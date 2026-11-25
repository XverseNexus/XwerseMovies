// lib/partner-common.js — helpers shared by api/partner.js and api/partner-admin.js
const crypto = require('crypto');

const URL_  = () => process.env.SUPABASE_URL;
const KEY_  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr   = (extra) => ({ apikey: KEY_(), Authorization: `Bearer ${KEY_()}`, 'Content-Type': 'application/json', ...(extra || {}) });

// REST call to Supabase with the service-role key. → { ok, status, data }
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, {
    method,
    headers: hdr(prefer ? { Prefer: prefer } : undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const txt = await r.text();
  if (txt) { try { data = JSON.parse(txt); } catch (e) { data = txt; } }
  return { ok: r.ok, status: r.status, data };
}

// Supabase returns max 1000 rows per request → page through.
async function sbAll(path, maxRows = 30000) {
  const out = [];
  for (let off = 0; off < maxRows; off += 1000) {
    const r = await sb(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${off}`);
    if (!r.ok || !Array.isArray(r.data)) break;
    out.push(...r.data);
    if (r.data.length < 1000) break;
  }
  return out;
}

// Who is calling? → { id, email, verified } or null
async function getUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const r = await fetch(`${URL_()}/auth/v1/user`, { headers: { apikey: KEY_(), Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id) return null;
  return { id: u.id, email: u.email || '', verified: !!(u.email_confirmed_at || u.confirmed_at) };
}

async function isStaff(userId) {
  const r = await sb(`profiles?id=eq.${encodeURIComponent(userId)}&select=is_admin,role`);
  const me = Array.isArray(r.data) ? r.data[0] : null;
  return !!(me && (me.is_admin === true || me.role === 'admin' || me.role === 'moderator'));
}

const clientIp = (req) => {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  let ip = xf || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || '';
  ip = ip.replace(/^::ffff:/i, '');
  // IPv6: one home connection hands out many addresses (privacy extensions) → count the whole /64 as one
  if (ip.includes(':')) {
    const parts = ip.split('::')[0].split(':');
    ip = parts.slice(0, 4).join(':') + '::/64';
  }
  return ip;
};
const hashIp = (ip) => crypto.createHash('sha256').update((process.env.IP_HASH_SALT || KEY_() || 'x') + '|' + ip).digest('hex').slice(0, 32);
const country = (req) => String(req.headers['x-vercel-ip-country'] || '').toUpperCase().slice(0, 2) || null;
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

// VPN / proxy / Tor / datacenter check (ipapi.is, free key = 1000 lookups per day). Cached 24h per IP hash.
// No key set → { checked:false } and nothing is blocked.
async function vpnCheck(ip, ipHash) {
  const key = process.env.IPAPI_KEY;
  if (!key || !ip) return { checked: false, vpn: false };
  const cached = await sb(`ip_checks?ip_hash=eq.${ipHash}&select=vpn,checked_at`);
  const c = Array.isArray(cached.data) ? cached.data[0] : null;
  if (c && Date.now() - new Date(c.checked_at).getTime() < 24 * 3600 * 1000) return { checked: true, vpn: !!c.vpn };
  try {
    const r = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return { checked: false, vpn: false };
    const d = await r.json();
    const vpn = !!(d.is_vpn || d.is_proxy || d.is_tor || d.is_datacenter);
    await sb('ip_checks?on_conflict=ip_hash', { method: 'POST', body: { ip_hash: ipHash, vpn, checked_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates' });
    return { checked: true, vpn };
  } catch (e) { return { checked: false, vpn: false }; }
}

module.exports = { sb, sbAll, getUser, isStaff, clientIp, hashIp, country, utcDay, vpnCheck };
