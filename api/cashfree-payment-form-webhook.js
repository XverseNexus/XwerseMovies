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
//   (customer_email + payment_amount → request_type, newest matching row)
//
// This relies on the user paying with the SAME email they used to log
// into the site (the Request page makes them copy it before redirecting).
// Matching rules:
//   * Email is compared case-insensitively; for Gmail, dots and "+tags" are
//     ignored too (they all reach the same mailbox).
//   * A SUCCESS payment matches the newest 'pending' row, else the newest
//     'failed' row — so a user whose first attempt failed/dropped and who then
//     retried successfully on the same form is still activated.
//   * USER_DROPPED events are ignored (the user may simply retry); only a real
//     FAILED event marks a pending row failed.
//   * Idempotent: a payment id (cf_payment_id) that is already stored on a row
//     is never applied twice, so Cashfree webhook retries can't activate a
//     second request.
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

// Lower-case + trim; for Gmail also drop dots and the "+tag" part.
function normalizeEmail(e) {
  const v = String(e || '').trim().toLowerCase();
  const at = v.lastIndexOf('@');
  if (at < 1) return v;
  let local = v.slice(0, at), domain = v.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    domain = 'gmail.com';
  }
  return local + '@' + domain;
}

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

  if (body.type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    // The customer closed the payment page; they may well retry and succeed.
    // Don't touch the request (and don't notify) — just acknowledge.
    console.log('cashfree-payment-form-webhook: user dropped — no state change');
    res.status(200).json({ received: true, note: 'user dropped, ignored' });
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
  const isFailure = paymentStatus === 'FAILED';

  if (!isSuccess && !isFailure) {
    // Defensive: anything else (e.g. PENDING) is not actionable.
    res.status(200).json({ received: true, note: `ignored payment_status ${paymentStatus}` });
    return;
  }

  const restHeaders = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Idempotency: if this exact payment was already applied to a request,
    // acknowledge and stop (Cashfree retries webhooks).
    if (isSuccess && cfPaymentId) {
      const dupRes = await fetch(
        `${SUPABASE_URL}/rest/v1/requests?cashfree_payment_id=eq.${encodeURIComponent(cfPaymentId)}&select=id&limit=1`,
        { headers: restHeaders }
      );
      const dupRows = dupRes.ok ? await dupRes.json() : [];
      if (Array.isArray(dupRows) && dupRows.length) {
        console.log('cashfree-payment-form-webhook: payment already applied, ignoring retry', { cfPaymentId, requestId: dupRows[0].id });
        res.status(200).json({ received: true, note: 'already processed' });
        return;
      }
    }

    // Candidate rows for this amount. Email is compared in JS (normalised), not in
    // the query, so "User@Gmail.com" / "u.ser@gmail.com" still match.
    const statusFilter = isSuccess ? 'in.(pending,failed)' : 'eq.pending';
    const findUrl = `${SUPABASE_URL}/rest/v1/requests`
      + `?price=eq.${dbPrice}`
      + `&payment_status=${statusFilter}`
      + `&order=created_at.desc`
      + `&limit=200&select=*`;

    const getRes = await fetch(findUrl, { headers: restHeaders });
    const rows = await getRes.json();
    const wanted = normalizeEmail(customerEmail);
    const matches = Array.isArray(rows) ? rows.filter(r => normalizeEmail(r.user_email) === wanted) : [];
    // Prefer a still-pending row; fall back to the newest failed one (retry-after-failure case).
    const row = matches.find(r => r.payment_status === 'pending') || matches[0] || null;
    console.log('cashfree-payment-form-webhook: correlation result', {
      candidates: Array.isArray(rows) ? rows.length : 'ERROR', matched: matches.length, matchedId: row?.id,
    });

    if (!row) {
      // No matching row — most likely the user paid with a different email than their
      // site login (or paid without creating a request). Log for manual reconciliation.
      console.error('cashfree-payment-form-webhook: no matching request', {
        customerEmail, paymentAmount, requestType, cfPaymentId, paymentStatus,
      });
      res.status(200).json({ received: true, note: 'no matching request found' });
      return;
    }

    const newStatus = isSuccess ? 'paid' : 'failed';

    // Instant access: a movie whose PAID embed the admin already set up is handed over
    // the moment the payment is confirmed (no waiting for "Give Access").
    let paidUrl = null;
    if (isSuccess && row.request_type === 'movie' && row.tmdb_id) {
      try {
        const pe = await fetch(
          `${SUPABASE_URL}/rest/v1/movie_paid_embeds?tmdb_id=eq.${encodeURIComponent(row.tmdb_id)}&media_type=eq.movie&select=paid_url&limit=1`,
          { headers: restHeaders }
        );
        const peRows = pe.ok ? await pe.json() : [];
        paidUrl = (Array.isArray(peRows) && peRows[0]?.paid_url) || null;
      } catch (e) { console.error('cashfree-payment-form-webhook: paid-embed lookup failed (non-fatal)', e); }
    }

    const patchBody = { payment_status: newStatus, cashfree_payment_id: cfPaymentId };
    if (paidUrl) {
      patchBody.watch_url   = paidUrl;
      patchBody.status      = 'completed';
      patchBody.admin_notes = '[AUTO] Paid embed was already set by admin — access given automatically when the payment was confirmed.';
    }

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: restHeaders,
      body: JSON.stringify(patchBody),
    });
    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error('Failed to update request: ' + errText);
    }

    // Notify the user — success or failure, they should know either way.
    const notifBody = paidUrl
      ? `Payment received. "${row.title}" is ready to watch — open My Requests and tap Watch Now.`
      : isSuccess
      ? `Payment received for "${row.title}". We are processing your request and you will get access within 24 hours.`
      : `Your payment for "${row.title}" didn't go through. No amount was charged — please try again.`;

    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...restHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify([{
        user_id: row.user_id,
        title: paidUrl ? 'Your request is ready' : (isSuccess ? 'Payment received' : 'Payment failed'),
        body: notifBody,
        image_url: row.poster_url || null,
        is_read: false,
      }]),
    }).catch((e) => console.error('cashfree-payment-form-webhook: notification insert failed', e));

    res.status(200).json({ received: true, status: newStatus, request_id: row.id, auto_granted: !!paidUrl });
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
