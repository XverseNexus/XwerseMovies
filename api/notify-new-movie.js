// ═══════════════════════════════════════════════════════════
//  POST /api/notify-new-movie
//  Called from XwerseMovies_Admin.html after a movie/show is added
//  with status "active" — inserts one notification row per user so
//  everyone sees "New on XwerseMovies: <title>" in their bell panel.
//
//  Why this is a serverless function and not a direct Supabase call
//  from Admin.html: bulk-reading every user's profile id and
//  inserting notifications FOR OTHER USERS is exactly the kind of
//  thing Row Level Security should (and does) block from the
//  client's anon key — a client shouldn't be able to write into
//  other users' rows directly. This runs server-side with the
//  service_role key instead, same pattern as the payment webhook.
//
//  Required Vercel environment variables (already set up for
//  Task 11's payment webhook — reused here, nothing new to add):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
//  AUTH: the caller must send `Authorization: Bearer <supabase access
//  token>` and be an admin/moderator (verified server-side below).
// ═══════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl        = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('notify-new-movie: missing Supabase env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    // ── AUTH: only a logged-in admin/moderator may broadcast ──────
    // The caller must send its Supabase access token as
    // `Authorization: Bearer <token>`. We verify it with Supabase Auth,
    // then check the caller's role in `profiles` using the service key.
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Login required' });

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': supabaseServiceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const caller = await userRes.json();
    if (!caller || !caller.id) return res.status(401).json({ error: 'Invalid session' });

    const roleRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=is_admin,role`,
      { headers: { 'apikey': supabaseServiceKey, 'Authorization': `Bearer ${supabaseServiceKey}` } }
    );
    const roleRows = roleRes.ok ? await roleRes.json() : [];
    const me = Array.isArray(roleRows) ? roleRows[0] : null;
    const allowed = me && (me.is_admin === true || me.role === 'admin' || me.role === 'moderator');
    if (!allowed) return res.status(403).json({ error: 'Admins only' });

    const { title, type, image_url } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing movie/show title' });
    }

    // Fetch every user's id. `profiles` is 1 row per auth user
    // (created by the signup trigger — see SETUP_GUIDE.md), so this
    // gives us the full user list without touching auth.users
    // directly.
    const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });
    if (!profRes.ok) {
      const errText = await profRes.text();
      throw new Error('Failed to fetch profiles: ' + errText);
    }
    const profiles = await profRes.json();
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return res.status(200).json({ notified: 0 });
    }

    const label = type === 'tv' ? 'show' : 'movie';
    const rows = profiles.map((p) => ({
      user_id: p.id,
      title: '🎬 New on XwerseMovies',
      body: `${title} — naya ${label} ab available hai, abhi dekho!`,
      image_url: image_url || null,
      is_read: false,
    }));

    // Supabase's PostgREST accepts an array body for bulk insert in
    // a single request — no need to loop one-by-one.
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error('Failed to insert notifications: ' + errText);
    }

    return res.status(200).json({ notified: rows.length });
  } catch (err) {
    console.error('notify-new-movie error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
