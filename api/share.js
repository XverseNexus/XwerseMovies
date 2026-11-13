// api/share.js — link preview ("rich card") for a shared title.
//
// WhatsApp / Telegram / Instagram / Facebook / X read the OG tags of a link WITHOUT running
// JavaScript, so the static Home page can only ever show one generic card. This function
// answers  https://xwersemovies.bond/s/<movie|tv>/<tmdb id>  (see vercel.json rewrite)
// with a tiny HTML page whose title / description / image are THAT title's, and which sends
// real visitors straight on to the title's details on Home.
//
// Optional env vars: SITE_URL (default https://xwersemovies.bond), TMDB_API_KEY
// (defaults to the same public key the website already uses in xwerse-config.js).

const DEFAULT_TMDB_KEY = 'cf25940d9a3514c67d8dbbfe9d6c00dc';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

module.exports = async function handler(req, res) {
  const SITE = String(process.env.SITE_URL || 'https://xwersemovies.bond').replace(/\/+$/, '');
  const KEY  = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;

  const id   = String(req.query?.t || '').match(/^\d{1,9}$/) ? String(req.query.t) : null;
  const type = req.query?.type === 'tv' ? 'tv' : 'movie';

  let target = `${SITE}/Home`;
  let title = 'XwerseMovies';
  let desc  = 'Stream trending movies, TV shows and Bollywood hits — anytime, anywhere on XwerseMovies.';
  let image = `${SITE}/og-image.png`;
  let imgW = 1200, imgH = 630;
  let canonical = SITE + '/';

  if (id) {
    target = `${SITE}/Home?t=${id}&type=${type}`;
    canonical = `${SITE}/s/${type}/${id}`;
    try {
      const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${KEY}&language=en-US`, {
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const d = await r.json();
        const name = d.title || d.name;
        if (name) {
          const year = String(d.release_date || d.first_air_date || '').slice(0, 4);
          const rating = d.vote_average ? `⭐ ${d.vote_average.toFixed(1)}` : '';
          const genres = (d.genres || []).slice(0, 3).map((g) => g.name).join(', ');
          title = `${name}${year ? ` (${year})` : ''} • XwerseMovies`;
          const meta = [rating, type === 'tv' ? 'TV Show' : 'Movie', genres].filter(Boolean).join(' • ');
          let ov = String(d.overview || '').replace(/\s+/g, ' ').trim();
          if (ov.length > 180) ov = ov.slice(0, 177).replace(/\s+\S*$/, '') + '…';
          desc = [meta, ov].filter(Boolean).join(' — ') || desc;
          if (d.backdrop_path)    { image = `https://image.tmdb.org/t/p/w1280${d.backdrop_path}`; imgW = 1280; imgH = 720; }
          else if (d.poster_path) { image = `https://image.tmdb.org/t/p/w780${d.poster_path}`;    imgW = 780;  imgH = 1170; }
        }
      }
    } catch (e) {
      console.error('share: TMDB lookup failed', e && e.message);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="video.movie">
<meta property="og:site_name" content="XwerseMovies">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${imgW}">
<meta property="og:image:height" content="${imgH}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}a{color:#e50914}</style>
</head><body>
<p>Opening XwerseMovies… <a href="${esc(target)}">Tap here if nothing happens</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(html);
};
