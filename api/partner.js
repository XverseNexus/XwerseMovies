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
    const partnerId = st && st.partners && st.partners.status === 'active' ? st.partner_id : null;
    const ip = C.clientIp(req);
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
