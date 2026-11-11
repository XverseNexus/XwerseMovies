// ═══════════════════════════════════════════════════════════
//  POST /api/grant-request-access        (admin / moderator only)
//
//  One call that finishes a paid request from the Admin panel:
//    action: "grant"  → saves the watch link(s), marks the request
//                       'completed' and notifies the user.
//    action: "reject" → marks the request 'rejected' and notifies the
//                       user that a refund is on its way.
//
//  Runs server-side with the service-role key because inserting a
//  notification FOR ANOTHER USER is (rightly) blocked by RLS from the
//  browser. Same auth pattern as api/notify-new-movie.js.
//
//  Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════

// One link per line, optionally prefixed with an episode tag (S1E2 / E2 / 2).
function validWatchLinks(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  return lines.every(l =>
    /^https:\/\/\S+$/i.test(l) ||
    /^(?:S\d+\s*[ ._-]?)?E?\d+\s*[:=\s-]\s*https:\/\/\S+$/i.test(l)
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('grant-request-access: missing Supabase env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    // ── AUTH: admin / moderator only ──
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

    // ── Input ──
    const { id, action, watch_url } = req.body || {};
    if (!id || !/^[0-9a-f-]{8,}$/i.test(String(id))) return res.status(400).json({ error: 'Invalid request id' });
    if (action !== 'grant' && action !== 'reject') return res.status(400).json({ error: 'Invalid action' });

    const gRes = await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${encodeURIComponent(id)}&select=*`, { headers: H });
    const gRows = gRes.ok ? await gRes.json() : [];
    const row = Array.isArray(gRows) ? gRows[0] : null;
    if (!row) return res.status(404).json({ error: 'Request not found' });
    if (row.payment_status !== 'paid') return res.status(400).json({ error: 'This request is not paid' });

    let patch, notif;
    if (action === 'grant') {
      if (!validWatchLinks(watch_url)) {
        return res.status(400).json({ error: 'Invalid watch link(s). Use https:// links, one per line (E1 https://… for episodes).' });
      }
      patch = { watch_url: String(watch_url).split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n'), status: 'completed' };
      // Only notify the first time access is given (not on later link edits)
      if (row.status !== 'completed') {
        notif = {
          title: '🎬 Your request is ready!',
          body: `"${row.title}" is ready to watch. Open My Requests and tap Watch Now.`,
        };
      }
    } else {
      patch = { status: 'rejected' };
      notif = {
        title: 'Request could not be fulfilled',
        body: `Sorry, we couldn't arrange "${row.title}". Your payment of ₹${row.price} will be refunded to the original payment method within 5–7 business days.`,
      };
    }

    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/requests?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: H, body: JSON.stringify(patch),
    });
    if (!pRes.ok) {
      console.error('grant-request-access: update failed', await pRes.text());
      return res.status(500).json({ error: 'Could not update the request' });
    }

    if (notif) {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify([{ user_id: row.user_id, ...notif, image_url: row.poster_url || null, is_read: false }]),
      }).catch(e => console.error('grant-request-access: notification failed (non-fatal)', e));
    }

    return res.status(200).json({ success: true, status: patch.status });
  } catch (err) {
    console.error('grant-request-access error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
