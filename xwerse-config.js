// ═══════════════════════════════════════════════════════
//  xwerse-config.js  —  Shared config for all pages
//  Include this FIRST in every HTML file:
//  <script src="xwerse-config.js"></script>
// ═══════════════════════════════════════════════════════

const Xwerse = {
  SUPABASE_URL:     'https://oobohevfmvitveulvqlf.supabase.co',
  SUPABASE_KEY:     'sb_publishable_SKK21UE3-Ls5xS8kjt0DbA_qwj_QQ4v',
  TMDB_KEY:         'cf25940d9a3514c67d8dbbfe9d6c00dc',
  TMDB_BASE:        'https://api.themoviedb.org/3',
  TMDB_IMG:         'https://image.tmdb.org/t/p/',
  SITE_NAME:        'XwerseMovies',

  // ── PAY-PER-REQUEST (Phase 4) ──────────────────────────────
  // The old 4-plan subscription system is gone — streaming via
  // vidsrc is 100% free for everyone. Cashfree is now used only
  // for one-off Request payments (Movie ₹9 / Season ₹29 /
  // Complete Series ₹59) — see api/create-request-order.js +
  // api/cashfree-request-webhook.js.
  //
  // Same Vercel Environment Variables as before still apply:
  //   CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV
  //   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL
  CASHFREE_ENV: 'production', // must match the Vercel env var CASHFREE_ENV — both are 'production'

  REQUEST_PRICES: {
    movie:  { label: 'Movie Request',            price: 9,  priceLabel: '₹9'  },
    season: { label: 'Season Request',           price: 29, priceLabel: '₹29' },
    series: { label: 'Complete Web Series Request', price: 59, priceLabel: '₹59' },
  },

  // Shared status metadata so "My Requests" and the Admin panel always
  // show the same label/color/order for a given status.
  REQUEST_STATUS: {
    pending:    { label: 'Pending',    color: '#f5c518', order: 0 },
    accepted:   { label: 'Accepted',   color: '#64b5f6', order: 1 },
    processing: { label: 'Processing', color: '#ba68c8', order: 2 },
    uploading:  { label: 'Uploading',  color: '#4dd0e1', order: 3 },
    completed:  { label: 'Completed',  color: '#46d369', order: 4 },
    rejected:   { label: 'Rejected',   color: '#E50914', order: 5 },
  },
};

// ─────────────────────────────────────────────────────────
//  Supabase client (loaded from CDN)
// ─────────────────────────────────────────────────────────
let _sb = null;
function getSB() {
  if (_sb) return _sb;
  if (typeof supabase === 'undefined') {
    console.error('Supabase CDN not loaded!');
    return null;
  }
  _sb = supabase.createClient(Xwerse.SUPABASE_URL, Xwerse.SUPABASE_KEY);
  return _sb;
}

// ─────────────────────────────────────────────────────────
//  AUTH HELPERS
// ─────────────────────────────────────────────────────────
const Auth = {
  // Get current session user (fast, no network)
  async getUser() {

  const { data: { session } } =
  await getSB().auth.getSession();

  return session?.user || null;
},

  // Get full profile from DB
  async getProfile(uid) {
    const { data } = await getSB()
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle(); // FIX: .single() throws 406 when no row exists (new users)
    return data;
  },

  // Get viewer profiles
  async getViewerProfiles(uid) {
    const { data } = await getSB()
      .from('viewer_profiles')
      .select('*')
      .eq('user_id', uid)
      .order('created_at');
    return data || [];
  },

  // Sign in with email
  async signIn(email, password) {
    return getSB().auth.signInWithPassword({ email, password });
  },

  // Sign up with email
  async signUp(email, password, name) {
    return getSB().auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });
  },

  // Google OAuth
  async googleSignIn() {
    return getSB().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/index.html' }
    });
  },

  // Sign out
  async signOut() {
    // Don't clear saved profile on sign out —
    // so the same user skips Who's Watching on next sign-in.
    // Profile is only cleared when "Switch Profile" is explicitly used.
    return getSB().auth.signOut();
  },

  // Reset password
  async resetPassword(email) {
    return getSB().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html?reset=1'
    });
  },
};

