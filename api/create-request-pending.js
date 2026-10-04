// api/create-request-pending.js
// LIGHTWEIGHT version of create-request-order.js for the temporary static
// Cashfree Payment Forms fallback (used while Orders-API whitelisting is
// blocked — see handoff notes). This endpoint does NOT call any Cashfree
// API — it only inserts a `requests` row with payment_status='pending'.
// The user is then redirected (client-side) to the matching static
// Payment Form URL. api/cashfree-payment-form-webhook.js is what flips
// this row to 'paid' once Cashfree confirms the payment.
//
// Required Vercel Environment Variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// NOTE: unlike create-request-order.js, we do NOT collect/store a phone
// number here — the static Payment Form collects name/phone/email itself.

// Prices are looked up server-side ONLY — never trust a price sent by
// the browser. Keep this in sync with xwerse-config.js's REQUEST_PRICES.
const REQUEST_PRICES = {
  movie:  9,
  season: 29,
  series: 59,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    uid, email, name,
    title, request_type, tmdb_id, poster_url, season_number,
    preferred_language, preferred_audio, preferred_subtitle,
    preferred_quality, notes,
  } = req.body || {};

  // ── Validate ──────────────────────────────────────────
  if (!uid || !email || !title || !request_type) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  if (!REQUEST_PRICES[request_type]) {
    res.status(400).json({ error: 'Invalid request type' });
    return;
  }

  const price = REQUEST_PRICES[request_type];

  const SUPABASE_URL     = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('create-request-pending: missing environment variables');
    res.status(500).json({ error: 'Server is not configured correctly' });
    return;
  }

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/requests`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        user_id: uid,
        user_name: name || null,
        user_email: email,
        title,
        request_type,
        tmdb_id: tmdb_id || null,
        poster_url: poster_url || null,
        season_number: season_number || null,
        preferred_language: preferred_language || null,
        preferred_audio: preferred_audio || 'original',
        preferred_subtitle: preferred_subtitle || null,
        preferred_quality: ['highest','360p','480p','720p','1080p'].includes(preferred_quality) ? preferred_quality : 'highest', // max 1080p
        notes: notes || null,
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

    res.status(200).json({
      success: true,
      request_id: insertedRow.id,
      request_type,
      price,
    });
  } catch (err) {
    console.error('create-request-pending error:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};
