// api/partner.js — signed-in USER side of the partner program (Stage 1).
//
// POST  Authorization: Bearer <session token>
//   { action:'claim', code, t, type }
//        A visitor arrived through a partner link. Puts the partner's "thappa" on (this user, this title)
//        — only if: partner is active · title is promotable · not the partner's own account · e-mail verified ·
//        the user has no stamp on this title yet · the user never watched this title before.
//        → { ok, result, keep }   (keep:true = try again later, e.g. after the e-mail is verified)
//   { action:'track', phase:'start', tmdb_id, type, season, episode, host, adblock }   → { id }
//   { action:'track', phase:'ping'|'end', id, seconds, adblock }                        → { qualified, reason }
//        A view counts ("qualified") only when: e-mail verified · no ad-blocker · not VPN/proxy/Tor ·
//        at least 60 s really watched (server clock, not just the browser's) · max 2 counted views per IP and
//        per user in 24 h  (the same rules VOE uses for its own paid views).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (optional: IPAPI_KEY for VPN detection, IP_HASH_SALT)

const C = require('../lib/partner-common');
const S = require('../lib/partner-settle');

const CODE_RE = /^[A-Za-z0-9]{4,16}$/;
const MIN_SECONDS = 60;     // watched time needed
const SLACK = 5;            // browser/server clock tolerance (s)
const DAILY_CAP = 2;        // counted views per IP and per user in 24 h

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server is not configured correctly' });
  res.setHeader('Cache-Control', 'no-store');

  try {
    const user = await C.getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    const b = req.body || {};
    if (b.action === 'claim') return res.status(200).json(await claim(user, b));
    if (b.action === 'track') return res.status(200).json(await track(user, b, req));
    if (b.action === 'me') return res.status(200).json(await me(user));
    if (b.action === 'join') return res.status(200).json(await join(user));
    if (b.action === 'titles') return res.status(200).json(await titles(user));
    if (b.action === 'stats') return res.status(200).json(await stats(user, b));
    if (b.action === 'wallet') return res.status(200).json(await walletInfo(user));
    if (b.action === 'payout_save') return res.status(200).json(await payoutSave(user, b));
    if (b.action === 'payout_request') return res.status(200).json(await payoutRequest(user));
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('partner error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};

// ── thappa ───────────────────────────────────────────────────────────────
async function claim(user, b) {
  const code = String(b.code || '');
  const tmdb = parseInt(b.t, 10);
  const type = b.type === 'tv' ? 'tv' : 'movie';
  if (!CODE_RE.test(code) || !tmdb) return { ok: false, result: 'bad_request' };

  const log = (partnerId, result) => C.sb('partner_clicks', { method: 'POST', body: { user_id: user.id, partner_id: partnerId || null, tmdb_id: tmdb, media_type: type, result } });

  const pr = await C.sb(`partners?code=eq.${code}&select=user_id,status`);
  const partner = Array.isArray(pr.data) ? pr.data[0] : null;
  if (!partner || partner.status !== 'active') { await log(null, 'invalid_partner'); return { ok: false, result: 'invalid_partner' }; }
  if (partner.user_id === user.id) { await log(partner.user_id, 'self'); return { ok: false, result: 'self' }; }
  if (!user.verified) return { ok: false, result: 'unverified', keep: true };

  const tr = await C.sb(`partner_titles?tmdb_id=eq.${tmdb}&media_type=eq.${type}&enabled=eq.true&select=tmdb_id`);
  if (!(Array.isArray(tr.data) && tr.data.length)) { await log(partner.user_id, 'not_promotable'); return { ok: false, result: 'not_promotable' }; }

  const sr = await C.sb(`partner_stamps?user_id=eq.${user.id}&tmdb_id=eq.${tmdb}&media_type=eq.${type}&select=partner_id`);
  if (Array.isArray(sr.data) && sr.data.length) { await log(partner.user_id, 'already_stamped'); return { ok: true, result: 'already_stamped' }; }

  // Watched this title before? (our own tracking, or the older watch history) → no stamp, the viewer was already ours.
  const ev = await C.sb(`view_events?user_id=eq.${user.id}&tmdb_id=eq.${tmdb}&media_type=eq.${type}&select=id&limit=1`);
  let watched = Array.isArray(ev.data) && ev.data.length > 0;
  if (!watched) {
    const wh = await C.sb(`watch_history?user_id=eq.${user.id}&select=movie_id,movies!inner(tmdb_id,type)&movies.tmdb_id=eq.${tmdb}&limit=5`);
    if (wh.ok && Array.isArray(wh.data)) watched = wh.data.some(r => r.movies && String(r.movies.type || 'movie') === type);
  }
  if (watched) { await log(partner.user_id, 'already_watched'); return { ok: true, result: 'already_watched' }; }

  const ins = await C.sb('partner_stamps?on_conflict=user_id,tmdb_id,media_type', { method: 'POST', body: { user_id: user.id, tmdb_id: tmdb, media_type: type, partner_id: partner.user_id }, prefer: 'resolution=ignore-duplicates' });
  if (!ins.ok) { console.error('stamp insert failed', ins.status, ins.data); return { ok: false, result: 'error', keep: true }; }
  await log(partner.user_id, 'stamped');
  return { ok: true, result: 'stamped' };
}

// ── view tracking ────────────────────────────────────────────────────────
async function track(user, b, req) {
  if (b.phase === 'start') {
    const tmdb = parseInt(b.tmdb_id, 10);
    if (!tmdb) return { id: null };
    const type = b.type === 'tv' ? 'tv' : 'movie';
    const sr = await C.sb(`partner_stamps?user_id=eq.${user.id}&tmdb_id=eq.${tmdb}&media_type=eq.${type}&select=partner_id,partners(status)`);
    const st = Array.isArray(sr.data) ? sr.data[0] : null;
    let partnerId = st && st.partners && st.partners.status === 'active' ? st.partner_id : null;
    const ip = C.clientIp(req);
    // self-referral through a second account: the viewer is on a network the partner themself has used → not counted for the partner
    if (partnerId && ip) {
      const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
      const same = await C.sb(`view_events?user_id=eq.${partnerId}&ip_hash=eq.${C.hashIp(ip)}&started_at=gte.${since30}&select=id&limit=1`);
      if (Array.isArray(same.data) && same.data.length) partnerId = null;
    }
    const ins = await C.sb('view_events', { method: 'POST', prefer: 'return=representation', body: {
      user_id: user.id, tmdb_id: tmdb, media_type: type,
      season: parseInt(b.season, 10) || null, episode: parseInt(b.episode, 10) || null,
      host: String(b.host || '').toLowerCase().slice(0, 80) || null,
      partner_id: partnerId, country: C.country(req), ip_hash: ip ? C.hashIp(ip) : null,
      adblock: !!b.adblock, day: C.utcDay(),
    } });
    const row = Array.isArray(ins.data) ? ins.data[0] : null;
    return { id: row ? row.id : null };
  }

  const id = parseInt(b.id, 10);
  if (!id) return { qualified: false, reason: 'no_id' };
  const er = await C.sb(`view_events?id=eq.${id}&user_id=eq.${user.id}&select=*`);
  const ev = Array.isArray(er.data) ? er.data[0] : null;
  if (!ev) return { qualified: false, reason: 'not_found' };

  const now = Date.now();
  const elapsed = Math.floor((now - new Date(ev.started_at).getTime()) / 1000);
  const seconds = Math.max(ev.seconds || 0, Math.min(parseInt(b.seconds, 10) || 0, elapsed + SLACK));
  const patch = { seconds, last_ping_at: new Date(now).toISOString() };
  if (b.adblock && !ev.adblock) { patch.adblock = true; ev.adblock = true; }

  if (ev.qualified) { await C.sb(`view_events?id=eq.${id}`, { method: 'PATCH', body: patch }); return { qualified: true, reason: null }; }

  let reason = null, qualified = false;
  if (seconds >= MIN_SECONDS) {
    if (!user.verified) reason = 'unverified';
    else if (ev.adblock) reason = 'adblock';
    else {
      const ip = C.clientIp(req), ipHash = ip ? C.hashIp(ip) : ev.ip_hash;
      const v = await C.vpnCheck(ip, ipHash);
      if (v.vpn) { reason = 'vpn'; patch.vpn = true; }
      else {
        const since = new Date(now - 24 * 3600 * 1000).toISOString();
        const [byIp, byUser] = await Promise.all([
          ipHash ? C.sb(`view_events?ip_hash=in.(${[...new Set([ipHash, ev.ip_hash].filter(Boolean))].join(',')})&qualified=eq.true&qualified_at=gte.${since}&select=id`) : { data: [] },
          C.sb(`view_events?user_id=eq.${user.id}&qualified=eq.true&qualified_at=gte.${since}&select=id`),
        ]);
        if ((byIp.data || []).length >= DAILY_CAP) reason = 'ip_limit';
        else if ((byUser.data || []).length >= DAILY_CAP) reason = 'user_limit';
        else { qualified = true; reason = null; }
      }
    }
  } else if (b.phase === 'end') {
    reason = ev.adblock ? 'adblock' : 'too_short';
  } else if (ev.adblock) reason = 'adblock';

  patch.qualified = qualified; patch.reason = reason;
  if (qualified) patch.qualified_at = new Date(now).toISOString();
  await C.sb(`view_events?id=eq.${id}`, { method: 'PATCH', body: patch });
  return { qualified, reason };
}


// ── partner program: join + dashboard (Stage 2) ──────────────────────────
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SETTINGS_DEFAULT = { est_rate_default: 0.0007, est_rate_by_country: {}, share_pct: 50 };

async function getSettings() {
  const r = await C.sb('partner_settings?select=key,value');
  const out = { ...SETTINGS_DEFAULT };
  if (Array.isArray(r.data)) r.data.forEach(x => { if (x.key in out) out[x.key] = x.value; });
  return out;
}

async function myPartner(user) {
  const r = await C.sb(`partners?user_id=eq.${user.id}&select=code,status,created_at`);
  return Array.isArray(r.data) ? r.data[0] || null : null;
}

async function me(user) {
  const p = await myPartner(user);
  return { joined: !!p, code: p ? p.code : null, status: p ? p.status : null, verified: !!user.verified };
}

async function join(user) {
  if (!user.verified) return { ok: false, result: 'unverified' };
  const have = await myPartner(user);
  if (have) return { ok: true, joined: true, code: have.code, status: have.status };
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 6; i++) {
    let code = ''; for (let k = 0; k < 7; k++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const ins = await C.sb('partners', { method: 'POST', body: { user_id: user.id, code } });
    if (ins.ok) return { ok: true, joined: true, code, status: 'active' };
    if (ins.status !== 409) break;
    const again = await myPartner(user);        // double click: the first request already created it
    if (again) return { ok: true, joined: true, code: again.code, status: again.status };
  }
  return { ok: false, result: 'error' };
}

async function titles(user) {
  const p = await myPartner(user);
  if (!p) return { titles: [] };
  const r = await C.sb('partner_titles?enabled=eq.true&select=tmdb_id,media_type&order=created_at.desc&limit=500');
  return { titles: Array.isArray(r.data) ? r.data : [] };
}

// What the partner sees: only counted numbers + a rough estimate — never reasons or limits.
async function stats(user, b) {
  const p = await myPartner(user);
  if (!p) return { joined: false };
  const today = C.utcDay();
  let to = DAY_RE.test(b.to || '') ? b.to : today;
  let from = DAY_RE.test(b.from || '') ? b.from : C.utcDay(new Date(Date.now() - 6 * 864e5));
  if (from > to) from = to;
  if ((new Date(to) - new Date(from)) / 864e5 > 92) from = C.utcDay(new Date(new Date(to).getTime() - 92 * 864e5));

  const [vs, cl, cfg] = await Promise.all([
    C.sbAll(`view_events?partner_id=eq.${user.id}&qualified=eq.true&day=gte.${from}&day=lte.${to}&select=tmdb_id,media_type,country,day`),
    C.sbAll(`partner_clicks?partner_id=eq.${user.id}&created_at=gte.${from}T00:00:00Z&created_at=lte.${to}T23:59:59Z&select=result,created_at`),
    getSettings(),
  ]);

  const rate = (c) => { const v = cfg.est_rate_by_country && cfg.est_rate_by_country[c]; return Number.isFinite(+v) && v !== undefined && v !== null ? +v : +cfg.est_rate_default; };
  const share = Math.min(100, Math.max(0, +cfg.share_pct || 50)) / 100;
  const days = {}, tit = {}, cty = {};
  let est = 0;
  for (const v of vs) {
    const e = rate(v.country) * share; est += e;
    const d = days[v.day] = days[v.day] || { day: v.day, views: 0, est: 0 }; d.views++; d.est += e;
    const k = v.media_type + ':' + v.tmdb_id;
    const t = tit[k] = tit[k] || { tmdb_id: v.tmdb_id, media_type: v.media_type, views: 0, est: 0 }; t.views++; t.est += e;
    const c = cty[v.country || '??'] = cty[v.country || '??'] || { country: v.country || '??', views: 0 }; c.views++;
  }
  const r4 = (n) => Math.round(n * 1e6) / 1e6;
  return {
    joined: true, code: p.code, status: p.status, from, to,
    totals: {
      visits: cl.length,
      signups: cl.filter(x => x.result === 'stamped').length,
      views: vs.length,
      est_usd: r4(est),
    },
    days: Object.values(days).sort((a, b2) => a.day < b2.day ? 1 : -1).map(d => ({ ...d, est: r4(d.est) })),
    titles: Object.values(tit).sort((a, b2) => b2.views - a.views).slice(0, 100).map(t => ({ ...t, est: r4(t.est) })),
    countries: Object.values(cty).sort((a, b2) => b2.views - a.views).slice(0, 30),
    share_pct: Math.round(share * 100),
  };
}


// ── payouts (Stage 3) ────────────────────────────────────────────────────
const PAY_RE = { upi: /^[A-Za-z0-9._\-]{2,64}@[A-Za-z][A-Za-z0-9]{1,30}$/, usdt_trc20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, usdt_bep20: /^0x[a-fA-F0-9]{40}$/ };
const maskAddr = (a) => !a ? '' : (a.length <= 10 ? a : a.slice(0, 4) + '…' + a.slice(-4));

async function walletInfo(user) {
  const pr = await C.sb(`partners?user_id=eq.${user.id}&select=code,status,payout_method,payout_address`);
  const p = Array.isArray(pr.data) ? pr.data[0] : null;
  if (!p) return { joined: false };
  const cfg = await S.getSettings();
  const [w, fx] = await Promise.all([S.wallet(user.id, cfg), S.getUsdInr(cfg)]);
  return { joined: true, status: p.status, method: p.payout_method, address_masked: maskAddr(p.payout_address),
    wallet: w, rules: { min_usd: cfg.min_usd, min_inr: cfg.min_inr, usd_inr: Math.round(fx.rate * 100) / 100, hold_days: cfg.hold_days } };
}

async function payoutSave(user, b) {
  const method = String(b.method || ''), address = String(b.address || '').trim();
  if (!PAY_RE[method]) return { ok: false, error: 'Choose UPI or USDT (TRC20 / BEP20)' };
  if (!PAY_RE[method].test(address)) return { ok: false, error: method === 'upi' ? 'Enter a valid UPI ID, like name@bank' : 'That wallet address does not look right for ' + method.replace('usdt_', 'USDT ').toUpperCase() };
  const r = await C.sb(`partners?user_id=eq.${user.id}`, { method: 'PATCH', prefer: 'return=representation', body: { payout_method: method, payout_address: address, payout_updated_at: new Date().toISOString() } });
  return Array.isArray(r.data) && r.data.length ? { ok: true } : { ok: false, error: 'Join the Partner Program first' };
}

async function payoutRequest(user) {
  const pr = await C.sb(`partners?user_id=eq.${user.id}&select=status,payout_method,payout_address`);
  const p = Array.isArray(pr.data) ? pr.data[0] : null;
  if (!p) return { ok: false, error: 'Join the Partner Program first' };
  if (p.status !== 'active') return { ok: false, error: 'Your account is on ' + p.status + '. Payouts are paused.' };
  if (!p.payout_method || !p.payout_address) return { ok: false, error: 'Save your payout details first' };
  const cfg = await S.getSettings();
  const [w, fx] = await Promise.all([S.wallet(user.id, cfg), S.getUsdInr(cfg)]);
  cfg.usd_inr = fx.rate;
  if (w.payouts.some(x => x.status === 'requested')) return { ok: false, error: 'You already have a payout request open' };
  const amt = w.available;
  const need = p.payout_method === 'upi' ? (+cfg.min_inr / +cfg.usd_inr) : +cfg.min_usd;
  if (!(amt > 0) || amt + 1e-9 < need) return { ok: false, error: p.payout_method === 'upi' ? 'Minimum payout is ₹' + cfg.min_inr : 'Minimum payout is $' + cfg.min_usd };
  const ins = await C.sb('payouts', { method: 'POST', body: { partner_id: user.id, amount_usd: amt, usd_inr: cfg.usd_inr, method: p.payout_method, address: p.payout_address } });
  if (ins.ok) return { ok: true, amount_usd: amt };
  return { ok: false, error: ins.status === 409 ? 'You already have a payout request open' : 'Could not create the request, try again' };
}