// ─────────────────────────────────────────────────────────
//  DATABASE HELPERS
// ─────────────────────────────────────────────────────────
const DB = {
  // ── MY LIST ──────────────────────────────────────────
  async getMyList(uid) {
    const { data } = await getSB()
      .from('my_list')
      .select('movie_id, added_at, movies(*)')
      .eq('user_id', uid)
      .order('added_at', { ascending: false });
    return (data || []).map(r => ({ ...r.movies, addedAt: r.added_at }));
  },

  async addToMyList(uid, movieId) {
    return getSB().from('my_list').upsert({ user_id: uid, movie_id: movieId });
  },

  async removeFromMyList(uid, movieId) {
    return getSB().from('my_list')
      .delete().eq('user_id', uid).eq('movie_id', movieId);
  },

  async isInMyList(uid, movieId) {
    const { data } = await getSB()
      .from('my_list')
      .select('id')
      .eq('user_id', uid)
      .eq('movie_id', movieId)
      .maybeSingle(); // FIX: .single() throws 406 when movie not in list
    return !!data;
  },

  // ── CONTINUE WATCHING ────────────────────────────────
  async getContinueWatching(uid) {
    const { data } = await getSB()
      .from('continue_watching')
      .select('*, movies(*)')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });
    return (data || []).map(r => ({
      ...r.movies,
      progress:    r.progress_sec,
      duration:    r.duration_sec,
      completed:   r.completed,
      updatedAt:   r.updated_at,
      // TV show resume: last watched season + episode
      lastSeason:  r.last_season  || 1,
      lastEpisode: r.last_episode || 1,
    }));
  },

  async updateEmbedStatus(movieId, working, source = null) {
    const updates = {
      embed_working: working,
      last_checked:  new Date().toISOString(),
    };
    if (source) updates.embed_source = source;
    return getSB().from('movies').update(updates).eq('id', movieId);
  },

  async logSubscription(uid, plan, paymentId, amountINR) {
    // Log payment to subscriptions table (for audit trail)
    return getSB().from('subscriptions').insert({
      user_id:    uid,
      plan,
      amount:     amountINR,
      currency:   'INR',
      payment_id: paymentId || null,
      gateway:    'cashfree',
      status:     'active',
      starts_at:  new Date().toISOString(),
    });
  },

  // FIX: function signature was missing — caused SyntaxError breaking the ENTIRE app
  async upsertContinueWatching(uid, movieId, progressSec, durationSec, extraData = {}) {
    const completed = durationSec > 0 && (progressSec / durationSec) > 0.9;
    return getSB().from('continue_watching').upsert({
      user_id:      uid,
      movie_id:     movieId,
      progress_sec: progressSec,
      duration_sec: durationSec,
      completed,
      updated_at:   new Date().toISOString(),
      // Store last-watched season/episode for TV shows (ignored if column doesn't exist)
      ...(extraData.season  ? { last_season:  extraData.season  } : {}),
      ...(extraData.episode ? { last_episode: extraData.episode } : {}),
    }, { onConflict: 'user_id,movie_id' });
  },

  async removeContinueWatching(uid, movieId) {
    return getSB().from('continue_watching')
      .delete().eq('user_id', uid).eq('movie_id', movieId);
  },

  // ── RATINGS (thumbs up/down) ─────────────────────────
  // Keyed by tmdb_id + media_type — NOT the local movies.id.
  // Most content on this site is played straight from an
  // auto-generated TMDB embed and is never inserted into the
  // `movies` table, so keying on the local DB row would leave
  // ratings broken/missing for the majority of titles. tmdb_id
  // exists for everything (TMDB-sourced or admin-added), so
  // that's the one reliable, DB-independent identifier.
  async getAllRatings(uid) {
    const { data, error } = await getSB()
      .from('ratings')
      .select('tmdb_id, media_type, rating, updated_at')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });
    if (error) { console.error('getAllRatings:', error); return {}; }
    const map = {};
    (data || []).forEach(r => { map[r.media_type + '_' + r.tmdb_id] = r.rating; });
    return map;
  },

  async setRating(uid, tmdbId, mediaType, value) {
    return getSB().from('ratings').upsert({
      user_id:    uid,
      tmdb_id:    tmdbId,
      media_type: mediaType || 'movie',
      rating:     value, // 1 = thumbs up, -1 = thumbs down
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,tmdb_id,media_type' });
  },

  async deleteRating(uid, tmdbId, mediaType) {
    return getSB().from('ratings')
      .delete().eq('user_id', uid).eq('tmdb_id', tmdbId).eq('media_type', mediaType || 'movie');
  },

  // ── REQUESTS (Pay-Per-Request system, Phase 4) ───────
  // Rows are only ever created server-side by the Cashfree webhook
  // (Phase 4.4) after payment is confirmed — there is no client-side
  // "create request" call here on purpose.
  async getUserRequests(uid) {
    const { data, error } = await getSB()
      .from('requests')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (error) { console.error('getUserRequests:', error); return []; }
    return data || [];
  },

  async getRequest(id) {
    const { data, error } = await getSB()
      .from('requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { console.error('getRequest:', error); return null; }
    return data;
  },

  // Personal "fulfilled request" override for playback. If this user has
  // a completed, paid request for this exact title (matching season, for
  // season-specific requests) with a watch_url attached, that becomes
  // THEIR embed for this title everywhere on the site — everyone else
  // still gets the normal shared embed_url. This is how "Chintu requested
  // Bahubali, admin uploaded a special version just for him, later Mintu
  // requests the same title and gets his own access too" works without
  // needing a separate access-grants table — the requests table already
  // is the grant.
  // Direct-stream link (Telegram stream-bot URL etc.) for ONE of the user's own
  // requests. RLS already limits `requests` to the owner (and staff), and we
  // additionally require paid + completed and an https URL.
  async getMyDirectStream(uid, requestId) {
    if (!uid || !requestId) return null;
    const { data, error } = await getSB()
      .from('requests')
      .select('direct_url, payment_status, status')
      .eq('id', requestId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error || !data) return null;
    if (data.payment_status !== 'paid' || data.status !== 'completed') return null;
    const u = String(data.direct_url || '').trim();
    return /^https:\/\//i.test(u) ? u : null;
  },

  async getMyRequestOverride(uid, tmdbId, mediaType, seasonNumber) {
    if (!uid || !tmdbId) return null;
    const { data, error } = await getSB()
      .from('requests')
      .select('watch_url, request_type, season_number')
      .eq('user_id', uid)
      .eq('tmdb_id', tmdbId)
      .eq('payment_status', 'paid')
      .eq('status', 'completed')
      .not('watch_url', 'is', null)
      .order('updated_at', { ascending: false });
    if (error) { console.error('getMyRequestOverride:', error); return null; }
    if (!data?.length) return null;

    const match = data.find(r => {
      if (mediaType === 'tv') {
        if (r.request_type === 'series') return true;
        if (r.request_type === 'season') return r.season_number === seasonNumber;
        return false;
      }
      return r.request_type === 'movie';
    });
    return match?.watch_url || null;
  },

  // ── ADMIN: REQUESTS ───────────────────────────────────
  // RLS also enforces the admin/moderator check server-side — these
  // just fail gracefully (empty/error) for a non-admin caller.
  async getAllRequests({ status = null, search = '' } = {}) {
    let q = getSB().from('requests').select('*').eq('payment_status', 'paid').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`title.ilike.%${search}%,user_email.ilike.%${search}%,user_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) { console.error('getAllRequests:', error); return []; }
    return data || [];
  },

  async updateRequestStatus(id, status) {
    return getSB().from('requests').update({ status }).eq('id', id);
  },

  async updateRequestLinks(id, { watch_url, download_url } = {}) {
    const patch = {};
    if (watch_url   !== undefined) patch.watch_url   = watch_url;
    if (download_url !== undefined) patch.download_url = download_url;
    return getSB().from('requests').update(patch).eq('id', id);
  },

  async updateRequestNotes(id, admin_notes) {
    return getSB().from('requests').update({ admin_notes }).eq('id', id);
  },

  async updateRequestFull(id, patch) {
    return getSB().from('requests').update(patch).eq('id', id);
  },

  // Pending/unmatched payments — rows the Cashfree Payment Forms webhook
  // couldn't auto-correlate (e.g. user paid with a different email than
  // their site login) and are stuck at payment_status='pending' forever.
  // Not covered by getAllRequests() since that only ever shows paid rows.
  async getPendingPaymentRequests() {
    const { data, error } = await getSB()
      .from('requests')
      .select('*')
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false });
    if (error) { console.error('getPendingPaymentRequests:', error); return []; }
    return data || [];
  },

  // Manual override for the case above — admin has confirmed (e.g. via
  // Cashfree dashboard transaction logs) that this request's payment did
  // go through, so flip it to 'paid' by hand.
  async markRequestPaid(id) {
    return getSB().from('requests').update({ payment_status: 'paid' }).eq('id', id);
  },

  // ── WATCH HISTORY ────────────────────────────────────
  async getHistory(uid, limit = 50) {
    const { data } = await getSB()
      .from('watch_history')
      .select('*, movies(*)')
      .eq('user_id', uid)
      .order('watched_at', { ascending: false })
      .limit(limit);
    return (data || []).map(r => ({ ...r.movies, watchedAt: r.watched_at }));
  },

  async addToHistory(uid, movieId) {
    return getSB().from('watch_history').upsert({
      user_id:    uid,
      movie_id:   movieId,
      watched_at: new Date().toISOString(),
    }, { onConflict: 'user_id,movie_id' });
  },

  async clearHistory(uid) {
    return getSB().from('watch_history').delete().eq('user_id', uid);
  },

  // ── MOVIES ───────────────────────────────────────────
  async getMovies({ type, lang, genre, featured, limit = 30, page = 0 } = {}) {
    let q = getSB().from('movies').select('*').eq('status', 'active');
    if (type)     q = q.eq('type', type);
    if (lang)     q = q.eq('language', lang);
    if (featured) q = q.eq('featured', true);
    if (genre)    q = q.contains('genres', [genre]);
    return q.order('created_at', { ascending: false })
            .range(page * limit, (page + 1) * limit - 1);
  },

  async getAllMovies(limit = 100) {

  const { data } = await getSB()
    .from('movies')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
},

  async getMovie(id) {
    const { data } = await getSB().from('movies').select('*').eq('id', id).single();
    return data;
  },

  async searchMovies(query) {
    const { data } = await getSB().from('movies')
      .select('*')
      .eq('status', 'active')
      .ilike('title', `%${query}%`)
      .limit(20);
    return data || [];
  },

  async getFeatured() {
    const { data } = await getSB().from('movies')
      .select('*')
      .eq('featured', true)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(7);
    return data || [];
  },

  async incrementViews(movieId) {
    return getSB().rpc('increment_views', { movie_id: movieId });
  },

  // ── NOTIFICATIONS ────────────────────────────────────
  async getNotifications(uid) {
    const { data } = await getSB()
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(30);
    return data || [];
  },

  async markNotifRead(id) {
    return getSB().from('notifications').update({ is_read: true }).eq('id', id);
  },

  async markAllNotifsRead(uid) {
    return getSB().from('notifications')
      .update({ is_read: true }).eq('user_id', uid);
  },

  // ── VIEWER PROFILES ──────────────────────────────────
  async addViewerProfile(uid, name, avatarUrl = null, isKids = false) {
    return getSB().from('viewer_profiles').insert({
      user_id: uid, name, avatar_url: avatarUrl, is_kids: isKids,
    });
  },

  async updateViewerProfile(id, updates) {
    return getSB().from('viewer_profiles').update(updates).eq('id', id);
  },

  async deleteViewerProfile(id) {
    return getSB().from('viewer_profiles').delete().eq('id', id);
  },
};

// ─────────────────────────────────────────────────────────
//  TMDB HELPERS
// ─────────────────────────────────────────────────────────
const TMDB = {
  async fetch(path, params = {}) {
    const url = new URL(Xwerse.TMDB_BASE + path);
    url.searchParams.set('api_key', Xwerse.TMDB_KEY);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    const proxies = [
      url.toString(),
      'https://corsproxy.io/?' + encodeURIComponent(url.toString()),
    ];
    for (const u of proxies) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return r.json();
      } catch(e) {}
    }
    return null;
  },

  img(path, size = 'w500') {
    return path ? Xwerse.TMDB_IMG + size + path : null;
  },

  normalize(item) {
    const isTV = item.media_type === 'tv' || item.name;
    return {
      tmdb_id:      item.id,
      title:        item.title || item.name,
      type:         isTV ? 'tv' : 'movie',
      year:         (item.release_date || item.first_air_date || '').slice(0,4),
      rating:       item.vote_average?.toFixed(1),
      overview:     item.overview,
      poster_url:   TMDB.img(item.poster_path),
      backdrop_url: TMDB.img(item.backdrop_path, 'original'),
      genres:       [],
    };
  },

  async trending()    { return this.fetch('/trending/all/week'); },
  async topMovies()   { return this.fetch('/movie/top_rated', { region:'IN' }); },
  async topTV()       { return this.fetch('/tv/top_rated'); },
  async popularMov()  { return this.fetch('/movie/popular', { region:'IN' }); },
  async popularTV()   { return this.fetch('/tv/popular'); },
  async upcoming()    { return this.fetch('/movie/upcoming', { region:'IN' }); },
  async nowPlaying()  { return this.fetch('/movie/now_playing', { region:'IN' }); },
  async hindiMovies() { return this.fetch('/discover/movie', { with_original_language:'hi', sort_by:'popularity.desc', region:'IN' }); },
  async southMovies() { return this.fetch('/discover/movie', { with_original_language:'te', sort_by:'popularity.desc' }); },

  /* Genre rows for Home (Action & Adventure, Comedies, Thrillers, etc.),
     matching Netflix's own genre-row pattern. TMDB genre IDs are stable,
     well-known constants — see https://developer.themoviedb.org/reference/genre-movie-list */
  async byGenre(genreId, mediaType = 'movie') {
    const endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
    return this.fetch(endpoint, { with_genres: genreId, sort_by: 'popularity.desc' });
  },
  async movieDetails(id)  { return this.fetch(`/movie/${id}`, { append_to_response:'credits,videos,similar,release_dates,keywords' }); },
  async tvDetails(id)     { return this.fetch(`/tv/${id}`,    { append_to_response:'credits,videos,similar,seasons,content_ratings,keywords' }); },

  /* Used for the "Because You Liked X" row (Home). Returns
     { seedTitle, items } — items are normalized and capped at 15,
     or null if the seed title has no similar titles / lookup failed. */
  async similarTo(tmdbId, mediaType) {
    const details = mediaType === 'tv' ? await this.tvDetails(tmdbId) : await this.movieDetails(tmdbId);
    const results = details?.similar?.results || [];
    if (!results.length) return null;
    return {
      seedTitle: details.title || details.name || '',
      items: results.slice(0, 15).map(r => TMDB.normalize({ ...r, media_type: mediaType })),
    };
  },

  /* Combines "similar" results from multiple liked seed titles into one
     deduplicated list for "Top Picks for You" — a richer signal than a
     single seed. Excludes anything the user has thumbs-down'd or is
     already actively watching (Continue Watching), and excludes the
     seeds themselves so we don't recommend a title back to the person
     who already rated it. */
  async topPicksFor(seeds, { dislikedKeys = new Set(), excludeTmdbIds = new Set(), limit = 20 } = {}) {
    if (!seeds?.length) return [];
    const seedResults = await Promise.all(
      seeds.map(s => this.similarTo(s.tmdbId, s.mediaType).catch(() => null))
    );
    const seedKeySet = new Set(seeds.map(s => (s.mediaType || 'movie') + '_' + s.tmdbId));
    const seen  = new Set();
    const merged = [];
    for (const res of seedResults) {
      if (!res?.items) continue;
      for (const item of res.items) {
        const key = (item.type || 'movie') + '_' + item.tmdb_id;
        if (seen.has(key) || seedKeySet.has(key) || dislikedKeys.has(key)) continue;
        if (item.id && excludeTmdbIds.has(item.id)) continue;
        seen.add(key);
        merged.push(item);
        if (merged.length >= limit) return merged;
      }
    }
    return merged;
  },

  async tvSeason(id, s)   { return this.fetch(`/tv/${id}/season/${s}`); },
  async search(q)         { return this.fetch('/search/multi', { query:q }); },
};

// ─────────────────────────────────────────────────────────
//  SESSION HELPERS  (localStorage — persists across tabs + restarts)
// ─────────────────────────────────────────────────────────
const Session = {
  setProfile(profile) {
    localStorage.setItem('xwerse_active_profile', JSON.stringify(profile));
  },
  getProfile() {
    try { return JSON.parse(localStorage.getItem('xwerse_active_profile')); }
    catch { return null; }
  },
  clearProfile() {
    localStorage.removeItem('xwerse_active_profile');
  },
};

// ─────────────────────────────────────────────────────────
//  GLOBAL TOAST
// ─────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, duration = 2800) {
  let t = document.getElementById('xv-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'xv-toast';
    t.style.cssText = 'position:fixed;bottom:26px;right:22px;background:rgba(15,15,15,.97);border:1px solid rgba(255,255,255,.13);color:#fff;padding:10px 18px;border-radius:6px;font-size:.82rem;opacity:0;pointer-events:none;z-index:99999;transition:opacity .25s;backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,0,0,.5);font-family:Barlow,sans-serif;max-width:300px';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.style.opacity = '0', duration);
}

// ─────────────────────────────────────────────────────────
//  AUTH GUARD  — call on every protected page
// ─────────────────────────────────────────────────────────
async function requireAuth(redirectTo = 'index.html') {

  const sb = getSB();

  // FIRST TRY
  let { data: { session } } = await sb.auth.getSession();

  // Wait little if session restoring
  if (!session) {

    await new Promise(resolve => setTimeout(resolve, 1200));

    const retry = await sb.auth.getSession();

    session = retry.data.session;
  }

  // FINAL CHECK
  if (!session) {

    console.warn('No session found → redirecting');

    window.location.replace(redirectTo);

    return null;
  }

  return session.user;
}

// ─────────────────────────────────────────────────────────
//  NAV AVATAR — shared across all pages
// ─────────────────────────────────────────────────────────
async function initNavAvatar(avatarElId = 'navAvatar') {
  // On some pages the main script tag sits earlier in the document than
  // the mobile bottom-nav markup, so this element may not exist in the DOM
  // yet at call time. Wait for parsing to finish rather than silently
  // no-op'ing (which used to leave the mobile Profile tab stuck showing
  // its hardcoded placeholder letter and non-clickable).
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const el = document.getElementById(avatarElId);
  if (!el) return;
  const profile = Session.getProfile();
  const user    = await Auth.getUser();
  if (!user) return;

  const name  = profile?.name || user.email?.split('@')[0] || 'User';
  const email = user.email || '';

  if (profile?.avatar_url || user.user_metadata?.avatar_url) {
    const img = document.createElement('img');
    img.src   = profile?.avatar_url || user.user_metadata?.avatar_url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    img.onerror = () => { img.remove(); el.textContent = name[0].toUpperCase(); };
    el.innerHTML = '';
    el.appendChild(img);
  } else {
    el.textContent = name[0].toUpperCase();
  }

  const menuId = avatarElId + '_menu';

  function closeMenu() {
    const m = document.getElementById(menuId);
    if (m) m.remove();
    document.removeEventListener('click', outsideClick);
  }
  function outsideClick(e) {
    const m = document.getElementById(menuId);
    if (m && !m.contains(e.target) && e.target !== el) closeMenu();
  }

  el.onclick = (e) => {
    e.stopPropagation();
    if (document.getElementById(menuId)) { closeMenu(); return; }

    const rect        = el.getBoundingClientRect();
    const menu        = document.createElement('div');
    const menuHeight  = 310; // approx — header + 6 items
    const openUpward  = (window.innerHeight - rect.bottom) < (menuHeight + 16);
    menu.id    = menuId;
    menu.style.cssText = `position:fixed;
      ${openUpward ? `bottom:${window.innerHeight - rect.top + 8}px;` : `top:${rect.bottom + 8}px;`}
      right:${window.innerWidth-rect.right}px;
      background:#1a1a1a;border:1px solid rgba(255,255,255,.12);border-radius:8px;min-width:210px;
      box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:9999;overflow:hidden;animation:menuFadeIn .15s ease`;

    if (!document.getElementById('xvMenuStyle')) {
      const s = document.createElement('style');
      s.id = 'xvMenuStyle';
      s.textContent = `@keyframes menuFadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .xvm-item{display:flex;align-items:center;gap:10px;padding:11px 16px;font-size:.84rem;
          color:rgba(255,255,255,.8);cursor:pointer;font-family:'Barlow',sans-serif;transition:background .15s;
          border:none;background:none;width:100%;text-align:left}
        .xvm-item:hover{background:rgba(255,255,255,.07);color:#fff}
        .xvm-item.danger{color:#ff6b6b}.xvm-item.danger:hover{background:rgba(229,9,20,.1);color:#ff4444}
        .xvm-sep{height:1px;background:rgba(255,255,255,.08);margin:4px 0}
        .xvm-header{padding:12px 16px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
        .xvm-name{font-size:.88rem;font-weight:700;color:#fff}
        .xvm-email{font-size:.7rem;color:rgba(255,255,255,.38);margin-top:2px;word-break:break-all}`;
      document.head.appendChild(s);
    }

    Auth.getProfile(user.id).then(p => {
      const isAdmin = p?.is_admin || p?.role === 'admin' || p?.role === 'moderator';
      if (isAdmin) { const b = menu.querySelector('#xvm-admin-btn'); if (b) b.style.display='flex'; }
    });

    menu.innerHTML = `
      <div class="xvm-header">
        <div class="xvm-name">${name}</div>
        <div class="xvm-email">${email}</div>
      </div>
      <button class="xvm-item" onclick="window.location.href='XwerseMovies_Settings.html'">⚙️ &nbsp;Account Settings</button>
      <button class="xvm-item" onclick="window.location.href='XwerseMovies_Request.html'">🎬 &nbsp;Request a Title</button>
      <button class="xvm-item" onclick="window.location.href='XwerseMovies_MyRequests.html'">📋 &nbsp;My Requests</button>
      <button class="xvm-item" onclick="xvSwitchProfile()">👥 &nbsp;Switch Profile</button>
      <button class="xvm-item" id="xvm-admin-btn" style="display:none" onclick="window.location.href='XwerseMovies_Admin.html'">🛡️ &nbsp;Admin Panel</button>
      <div class="xvm-sep"></div>
      <button class="xvm-item danger" onclick="xvSignOut()">🚪 &nbsp;Sign Out</button>`;

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
  };
}

// Sign out — profile NOT cleared, so same user skips Who's Watching on return
async function xvSignOut() {
  await Auth.signOut();
  window.location.href = 'index.html';
}

// Switch profile — CLEARS saved profile so Who's Watching shows for selection
function xvSwitchProfile() {
  Session.setProfile(null);
  window.location.href = 'index.html';
}

// ═════════════════════════════════════════════════════════════════
//  ML  —  Centralized My List Manager
//
//  Single source of truth for My List across every page.
//  ALL pages call ML.init(uid) once, then use ML.has / ML.toggle.
//
//  Eliminates all five bugs:
//    A) Single key = String(movie.id) — no more dual tmdb_id fallback
//    B) One implementation shared by Home, Browse, Player, MyList
//    C) Every Supabase write is error-checked and surfaces failures
//    D) getList filters out null-join rows before storing
//    E) Browse now has real "already in list" state via ML.has()
//
//  Rule: ONLY movies with a DB id (integer) can be saved.
//        TMDB-only content (trending rows without m.id) shows a
//        clear message instead of a silent no-op.
// ═════════════════════════════════════════════════════════════════
const ML = {
  _uid:  null,
  _ids:  new Set(),   // Set<string> of String(movie.id)
  _data: [],          // full movie objects from DB (with addedAt)

  /* ── init ─────────────────────────────────────────────────────
     Call once per page after auth, before rendering any cards.
     Fetches the user's list from Supabase and populates state.    */
  async init(uid) {
    if (!uid) return;
    this._uid = uid;
    try {
      const sb   = getSB();
      const { data, error } = await sb
        .from('my_list')
        .select('movie_id, added_at, movies(*)')
        .eq('user_id', uid)
        .order('added_at', { ascending: false });

      if (error) { console.error('ML.init fetch error:', error); return; }

      // BUG D FIX: filter rows where the movie join returned null
      // (can happen if a movie was deleted outside the FK cascade)
      const valid = (data || []).filter(r => r.movies && r.movies.id);

      this._data = valid.map(r => ({ ...r.movies, addedAt: r.added_at }));
      this._ids  = new Set(this._data.map(m => String(m.id)));
    } catch (e) {
      console.error('ML.init exception:', e);
    }
  },

  /* ── has ──────────────────────────────────────────────────────
     Returns true if movie with this DB id is in the list.
     Always pass movie.id (integer), never tmdb_id.                */
  has(movieId) {
    if (!movieId) return false;
    return this._ids.has(String(movieId));
  },

  /* ── toggle ───────────────────────────────────────────────────
     The one function all Add/Remove buttons should call.
     Returns: true  = just added
              false = just removed
              null  = failed or not applicable                     */
  async toggle(movie) {
    if (!this._uid) {
      showToast('⚠️ Please log in first');
      return null;
    }
    // BUG A FIX: only DB movies (with integer id) can be saved.
    // TMDB-only rows have no id and cannot be stored in my_list
    // because the FK requires a real movies.id.
    if (!movie || !movie.id) {
      showToast('ℹ️ Not in the library yet — ask admin to add it');
      return null;
    }

    if (this.has(movie.id)) {
      return this._remove(movie.id);
    } else {
      return this._add(movie);
    }
  },

  /* ── _add (internal) ─────────────────────────────────────────  */
  async _add(movie) {
    // BUG C FIX: check the error instead of ignoring it
    const { error } = await getSB()
      .from('my_list')
      .upsert({ user_id: this._uid, movie_id: movie.id },
              { onConflict: 'user_id,movie_id' });

    if (error) {
      console.error('ML._add error:', error);
      showToast('❌ Could not save — ' + (error.message || 'try again'));
      return null;
    }

    // Optimistic local update (no re-fetch needed)
    this._ids.add(String(movie.id));
    if (!this._data.find(m => m.id === movie.id)) {
      this._data.unshift({ ...movie, addedAt: new Date().toISOString() });
    }
    showToast('✅ Added to My List');
    return true;
  },

  /* ── _remove (internal) ──────────────────────────────────────  */
  async _remove(movieId) {
    const { error } = await getSB()
      .from('my_list')
      .delete()
      .eq('user_id', this._uid)
      .eq('movie_id', movieId);

    if (error) {
      console.error('ML._remove error:', error);
      showToast('❌ Could not remove — ' + (error.message || 'try again'));
      return null;
    }

    this._ids.delete(String(movieId));
    this._data = this._data.filter(m => m.id !== movieId);
    showToast('Removed from My List');
    return false;
  },

  /* ── getData ──────────────────────────────────────────────────
     Full array of saved movie objects for the MyList page.        */
  getData() { return [...this._data]; },

  /* ── removeLocal ──────────────────────────────────────────────
     Used by MyList page for optimistic undo — splices without DB. */
  removeLocal(movieId) {
    this._ids.delete(String(movieId));
    const idx = this._data.findIndex(m => m.id === movieId);
    if (idx === -1) return null;
    const [removed] = this._data.splice(idx, 1);
    return { ...removed, _idx: idx };
  },

  restoreLocal(snapshot) {
    if (!snapshot) return;
    this._ids.add(String(snapshot.id));
    this._data.splice(snapshot._idx, 0, snapshot);
  },
};

// ─────────────────────────────────────────────────────────
//  REALTIME SYNC  (Task 14)
//  My List / Continue Watching used to only sync on page
//  refresh. This subscribes to Supabase Realtime so that a
//  change made in one tab/device (add to My List, progress
//  update, remove from Continue Watching, etc.) is reflected
//  in every other open tab/device within a second or two,
//  without the user having to reload.
//
//  IMPORTANT (one-time Supabase setup required):
//  Realtime must be enabled for the `my_list` and
//  `continue_watching` tables — Supabase Dashboard →
//  Database → Replication → toggle both tables on (or run
//  `ALTER PUBLICATION supabase_realtime ADD TABLE my_list,
//  continue_watching;` in the SQL Editor). Existing RLS
//  policies (user_id = auth.uid()) are reused automatically
//  for realtime — no extra policy needed.
// ─────────────────────────────────────────────────────────
const RT = {
  _channels: [],
  _timers:   {},

  /* Call once per page after auth + initial data load.
     handlers.onMyListChange() and handlers.onCWChange() are
     called (debounced) whenever a row changes for this user —
     the page decides how to refresh itself (e.g. re-run its
     existing load/render function). */
  init(uid, handlers = {}) {
    if (!uid) return;
    this.teardown(); // avoid duplicate subscriptions if init() is called twice
    const sb = getSB();

    const debounced = (key, fn, ms = 500) => {
      clearTimeout(this._timers[key]);
      this._timers[key] = setTimeout(() => { try { fn(); } catch (e) { console.error('RT handler error:', e); } }, ms);
    };

    if (handlers.onMyListChange) {
      const ch = sb.channel('rt-my-list-' + uid)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'my_list', filter: `user_id=eq.${uid}` },
          () => debounced('myList', handlers.onMyListChange))
        .subscribe();
      this._channels.push(ch);
    }

    if (handlers.onCWChange) {
      const ch = sb.channel('rt-cw-' + uid)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'continue_watching', filter: `user_id=eq.${uid}` },
          () => debounced('cw', handlers.onCWChange))
        .subscribe();
      this._channels.push(ch);
    }

    // Best-effort cleanup so we don't leak open sockets across page navigations.
    window.addEventListener('beforeunload', () => this.teardown(), { once: true });
  },

  /* Unsubscribe everything (safe to call even if nothing is subscribed). */
  teardown() {
    const sb = getSB();
    this._channels.forEach(ch => { try { sb.removeChannel(ch); } catch (e) {} });
    this._channels = [];
    Object.values(this._timers).forEach(t => clearTimeout(t));
    this._timers = {};
  },
};

// ─────────────────────────────────────────────────────────
//  RATINGS  (Task 15 — thumbs up/down)
//  Shared, like ML — one place for the DB-backed state, so
//  every page (Player, and the "more info" modal on
//  Home/Browse/Search) gets thumbs up/down for free just by
//  including xwerse-config.js. Call Ratings.init(uid) once
//  after auth, then drop Ratings.thumbsHTML(movieId) wherever
//  the buttons should appear. Requires a `ratings` table —
//  see SETUP_GUIDE.md for the SQL.
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
//  SWIPE SHEET  (Phase 3.6)
//  Swipe-down-to-close for the mobile full-screen "More Info"
//  modal, matching native iOS/Android sheet behaviour. Only
//  the drag-handle element is draggable (not the whole modal),
//  so it never fights with normal content scrolling inside
//  the sheet — the handle is a small dedicated grab strip at
//  the very top, like Apple/Netflix's own sheets.
// ─────────────────────────────────────────────────────────
const SwipeSheet = {
  attach(handleEl, modalEl, onClose) {
    if (!handleEl || !modalEl || handleEl._swipeAttached) return;
    handleEl._swipeAttached = true;

    let startY = 0, lastY = 0, dragging = false;
    const CLOSE_THRESHOLD = 110; // px

    const onStart = (e) => {
      dragging = true;
      startY = lastY = (e.touches ? e.touches[0].clientY : e.clientY);
      modalEl.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      lastY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = Math.max(0, lastY - startY);
      modalEl.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      modalEl.style.transition = '';
      const dy = Math.max(0, lastY - startY);
      if (dy > CLOSE_THRESHOLD) {
        onClose();
      }
      modalEl.style.transform = '';
      startY = lastY = 0;
    };

    handleEl.addEventListener('touchstart', onStart, { passive: true });
    handleEl.addEventListener('touchmove',  onMove,  { passive: true });
    handleEl.addEventListener('touchend',   onEnd);
    handleEl.addEventListener('touchcancel', onEnd);
  },
};

const Ratings = {
  _data: {},   // "movie_155" / "tv_1399" -> 1 (up) | -1 (down)
  _uid:  null,

  async init(uid) {
    this._uid  = uid;
    this._data = uid ? await DB.getAllRatings(uid) : {};
  },

  _key(tmdbId, mediaType) { return (mediaType || 'movie') + '_' + tmdbId; },

  /* 0 = not rated, 1 = thumbs up, -1 = thumbs down */
  get(tmdbId, mediaType) {
    if (!tmdbId) return 0;
    return this._data[this._key(tmdbId, mediaType)] || 0;
  },

  /* Returns the user's most recently thumbs-up'd title as {tmdbId, mediaType},
     or null if they haven't liked anything yet. Powers "Because You Liked X"
     on Home. _data is populated in most-recent-first order (see init()/
     DB.getAllRatings' ORDER BY updated_at desc), and plain-object string-key
     insertion order is preserved per spec, so the first match here really is
     the most recent one — no extra sorting/timestamps needed client-side. */
  getMostRecentLiked() {
    for (const key of Object.keys(this._data)) {
      if (this._data[key] === 1) {
        const idx = key.indexOf('_');
        return { mediaType: key.slice(0, idx), tmdbId: parseInt(key.slice(idx + 1), 10) };
      }
    }
    return null;
  },

  /* Same idea as getMostRecentLiked() but returns up to n seeds (most
     recent first), for combining multiple liked titles into one
     "Top Picks for You" row instead of relying on a single title. */
  getTopLikedSeeds(n = 3) {
    const seeds = [];
    for (const key of Object.keys(this._data)) {
      if (this._data[key] === 1) {
        const idx = key.indexOf('_');
        seeds.push({ mediaType: key.slice(0, idx), tmdbId: parseInt(key.slice(idx + 1), 10) });
        if (seeds.length >= n) break;
      }
    }
    return seeds;
  },

  /* Set of "mediaType_tmdbId" keys the user gave a thumbs-down — used to
     filter disliked titles back out of recommendation rows. */
  getDislikedSet() {
    const set = new Set();
    for (const key of Object.keys(this._data)) {
      if (this._data[key] === -1) set.add(key);
    }
    return set;
  },

  /* Tapping the same thumb again clears the rating (matches Netflix). */
  async toggle(tmdbId, mediaType, value) {
    if (!this._uid || !tmdbId) return null;
    const key     = this._key(tmdbId, mediaType);
    const current = this.get(tmdbId, mediaType);
    if (current === value) {
      const { error } = await DB.deleteRating(this._uid, tmdbId, mediaType);
      if (error) { console.error('deleteRating:', error); this._lastError = error; return null; }
      delete this._data[key];
      return 0;
    }
    const { error } = await DB.setRating(this._uid, tmdbId, mediaType, value);
    if (error) { console.error('setRating:', error); this._lastError = error; return null; }
    this._data[key] = value;
    return value;
  },

  /* Small thumbs-up/thumbs-down pair. Pass the movie/show's tmdb_id +
     type ('movie'/'tv') — NOT the local DB id, since most titles are
     played straight off TMDB and never get a local DB row.
     size: 'md' (default) or 'sm'. */
  thumbsHTML(tmdbId, mediaType, size = 'md') {
    if (!tmdbId) return '';
    const mt   = mediaType || 'movie';
    const up   = this.get(tmdbId, mt) === 1  ? ' active' : '';
    const down = this.get(tmdbId, mt) === -1 ? ' active' : '';
    return `
      <div class="xv-thumbs xv-thumbs-${size}" data-tmdb="${tmdbId}" data-media="${mt}">
        <button class="xv-thumb${up}"   type="button" data-val="1"  onclick="rateThumb(this,${tmdbId},'${mt}',1)"  aria-label="I like this" title="I like this">👍</button>
        <button class="xv-thumb${down}" type="button" data-val="-1" onclick="rateThumb(this,${tmdbId},'${mt}',-1)" aria-label="Not for me"  title="Not for me">👎</button>
      </div>`;
  },

  injectStyles() {
    if (document.getElementById('xv-thumbs-style')) return;
    const style = document.createElement('style');
    style.id = 'xv-thumbs-style';
    style.textContent = `
      .xv-thumbs{display:inline-flex;gap:8px;vertical-align:middle}
      .xv-thumb{width:36px;height:36px;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);
        background:rgba(255,255,255,.06);color:rgba(255,255,255,.9);font-size:1rem;cursor:pointer;
        display:inline-flex;align-items:center;justify-content:center;transition:.15s;
        filter:grayscale(1) opacity(.75);line-height:1;padding:0}
      .xv-thumb:hover{border-color:#fff;background:rgba(255,255,255,.16);filter:grayscale(.3) opacity(1)}
      .xv-thumb.active{border-color:var(--green,#46d369);background:rgba(70,211,105,.18);filter:none}
      .xv-thumbs-sm .xv-thumb{width:30px;height:30px;font-size:.82rem}
    `;
    document.head.appendChild(style);
  },
};

/* Global click handler for the inline onclick in Ratings.thumbsHTML() —
   kept global (rather than a method the markup calls on Ratings directly)
   so it can also update every matching .xv-thumbs block on the page in
   one go, in case the same title's buttons appear more than once. */
async function rateThumb(el, tmdbId, mediaType, value) {
  if (!Ratings._uid) { showToast('⚠️ Please log in first'); return; }
  const result = await Ratings.toggle(tmdbId, mediaType, value);
  if (result === null) {
    const msg = Ratings._lastError?.message || 'unknown error';
    showToast('❌ Could not save rating: ' + msg, 4500);
    return;
  }
  document.querySelectorAll(`.xv-thumbs[data-tmdb="${tmdbId}"][data-media="${mediaType}"]`).forEach(wrap => {
    wrap.querySelectorAll('.xv-thumb').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === result);
    });
  });
  if (result === 1)       showToast('👍 Thanks for the feedback!');
  else if (result === -1) showToast('👎 Thanks — we\u2019ll show you less like this');
}

// ─────────────────────────────────────────────────────────
//  SHARED CARD COMPONENT
//  One visual pattern for every poster/list/continue-watching
//  card across Home, Browse and My List. Previously each page
//  had its own cardHTML/cHTML/mlCardHTML/cwCardHTML with
//  slightly different class names & spacing — this unifies
//  them so spacing, radius, hover effects stay consistent and
//  future tweaks only happen in one place.
//
//  Relies on the page-local `_reg`/`_get` registry (each page
//  already defines these) to avoid JSON-in-onclick crashes.
//
//  Usage:
//    XCard.poster(m, { onOpen:'openModal', action:{type:'add', inList, onToggle:'mlToggle'} })
//    XCard.row(m,    { onOpen:'openMod',   action:{type:'remove', onRemove:'removeML'}, subtitle:m.overview })
//    XCard.cw(m,     { isDone:false, subtitle:'...', onRemove:'removeCW' })
//    XCard.top10(m, i, { onOpen:'openModal' })
// ─────────────────────────────────────────────────────────
const XCard = {
  _stylesInjected: false,

  injectStyles() {
    if (XCard._stylesInjected) return;
    XCard._stylesInjected = true;
    const s = document.createElement('style');
    s.id = 'xcard-styles';
    s.textContent = `
/* ===== XCard — shared card component ===== */
.xc-card{width:100%;border-radius:5px;overflow:hidden;background:var(--card);border:1px solid var(--border);cursor:pointer;transition:transform .22s,border-color .22s,box-shadow .22s;position:relative}
.cards-scroll .xc-card{flex-shrink:0;width:155px;scroll-snap-align:start}
@media(max-width:640px){.cards-scroll .xc-card{width:120px}}
.xc-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.22);box-shadow:var(--shadow-card)}
.xc-thumb{position:relative;aspect-ratio:2/3;overflow:hidden}
.xc-img{width:100%;height:100%;object-fit:cover;background:#222;display:block;transition:filter .22s}
.xc-card:hover .xc-img{filter:brightness(.55)}
.xc-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0;transition:opacity .2s;background:rgba(0,0,0,.35)}
.xc-card:hover .xc-overlay{opacity:1}
.xc-play{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.92);border:none;color:#000;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s}
.xc-play:hover{transform:scale(1.1)}
.xc-add,.xc-remove-btn{width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.55);border:1.5px solid rgba(255,255,255,.45);color:#fff;font-size:.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
.xc-add:hover{border-color:#fff}
.xc-remove-btn:hover{background:rgba(229,9,20,.75);border-color:var(--red)}
.xc-type{position:absolute;top:6px;left:6px;font-size:.57rem;font-weight:800;padding:2px 6px;border-radius:3px;letter-spacing:.8px;background:rgba(0,0,0,.7);color:#fff}
.xc-type.tv{color:var(--green)}
.xc-rating{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);color:var(--green);font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:3px}
.xc-info{padding:8px 9px 10px}
.xc-name{font-size:.8rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
.xc-meta{font-size:.66rem;color:var(--muted);display:flex;gap:5px;align-items:center}

/* Row (list) variant — Browse list-view & My List list-view */
.xc-card.xc-row{display:flex;align-items:center;gap:0}
.xc-card.xc-row .xc-thumb{width:62px;height:93px;flex-shrink:0;aspect-ratio:unset}
.xc-card.xc-row:hover .xc-img{filter:brightness(.8)}
.xc-card.xc-row .xc-overlay{flex-direction:row}
.xc-card.xc-row .xc-info{flex:1;padding:9px 13px;min-width:0}
.xc-card.xc-row .xc-name{font-size:.88rem;white-space:normal;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.xc-card.xc-row .xc-meta{font-size:.72rem}
.xc-sub-desc{font-size:.7rem;color:var(--muted);margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xc-added{font-size:.64rem;color:var(--muted);margin-top:3px}
.xc-row-acts{display:flex;gap:8px;padding:0 12px;flex-shrink:0}
.xc-la-btn{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid var(--border);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;transition:all .2s}
.xc-la-btn:hover{background:rgba(255,255,255,.16)}
.xc-la-btn.xc-del:hover{background:rgba(229,9,20,.7);border-color:var(--red)}

/* Continue-watching thumb card — Home & My List */
.xc-cw{flex-shrink:0;width:220px;border-radius:5px;overflow:hidden;background:var(--card);border:1px solid var(--border);cursor:pointer;transition:transform .2s,border-color .2s;position:relative;scroll-snap-align:start}
.xc-cw:hover{transform:scale(1.04);border-color:rgba(255,255,255,.28)}
@media(max-width:640px){.xc-cw{width:175px}}
.xc-cw-thumb{position:relative;height:126px;overflow:hidden}
.xc-cw-img{width:100%;height:100%;object-fit:cover;background:#222;display:block;transition:filter .2s}
.xc-cw:hover .xc-cw-img{filter:brightness(.65)}
.xc-cw-playov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;background:rgba(0,0,0,.3)}
.xc-cw:hover .xc-cw-playov{opacity:1}
.xc-cw-playbtn{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;color:#000;font-size:1rem}
.xc-cw-prog{position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,.22)}
.xc-cw-progfill{height:100%;background:var(--red);border-radius:0 2px 2px 0;transition:width .3s ease;box-shadow:0 0 6px rgba(229,9,20,.6);min-width:3px}
.xc-cw-time{position:absolute;bottom:7px;right:8px;font-size:.62rem;color:rgba(255,255,255,.75);background:rgba(0,0,0,.6);padding:2px 6px;border-radius:3px}
.xc-cw-info{padding:9px 11px 11px}
.xc-cw-title{font-size:.83rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
.xc-cw-sub{font-size:.7rem;color:var(--muted)}
.xc-cw-remove{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);border:none;color:rgba(255,255,255,.6);width:22px;height:22px;border-radius:50%;font-size:.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:all .2s}
.xc-cw:hover .xc-cw-remove{opacity:1}
.xc-cw-remove:hover{background:rgba(229,9,20,.7);color:#fff}
.xc-cw-est{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;margin-left:4px;border-radius:50%;background:rgba(255,255,255,.18);color:rgba(255,255,255,.85);font-size:.56rem;font-style:normal;cursor:help;vertical-align:middle;line-height:1}
.xc-cw-est:hover,.xc-cw-est:focus-visible{background:rgba(255,255,255,.35)}

/* Top 10 numbered card — Home & Browse */
.xc-t10{flex-shrink:0;display:flex;align-items:flex-end;cursor:pointer;transition:transform .2s}
.xc-t10:hover{transform:scale(1.04);z-index:3}
.xc-t10-num{font-family:'Bebas Neue',cursive;font-size:7rem;color:transparent;-webkit-text-stroke:2px rgba(255,255,255,.18);line-height:1;margin-right:-20px;z-index:1;flex-shrink:0;transition:-webkit-text-stroke-color .2s}
.xc-t10:hover .xc-t10-num{-webkit-text-stroke-color:rgba(255,255,255,.42)}
.xc-t10-img{width:100px;height:146px;border-radius:4px;object-fit:cover;background:#222;z-index:2;position:relative;border:1px solid var(--border)}
@media(max-width:640px){.xc-t10-num{font-size:5.5rem}.xc-t10-img{width:80px;height:116px}}

/* Tablet (641–1024px, Task 7): card sizes tuned between the mobile
   and desktop values instead of jumping straight from one to the
   other — applies everywhere XCard is used (Home, Browse, My List). */
@media(max-width:1024px) and (min-width:641px){
  .cards-scroll .xc-card{width:138px}
  .xc-cw{width:195px}
  .xc-t10-num{font-size:6rem}
  .xc-t10-img{width:90px;height:131px}
}

/* Large desktop & ultra-wide (Task 9) — Netflix doesn't just add more
   columns on a bigger monitor, the cards themselves grow a bit too.
   Two tiers: laptops/small desktops stay at the 155px base above,
   1440px+ steps up, 1920px+ (large/ultra-wide monitors) steps up again. */
@media(min-width:1440px){
  .cards-scroll .xc-card{width:172px}
  .xc-cw{width:242px}
  .xc-t10-num{font-size:7.6rem}
  .xc-t10-img{width:112px;height:164px}
}
@media(min-width:1920px){
  .cards-scroll .xc-card{width:188px}
  .xc-cw{width:262px}
  .xc-t10-num{font-size:8.4rem}
  .xc-t10-img{width:122px;height:178px}
}

/* Keyboard / TV-remote navigation (Task 8) — cards are plain <div>s with
   onclick, so they need tabindex + a visible focus state to be usable
   without a mouse (Tab key, or a Smart TV remote's D-pad). */
.xc-card:focus-visible,.xc-cw:focus-visible,.xc-t10:focus-visible{
  outline:3px solid var(--red);outline-offset:2px;
}
.xc-play:focus-visible,.xc-add:focus-visible,.xc-remove-btn:focus-visible,.xc-la-btn:focus-visible,.xc-cw-remove:focus-visible{
  outline:2px solid #fff;outline-offset:2px;
}
.xc-card:focus-visible{transform:translateY(-2px);border-color:rgba(255,255,255,.22)}
.xc-cw:focus-visible{transform:scale(1.04);border-color:rgba(255,255,255,.28)}

/* Respect reduced-motion preference — disable the hover zoom/scale and
   never start the autoplay trailer preview (motion is exactly what
   these users have asked to avoid). Static poster + click still works. */
@media (prefers-reduced-motion: reduce){
  .xc-card,.xc-img,.xc-overlay,.xc-cw,.xc-cw-img,.xc-cw-playov,.xc-t10,.xc-t10-num,.xc-preview-wrap{transition:none!important}
  .xc-card:hover,.xc-card:focus-visible{transform:none}
  .xc-cw:hover,.xc-cw:focus-visible{transform:none}
  .xc-t10:hover{transform:none}
}

/* Hover-preview trailer overlay — poster cards only (see initHoverPreview) */
.xc-img{z-index:0;position:relative}
.xc-overlay{z-index:3}
.xc-type,.xc-rating{z-index:4}
.xc-preview-wrap{position:absolute;inset:0;z-index:1;opacity:0;transition:opacity .4s ease;pointer-events:none;background:#000;overflow:hidden}
.xc-preview-wrap.show{opacity:1}
.xc-preview-mount{position:absolute;inset:0;width:100%;height:100%}
.xc-preview-mount iframe{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border:0}

/* Smart TV / 10-foot UI (Task 10) — applied only when '.tv-mode' is
   detected on <html> (see XCard.detectTVMode). A remote's D-pad focus
   needs to be obvious from couch distance, so the focused card visibly
   "pops" — bigger scale-up and thicker outline than the desktop
   keyboard-focus ring from Task 8, plus larger base text for readability. */
html.tv-mode{font-size:110%}
html.tv-mode .xc-card:focus-visible,html.tv-mode .xc-cw:focus-visible,html.tv-mode .xc-t10:focus-visible{
  outline-width:4px;outline-offset:4px;transform:scale(1.12);z-index:5;
  box-shadow:0 12px 40px rgba(0,0,0,.8);
}
html.tv-mode .xc-name,html.tv-mode .xc-cw-title{font-size:1.05em}
html.tv-mode .xc-play,html.tv-mode .xc-add,html.tv-mode .xc-remove-btn,html.tv-mode .xc-la-btn{transform:scale(1.15)}
    `;
    document.head.appendChild(s);
    XCard.detectTVMode();
    XCard.initHoverPreview();
    XCard.initTVNav();
  },

  // Smart TV browsers (Tizen, webOS, Android TV/Google TV, Fire TV,
  // HbbTV) identify themselves in the user agent — screen size alone
  // isn't reliable since a TV can report the same viewport as a large
  // monitor. When detected, add `.tv-mode` to <html> for the CSS above.
  detectTVMode() {
    try {
      const ua = navigator.userAgent || '';
      const isTV = /\b(Tizen|SMART-TV|SmartTV|WebOS|Web0S|GoogleTV|Google TV|AFT[A-Z]|AppleTV|HbbTV|CrKey|VIDAA|BRAVIA|NetCast)\b/i.test(ua);
      if (isTV) document.documentElement.classList.add('tv-mode');
    } catch (e) { /* navigator unavailable — ignore */ }
  },

  // D-pad / arrow-key spatial navigation (Task 10) — Tab already moves
  // focus in DOM order (works fine for a keyboard), but a TV remote's
  // D-pad sends arrow keys and expects "move to the nearest card in
  // that direction", not "next in the DOM". This makes ArrowLeft/Right/
  // Up/Down jump between cards geometrically, on any device — it's a
  // plain keydown handler, so it works the same whether the keys came
  // from an actual remote or a keyboard.
  _tvNavInit: false,
  initTVNav() {
    if (XCard._tvNavInit) return;
    XCard._tvNavInit = true;

    const SELECTOR = '.xc-card,.xc-cw,.xc-t10';

    document.addEventListener('keydown', (e) => {
      const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const dir = dirs[e.key];
      if (!dir) return;
      const current = document.activeElement;
      if (!current || !current.matches || !current.matches(SELECTOR)) return;

      const next = XCard._findNearestCard(current, dir, SELECTOR);
      if (next) {
        e.preventDefault();
        next.focus();
        if (next.scrollIntoView) next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    });
  },

  _findNearestCard(current, dir, selector) {
    const curRect = current.getBoundingClientRect();
    const cx = curRect.left + curRect.width / 2;
    const cy = curRect.top + curRect.height / 2;

    let best = null;
    let bestScore = Infinity;

    document.querySelectorAll(selector).forEach((el) => {
      if (el === current) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // hidden/off-screen
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;

      // Only consider candidates actually in the requested direction,
      // then score by primary-axis distance (main direction of travel)
      // plus a penalty for drifting off the cross-axis — this keeps
      // "next card in the row" preferred over "a card two rows down".
      let inDirection = false, primary = 0, cross = 0;
      if (dir === 'left')  { inDirection = dx < -1; primary = -dx; cross = Math.abs(dy); }
      if (dir === 'right') { inDirection = dx > 1;  primary = dx;  cross = Math.abs(dy); }
      if (dir === 'up')    { inDirection = dy < -1; primary = -dy; cross = Math.abs(dx); }
      if (dir === 'down')  { inDirection = dy > 1;  primary = dy;  cross = Math.abs(dx); }
      if (!inDirection) return;

      const score = primary + cross * 2; // cross-axis drift weighted higher
      if (score < bestScore) { bestScore = score; best = el; }
    });

    return best;
  },

  // ── HOVER-PREVIEW TRAILER (Netflix-style) ──────────────────────
  // Hover a poster card for 3s → muted TMDB/YouTube trailer plays
  // inline over the poster. Scoped to grid poster cards only
  // (.xc-card:not(.xc-row)) — row/list cards and the small
  // continue-watching thumb are too small for a meaningful preview.
  _hoverPreviewInit: false,
  _trailerCache: {},

  initHoverPreview() {
    if (XCard._hoverPreviewInit) return;
    XCard._hoverPreviewInit = true;

    document.addEventListener('mouseover', (e) => {
      // Motion (an autoplaying trailer) is exactly what a reduced-motion
      // preference asks us to avoid — don't even start the timer.
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const card = e.target.closest('.xc-card:not(.xc-row)');
      if (!card || card.contains(e.relatedTarget)) return;
      clearTimeout(card._hoverT);
      card._hoverT = setTimeout(() => XCard._showPreview(card), 3000);
    });

    document.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.xc-card:not(.xc-row)');
      if (!card || card.contains(e.relatedTarget)) return;
      clearTimeout(card._hoverT);
      XCard._hidePreview(card);
    });
  },

  // Loads YouTube's official IFrame Player API once (not the raw embed
  // postMessage protocol — that doesn't reliably tell us when the actual
  // video starts vs. when YouTube's own channel/branding thumbnail is
  // still showing). The API's onStateChange event is the accurate signal.
  _ytApiPromise: null,
  _loadYTApi() {
    if (XCard._ytApiPromise) return XCard._ytApiPromise;
    XCard._ytApiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      const prevCb = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCb === 'function') prevCb();
        resolve(window.YT);
      };
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    });
    return XCard._ytApiPromise;
  },

  async _showPreview(card) {
    const m = typeof _get === 'function' ? _get(card.dataset.mk) : null;
    if (!m || !m.tmdb_id) return; // DB-only entries without a TMDB id have no trailer to fetch
    const key = await XCard._getTrailerKey(m);
    if (!key || !card.matches(':hover')) return; // moved on while we were fetching

    const YT = await XCard._loadYTApi();
    if (!card.matches(':hover')) return; // moved on while the API script loaded

    // Reuse an existing player for this card (e.g. hovered again) instead
    // of tearing down and recreating the iframe each time.
    if (card._ytPlayer && typeof card._ytPlayer.loadVideoById === 'function') {
      try {
        if (card._ytWrap) card._ytWrap.classList.remove('show');
        card._ytPlayer.loadVideoById(key);
        return;
      } catch (e) { /* player died — fall through and rebuild below */ }
    }

    const thumb = card.querySelector('.xc-thumb');
    if (!thumb) return;

    // The wrap is a plain div we fully control (opacity stays 0 until we
    // say otherwise). YT.Player replaces `mount` with its own iframe, and
    // that iframe briefly shows YouTube's own channel/branding cover page
    // before the real video frames render — since that all happens INSIDE
    // the wrap while it's still opacity:0, the user never sees it.
    let wrap = thumb.querySelector('.xc-preview-wrap');
    let mount;
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'xc-preview-wrap';
      mount = document.createElement('div');
      mount.id = 'xcpm_' + Math.random().toString(36).slice(2);
      mount.className = 'xc-preview-mount';
      wrap.appendChild(mount);
      thumb.appendChild(wrap);
    } else {
      mount = wrap.querySelector('.xc-preview-mount');
    }
    card._ytWrap = wrap;

    card._ytPlayer = new YT.Player(mount.id, {
      videoId: key,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: key,
        modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1,
        origin: location.origin,
      },
      events: {
        onReady: (e) => {
          e.target.mute();
          e.target.playVideo();
        },
        // Fires PLAYING (1) only once the video is genuinely rendering
        // frames. That's our cue to reveal the (already-loaded) wrapper —
        // whatever YouTube showed inside it before this point stays hidden.
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING && card.matches(':hover')) {
            card._ytWrap && card._ytWrap.classList.add('show');
          }
        },
      },
    });
  },

  _hidePreview(card) {
    if (card._ytWrap) card._ytWrap.classList.remove('show');
    if (!card._ytPlayer) return;
    try { card._ytPlayer.stopVideo(); } catch (e) { /* player already gone */ }
  },

  async _getTrailerKey(m) {
    const cacheKey = `${m.type || 'movie'}_${m.tmdb_id}`;
    if (XCard._trailerCache[cacheKey] !== undefined) return XCard._trailerCache[cacheKey];
    try {
      const data = m.type === 'tv' ? await TMDB.tvDetails(m.tmdb_id) : await TMDB.movieDetails(m.tmdb_id);
      const vids = data?.videos?.results || [];
      const vid = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
               || vids.find(v => v.site === 'YouTube' && v.type === 'Trailer')
               || vids.find(v => v.site === 'YouTube' && v.type === 'Teaser')
               || null;
      const key = vid ? vid.key : null;
      XCard._trailerCache[cacheKey] = key;
      return key;
    } catch (e) {
      XCard._trailerCache[cacheKey] = null;
      return null;
    }
  },

  // Keyboard/TV-remote accessibility (Task 8): every XCard div is a
  // click target but not natively focusable/activatable without a mouse.
  // This returns the shared attributes that fix that — Tab-focusable,
  // announced as a button, and Enter/Space triggers the same onclick.
  _a11yAttrs(title) {
    const label = String(title || 'Open title').replace(/"/g, '&quot;');
    return `tabindex="0" role="button" aria-label="${label}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`;
  },

  _actionBtn(k, action, size /* 'overlay' | 'row' */) {
    if (!action || action.type === 'none') return '';
    const cls = size === 'row' ? 'xc-la-btn' : 'xc-add';
    if (action.type === 'add') {
      const inList = !!action.inList;
      return `<button class="${cls}" data-mk="${k}" onclick="event.stopPropagation();${action.onToggle || 'mlToggle'}(_get(this.dataset.mk))">${inList ? '✓' : '+'}</button>`;
    }
    if (action.type === 'remove') {
      const delCls = size === 'row' ? 'xc-la-btn xc-del' : 'xc-remove-btn';
      return `<button class="${delCls}" data-mk="${k}" onclick="event.stopPropagation();${action.onRemove || 'removeML'}(_get(this.dataset.mk).id)">✕</button>`;
    }
    return '';
  },

  // Poster grid card — replaces cardHTML (Home) / cHTML grid mode (Browse) / mlCardHTML grid mode (My List)
  poster(m, opts = {}) {
    XCard.injectStyles();
    const { onOpen = 'openModal', onPlay = null, showBadge = true, action = { type: 'add' } } = opts;
    const k      = _reg(m);
    const isTV   = m.type === 'tv';
    const rat    = m.rating || m.vote_average || '';
    const playFn = onPlay || onOpen;
    return `<div class="xc-card" data-mk="${k}" ${XCard._a11yAttrs(m.title)} onclick="${onOpen}(_get(this.dataset.mk))">
      <div class="xc-thumb">
        <img class="xc-img" src="${m.poster_url||''}" alt="${m.title}" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.title)}&background=222&color=555&size=400'">
        ${showBadge ? `<span class="xc-type ${m.type||'movie'}">${isTV?'TV':'MOVIE'}</span>` : ''}
        ${showBadge && rat ? `<span class="xc-rating">★ ${rat}</span>` : ''}
        <div class="xc-overlay">
          <button class="xc-play" data-mk="${k}" onclick="event.stopPropagation();${playFn}(_get(this.dataset.mk))">▶</button>
          ${XCard._actionBtn(k, action, 'overlay')}
        </div>
      </div>
      <div class="xc-info">
        <div class="xc-name">${m.title}</div>
        <div class="xc-meta"><span>${m.year||''}</span>${rat?`<span style="color:var(--green)">★ ${rat}</span>`:''}</div>
      </div>
    </div>`;
  },

  // Wide row/list card — replaces cHTML list mode (Browse) / mlCardHTML list mode (My List)
  row(m, opts = {}) {
    XCard.injectStyles();
    const { onOpen = 'openModal', onPlay = null, action = { type: 'add' }, subtitle = '', added = '' } = opts;
    const k      = _reg(m);
    const rat    = m.rating || m.vote_average || '';
    const playFn = onPlay || onOpen;
    return `<div class="xc-card xc-row" data-mk="${k}" ${XCard._a11yAttrs(m.title)} onclick="${onOpen}(_get(this.dataset.mk))">
      <div class="xc-thumb">
        <img class="xc-img" src="${m.poster_url||''}" alt="${m.title}" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.title)}&background=222&color=555'">
        <div class="xc-overlay"><button class="xc-play" data-mk="${k}" onclick="event.stopPropagation();${playFn}(_get(this.dataset.mk))">▶</button></div>
      </div>
      <div class="xc-info">
        <div class="xc-name">${m.title}</div>
        <div class="xc-meta"><span>${m.year||''}</span>${rat?`<span>·</span><span style="color:var(--green)">★ ${rat}</span>`:''}</div>
        ${subtitle ? `<div class="xc-sub-desc">${subtitle}</div>` : ''}
        ${added ? `<div class="xc-added">${added}</div>` : ''}
      </div>
      <div class="xc-row-acts">
        <button class="xc-la-btn" data-mk="${k}" onclick="event.stopPropagation();${playFn}(_get(this.dataset.mk))" title="Play">▶</button>
        ${XCard._actionBtn(k, action, 'row')}
      </div>
    </div>`;
  },

  // Continue-watching thumb card — replaces cwCardHTML (Home + My List, incl. TV resume / isDone state)
  cw(m, opts = {}) {
    XCard.injectStyles();
    const {
      onPlay     = 'playMovie',
      onRemove   = 'removeCW',
      showRemove = true,
      isDone     = false,
      subtitle   = null, // override default subtitle text if provided
    } = opts;
    const dur      = Number(m.duration) || 0;
    const prog     = Number(m.progress) || 0;
    const rawPct   = dur > 0 ? (prog / dur) * 100 : 0;
    const pct      = Math.min(100, Math.max(rawPct > 0 ? 3 : 0, rawPct));
    const minsLeft = dur > 0 ? Math.max(0, Math.round((dur - prog) / 60)) : 0;
    const isTV     = m.type === 'tv';
    const lastS    = m.lastSeason  || 1;
    const lastE    = m.lastEpisode || 1;
    const k        = _reg(m);
    const onClickPlay = isTV
      ? `${onPlay}(_get(this.dataset.mk),${lastS},${lastE})`
      : `${onPlay}(_get(this.dataset.mk))`;
    const sub = subtitle !== null ? subtitle : (isDone ? 'Watched' : (isTV ? `S${lastS} E${lastE} · Continue` : 'Continue watching'));
    return `<div class="xc-cw" data-mk="${k}" ${XCard._a11yAttrs(m.title)} onclick="${onClickPlay}">
      <div class="xc-cw-thumb">
        <img class="xc-cw-img" src="${m.backdrop_url||m.poster_url||''}" alt="${m.title}" loading="lazy" onerror="this.src='${m.poster_url||''}'">
        <div class="xc-cw-playov"><div class="xc-cw-playbtn">▶</div></div>
        <div class="xc-cw-prog" title="Estimated progress — based on time spent, not exact video position"><div class="xc-cw-progfill" style="width:${pct}%"></div></div>
        ${isDone ? `<div class="xc-cw-time" style="color:var(--green)">✓ Done</div>` : (minsLeft > 0 ? `<div class="xc-cw-time">~${minsLeft}m left<i class="xc-cw-est" tabindex="0" role="button" aria-label="Why estimated?" title="Estimated — based on time spent, not exact video position" onclick="event.stopPropagation();showToast('ℹ️ Progress is estimated from time spent watching, not the exact video position')">i</i></div>` : '')}
        ${showRemove ? `<button class="xc-cw-remove" data-mk="${k}" onclick="event.stopPropagation();${onRemove}(_get(this.dataset.mk).id)" title="Remove">✕</button>` : ''}
      </div>
      <div class="xc-cw-info">
        <div class="xc-cw-title">${m.title}</div>
        <div class="xc-cw-sub">${sub}</div>
      </div>
    </div>`;
  },

  // Top-10 numbered card — replaces manual markup in buildTopTen (Home) / buildT10 (Browse)
  top10(m, i, opts = {}) {
    XCard.injectStyles();
    const { onOpen = 'openModal' } = opts;
    const k = _reg(m);
    return `<div class="xc-t10" data-mk="${k}" ${XCard._a11yAttrs(m.title)} onclick="${onOpen}(_get(this.dataset.mk))">
      <div class="xc-t10-num">${i+1}</div>
      <img class="xc-t10-img" src="${m.poster_url||''}" alt="${m.title}" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.title)}&background=222&color=555&size=200'">
    </div>`;
  },
};

