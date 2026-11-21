// api/staff-paid-links.js — STAFF ONLY (admin / moderator): every paid link the admin has uploaded.
//
// Used by the "Paid access" switch in the profile menu. When a staff member turns it on, the site
// plays every paid movie / series / season for them (and marks those titles red), without buying.
// A normal user always gets 403 here, so no paid link ever reaches a non-staff browser.
//
// POST  Authorization: Bearer <session token>      (no body needed)
//   → { rows: [{ tmdb_id, request_type:'movie'|'series'|'season', season_number, watch_url }] }
//     Same shape as the buyer's own `requests` rows, so the site's existing "purchased" code works unchanged.
//
// Sources: movie_paid_embeds (the shared paid link of a title; TV = full episode list "S1E1 https://…")
//          + paid/completed `requests` rows for titles that have no shared paid link
//            (special versions the admin uploaded for one buyer).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server is not configured correctly' });
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Login required' });
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
    if (!uRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const caller = await uRes.json();
    if (!caller?.id) return res.status(401).json({ error: 'Invalid session' });

    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=is_admin,role`, { headers: H });
    const pRows = pRes.ok ? await pRes.json() : [];
    const me = Array.isArray(pRows) ? pRows[0] : null;
    if (!(me && (me.is_admin === true || me.role === 'admin' || me.role === 'moderator'))) {
      return res.status(403).json({ error: 'Staff only' });
    }

    const [eRes, rRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/movie_paid_embeds?select=tmdb_id,media_type,paid_url&limit=3000`, { headers: H }),
      fetch(`${SUPABASE_URL}/rest/v1/requests?payment_status=eq.paid&status=eq.completed&watch_url=not.is.null`
        + `&select=tmdb_id,request_type,season_number,watch_url,updated_at&order=updated_at.desc&limit=3000`, { headers: H }),
    ]);
    if (!eRes.ok) {
      const t = (await eRes.text()).slice(0, 200);
      console.error('staff-paid-links: embeds failed', eRes.status, t);
      return res.status(500).json({ error: 'Could not read paid links' });
    }
    const embeds = await eRes.json();
    const reqs   = rRes.ok ? await rRes.json() : [];

    const rows = [];
    const covered = { movie: new Set(), tv: new Set() };           // titles that already have a shared paid link

    (Array.isArray(embeds) ? embeds : []).forEach(e => {
      const url = String(e.paid_url || '').trim();
      const tid = Number(e.tmdb_id);
      if (!url || !tid) return;
      // a movie link is ONE https URL; anything else is a TV episode list (older rows may be saved as media_type 'movie')
      const isTV = e.media_type === 'tv' || !/^https:\/\/\S+$/i.test(url);
      rows.push({ tmdb_id: tid, request_type: isTV ? 'series' : 'movie', season_number: null, watch_url: url });
      covered[isTV ? 'tv' : 'movie'].add(tid);
    });

    const seen = new Set();                                        // newest request per (title, type, season) only
    (Array.isArray(reqs) ? reqs : []).forEach(r => {
      const url = String(r.watch_url || '').trim();
      const tid = Number(r.tmdb_id);
      if (!url || !tid) return;
      const kind = r.request_type === 'movie' ? 'movie' : 'tv';
      if (covered[kind].has(tid)) return;                          // the shared paid link already covers this title
      const key = `${tid}|${r.request_type}|${r.season_number || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ tmdb_id: tid, request_type: r.request_type, season_number: r.season_number ?? null, watch_url: url });
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ rows });
  } catch (err) {
    console.error('staff-paid-links error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
