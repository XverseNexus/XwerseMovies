// api/create-request-pending.js
// Creates (or refreshes) a `requests` row with payment_status='pending' just
// before the user is sent to the Cashfree Payment Form. This endpoint does NOT
// call any Cashfree API. api/cashfree-payment-form-webhook.js flips the row to
// 'paid' once Cashfree confirms the payment, matching it by (email + amount).
//
// Security / matching rules:
//   * The caller MUST send their Supabase access token (Authorization: Bearer ...).
//     The user id and email are taken from that verified token — never from the
//     request body — so nobody can create rows for someone else's account, and the
//     stored email is always the login email the user is told to use on the form.
//   * If the same user already has a still-pending row for the same title/type/
//     season, that row is reused (and bumped to "newest") instead of stacking
//     duplicates. This keeps "newest pending row for this email + amount" = the
//     request the user is paying for right now.
//
// Required Vercel Environment Variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// Prices are looked up server-side ONLY — never trust a price sent by the
// browser. Keep this in sync with xwerse-config.js's REQUEST_PRICES.
const REQUEST_PRICES = {
  movie:  9,
  season: 29,
  series: 59,
};

const QUALITIES = ['highest', '360p', '480p', '720p', '1080p']; // max 1080p

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const SUPABASE_URL     = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('create-request-pending: missing environment variables');
    res.status(500).json({ error: 'Server is not configured correctly' });
    return;
  }

  // ── Who is calling? (verify the Supabase access token) ──
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Please sign in again' });
    return;
  }

  let user;
  try {
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!uRes.ok) { res.status(401).json({ error: 'Session expired — please sign in again' }); return; }
    user = await uRes.json();
  } catch (err) {
    console.error('create-request-pending: auth check failed', err);
    res.status(500).json({ error: 'Could not verify your session' });
    return;
  }
  if (!user?.id || !user?.email) {
    res.status(401).json({ error: 'Please sign in again' });
    return;
  }

  const {
    name, title, request_type, tmdb_id, poster_url, season_number,
    preferred_language, preferred_audio, preferred_subtitle,
    preferred_quality, notes,
  } = req.body || {};

  // ── Validate ──────────────────────────────────────────
  if (!title || !request_type) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  if (!REQUEST_PRICES[request_type]) {
    res.status(400).json({ error: 'Invalid request type' });
    return;
  }

  const price = REQUEST_PRICES[request_type];
  const restHeaders = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const fields = {
    user_name: name || null,
    title,
    poster_url: poster_url || null,
    preferred_language: preferred_language || null,
    preferred_audio: preferred_audio || 'original',
    preferred_subtitle: preferred_subtitle || null,
    preferred_quality: QUALITIES.includes(preferred_quality) ? preferred_quality : 'highest',
    notes: notes || null,
  };

  try {
    // ── Reuse an existing pending row for the same thing ──
    let q = `${SUPABASE_URL}/rest/v1/requests`
      + `?user_id=eq.${encodeURIComponent(user.id)}`
      + `&payment_status=eq.pending`
      + `&request_type=eq.${encodeURIComponent(request_type)}`
      + (tmdb_id ? `&tmdb_id=eq.${encodeURIComponent(tmdb_id)}` : `&tmdb_id=is.null&title=eq.${encodeURIComponent(title)}`)
      + (season_number ? `&season_number=eq.${encodeURIComponent(season_number)}` : `&season_number=is.null`)
      + `&order=created_at.desc&limit=1&select=id`;
    const exRes = await fetch(q, { headers: restHeaders });
    const exRows = exRes.ok ? await exRes.json() : [];
    const existing = Array.isArray(exRows) ? exRows[0] : null;

    if (existing) {
      // Bump to "newest" so the webhook (newest pending row for this email + amount)
      // picks exactly this one.
      const upd = await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: restHeaders,
        body: JSON.stringify({ ...fields, created_at: new Date().toISOString() }),
      });
      if (upd.ok) {
        res.status(200).json({ success: true, request_id: existing.id, request_type, price, reused: true });
        return;
      }
      console.error('create-request-pending: reuse update failed, inserting new row', await upd.text());
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/requests`, {
      method: 'POST',
      headers: { ...restHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        ...fields,
        user_id: user.id,
        user_email: user.email,           // verified login email, not client-supplied
        request_type,
        tmdb_id: tmdb_id || null,
        season_number: season_number || null,
        price,
        payment_status: 'pending',
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('create-request-pending: insert failed', errText);
      res.status(500).json({ error: 'Could not create request record' });
      return;
    }

    const [insertedRow] = await insertRes.json();
    res.status(200).json({ success: true, request_id: insertedRow.id, request_type, price });
  } catch (err) {
    console.error('create-request-pending error:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};
