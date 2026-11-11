// api/cashfree-payment-form-webhook.js
// Webhook for the TEMPORARY static Cashfree Payment Forms fallback (used
// while Orders-API whitelisting is blocked — see handoff notes).
//
// IMPORTANT (corrected after checking real webhook logs in the Cashfree
// dashboard): Payment Forms do NOT send a special "PAYMENT_FORM_ORDER_
// WEBHOOK" event — they send the exact same standard PG payment webhooks
// as every other Cashfree product:
//   type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK" | "PAYMENT_USER_DROPPED_WEBHOOK"
// with payload shape:
//   { data: { order: {...}, payment: {...}, customer_details: {...} }, event_time, type }
// (customer_details is a TOP-LEVEL sibling of order/payment, not nested
// inside order — an earlier version of this file had that wrong.)
// Reference: https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks
//
// Payment Forms don't let us attach our own order_tags/reference the way
// the Orders API does, so we can't match a webhook to a `requests` row by
// ID directly. Instead we correlate by:
//
//   (customer_email + payment_amount → request_type + payment_status='pending',
//    most recently created)
//
// This relies on the user paying with the SAME email they used to log
// into the site (the Request page tells them this before redirecting).
// Matching only against rows still in 'pending' also makes this
// naturally idempotent if Cashfree retries the webhook.
//
// Configure in Cashfree Dashboard → Developers → Webhooks, subscribed to
// PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK, and
// PAYMENT_USER_DROPPED_WEBHOOK, pointing at:
//   https://xwersemovies.bond/api/cashfree-payment-form-webhook

const crypto = require('crypto');

