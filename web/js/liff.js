// Shared LIFF bootstrap (PLAN §9). Every page calls initLiff() itself.

// liff.* calls other than init() throw until init has finished; api() checks this flag.
let liffReady = false;

/**
 * Initializes LIFF and makes sure the user is logged in.
 * Resolves to the ID token, or to null while redirecting to LINE login.
 */
async function initLiff() {
  if (!CONFIG.LIFF_ID) throw new Error('ยังไม่ได้ตั้งค่า LIFF_ID ใน js/config.js');
  await liff.init({ liffId: CONFIG.LIFF_ID });
  liffReady = true;
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: location.href });
    return null;
  }
  return liff.getIDToken();
}

/**
 * Page bootstrap (PLAN §9 steps 1-5): init LIFF, log in, call `me`, and send unregistered
 * users to register.html (which comes back here afterwards). Resolves to the `me` result,
 * or to null while the page is redirecting.
 */
async function startPage(options) {
  const opts = options || {};
  showLoading();
  try {
    const idToken = await initLiff();
    if (!idToken) return null;
    const me = await loadMe_(opts.fresh);
    if (opts.requireUser !== false && !me.user) {
      location.replace('register.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
      return null;
    }
    if (me.user && !me.user.active) {
      showError(new Error('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ'));
      return null;
    }
    return me;
  } catch (err) {
    showError(err);
    return null;
  }
}

// Every Apps Script call takes about 2 s, so a registered user's `me` is kept in this browser for
// ME_CACHE_MS and reused by the next page (one call instead of two). It only shapes the UI: the
// server checks role and permissions on every action. A cached copy older than ME_REFRESH_MS is
// refreshed in the background for the page after this one.
const ME_CACHE_MS = 10 * 60 * 1000;
const ME_REFRESH_MS = 2 * 60 * 1000;

function meCacheKey_() {
  const token = liff.getDecodedIDToken();
  return token && token.sub ? 'me:' + CONFIG.LIFF_ID + ':' + token.sub : null;
}

async function loadMe_(fresh) {
  const key = meCacheKey_();
  let cached = null;
  try {
    cached = key && !fresh ? JSON.parse(localStorage.getItem(key) || 'null') : null;
  } catch (err) {
    cached = null;
  }
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && cached.me && age >= 0 && age < ME_CACHE_MS) {
    if (age > ME_REFRESH_MS) api('me').then(function (me) { saveMe_(key, me); }).catch(function () {});
    return cached.me;
  }
  const me = await api('me');
  saveMe_(key, me);
  return me;
}

/** Only registered, active users are cached, so a new user always sees the register check. */
function saveMe_(key, me) {
  try {
    if (key && me && me.user && me.user.active) localStorage.setItem(key, JSON.stringify({ at: Date.now(), me: me }));
    else if (key) localStorage.removeItem(key);
  } catch (err) {
    // Storage can be blocked (private mode); the page just calls `me` every time.
  }
}

/** After the user's own data changes (register), so the next page reads it fresh. */
function forgetMe() {
  try {
    const key = meCacheKey_();
    if (key) localStorage.removeItem(key);
  } catch (err) {
    // nothing cached
  }
}
