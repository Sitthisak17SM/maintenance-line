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
    const me = await api('me');
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