// ─────────────────────────────────────────────────────────
//  SHARED NOTIFICATION PANEL
//  Netflix-style slide-in drawer — works on every page.
//
//  Usage in any page:
//    1. Bell button: onclick="XvNotif.toggle()"
//    2. Add class "_xvNP-dot" on the red dot span  ← auto-hides/shows
//    3. In page init:  XvNotif.init(currentUser.id);
// ─────────────────────────────────────────────────────────
const XvNotif = {
  _uid:   null,
  _items: [],
  _open:  false,
  _tab:   'all',

  /* Call once after auth. Fire-and-forget is fine. */
  async init(uid) {
    this._uid = uid;
    this._inject();
    try {
      this._items = await DB.getNotifications(uid);
    } catch(e) { this._items = []; }
    this._badge();
    this._render();
  },

  /* Toggle open / close */
  toggle() {
    this._open = !this._open;
    const p  = document.getElementById('_xvNP');
    const ov = document.getElementById('_xvNPOv');
    if (p)  p.classList.toggle('_xvNP-open', this._open);
    if (ov) ov.classList.toggle('_xvNPOv-show', this._open);
    if (this._open) this._render();
  },

  close() { if (this._open) this.toggle(); },

  /* Switch All / Unread tabs */
  setTab(tab, btn) {
    this._tab = tab;
    document.querySelectorAll('._xvNP-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this._render();
  },

  /* Mark single notification read */
  async markRead(id) {
    DB.markNotifRead(id).catch(() => {});
    this._items = this._items.map(n => n.id === id ? { ...n, is_read: true } : n);
    this._badge();
    this._render();
  },

  /* Mark all read */
  async markAllRead() {
    if (!this._uid) return;
    try { await DB.markAllNotifsRead(this._uid); } catch(e) {}
    this._items = this._items.map(n => ({ ...n, is_read: true }));
    this._badge();
    this._render();
    showToast('✅ All marked as read');
  },

  /* ── private ── */

  _render() {
    const list = document.getElementById('_xvNPList');
    if (!list) return;

    let items = this._tab === 'unread'
      ? this._items.filter(n => !n.is_read)
      : [...this._items];

    if (!items.length) {
      list.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    padding:52px 20px;text-align:center">
          <div style="font-size:2.6rem;margin-bottom:14px;opacity:.25">🔔</div>
          <div style="font-size:.9rem;font-weight:700;color:rgba(255,255,255,.45);margin-bottom:6px">
            ${this._tab === 'unread' ? 'All caught up' : 'No notifications yet'}
          </div>
          <div style="font-size:.76rem;color:rgba(255,255,255,.25);line-height:1.55">
            New notifications will show up here
          </div>
        </div>`;
      return;
    }

    list.innerHTML = items.map(n => `
      <div class="_xvNP-item${n.is_read ? '' : ' _xvNP-unread'}"
           onclick="XvNotif.markRead(${n.id})" role="button">
        <img class="_xvNP-thumb"
             src="${n.image_url || 'https://ui-avatars.com/api/?name=XV&background=E50914&color=fff&size=64'}"
             onerror="this.src='https://ui-avatars.com/api/?name=XV&background=333&color=555&size=64'">
        <div class="_xvNP-body">
          <div class="_xvNP-ttl">
            ${!n.is_read ? '<span class="_xvNP-unread-dot"></span>' : ''}
            ${n.title || ''}
          </div>
          <div class="_xvNP-desc">${n.body || ''}</div>
          <div class="_xvNP-time">${this._timeAgo(n.created_at)}</div>
        </div>
      </div>`).join('');
  },

  _badge() {
    const u = this._items.filter(n => !n.is_read).length;

    /* Update count labels inside the panel */
    const cnt = document.getElementById('_xvNPCnt');
    if (cnt) { cnt.textContent = u > 99 ? '99+' : u; cnt.style.display = u ? 'flex' : 'none'; }

    /* Update every bell dot on the page that has class _xvNP-dot */
    document.querySelectorAll('._xvNP-dot').forEach(el => {
      el.style.display = u ? 'block' : 'none';
    });
  },

  _timeAgo(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  },

  /* Inject CSS + HTML once */
  _inject() {
    if (document.getElementById('_xvNPStyle')) return;

    /* ── CSS ── */
    const css = document.createElement('style');
    css.id = '_xvNPStyle';
    css.textContent = `
      #_xvNPOv{position:fixed;inset:0;z-index:9000;display:none}
      #_xvNPOv._xvNPOv-show{display:block}
      #_xvNP{
        position:fixed;top:0;right:0;width:360px;height:100vh;
        background:rgba(9,9,9,.98);border-left:1px solid rgba(255,255,255,.08);
        z-index:9001;transform:translateX(100%);
        transition:transform .3s cubic-bezier(.4,0,.2,1);
        display:flex;flex-direction:column;
        backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
        box-shadow:-8px 0 32px rgba(0,0,0,.5)
      }
      #_xvNP._xvNP-open{transform:translateX(0)}
      ._xvNP-hd{
        display:flex;align-items:center;justify-content:space-between;
        padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,.07);
        flex-shrink:0
      }
      ._xvNP-title{
        font-family:'Bebas Neue',cursive;font-size:1.15rem;letter-spacing:1.5px;
        color:#fff;display:flex;align-items:center;gap:9px
      }
      ._xvNP-cnt{
        background:#E50914;color:#fff;font-family:'Barlow',sans-serif;
        font-size:.6rem;font-weight:800;min-width:18px;height:18px;
        border-radius:9px;display:flex;align-items:center;justify-content:center;
        padding:0 5px;letter-spacing:0
      }
      ._xvNP-x{
        background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);
        color:rgba(255,255,255,.55);cursor:pointer;width:30px;height:30px;
        border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:.85rem;transition:all .18s
      }
      ._xvNP-x:hover{background:rgba(255,255,255,.14);color:#fff}
      ._xvNP-tabs{
        display:flex;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0
      }
      ._xvNP-tab{
        flex:1;background:none;border:none;border-bottom:2px solid transparent;
        color:rgba(255,255,255,.4);font-size:.8rem;font-weight:600;
        padding:10px 6px;cursor:pointer;font-family:'Barlow',sans-serif;
        transition:all .2s;margin-bottom:-1px
      }
      ._xvNP-tab.active{color:#fff;border-bottom-color:#E50914}
      ._xvNP-list{
        flex:1;overflow-y:auto;
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.08) transparent
      }
      ._xvNP-list::-webkit-scrollbar{width:4px}
      ._xvNP-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
      ._xvNP-item{
        display:flex;gap:12px;padding:13px 16px;
        border-bottom:1px solid rgba(255,255,255,.05);
        cursor:pointer;transition:background .17s;position:relative
      }
      ._xvNP-item:hover{background:rgba(255,255,255,.04)}
      ._xvNP-unread{background:rgba(229,9,20,.04)}
      ._xvNP-unread::before{
        content:'';position:absolute;left:0;top:0;bottom:0;
        width:3px;background:#E50914;border-radius:0 2px 2px 0
      }
      ._xvNP-thumb{
        width:52px;height:52px;border-radius:6px;object-fit:cover;
        flex-shrink:0;background:#1e1e1e
      }
      ._xvNP-body{flex:1;min-width:0}
      ._xvNP-ttl{
        font-size:.83rem;font-weight:600;color:#fff;
        margin-bottom:3px;line-height:1.35;display:flex;align-items:center;gap:6px
      }
      ._xvNP-unread-dot{
        width:6px;height:6px;background:#E50914;border-radius:50%;
        flex-shrink:0;margin-top:1px
      }
      ._xvNP-desc{
        font-size:.74rem;color:rgba(255,255,255,.42);line-height:1.45;
        margin-bottom:4px;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden
      }
      ._xvNP-time{font-size:.65rem;color:rgba(255,255,255,.22)}
      ._xvNP-ft{
        padding:12px 14px;border-top:1px solid rgba(255,255,255,.07);
        flex-shrink:0;display:flex;gap:8px
      }
      ._xvNP-mark{
        flex:1;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.62);
        padding:9px;font-size:.78rem;font-weight:600;border-radius:6px;
        cursor:pointer;font-family:'Barlow',sans-serif;transition:all .2s
      }
      ._xvNP-mark:hover{background:rgba(255,255,255,.11);color:#fff}
      ._xvNP-cfg{
        background:rgba(229,9,20,.08);border:1px solid rgba(229,9,20,.18);
        color:#E50914;padding:9px 13px;font-size:.78rem;font-weight:600;
        border-radius:6px;cursor:pointer;font-family:'Barlow',sans-serif;
        transition:all .2s;white-space:nowrap
      }
      ._xvNP-cfg:hover{background:rgba(229,9,20,.16)}
      @media(max-width:480px){
        #_xvNP{width:100vw;border-left:none}
      }
    `;
    document.head.appendChild(css);

    /* ── Overlay ── */
    const ov = document.createElement('div');
    ov.id = '_xvNPOv';
    ov.onclick = () => XvNotif.close();
    document.body.appendChild(ov);

    /* ── Panel ── */
    const panel = document.createElement('div');
    panel.id = '_xvNP';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notifications');
    panel.innerHTML = `
      <div class="_xvNP-hd">
        <div class="_xvNP-title">
          Notifications
          <span class="_xvNP-cnt" id="_xvNPCnt" style="display:none">0</span>
        </div>
        <button class="_xvNP-x" onclick="XvNotif.close()" aria-label="Close">✕</button>
      </div>
      <div class="_xvNP-tabs">
        <button class="_xvNP-tab active" onclick="XvNotif.setTab('all',this)">All</button>
        <button class="_xvNP-tab" onclick="XvNotif.setTab('unread',this)">Unread</button>
      </div>
      <div class="_xvNP-list" id="_xvNPList">
        <div style="display:flex;flex-direction:column;align-items:center;
                    justify-content:center;padding:52px 20px;text-align:center">
          <div style="width:28px;height:28px;border:2px solid rgba(229,9,20,.4);
                      border-top-color:#E50914;border-radius:50%;
                      animation:_xvSpin .8s linear infinite;margin-bottom:14px"></div>
          <div style="font-size:.8rem;color:rgba(255,255,255,.3)">Loading…</div>
        </div>
      </div>
      <div class="_xvNP-ft">
        <button class="_xvNP-mark" onclick="XvNotif.markAllRead()">✓ Mark All Read</button>
        <button class="_xvNP-cfg"
          onclick="XvNotif.close();window.location.href='XwerseMovies_Settings.html#notifs'">
          ⚙ Settings
        </button>
      </div>`;
    document.body.appendChild(panel);

    /* Spinner keyframes */
    const spin = document.createElement('style');
    spin.textContent = '@keyframes _xvSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(spin);

    /* Close on Escape key */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && XvNotif._open) XvNotif.close();
    });
  },
};

// ─────────────────────────────────────────────────────────
//  PASSWORD STRENGTH METER
//  Attach to any password <input> — shows a 3-bar weak/medium/
//  strong indicator underneath as the user types. Used on the
//  signup form (index.html) and Settings → Change Password.
//
//  Usage:  PwdMeter.attach(document.getElementById('suPass'));
// ─────────────────────────────────────────────────────────
const PwdMeter = {
  _injected: false,

  injectStyles() {
    if (PwdMeter._injected) return;
    PwdMeter._injected = true;
    const s = document.createElement('style');
    s.id = 'pwdmeter-styles';
    s.textContent = `
.pwm{margin:6px 2px 2px;display:none}
.pwm-bars{display:flex;gap:4px;margin-bottom:5px}
.pwm-bar{height:4px;flex:1;border-radius:2px;background:rgba(255,255,255,.14);transition:background .25s ease}
.pwm-bar.on.weak{background:#E50914}
.pwm-bar.on.medium{background:#f5a623}
.pwm-bar.on.strong{background:#2ecc71}
.pwm-label{font-size:.7rem;font-weight:600;letter-spacing:.2px}
.pwm-label.weak{color:#E50914}
.pwm-label.medium{color:#f5a623}
.pwm-label.strong{color:#2ecc71}
    `;
    document.head.appendChild(s);
  },

  // 0 = empty, 1 = weak, 2 = medium, 3 = strong
  _score(pwd) {
    if (!pwd) return 0;
    let pts = 0;
    if (pwd.length >= 6)  pts++;
    if (pwd.length >= 10) pts++;
    if (pwd.length >= 14) pts++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) pts++;
    if (/[0-9]/.test(pwd)) pts++;
    if (/[^A-Za-z0-9]/.test(pwd)) pts++;
    if (pts <= 2) return 1;
    if (pts <= 4) return 2;
    return 3;
  },

  attach(input) {
    if (!input || input._pwmAttached) return;
    input._pwmAttached = true;
    PwdMeter.injectStyles();

    const wrap = document.createElement('div');
    wrap.className = 'pwm';
    wrap.innerHTML = `
      <div class="pwm-bars">
        <div class="pwm-bar" data-i="1"></div>
        <div class="pwm-bar" data-i="2"></div>
        <div class="pwm-bar" data-i="3"></div>
      </div>
      <div class="pwm-label"></div>`;
    // Netflix-style floating-label inputs (index.html's `.field`) position
    // the <label> absolutely and center it using the wrapper's height —
    // inserting the meter directly after the input would grow that
    // wrapper's height as the meter toggles and throw the label off.
    // Insert after the whole `.field` wrapper instead when present.
    const anchor = input.closest('.field') || input;
    anchor.insertAdjacentElement('afterend', wrap);

    const bars  = wrap.querySelectorAll('.pwm-bar');
    const label = wrap.querySelector('.pwm-label');
    const levels = {
      1: ['weak',   'Weak password'],
      2: ['medium', 'Medium strength'],
      3: ['strong', 'Strong password'],
    };

    const update = () => {
      const score = PwdMeter._score(input.value);
      if (score === 0) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      const [cls, text] = levels[score];
      bars.forEach((b, idx) => { b.className = 'pwm-bar' + (idx < score ? ` on ${cls}` : ''); });
      label.className = 'pwm-label ' + cls;
      label.textContent = text;
    };

    input.addEventListener('input', update);
    update();
  },
};

// ─────────────────────────────────────────────────────────
//  SERVICE WORKER UPDATE HANDLER
//  When a new service worker activates, reload the page so
//  fresh files (including this config) are used immediately.
//  Prevents "XvNotif is not defined" from stale SW cache.
// ─────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  var _xvSwRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (!_xvSwRefreshing) {
      _xvSwRefreshing = true;
      window.location.reload();
    }
  });
}
