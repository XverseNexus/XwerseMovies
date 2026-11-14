// lib/episode-links.js — shared by the payment webhook and the admin paid-embed API.
//
// A TV show's PAID link text holds one line per episode (same format the admin already
// uses in "Give Access"):
//     S1E1 https://filemoon.../e/abc
//     S2E3 https://voe.sx/e/xyz
//     E3   https://...          (episode without a season — only for single-season shows)
//     https://...               (plain link, used for any episode)

function parse(text) {
  const out = { eps: [], plain: [], bad: [], lines: [] };
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let m = line.match(/^(https:\/\/\S+)$/i);
    if (m) { out.plain.push(m[1]); out.lines.push(line); return; }
    m = line.match(/^(?:S(\d+)\s*[ ._-]?)?E?(\d+)\s*[:=\s-]\s*(https:\/\/\S+)$/i);
    if (m) { out.eps.push({ season: m[1] ? +m[1] : null, ep: +m[2], url: m[3], line }); out.lines.push(line); return; }
    out.bad.push(i + 1);
  });
  return out;
}

// Checks the whole text; used by the admin API before saving.
function validate(text) {
  const p = parse(text);
  const seasons = {};
  p.eps.forEach(e => { const k = e.season == null ? 0 : e.season; seasons[k] = (seasons[k] || 0) + 1; });
  return { ok: !p.bad.length && p.lines.length > 0, bad: p.bad, count: p.lines.length, seasons };
}

// The text a buyer should receive.
//   series → everything
//   season → only that season's lines (a show whose lines carry no season numbers at all is
//            treated as single-season, so everything is used)
// Returns null when there is nothing to give yet (the admin then grants manually).
function forRequest(text, requestType, seasonNo) {
  const p = parse(text);
  if (!p.lines.length) return null;
  if (requestType === 'series') return p.lines.join('\n');
  const sn = Number(seasonNo) || 1;
  const mine = p.eps.filter(e => e.season === sn).map(e => e.line);
  if (mine.length) return mine.join('\n');
  const anySeasoned = p.eps.some(e => e.season != null);
  return anySeasoned ? null : p.lines.join('\n');
}

module.exports = { parse, validate, forRequest };
