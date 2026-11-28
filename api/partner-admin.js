// api/partner-admin.js — STAFF ONLY (admin / moderator) side of the partner program, Stage 1.
//
// POST  Authorization: Bearer <staff session token>
//   { action:'status' }                                   → { me: {code,status}|null, vpn_check: bool }
//   { action:'become_test_partner' }                      → { code }   (creates the caller's own test partner)
//   { action:'titles_list' }                              → { titles:[{tmdb_id,media_type,enabled}] }
//   { action:'titles_set', tmdb_id, media_type, enabled } → { ok }
//   { action:'report', from:'YYYY-MM-DD', to:'YYYY-MM-DD', host:'voe' }
//        → calibration numbers: per day / per partner / per country, from OUR tracking, to compare with
//          the VOE "Insights → Table" (their Paid views). host = only views whose embed host contains this text.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const C = require('../lib/partner-common');
const S = require('../lib/partner-settle');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server is not configured correctly' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await C.getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    const role = await C.staffRole(user.id);
    if (!role) return res.status(403).json({ error: 'Staff only' });
    const isAdmin = role === 'admin';
    const adminOnly = () => { if (!isAdmin) { res.status(403).json({ error: 'Only the admin can do this' }); return true; } return false; };
    const logIt = (sid, action, detail) => C.sb('settlement_log', { method: 'POST', body: { settlement_id: sid || null, actor: user.id, action, detail: detail || null } });
    const b = req.body || {};
    // strict money input: a number or numeric string, never null / '' / NaN
    const amt = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e7 ? Number(v) : null;
    const maskAddr = (a) => isAdmin || !a ? a : '••••' + String(a).slice(-4);

    if (b.action === 'status') {
      const r = await C.sb(`partners?user_id=eq.${user.id}&select=code,status`);
      return res.status(200).json({ me: Array.isArray(r.data) && r.data[0] ? r.data[0] : null, vpn_check: !!process.env.IPAPI_KEY });
    }

    if (b.action === 'become_test_partner') {
      const have = await C.sb(`partners?user_id=eq.${user.id}&select=code`);
      if (Array.isArray(have.data) && have.data[0]) return res.status(200).json({ code: have.data[0].code });
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let lastErr = null;
      for (let i = 0; i < 6; i++) {
        let code = ''; for (let k = 0; k < 7; k++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        const ins = await C.sb('partners', { method: 'POST', body: { user_id: user.id, code } });
        if (ins.ok) return res.status(200).json({ code });
        lastErr = ins;
        if (ins.status !== 409) break;
      }
      const why = lastErr ? (lastErr.status + ' ' + (lastErr.data && (lastErr.data.message || lastErr.data.hint) || JSON.stringify(lastErr.data || ''))).slice(0, 160) : '';
      return res.status(500).json({ error: 'Could not create a code: ' + why });
    }

    if (b.action === 'settings_get') {
      const cfg = await S.getSettings(); const fx = await S.getUsdInr(cfg); const lb = await S.learnedBase();
      return res.status(200).json({ ...cfg, usd_inr_live: Math.round(fx.rate * 100) / 100, usd_inr_source: fx.source, learned: lb ? { base: lb.base, weeks: lb.weeks } : null });
    }

    if (b.action === 'settings_set') {
      if (adminOnly()) return;
      const num = (v, lo, hi) => { const n = Number(v); return n >= lo && n <= hi ? n : null; };
      const cur = await S.getSettings();
      const next = {
        est_rate_default: num(b.est_rate_default, 0, 1), share_pct: num(b.share_pct, 1, 100),
        default_weight: num(b.default_weight ?? cur.default_weight, 0.01, 1000), hold_days: num(b.hold_days ?? cur.hold_days, 0, 120),
        min_usd: num(b.min_usd ?? cur.min_usd, 0, 10000), min_inr: num(b.min_inr ?? cur.min_inr, 0, 1000000), usd_inr: num(b.usd_inr ?? cur.usd_inr, 1, 1000),
      };
      next.promo_hosts = Array.isArray(b.promo_hosts) ? b.promo_hosts.map(x => String(x).toLowerCase().replace(/[^a-z0-9.\-]/g, '')).filter(Boolean).slice(0, 20) : cur.promo_hosts;
      if (!next.promo_hosts.length) next.promo_hosts = ['voe'];
      next.est_auto = b.est_auto === undefined ? cur.est_auto !== false : b.est_auto !== false;
      next.est_safety = num(b.est_safety ?? cur.est_safety, 0.3, 1) ?? cur.est_safety;
      next.usd_inr_auto = b.usd_inr_auto === undefined ? cur.usd_inr_auto !== false : b.usd_inr_auto !== false;
      for (const [k, v] of Object.entries(next)) if (v === null) return res.status(400).json({ error: 'Invalid value for ' + k });
      const mapOf = (obj, hi) => { const o = {}; for (const [k, v] of Object.entries(obj || {})) if (/^[A-Z]{2}$/.test(k) && Number(v) >= 0 && Number(v) <= hi) o[k] = Number(v); return o; };
      next.est_rate_by_country = b.est_rate_by_country ? mapOf(b.est_rate_by_country, 1) : cur.est_rate_by_country;
      next.country_weights = b.country_weights ? mapOf(b.country_weights, 1000) : cur.country_weights;
      const rows = Object.entries(next).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
      const r = await C.sb('partner_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: rows });
      if (!r.ok) return res.status(500).json({ error: 'Could not save (' + r.status + ')' });
      await logIt(null, 'settings_set', next);
      return res.status(200).json({ ok: true });
    }

    // ── weekly settlement ────────────────────────────────────────────
    const weekDone = (d) => d < C.utcDay();        // the Sunday (UTC) must be over
    const weekEndOk = (d) => S.DAY_RE.test(d || '') && new Date(d + 'T00:00:00Z').getUTCDay() === 0;
    const withNames = async (lines) => {
      if (!lines.length) return lines;
      const ps = await C.sbAll('partners?select=user_id,code,status', 20000, 'user_id.asc');
      const ids = lines.map(l => l.partner_id), pr = [];
      for (let i = 0; i < ids.length; i += 60) pr.push(...await C.sbAll('profiles?select=id,name,email&id=in.(' + ids.slice(i, i + 60).join(',') + ')', 5000, 'id.asc'));
      return lines.map(l => { const p = ps.find(x => x.user_id === l.partner_id) || {}; const q = pr.find(x => x.id === l.partner_id) || {}; return { ...l, code: p.code, status: p.status, name: q.name || '', email: q.email || '' }; });
    };

    if (b.action === 'settle_preview') {
      if (!weekEndOk(b.week_end)) return res.status(400).json({ error: 'Week must end on a Sunday (YYYY-MM-DD)' });
      const total = amt(b.voe_total_usd);
      if (total === null) return res.status(400).json({ error: 'Enter the Voe total in USD' });
      const cfg = await S.getSettings();
      const c = await S.compute(b.week_end, total, cfg);
      c.finished = weekDone(b.week_end);
      c.lines = await withNames(c.lines);
      const ex = await C.sb(`settlements?week_start=eq.${c.week_start}&select=id,status,voe_total_usd,voe_paid,note`);
      c.existing = Array.isArray(ex.data) ? ex.data[0] || null : null;
      c.partners_total = Math.round(c.lines.reduce((a, l) => a + l.amount_usd, 0) * 1e4) / 1e4;
      return res.status(200).json(c);
    }

    if (b.action === 'settle_save') {
      if (!weekEndOk(b.week_end)) return res.status(400).json({ error: 'Week must end on a Sunday' });
      const total = amt(b.voe_total_usd);
      if (total === null) return res.status(400).json({ error: 'Enter the Voe total in USD' });
      if (!weekDone(b.week_end) && !isAdmin) return res.status(400).json({ error: 'This week is not over yet (UTC). Wait until Monday.' });
      const cfg = await S.getSettings();
      const c = await S.compute(b.week_end, total, cfg);
      const ex = await C.sb(`settlements?week_start=eq.${c.week_start}&select=id,status`);
      const old = Array.isArray(ex.data) ? ex.data[0] : null;
      if (old && old.status === 'approved') return res.status(409).json({ error: 'This week is already approved and locked' });
      const body = { week_start: c.week_start, week_end: c.week_end, voe_total_usd: total, voe_paid_views: parseInt(b.voe_paid_views, 10) || null, voe_all_views: parseInt(b.voe_all_views, 10) || null, our_views: c.eligible_views, share_pct: c.share_pct, total_weight: c.total_weight, note: String(b.note || '').slice(0, 300) || null, entered_by: user.id, status: 'draft', updated_at: new Date().toISOString(), partners_total: null, lines_count: null };
      let sid = old && old.id;
      if (old) {
        // only while still a draft (an approve that happened in between must not be undone)
        const up = await C.sb(`settlements?id=eq.${old.id}&status=eq.draft`, { method: 'PATCH', prefer: 'return=representation', body });
        if (!up.ok) return res.status(500).json({ error: 'Could not save (' + up.status + ')' });
        if (!Array.isArray(up.data) || !up.data.length) return res.status(409).json({ error: 'This week was approved meanwhile. Reload.' });
      } else { const ins = await C.sb('settlements', { method: 'POST', prefer: 'return=representation', body }); sid = Array.isArray(ins.data) && ins.data[0] && ins.data[0].id; if (!sid) return res.status(500).json({ error: 'Could not save (' + ins.status + ')' }); }
      const del = await C.sb(`settlement_lines?settlement_id=eq.${sid}`, { method: 'DELETE' });
      if (!del.ok) return res.status(500).json({ error: 'Could not clear old lines (' + del.status + '). Draft NOT usable — save again.' });
      if (c.lines.length) {
        const li = await C.sb('settlement_lines', { method: 'POST', body: c.lines.map(l => ({ settlement_id: sid, partner_id: l.partner_id, views: l.views, weight: l.weight, amount_usd: l.amount_usd })) });
        if (!li.ok) return res.status(500).json({ error: 'Could not save partner lines (' + li.status + '). Draft NOT usable — save again.' });
      }
      // integrity stamp: approve is only allowed when the lines in the DB add up to exactly this
      const ptot = Math.round(c.lines.reduce((a, l) => a + l.amount_usd, 0) * 1e6) / 1e6;
      const fin = await C.sb(`settlements?id=eq.${sid}`, { method: 'PATCH', body: { partners_total: ptot, lines_count: c.lines.length } });
      if (!fin.ok) return res.status(500).json({ error: 'Could not finish save (' + fin.status + '). Did you run sql/partner_stage6.sql?' });
      // housekeeping: raw rows of views that did NOT count are only useful for the calibration report → keep 60 days
      C.sb(`view_events?qualified=eq.false&day=lt.${C.utcDay(new Date(Date.now() - 60 * 864e5))}`, { method: 'DELETE' }).catch(() => {});
      await logIt(sid, old ? 'draft_updated' : 'draft_created', { voe_total_usd: total, partners: c.lines.length, role });
      return res.status(200).json({ ok: true, id: sid });
    }

    if (b.action === 'settle_list') {
      const rows = await (await C.sbAll('settlements?select=*', 2000, 'week_start.desc')).slice(0, 30);
      const ids = rows.map(r => r.id);
      const ls = ids.length ? await C.sbAll(`settlement_lines?settlement_id=in.(${ids.join(',')})&select=settlement_id,amount_usd`, 30000, 'settlement_id.asc,partner_id.asc') : [];
      return res.status(200).json({ role, settlements: rows.map(r => ({ ...r, partners_total: Math.round(ls.filter(l => l.settlement_id === r.id).reduce((a, l) => a + +l.amount_usd, 0) * 1e4) / 1e4 })) });
    }

    if (b.action === 'settle_approve') {
      if (adminOnly()) return;
      const id = parseInt(b.id, 10);
      const r = await C.sb(`settlements?id=eq.${id}&select=id,status,entered_by,week_end,updated_at,partners_total,lines_count,voe_total_usd`);
      const st = Array.isArray(r.data) ? r.data[0] : null;
      if (!st) return res.status(404).json({ error: 'Not found' });
      if (st.status === 'approved') return res.status(200).json({ ok: true });
      if (!weekDone(st.week_end)) return res.status(400).json({ error: 'This week is not over yet (UTC). Approve only after the week has ended.' });
      if (!b.updated_at || String(b.updated_at) !== String(st.updated_at)) return res.status(409).json({ error: 'The draft changed after you opened it. Reload and check the numbers again.' });
      // lines in the DB must match what was computed when the draft was saved
      const ls = await C.sbAll(`settlement_lines?settlement_id=eq.${id}&select=partner_id,amount_usd`, 30000, 'partner_id.asc');
      const sum = Math.round(ls.reduce((a, l) => a + +l.amount_usd, 0) * 1e6) / 1e6;
      if (st.partners_total === null || st.partners_total === undefined || st.lines_count === null || ls.length !== +st.lines_count || Math.abs(sum - +st.partners_total) > 0.00001)
        return res.status(409).json({ error: 'Draft lines are incomplete or do not match. Save the draft again, then approve.' });
      const ap = await C.sb(`settlements?id=eq.${id}&status=eq.draft&updated_at=eq.${encodeURIComponent(st.updated_at)}`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() } });
      if (!ap.ok) return res.status(500).json({ error: 'Could not approve (' + ap.status + ')' });
      if (!Array.isArray(ap.data) || !ap.data.length) return res.status(409).json({ error: 'The draft changed while approving. Reload and try again.' });
      await logIt(id, 'approved', { voe_total_usd: st.voe_total_usd, partners_total: st.partners_total });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'settle_voe_paid') {
      if (adminOnly()) return;
      const id = parseInt(b.id, 10), paid = b.paid !== false;
      const r = await C.sb(`settlements?id=eq.${id}&select=id,status`);
      const st = Array.isArray(r.data) ? r.data[0] : null;
      if (!st || st.status !== 'approved') return res.status(400).json({ error: 'Approve the week first' });
      if (!paid) {
        const s2 = await C.sb(`settlements?id=eq.${id}&select=voe_paid_at`);
        const since = Array.isArray(s2.data) && s2.data[0] && s2.data[0].voe_paid_at;
        const po = await C.sbAll('payouts?status=neq.rejected&select=id,created_at', 5000, 'id.asc');
        if (since && po.some(p => new Date(p.created_at) >= new Date(since))) return res.status(409).json({ error: 'Payout requests were already made after this was marked paid. It cannot be un-marked.' });
      }
      const vp = await C.sb(`settlements?id=eq.${id}&status=eq.approved`, { method: 'PATCH', body: { voe_paid: paid, voe_paid_at: paid ? new Date().toISOString() : null } });
      if (!vp.ok) return res.status(500).json({ error: 'Could not save (' + vp.status + ')' });
      await logIt(id, paid ? 'voe_paid_marked' : 'voe_paid_unmarked', null);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'settle_log') {
      const q = b.id ? `settlement_id=eq.${parseInt(b.id, 10)}&` : '';
      const r = await C.sb(`settlement_log?${q}select=*&order=id.desc&limit=100`);
      const rows = Array.isArray(r.data) ? r.data : [];
      const ids = [...new Set(rows.map(x => x.actor).filter(Boolean))];
      const pr = ids.length ? await C.sbAll(`profiles?select=id,name,email&id=in.(${ids.join(',')})`, 5000, 'id.asc') : [];
      return res.status(200).json({ log: rows.map(x => { const p = pr.find(q2 => q2.id === x.actor) || {}; return { ...x, actor_name: p.name || p.email || '' }; }) });
    }

    // ── partners, payouts ────────────────────────────────────────────
    if (b.action === 'partners_list') {
      const ps = (await C.sbAll('partners?select=user_id,code,status,payout_method,payout_address,created_at', 5000, 'created_at.desc,user_id.asc')).slice(0, 500);
      const named = await withNames(ps.map(p => ({ partner_id: p.user_id })));
      const [ls, po, ve] = await Promise.all([C.sbAll('settlement_lines?select=partner_id,amount_usd,settlements!inner(status)', 30000, 'settlement_id.asc,partner_id.asc'), C.sbAll('payouts?select=partner_id,amount_usd,status', 30000, 'id.asc'),
        C.sbAll(`view_events?qualified=eq.true&partner_id=not.is.null&day=gte.${C.utcDay(new Date(Date.now() - 30 * 864e5))}&select=partner_id,day`, 100000, 'id.asc')]);
      const nm = new Map(named.map(x => [x.partner_id, x])), v30 = {}, last = {}, earn = {}, paidm = {};
      for (const v of ve) { v30[v.partner_id] = (v30[v.partner_id] || 0) + 1; if (!last[v.partner_id] || v.day > last[v.partner_id]) last[v.partner_id] = v.day; }
      for (const l of ls) if (l.settlements && l.settlements.status === 'approved') earn[l.partner_id] = (earn[l.partner_id] || 0) + +l.amount_usd;
      for (const x of po) if (x.status === 'paid') paidm[x.partner_id] = (paidm[x.partner_id] || 0) + +x.amount_usd;
      return res.status(200).json({ role, partners: ps.map(p => {
        const n = nm.get(p.user_id) || {};
        return { user_id: p.user_id, code: p.code, status: p.status, name: n.name, email: n.email, method: p.payout_method, address: maskAddr(p.payout_address), joined: p.created_at,
          views_30d: v30[p.user_id] || 0, last_view: last[p.user_id] || '',
          earned: Math.round((earn[p.user_id] || 0) * 1e4) / 1e4, paid: Math.round((paidm[p.user_id] || 0) * 1e4) / 1e4 };
      }) });
    }

    if (b.action === 'partner_set_status') {
      if (adminOnly()) return;
      if (!['active', 'hold', 'banned'].includes(b.status)) return res.status(400).json({ error: 'Bad status' });
      await C.sb(`partners?user_id=eq.${encodeURIComponent(b.partner_id)}`, { method: 'PATCH', body: { status: b.status } });
      await logIt(null, 'partner_status', { partner_id: b.partner_id, status: b.status });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'payouts_list') {
      const f = ['requested', 'paid', 'rejected'].includes(b.status) ? `status=eq.${b.status}&` : '';
      const rows = (await C.sbAll(`payouts?${f}select=*`, 5000, 'id.desc')).slice(0, 200);
      const ids = [...new Set(rows.map(r => r.partner_id))];
      const named = await withNames(ids.map(id => ({ partner_id: id })));
      const paidAll = await C.sbAll('payouts?status=eq.paid&select=partner_id,amount_usd', 30000, 'id.asc');
      const pinfo = [], lines = [];
      for (let i = 0; i < ids.length; i += 60) {
        const chunk = ids.slice(i, i + 60).join(',');
        pinfo.push(...await C.sbAll(`partners?select=user_id,created_at&user_id=in.(${chunk})`, 5000, 'user_id.asc'));
        lines.push(...await C.sbAll(`settlement_lines?partner_id=in.(${chunk})&select=partner_id,amount_usd,settlements!inner(status)`, 30000, 'settlement_id.asc,partner_id.asc'));
      }
      return res.status(200).json({ role, open: rows.filter(r => r.status === 'requested').length, payouts: rows.map(r => {
        if (!isAdmin && r.payout_address) r = { ...r, payout_address: maskAddr(r.payout_address) };
        const n = named.find(x => x.partner_id === r.partner_id) || {}, pi = pinfo.find(x => x.user_id === r.partner_id) || {};
        const mine = paidAll.filter(x => x.partner_id === r.partner_id);
        return { ...r, code: n.code, name: n.name, email: n.email, partner_status: n.status, joined: pi.created_at,
          prev_paid: mine.length, paid_total: Math.round(mine.reduce((a, x) => a + +x.amount_usd, 0) * 1e4) / 1e4,
          earned_total: Math.round(lines.filter(l => l.partner_id === r.partner_id && l.settlements && l.settlements.status === 'approved').reduce((a, l) => a + +l.amount_usd, 0) * 1e4) / 1e4 };
      }) });
    }

    if (b.action === 'payout_mark_paid' || b.action === 'payout_reject') {
      if (adminOnly()) return;
      const id = parseInt(b.id, 10);
      const r = await C.sb(`payouts?id=eq.${id}&select=id,status`);
      const p = Array.isArray(r.data) ? r.data[0] : null;
      if (!p || p.status !== 'requested') return res.status(400).json({ error: 'Not an open request' });
      const paid = b.action === 'payout_mark_paid';
      if (paid && !String(b.txn_ref || '').trim()) return res.status(400).json({ error: 'Enter the transaction / UTR reference of the money you sent' });
      const body = { status: paid ? 'paid' : 'rejected', decided_at: new Date().toISOString(), decided_by: user.id, txn_ref: paid ? String(b.txn_ref || '').slice(0, 120) || null : null, admin_note: String(b.note || '').slice(0, 300) || null };
      if (paid) { const fx = await S.getUsdInr(await S.getSettings()); body.usd_inr = Number(b.usd_inr) > 0 ? Number(b.usd_inr) : Math.round(fx.rate * 100) / 100; if (!(body.usd_inr >= 20 && body.usd_inr <= 500)) return res.status(400).json({ error: 'USD→INR rate looks wrong' }); }
      const pu = await C.sb(`payouts?id=eq.${id}&status=eq.requested`, { method: 'PATCH', prefer: 'return=representation', body });
      if (!pu.ok) return res.status(500).json({ error: 'Could not save (' + pu.status + '). Nothing was changed — check before sending money.' });
      if (!Array.isArray(pu.data) || !pu.data.length) return res.status(409).json({ error: 'Someone else already decided this request. Reload.' });
      await logIt(null, paid ? 'payout_paid' : 'payout_rejected', { id, txn_ref: body.txn_ref });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'titles_list') {
      const prom = await C.promotable((await S.getSettings()).promo_hosts);
      const list = [...prom.values()].sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1) || String(a.title).localeCompare(String(b.title)));
      return res.status(200).json({ titles: list });
    }

    if (b.action === 'titles_set') {
      if (adminOnly()) return;
      const tmdb = parseInt(b.tmdb_id, 10);
      if (!tmdb) return res.status(400).json({ error: 'Enter a valid TMDB id' });
      const type = b.media_type === 'tv' ? 'tv' : 'movie';
      const r = await C.sb('partner_titles?on_conflict=tmdb_id,media_type', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { tmdb_id: tmdb, media_type: type, enabled: b.enabled !== false } });
      if (!r.ok) return res.status(500).json({ error: 'Could not save' });
      await logIt(null, 'title_set', { tmdb_id: tmdb, media_type: type, enabled: b.enabled !== false });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'report') {
      const to   = DAY_RE.test(b.to   || '') ? b.to   : C.utcDay();
      const from = DAY_RE.test(b.from || '') ? b.from : C.utcDay(new Date(Date.now() - 6 * 864e5));
      const hostQ = String(b.host || '').toLowerCase().replace(/[^a-z0-9.\-]/g, '').slice(0, 40);
      const rows = await C.sbAll(`view_events?day=gte.${from}&day=lte.${to}${hostQ ? `&host=ilike.*${hostQ}*` : ''}&select=day,partner_id,country,qualified,reason,adblock,vpn,seconds`, 30000, 'id.asc');

      const days = {}, partners = {}, countries = {}, reasons = {};
      const tot = { started: 0, qualified: 0, not_qualified: 0 };
      for (const r of rows) {
        const d = days[r.day] || (days[r.day] = { day: r.day, started: 0, qualified: 0, reasons: {} });
        d.started++; tot.started++;
        if (r.qualified) { d.qualified++; tot.qualified++; } else {
          tot.not_qualified++;
          const k = r.reason || 'too_short'; d.reasons[k] = (d.reasons[k] || 0) + 1; reasons[k] = (reasons[k] || 0) + 1;
        }
        const pk = r.partner_id || 'organic';
        const p = partners[pk] || (partners[pk] = { partner_id: pk, started: 0, qualified: 0 });
        p.started++; if (r.qualified) p.qualified++;
        if (r.qualified) { const ck = r.country || '??'; countries[ck] = (countries[ck] || 0) + 1; }
      }
      const [clicks, stamps] = await Promise.all([
        C.sbAll(`partner_clicks?created_at=gte.${from}T00:00:00Z&created_at=lt.${C.utcDay(new Date(new Date(to + 'T00:00:00Z').getTime() + 864e5))}T00:00:00Z&select=result`, 30000, 'id.asc'),
        C.sbAll(`partner_stamps?created_at=gte.${from}T00:00:00Z&created_at=lt.${C.utcDay(new Date(new Date(to + 'T00:00:00Z').getTime() + 864e5))}T00:00:00Z&select=user_id`, 30000, 'user_id.asc,tmdb_id.asc,media_type.asc'),
      ]);
      const clickResults = {}; clicks.forEach(c => { clickResults[c.result || '?'] = (clickResults[c.result || '?'] || 0) + 1; });
      return res.status(200).json({
        from, to, host: hostQ, total: tot, reasons, clicks: { total: clicks.length, results: clickResults }, stamps: stamps.length,
        days: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
        partners: Object.values(partners).sort((a, b) => b.qualified - a.qualified),
        countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).map(([country, qualified]) => ({ country, qualified })),
        capped: rows.length >= 30000,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    if (err && err.message === 'too_many_rows') return res.status(413).json({ error: 'Too many views in that week to settle in one go. Tell the developer.' });
    console.error('partner-admin error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
