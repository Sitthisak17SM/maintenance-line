// Shared LIFF bootstrap (PLAN §9). Every page calls initLiff() itself.

/**
 * Initializes LIFF and makes sure the user is logged in.
 * Resolves to the ID token, or to null while redirecting to LINE login.
 */
async function initLiff() {
  if (!CONFIG.LIFF_ID) throw new Error('ยังไม่ได้ตั้งค่า LIFF_ID ใน js/config.js');
  await liff.init({ liffId: CONFIG.LIFF_ID });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: location.href });
    return null;
  }
  return liff.getIDToken();
}
