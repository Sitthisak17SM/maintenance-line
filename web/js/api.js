// Calls the Apps Script API (PLAN §6). text/plain avoids a CORS preflight.

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Resolves to `data` on success; throws ApiError(code, message) otherwise. */
async function api(action, data) {
  if (!CONFIG.API_URL) throw new ApiError('CONFIG', 'ยังไม่ได้ตั้งค่า API_URL ใน js/config.js');
  const idToken = typeof liff !== 'undefined' && liff.isLoggedIn() ? liff.getIDToken() : null;
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, idToken, data: data || {} }),
  });
  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new ApiError('INTERNAL', 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ' + res.status + ')');
  }
  if (!json.ok) throw new ApiError(json.error.code, json.error.message);
  return json.data;
}
