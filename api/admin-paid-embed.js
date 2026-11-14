// api/admin-paid-embed.js — admin-only: read / set / clear the PAID embed link of a movie.
//
// The paid link lives in its own table (movie_paid_embeds) that the public site can NOT read
// (RLS on, no policies) — if it sat in the `movies` table, every visitor could see it.
// Only this endpoint (service-role key) and the payment webhook touch it.
//
// POST  Authorization: Bearer <admin's session token>
//   { action:'get', movie_id }                          → { paid_url }
//   { action:'set', movie_id, tmdb_id, paid_url }       → saves it (blank paid_url = remove)
//                                                         and updates buyers that were auto-granted
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const EP = require('../lib/episode-links');

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
    const rRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=is_admin,role`, { headers: H });
    const rRows = rRes.ok ? await rRes.json() : [];
    const me = Array.isArray(rRows) ? rRows[0] : null;
    if (!(me && (me.is_admin === true || me.role === 'admin' || me.role === 'moderator'))) {
      return res.status(403).json({ error: 'Admins only' });
    }

    const { action, movie_id, tmdb_id, paid_url, media_type } = req.body || {};
    const isTV = media_type === 'tv';

    // All paid embeds at once (the admin panel loads this once, so Edit opens instantly)
    if (action === 'list') {
      const l = await fetch(`${SUPABASE_URL}/rest/v1/movie_paid_embeds?select=movie_id,paid_url&limit=2000`, { headers: H });
      if (!l.ok) {
        const t = (await l.text()).slice(0, 220);
        console.error('admin-paid-embed: list failed', l.status, t);
        return res.status(500).json({ error: `Could not read paid embeds [${l.status}] ${t}` });
      }
      const rows = await l.json();
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach(r => { map[r.movie_id] = r.paid_url; });
      return res.status(200).json({ map });
    }

    const mid = parseInt(movie_id, 10);
    if (!mid) return res.status(400).json({ error: 'Invalid movie' });

    if (action === 'get') {
      const g = await fetch(`${SUPABASE_URL}/rest/v1/movie_paid_embeds?movie_id=eq.${mid}&select=paid_url&limit=1`, { headers: H });
      if (!g.ok) {
        const t = (await g.text()).slice(0, 220);
        console.error('admin-paid-embed: read failed', g.status, t);
        return res.status(500).json({ error: `Could not read paid embed [${g.status}] ${t}` });
      }
      const rows = await g.json();
      return res.status(200).json({ paid_url: (Array.isArray(rows) && rows[0]?.paid_url) || null });
    }

    if (action !== 'set') return res.status(400).json({ error: 'Invalid action' });

    let url = String(paid_url || '').trim();
    const tid = parseInt(tmdb_id, 10) || null;

    if (!url) {
      const d = await fetch(`${SUPABASE_URL}/rest/v1/movie_paid_embeds?movie_id=eq.${mid}`, { method: 'DELETE', headers: H });
      if (!d.ok) return res.status(500).json({ error: 'Could not remove paid embed' });
      return res.status(200).json({ success: true, removed: true });
    }
    if (isTV) {
      if (url.length > 60000) return res.status(400).json({ error: 'Episode list is too long' });
      const v = EP.validate(url);
      if (v.bad.length) return res.status(400).json({ error: `Line ${v.bad.slice(0, 5).join(', ')} is not valid. Use: S1E1 https://link` });
      if (!v.ok) return res.status(400).json({ error: 'Add at least one episode link' });
      url = EP.parse(url).lines.join('\n');           // tidy: trimmed, no blank lines
    } else if (!/^https:\/\/[^\s]+$/i.test(url)) {
      return res.status(400).json({ error: 'Paid embed must be one https:// link' });
    }
    if (!tid) return res.status(400).json({ error: 'This title has no TMDB ID — a paid embed needs it to match purchases' });

    const saveRow = (mt) => fetch(`${SUPABASE_URL}/rest/v1/movie_paid_embeds?on_conflict=movie_id`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ movie_id: mid, tmdb_id: tid, media_type: mt, paid_url: url, updated_at: new Date().toISOString() }),
    });
    let up = await saveRow(isTV ? 'tv' : 'movie');
    if (!up.ok && isTV) up = await saveRow('movie');   // older table with a movie-only check: the webhook finds TV rows by movie_id anyway
    if (!up.ok) {
      const t = (await up.text()).slice(0, 220);
      console.error('admin-paid-embed: upsert failed', up.status, t);
      return res.status(500).json({ error: `Could not save paid embed [${up.status}] ${t}` });
    }

    // Embed changed → everyone who was auto-granted this title gets the new link(s) too.
    let updated = 0;
    if (!isTV) {
      const pr = await fetch(
        `${SUPABASE_URL}/rest/v1/requests?request_type=eq.movie&tmdb_id=eq.${tid}&payment_status=eq.paid`
        + `&admin_notes=like.${encodeURIComponent('[AUTO]')}*&select=id`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ watch_url: url }) }
      );
      if (pr.ok) { const rows = await pr.json(); updated = Array.isArray(rows) ? rows.length : 0; }
    } else {
      // each buyer gets what their purchase covers (whole series, or just their season)
      const gr = await fetch(
        `${SUPABASE_URL}/rest/v1/requests?request_type=in.(season,series)&tmdb_id=eq.${tid}&payment_status=eq.paid`
        + `&admin_notes=like.${encodeURIComponent('[AUTO]')}*&select=id,request_type,season_number&limit=1000`,
        { headers: H }
      );
      const buyers = gr.ok ? await gr.json() : [];
      const results = await Promise.all((Array.isArray(buyers) ? buyers : []).map(async (b) => {
        const mine = EP.forRequest(url, b.request_type, b.season_number);
        if (!mine) return false;
        const r = await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${b.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ watch_url: mine }) });
        return r.ok;
      }));
      updated = results.filter(Boolean).length;
    }

    return res.status(200).json({ success: true, updated_requests: updated });
  } catch (err) {
    console.error('admin-paid-embed error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
