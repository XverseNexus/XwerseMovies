// api/create-request-order.js
// Creates a Cashfree order for a Pay-Per-Request payment (Movie ₹9 /
// Season ₹29 / Complete Series ₹59), and inserts the corresponding
// `requests` row with payment_status='pending'. The row only becomes
// real/actionable once api/cashfree-request-webhook.js confirms payment
// and flips payment_status to 'paid'.
//
// Required Vercel Environment Variables (same ones already used for the
// old subscription checkout — nothing new to add):
//   CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL

// Prices are looked up server-side ONLY — never trust a price sent by
// the browser, or anyone could pay ₹1 for a ₹59 request by editing the
// request body. Keep this in sync with xwerse-config.js's REQUEST_PRICES.
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
    uid, email, name, phone,
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
  if (!/^\d{10}$/.test(String(phone || ''))) {
    res.status(400).json({ error: 'A valid 10-digit phone number is required' });
    return;
  }

  const price = REQUEST_PRICES[request_type];

  const SUPABASE_URL         = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CASHFREE_APP_ID      = process.env.CASHFREE_APP_ID;
  const CASHFREE_SECRET_KEY  = process.env.CASHFREE_SECRET_KEY;
  const CASHFREE_ENV         = process.env.CASHFREE_ENV || 'sandbox';
  const SITE_URL             = process.env.SITE_URL;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !CASHFREE_APP_ID || !CASHFREE_SECRET_KEY || !SITE_URL) {
    console.error('create-request-order: missing environment variables');
    res.status(500).json({ error: 'Server is not configured correctly' });
    return;
  }

  try {
    // ── 1. Insert the pending request row ──────────────
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
      console.error('create-request-order: insert failed', errText);
      res.status(500).json({ error: 'Could not create request record' });
      return;
    }

    const [insertedRow] = await insertRes.json();
    const requestId = insertedRow.id;
    const orderId   = `req_${requestId}`;

    // ── 2. Create the Cashfree order ────────────────────
    const cfBase = CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

    const cfRes = await fetch(`${cfBase}/orders`, {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: price,
        order_currency: 'INR',
        customer_details: {
          customer_id: uid,
          customer_name: name || 'XwerseMovies User',
          customer_email: email,
          customer_phone: phone,
        },
        order_meta: {
          return_url: `${SITE_URL}/XwerseMovies_Request.html?order_id=${orderId}`,
          notify_url: `${SITE_URL}/api/cashfree-request-webhook`,
        },
        order_note: `${request_type} request: ${title}`,
        order_tags: {
          request_id: String(requestId),
        },
      }),
    });

    const cfData = await cfRes.json();

    if (!cfRes.ok || !cfData.payment_session_id) {
      console.error('create-request-order: Cashfree order creation failed', cfData);
      // Mark the row as failed so it doesn't sit around as a phantom 'pending'
      await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${requestId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payment_status: 'failed' }),
      }).catch(() => {});
      res.status(500).json({ error: cfData.message || 'Could not start payment' });
      return;
    }

    res.status(200).json({
      payment_session_id: cfData.payment_session_id,
      order_id: orderId,
    });
  } catch (err) {
    console.error('create-request-order error:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};
