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
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server is not configured correctly' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await C.getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    if (!(await C.isStaff(user.id))) return res.status(403).json({ error: 'Staff only' });
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
      const r = await C.sb('partner_settings?select=key,value');
      const out = { est_rate_default: 0.0007, est_rate_by_country: {}, share_pct: 50 };
      if (Array.isArray(r.data)) r.data.forEach(x => { if (x.key in out) out[x.key] = x.value; });
      return res.status(200).json(out);
    }

    if (b.action === 'settings_set') {
      const rows = [];
      const def = Number(b.est_rate_default);
      if (!(def >= 0 && def <= 1)) return res.status(400).json({ error: 'Default rate must be between 0 and 1 (USD per view)' });
      rows.push({ key: 'est_rate_default', value: def });
      const by = {};
      for (const [k, v] of Object.entries(b.est_rate_by_country || {})) {
        if (/^[A-Z]{2}$/.test(k) && Number(v) >= 0 && Number(v) <= 1) by[k] = Number(v);
      }
      rows.push({ key: 'est_rate_by_country', value: by });
      const sp = Number(b.share_pct);
      if (!(sp >= 1 && sp <= 100)) return res.status(400).json({ error: 'Share % must be 1-100' });
      rows.push({ key: 'share_pct', value: sp });
      const r = await C.sb('partner_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: rows.map(x => ({ ...x, updated_at: new Date().toISOString() })) });
      if (!r.ok) return res.status(500).json({ error: 'Could not save (' + r.status + ')' });
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
