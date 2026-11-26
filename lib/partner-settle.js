// lib/partner-settle.js — weekly settlement maths + wallet (shared by partner-admin.js and partner.js)
const C = require('./partner-common');

const DEFAULTS = {
  est_rate_default: 0.0007, est_rate_by_country: {}, share_pct: 50,
  country_weights: {}, default_weight: 10,   // Voe tier weights (45/30/20/15/10) by viewer country
  hold_days: 14, min_usd: 5, min_inr: 500, usd_inr: 85, usd_inr_auto: true,   // usd_inr = manual fallback
};
async function getSettings() {
  const r = await C.sb('partner_settings?select=key,value');
  const out = { ...DEFAULTS };
  if (Array.isArray(r.data)) r.data.forEach(x => { if (x.key in out) out[x.key] = x.value; });
  return out;
}
const wOf = (cfg, country) => {
  const v = cfg.country_weights && cfg.country_weights[country];
  return Number.isFinite(+v) && v !== undefined && v !== null && +v > 0 ? +v : +cfg.default_weight;
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d, n) => C.utcDay(new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5));

// Pro-rata split of the REAL Voe money of that week over ALL counted views (partners + organic), weighted by viewer country.
async function compute(weekEnd, voeTotal, cfg) {
  const start = addDays(weekEnd, -6);
  const rows = await C.sbAll(`view_events?qualified=eq.true&day=gte.${start}&day=lte.${weekEnd}&select=partner_id,user_id,country,ip_hash`);
  const by = {}; let totalW = 0;
  for (const r of rows) {
    const w = wOf(cfg, r.country); totalW += w;
    if (!r.partner_id) continue;
    const p = by[r.partner_id] = by[r.partner_id] || { partner_id: r.partner_id, views: 0, weight: 0, users: new Set(), ips: new Set() };
    p.views++; p.weight += w; if (r.user_id) p.users.add(r.user_id); if (r.ip_hash) p.ips.add(r.ip_hash);
  }
  const share = Math.min(100, Math.max(0, +cfg.share_pct || 50)) / 100;
  const lines = Object.values(by).map(p => {
    const amount = totalW > 0 ? voeTotal * share * (p.weight / totalW) : 0;
    const flags = [];
    if (p.views >= 10 && p.users.size / p.views < 0.3) flags.push('few_viewers');
    if (p.views >= 10 && p.ips.size / p.views < 0.3) flags.push('few_ips');
    return { partner_id: p.partner_id, views: p.views, weight: Math.round(p.weight * 10000) / 10000, amount_usd: Math.round(amount * 1e6) / 1e6, viewers: p.users.size, ips: p.ips.size, flags };
  }).sort((a, b) => b.amount_usd - a.amount_usd);
  return { week_start: start, week_end: weekEnd, total_views: rows.length, total_weight: Math.round(totalW * 10000) / 10000, share_pct: share * 100, lines };
}

// What a partner has earned / can take out
async function wallet(partnerId, cfg) {
  const [ls, ps] = await Promise.all([
    C.sbAll(`settlement_lines?partner_id=eq.${partnerId}&select=amount_usd,settlements!inner(status,voe_paid,approved_at,week_end)`),
    C.sbAll(`payouts?partner_id=eq.${partnerId}&select=id,amount_usd,status,method,created_at,decided_at,txn_ref,admin_note&order=id.desc`),
  ]);
  const holdMs = (+cfg.hold_days || 0) * 864e5, now = Date.now();
  let available = 0, held = 0, waiting = 0;
  for (const l of ls) {
    const s = l.settlements; if (!s || s.status !== 'approved') { waiting += +l.amount_usd; continue; }
    if (s.voe_paid && s.approved_at && now - new Date(s.approved_at).getTime() >= holdMs) available += +l.amount_usd; else held += +l.amount_usd;
  }
  const reserved = ps.filter(p => p.status !== 'rejected').reduce((a, p) => a + +p.amount_usd, 0);
  const paid = ps.filter(p => p.status === 'paid').reduce((a, p) => a + +p.amount_usd, 0);
  const r4 = n => Math.round(n * 10000) / 10000;
  return { available: r4(Math.max(0, available - reserved)), held: r4(held), draft: r4(waiting), paid: r4(paid), requested: r4(ps.filter(p => p.status === 'requested').reduce((a, p) => a + +p.amount_usd, 0)), payouts: ps.slice(0, 50) };
}

// Live USD→INR (no key needed). Cached 6 h in partner_settings; falls back to the last good value, then to the manual rate.
const FX_SOURCES = [
  ['https://open.er-api.com/v6/latest/USD', j => j && j.rates && j.rates.INR],
  ['https://api.frankfurter.app/latest?from=USD&to=INR', j => j && j.rates && j.rates.INR],
];
async function getUsdInr(cfg) {
  const manual = +cfg.usd_inr || 85;
  if (cfg.usd_inr_auto === false) return { rate: manual, source: 'manual' };
  let cache = null;
  const r = await C.sb('partner_settings?key=eq.usd_inr_cache&select=value');
  if (Array.isArray(r.data) && r.data[0]) cache = r.data[0].value;
  if (cache && cache.rate && Date.now() - new Date(cache.at).getTime() < 6 * 3600e3) return { rate: +cache.rate, source: 'live', at: cache.at };
  for (const [url, pick] of FX_SOURCES) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) continue;
      const v = +pick(await resp.json());
      if (v >= 50 && v <= 200) {
        const at = new Date().toISOString();
        await C.sb('partner_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { key: 'usd_inr_cache', value: { rate: v, at }, updated_at: at } });
        return { rate: v, source: 'live', at };
      }
    } catch (e) {}
  }
  if (cache && cache.rate) return { rate: +cache.rate, source: 'last-known', at: cache.at };
  return { rate: manual, source: 'manual' };
}

module.exports = { getUsdInr, DEFAULTS, getSettings, compute, wallet, DAY_RE, addDays };