// Keep in sync with xwerse-config.js's REQUEST_PRICES and
// api/create-request-pending.js.
const PRICE_TO_TYPE = {
  9:  'movie',
  29: 'season',
  59: 'series',
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function handler(req, res) {
  console.log('cashfree-payment-form-webhook: invoked', { method: req.method });

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
  const SUPABASE_URL        = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!CASHFREE_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('cashfree-payment-form-webhook: missing environment variables', {
      hasSecret: !!CASHFREE_SECRET_KEY, hasUrl: !!SUPABASE_URL, hasServiceKey: !!SERVICE_ROLE_KEY,
    });
    res.status(500).json({ error: 'Server is not configured correctly' });
    return;
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('cashfree-payment-form-webhook: failed to read raw body', err);
    res.status(400).json({ error: 'Could not read request body' });
    return;
  }
  console.log('cashfree-payment-form-webhook: raw body length', rawBody.length);
  if (!rawBody.length) {
    console.error('cashfree-payment-form-webhook: raw body is EMPTY — bodyParser was likely not disabled correctly, or req stream was already consumed');
  }

  // ── Verify signature: HMAC-SHA256(timestamp + rawBody), base64 ──
  const timestamp = req.headers['x-webhook-timestamp'];
  const signature = req.headers['x-webhook-signature'];
  console.log('cashfree-payment-form-webhook: headers present?', { hasTimestamp: !!timestamp, hasSignature: !!signature });
  if (!timestamp || !signature) {
    console.error('cashfree-payment-form-webhook: missing signature headers', { headerKeys: Object.keys(req.headers) });
    res.status(401).json({ error: 'Missing signature headers' });
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', CASHFREE_SECRET_KEY)
    .update(timestamp + rawBody)
    .digest('base64');

  if (!safeEqual(expectedSignature, signature)) {
    console.error('cashfree-payment-form-webhook: signature mismatch — rejecting', {
      expectedLen: expectedSignature.length, receivedLen: signature.length,
    });
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }
  console.log('cashfree-payment-form-webhook: signature verified OK');

  // ── Parse payload ──────────────────────────────────────
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.error('cashfree-payment-form-webhook: invalid JSON in body', { rawBodyPreview: rawBody.slice(0, 200) });
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  console.log('cashfree-payment-form-webhook: payload type', body.type);

  const VALID_TYPES = ['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'];
  if (!VALID_TYPES.includes(body.type)) {
    // Not a payment event we care about (e.g. refund/dispute webhooks if
    // ever subscribed by mistake) — ack and ignore.
    console.log('cashfree-payment-form-webhook: ignoring non-matching event type', body.type);
    res.status(200).json({ received: true, note: 'ignored event type' });
    return;
  }

  const payment         = body.data?.payment || {};
  const orderInfo        = body.data?.order || {};
  const customerDetails = body.data?.customer_details || {}; // top-level under data, NOT nested in order
  const paymentStatus   = payment.payment_status; // 'SUCCESS' | 'FAILED' | 'USER_DROPPED'
  const paymentAmount   = Number(payment.payment_amount ?? orderInfo.order_amount);
  const cfPaymentId     = payment.cf_payment_id || null;
  const customerEmail   = (customerDetails.customer_email || '').trim();

  const requestType = PRICE_TO_TYPE[paymentAmount] || (() => {
    // Fallback: tolerate tiny rounding/fee differences (e.g. 9.02 instead
    // of 9) by matching to the closest known price within ₹2.
    const closest = Object.keys(PRICE_TO_TYPE)
      .map(Number)
      .find(p => Math.abs(p - paymentAmount) <= 2);
    if (closest) {
      console.log('cashfree-payment-form-webhook: exact price match failed, used tolerant fallback', { paymentAmount, matchedPrice: closest });
      return PRICE_TO_TYPE[closest];
    }
    return undefined;
  })();
  // The DB stores our canonical price (9/29/59), not whatever Cashfree
  // actually charged (which could differ slightly with fees/rounding) —
  // so look up the canonical price to query by, not the raw paymentAmount.
  const dbPrice = requestType
    ? Number(Object.keys(PRICE_TO_TYPE).find(p => PRICE_TO_TYPE[p] === requestType))
    : null;
  console.log('cashfree-payment-form-webhook: parsed payment', {
    paymentStatus, paymentAmount, requestType, dbPrice, customerEmail, cfPaymentId,
  });

  if (!customerEmail || !requestType) {
    // Can't correlate this to a request — ack so Cashfree stops retrying,
    // but log it since it means either a price mismatch or a non-request
    // form got wired to this webhook by mistake.
    console.error('cashfree-payment-form-webhook: could not correlate', {
      customerEmail, paymentAmount, cfPaymentId,
    });
    res.status(200).json({ received: true, note: 'could not correlate to a request' });
    return;
  }

  const isSuccess = paymentStatus === 'SUCCESS';
  const isFailure = paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED';

  if (!isSuccess && !isFailure) {
    // Shouldn't happen given VALID_TYPES check above, but stay defensive.
    res.status(200).json({ received: true, note: `ignored payment_status ${paymentStatus}` });
    return;
  }

  const restHeaders = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Find the most recent still-pending request for this email + price.
    // Filtering on payment_status=eq.pending here is what makes this
    // idempotent against Cashfree webhook retries.
    const findUrl = `${SUPABASE_URL}/rest/v1/requests`
      + `?user_email=eq.${encodeURIComponent(customerEmail)}`
      + `&price=eq.${dbPrice}`
      + `&payment_status=eq.pending`
      + `&order=created_at.desc`
      + `&limit=1&select=*`;

    const getRes = await fetch(findUrl, { headers: restHeaders });
    const rows = await getRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    console.log('cashfree-payment-form-webhook: correlation query result', {
      findUrl, matchedCount: Array.isArray(rows) ? rows.length : 'ERROR', matchedId: row?.id,
    });

    if (!row) {
      // No matching pending row — most likely the user paid with a
      // different email than their site login. Log for manual admin
      // reconciliation rather than silently dropping the payment.
      console.error('cashfree-payment-form-webhook: no matching pending request', {
        customerEmail, paymentAmount, requestType, cfPaymentId,
      });
      res.status(200).json({ received: true, note: 'no matching pending request found' });
      return;
    }

    const newStatus = isSuccess ? 'paid' : 'failed';

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: restHeaders,
      body: JSON.stringify({
        payment_status: newStatus,
        cashfree_payment_id: cfPaymentId,
      }),
    });
    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error('Failed to update request: ' + errText);
    }

    // Notify the user — success or failure, they should know either way.
    const notifBody = isSuccess
      ? `✅ Payment successful! Your request for "${row.title}" has been submitted and is now pending review.`
      : `❌ Payment for your "${row.title}" request didn't go through. No amount was charged — please try again.`;

    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...restHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify([{
        user_id: row.user_id,
        title: isSuccess ? '🎬 Request Submitted' : '⚠️ Payment Failed',
        body: notifBody,
        image_url: row.poster_url || null,
        is_read: false,
      }]),
    }).catch((e) => console.error('cashfree-payment-form-webhook: notification insert failed', e));

    res.status(200).json({ received: true, status: newStatus, request_id: row.id });
  } catch (err) {
    console.error('cashfree-payment-form-webhook error:', err);
    // Still 200 — Cashfree retries on non-2xx, and retrying won't fix a
    // bug on our end. Log it for us to investigate instead.
    res.status(200).json({ received: true, error: 'internal error, logged' });
  }
}

module.exports = handler;
// Vercel needs the RAW request body (byte-for-byte) to verify the
// signature correctly — this MUST be attached to the same function
// object we actually export, not a discarded intermediate one.
module.exports.config = {
  api: { bodyParser: false },
};
