// ═══════════════════════════════════════════════════════════
//  XwerseMovies — Service Worker
//  Handles: offline support, app shell caching, background sync
// ═══════════════════════════════════════════════════════════

const CACHE_NAME    = 'xwerse-v37';
const SHELL_TIMEOUT = 3000; // ms before falling back to cache

// App shell — these files are cached on install
const APP_SHELL = [
  '/index.html',
  '/XwerseMovies_Home.html',
  '/XwerseMovies_Browse.html',
  '/XwerseMovies_MyList.html',
  '/XwerseMovies_Player.html',
  '/XwerseMovies_Search.html',
  '/XwerseMovies_Settings.html',
  '/XwerseMovies_Request.html',
  '/XwerseMovies_MyRequests.html',
  '/xwerse-config.js',
  '/manifest.json',
  '/favicon.png',
  '/og-image.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap',
];

// These domains are always fetched from network (no caching)
const NETWORK_ONLY = [
  'supabase.co',        // Supabase API — always live data
  'api.themoviedb.org', // TMDB — always fresh
  'vidsrc.to',          // Video embeds — never cache
  'streamtape.com',
  'dailymotion.com',
  'corsproxy.io',
  'allorigins.win',
];

// ─────────────────────────────────────────
//  INSTALL — cache the app shell
// ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ─────────────────────────────────────────
//  ACTIVATE — clean up old caches
// ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // take control of all pages
  );
});

// ─────────────────────────────────────────
//  FETCH — strategy per request type
// ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Network-only for API / video domains
  if (NETWORK_ONLY.some(d => url.hostname.includes(d))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Network-only for non-GET requests
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. xwerse-config.js — ALWAYS network-first
  //    This file contains XvNotif and other shared code.
  //    Cache-first caused "XvNotif is not defined" when old SW served stale config.
  //    Network-first ensures deployed updates land immediately without hard-refresh.
  if (url.pathname === '/xwerse-config.js') {
    event.respondWith(networkFirstWithTimeout(event.request, 2000));
    return;
  }

  // 4. For HTML pages: Network-first with cache fallback
  //    Shows cached version if network is slow / offline
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      networkFirstWithTimeout(event.request, SHELL_TIMEOUT)
    );
    return;
  }

  // 5. For all other static assets (CSS, fonts, images, other JS): Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        // Cache a copy of new static assets for future offline use
        if (res.ok && event.request.url.startsWith('http')) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, resClone));
        }
        return res;
      }).catch(() => offlineFallback(url));
    })
  );
});

// ─────────────────────────────────────────
//  HELPER: network-first with timeout
// ─────────────────────────────────────────
async function networkFirstWithTimeout(request, timeout) {
  const cached  = await caches.match(request);
  const network = fetch(request).then(res => {
    if (res.ok) {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone));
    }
    return res;
  });

  try {
    return await Promise.race([
      network,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeout)
      ),
    ]);
  } catch {
    // Network slow/offline — use cache
    return cached || offlineFallback(new URL(request.url));
  }
}

// ─────────────────────────────────────────
//  HELPER: minimal offline page
// ─────────────────────────────────────────
function offlineFallback(url) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XwerseMovies — Offline</title>
<style>
  body{margin:0;background:#141414;color:#fff;font-family:'Barlow',sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:100vh;text-align:center;padding:20px}
  h1{font-family:'Bebas Neue',cursive;font-size:3rem;color:#E50914;margin:0 0 8px}
  p{color:rgba(255,255,255,.6);max-width:320px;line-height:1.6}
  a{color:#E50914;text-decoration:none;font-weight:700}
</style>
</head>
<body>
<h1>XwerseMovies</h1>
<p>You're offline. Please check your internet connection and <a href="/">try again</a>.</p>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  );
}
