// api/partner-admin.js — STAFF ONLY (admin / moderator) side of the partner program, Stage 1.
//
// POST  Authorization: Bearer <staff session token>
//   { action:'status' }                                   → { me: {code,status}|null, vpn_check: bool }
//   { action:'become_test_partner' }                      → { code }   (creates the caller's own test partner)
//   { action:'titles_list' }                              → { titles:[{tmdb_id,media_type,enabled}] }
//   { action:'titles_set', tmdb_id, media_type, enabled } → { ok }
//   { action:'report', from:'YYYY-MM-DD', to:'YYYY-MM-DD', host:'voe' }
//        → calibration numbers: per day / per partner / per country, from OUR tracking, to compare with
//          the VOE "Insights → Table" (their Paid views). host = only views whose embed host contains this text.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const C = require('../lib/partner-common');
const S = require('../lib/partner-settle');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server is not configured correctly' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await C.getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    const role = await C.staffRole(user.id);
    if (!role) return res.status(403).json({ error: 'Staff only' });
    const isAdmin = role === 'admin';
    const adminOnly = () => { if (!isAdmin) { res.status(403).json({ error: 'Only the admin can do this' }); return true; } return false; };
    const logIt = (sid, action, detail) => C.sb('settlement_log', { method: 'POST', body: { settlement_id: sid || null, actor: user.id, action, detail: detail || null } });
    const b = req.body || {};

    if (b.action === 'status') {
      const r = await C.sb(`partners?user_id=eq.${user.id}&select=code,status`);
      return res.status(200).json({ me: Array.isArray(r.data) && r.data[0] ? r.data[0] : null, vpn_check: !!process.env.IPAPI_KEY });
    }

    if (b.action === 'become_test_partner') {
      const have = await C.sb(`partners?user_id=eq.${user.id}&select=code`);
      if (Array.isArray(have.data) && have.data[0]) return res.status(200).json({ code: have.data[0].code });
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let lastErr = null;
      for (let i = 0; i < 6; i++) {
        let code = ''; for (let k = 0; k < 7; k++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        const ins = await C.sb('partners', { method: 'POST', body: { user_id: user.id, code } });
        if (ins.ok) return res.status(200).json({ code });
        lastErr = ins;
        if (ins.status !== 409) break;
      }
      const why = lastErr ? (lastErr.status + ' ' + (lastErr.data && (lastErr.data.message || lastErr.data.hint) || JSON.stringify(lastErr.data || ''))).slice(0, 160) : '';
      return res.status(500).json({ error: 'Could not create a code: ' + why });
    }

    if (b.action === 'settings_get') {
      const cfg = await S.getSettings(); const fx = await S.getUsdInr(cfg);
      return res.status(200).json({ ...cfg, usd_inr_live: Math.round(fx.rate * 100) / 100, usd_inr_source: fx.source });
    }

    if (b.action === 'settings_set') {
      if (adminOnly()) return;
      const num = (v, lo, hi) => { const n = Number(v); return n >= lo && n <= hi ? n : null; };
      const cur = await S.getSettings();
      const next = {
        est_rate_default: num(b.est_rate_default, 0, 1), share_pct: num(b.share_pct, 1, 100),
        default_weight: num(b.default_weight ?? cur.default_weight, 0.01, 1000), hold_days: num(b.hold_days ?? cur.hold_days, 0, 120),
        min_usd: num(b.min_usd ?? cur.min_usd, 0, 10000), min_inr: num(b.min_inr ?? cur.min_inr, 0, 1000000), usd_inr: num(b.usd_inr ?? cur.usd_inr, 1, 1000),
      };
      next.usd_inr_auto = b.usd_inr_auto === undefined ? cur.usd_inr_auto !== false : b.usd_inr_auto !== false;
      for (const [k, v] of Object.entries(next)) if (v === null) return res.status(400).json({ error: 'Invalid value for ' + k });
      const mapOf = (obj, hi) => { const o = {}; for (const [k, v] of Object.entries(obj || {})) if (/^[A-Z]{2}$/.test(k) && Number(v) >= 0 && Number(v) <= hi) o[k] = Number(v); return o; };
      next.est_rate_by_country = b.est_rate_by_country ? mapOf(b.est_rate_by_country, 1) : cur.est_rate_by_country;
      next.country_weights = b.country_weights ? mapOf(b.country_weights, 1000) : cur.country_weights;
      const rows = Object.entries(next).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
      const r = await C.sb('partner_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: rows });
      if (!r.ok) return res.status(500).json({ error: 'Could not save (' + r.status + ')' });
      await logIt(null, 'settings_set', next);
      return res.status(200).json({ ok: true });
    }

    // ── weekly settlement ────────────────────────────────────────────
    const weekEndOk = (d) => S.DAY_RE.test(d || '') && new Date(d + 'T00:00:00Z').getUTCDay() === 0;
    const withNames = async (lines) => {
      if (!lines.length) return lines;
      const ps = await C.sbAll('partners?select=user_id,code,status');
      const ids = lines.map(l => l.partner_id), pr = [];
      for (let i = 0; i < ids.length; i += 60) pr.push(...await C.sbAll('profiles?select=id,name,email&id=in.(' + ids.slice(i, i + 60).join(',') + ')'));
      return lines.map(l => { const p = ps.find(x => x.user_id === l.partner_id) || {}; const q = pr.find(x => x.id === l.partner_id) || {}; return { ...l, code: p.code, status: p.status, name: q.name || '', email: q.email || '' }; });
    };

    if (b.action === 'settle_preview') {
      if (!weekEndOk(b.week_end)) return res.status(400).json({ error: 'Week must end on a Sunday (YYYY-MM-DD)' });
      const total = Number(b.voe_total_usd);
      if (!(total >= 0 && total < 1e7)) return res.status(400).json({ error: 'Enter the Voe total in USD' });
      const cfg = await S.getSettings();
      const c = await S.compute(b.week_end, total, cfg);
      c.lines = await withNames(c.lines);
      const ex = await C.sb(`settlements?week_start=eq.${c.week_start}&select=id,status,voe_total_usd,voe_paid,note`);
      c.existing = Array.isArray(ex.data) ? ex.data[0] || null : null;
      c.partners_total = Math.round(c.lines.reduce((a, l) => a + l.amount_usd, 0) * 1e4) / 1e4;
      return res.status(200).json(c);
    }

    if (b.action === 'settle_save') {
      if (!weekEndOk(b.week_end)) return res.status(400).json({ error: 'Week must end on a Sunday' });
      const total = Number(b.voe_total_usd);
      if (!(total >= 0 && total < 1e7)) return res.status(400).json({ error: 'Enter the Voe total in USD' });
      const cfg = await S.getSettings();
      const c = await S.compute(b.week_end, total, cfg);
      const ex = await C.sb(`settlements?week_start=eq.${c.week_start}&select=id,status`);
      const old = Array.isArray(ex.data) ? ex.data[0] : null;
      if (old && old.status === 'approved') return res.status(409).json({ error: 'This week is already approved and locked' });
      const body = { week_start: c.week_start, week_end: c.week_end, voe_total_usd: total, voe_paid_views: parseInt(b.voe_paid_views, 10) || null, voe_all_views: parseInt(b.voe_all_views, 10) || null, share_pct: c.share_pct, total_weight: c.total_weight, note: String(b.note || '').slice(0, 300) || null, entered_by: user.id, status: 'draft', updated_at: new Date().toISOString() };
      let sid = old && old.id;
      if (old) await C.sb(`settlements?id=eq.${old.id}`, { method: 'PATCH', body });
      else { const ins = await C.sb('settlements', { method: 'POST', prefer: 'return=representation', body }); sid = Array.isArray(ins.data) && ins.data[0] && ins.data[0].id; if (!sid) return res.status(500).json({ error: 'Could not save (' + ins.status + ')' }); }
      await C.sb(`settlement_lines?settlement_id=eq.${sid}`, { method: 'DELETE' });
      if (c.lines.length) await C.sb('settlement_lines', { method: 'POST', body: c.lines.map(l => ({ settlement_id: sid, partner_id: l.partner_id, views: l.views, weight: l.weight, amount_usd: l.amount_usd })) });
      await logIt(sid, old ? 'draft_updated' : 'draft_created', { voe_total_usd: total, partners: c.lines.length, role });
      return res.status(200).json({ ok: true, id: sid });
    }

    if (b.action === 'settle_list') {
      const rows = await C.sbAll('settlements?select=*&order=week_start.desc&limit=30', 60);
      const ids = rows.map(r => r.id);
      const ls = ids.length ? await C.sbAll(`settlement_lines?settlement_id=in.(${ids.join(',')})&select=settlement_id,amount_usd`) : [];
      return res.status(200).json({ role, settlements: rows.map(r => ({ ...r, partners_total: Math.round(ls.filter(l => l.settlement_id === r.id).reduce((a, l) => a + +l.amount_usd, 0) * 1e4) / 1e4 })) });
    }

    if (b.action === 'settle_approve') {
      if (adminOnly()) return;
      const id = parseInt(b.id, 10);
      const r = await C.sb(`settlements?id=eq.${id}&select=id,status,entered_by`);
      const st = Array.isArray(r.data) ? r.data[0] : null;
      if (!st) return res.status(404).json({ error: 'Not found' });
      if (st.status === 'approved') return res.status(200).json({ ok: true });
      await C.sb(`settlements?id=eq.${id}`, { method: 'PATCH', body: { status: 'approved', approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
      await logIt(id, 'approved', null);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'settle_voe_paid') {
      if (adminOnly()) return;
      const id = parseInt(b.id, 10), paid = b.paid !== false;
      const r = await C.sb(`settlements?id=eq.${id}&select=id,status`);
      const st = Array.isArray(r.data) ? r.data[0] : null;
      if (!st || st.status !== 'approved') return res.status(400).json({ error: 'Approve the week first' });
      await C.sb(`settlements?id=eq.${id}`, { method: 'PATCH', body: { voe_paid: paid, voe_paid_at: paid ? new Date().toISOString() : null } });
      await logIt(id, paid ? 'voe_paid_marked' : 'voe_paid_unmarked', null);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'settle_log') {
      const q = b.id ? `settlement_id=eq.${parseInt(b.id, 10)}&` : '';
      const r = await C.sb(`settlement_log?${q}select=*&order=id.desc&limit=100`);
      const rows = Array.isArray(r.data) ? r.data : [];
      const ids = [...new Set(rows.map(x => x.actor).filter(Boolean))];
      const pr = ids.length ? await C.sbAll(`profiles?select=id,name,email&id=in.(${ids.join(',')})`) : [];
      return res.status(200).json({ log: rows.map(x => { const p = pr.find(q2 => q2.id === x.actor) || {}; return { ...x, actor_name: p.name || p.email || '' }; }) });
    }

    // ── partners, payouts ────────────────────────────────────────────
    if (b.action === 'partners_list') {
      const ps = await C.sbAll('partners?select=user_id,code,status,payout_method,payout_address,created_at&order=created_at.desc&limit=500', 2000);
      const named = await withNames(ps.map(p => ({ partner_id: p.user_id })));
      const [ls, po] = await Promise.all([C.sbAll('settlement_lines?select=partner_id,amount_usd,settlements!inner(status)'), C.sbAll('payouts?select=partner_id,amount_usd,status')]);
      return res.status(200).json({ role, partners: ps.map(p => {
        const n = named.find(x => x.partner_id === p.user_id) || {};
        return { user_id: p.user_id, code: p.code, status: p.status, name: n.name, email: n.email, method: p.payout_method, address: p.payout_address, joined: p.created_at,
          earned: Math.round(ls.filter(l => l.partner_id === p.user_id && l.settlements && l.settlements.status === 'approved').reduce((a, l) => a + +l.amount_usd, 0) * 1e4) / 1e4,
          paid: Math.round(po.filter(x => x.partner_id === p.user_id && x.status === 'paid').reduce((a, x) => a + +x.amount_usd, 0) * 1e4) / 1e4 };
      }) });
    }

    if (b.action === 'partner_set_status') {
      if (adminOnly()) return;
      if (!['active', 'hold', 'banned'].includes(b.status)) return res.status(400).json({ error: 'Bad status' });
      await C.sb(`partners?user_id=eq.${encodeURIComponent(b.partner_id)}`, { method: 'PATCH', body: { status: b.status } });
      await logIt(null, 'partner_status', { partner_id: b.partner_id, status: b.status });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'payouts_list') {
      const f = ['requested', 'paid', 'rejected'].includes(b.status) ? `status=eq.${b.status}&` : '';
      const rows = await C.sbAll(`payouts?${f}select=*&order=id.desc&limit=200`, 400);
      const named = await withNames([...new Set(rows.map(r => r.partner_id))].map(id => ({ partner_id: id })));
      return res.status(200).json({ role, payouts: rows.map(r => { const n = named.find(x => x.partner_id === r.partner_id) || {}; return { ...r, code: n.code, name: n.name, email: n.email, partner_status: n.status }; }) });
    }

    if (b.action === 'payout_mark_paid' || b.action === 'payout_reject') {
      if (adminOnly()) return;
      const id = parseInt(b.id, 10);
      const r = await C.sb(`payouts?id=eq.${id}&select=id,status`);
      const p = Array.isArray(r.data) ? r.data[0] : null;
      if (!p || p.status !== 'requested') return res.status(400).json({ error: 'Not an open request' });
      const paid = b.action === 'payout_mark_paid';
      const body = { status: paid ? 'paid' : 'rejected', decided_at: new Date().toISOString(), decided_by: user.id, txn_ref: paid ? String(b.txn_ref || '').slice(0, 120) || null : null, admin_note: String(b.note || '').slice(0, 300) || null };
      if (paid) { const fx = await S.getUsdInr(await S.getSettings()); body.usd_inr = Number(b.usd_inr) > 0 ? Number(b.usd_inr) : Math.round(fx.rate * 100) / 100; }
      await C.sb(`payouts?id=eq.${id}`, { method: 'PATCH', body });
      await logIt(null, paid ? 'payout_paid' : 'payout_rejected', { id, txn_ref: body.txn_ref });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'titles_list') {
      const r = await C.sb('partner_titles?select=tmdb_id,media_type,enabled&order=created_at.desc&limit=500');
      return res.status(200).json({ titles: Array.isArray(r.data) ? r.data : [] });
    }

    if (b.action === 'titles_set') {
      const tmdb = parseInt(b.tmdb_id, 10);
      if (!tmdb) return res.status(400).json({ error: 'Enter a valid TMDB id' });
      const type = b.media_type === 'tv' ? 'tv' : 'movie';
      const r = await C.sb('partner_titles?on_conflict=tmdb_id,media_type', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { tmdb_id: tmdb, media_type: type, enabled: b.enabled !== false } });
      if (!r.ok) return res.status(500).json({ error: 'Could not save' });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'report') {
      const to   = DAY_RE.test(b.to   || '') ? b.to   : C.utcDay();
      const from = DAY_RE.test(b.from || '') ? b.from : C.utcDay(new Date(Date.now() - 6 * 864e5));
      const hostQ = String(b.host || '').toLowerCase().replace(/[^a-z0-9.\-]/g, '').slice(0, 40);
      const rows = await C.sbAll(`view_events?day=gte.${from}&day=lte.${to}${hostQ ? `&host=ilike.*${hostQ}*` : ''}&select=day,partner_id,country,qualified,reason,adblock,vpn,seconds&order=id.asc`);

      const days = {}, partners = {}, countries = {}, reasons = {};
      const tot = { started: 0, qualified: 0, not_qualified: 0 };
      for (const r of rows) {
        const d = days[r.day] || (days[r.day] = { day: r.day, started: 0, qualified: 0, reasons: {} });
        d.started++; tot.started++;
        if (r.qualified) { d.qualified++; tot.qualified++; } else {
          tot.not_qualified++;
          const k = r.reason || 'too_short'; d.reasons[k] = (d.reasons[k] || 0) + 1; reasons[k] = (reasons[k] || 0) + 1;
        }
        const pk = r.partner_id || 'organic';
        const p = partners[pk] || (partners[pk] = { partner_id: pk, started: 0, qualified: 0 });
        p.started++; if (r.qualified) p.qualified++;
        if (r.qualified) { const ck = r.country || '??'; countries[ck] = (countries[ck] || 0) + 1; }
      }
      const [clicks, stamps] = await Promise.all([
        C.sbAll(`partner_clicks?created_at=gte.${from}T00:00:00Z&created_at=lt.${to}T23:59:59Z&select=result`),
        C.sbAll(`partner_stamps?created_at=gte.${from}T00:00:00Z&created_at=lt.${to}T23:59:59Z&select=user_id`),
      ]);
      const clickResults = {}; clicks.forEach(c => { clickResults[c.result || '?'] = (clickResults[c.result || '?'] || 0) + 1; });
      return res.status(200).json({
        from, to, host: hostQ, total: tot, reasons, clicks: { total: clicks.length, results: clickResults }, stamps: stamps.length,
        days: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
        partners: Object.values(partners).sort((a, b) => b.qualified - a.qualified),
        countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).map(([country, qualified]) => ({ country, qualified })),
        capped: rows.length >= 30000,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('partner-admin error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
