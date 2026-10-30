// LINE Messaging API and LINE Login helpers.

const LINE_API_BASE = 'https://api.line.me';
const LINE_IDTOKEN_CACHE_SECONDS = 600;

function Line_text(text) {
  return { type: 'text', text: text };
}

/** Reply is free (no quota). A reply token is single-use and short-lived. */
function Line_reply(replyToken, messages) {
  const res = UrlFetchApp.fetch(LINE_API_BASE + '/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + Line_accessToken_() },
    payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    console.error('LINE reply failed: %s %s', res.getResponseCode(), res.getContentText());
  }
  return res.getResponseCode() === 200;
}

/** Phase 1: push notifications (counts toward quota, see PLAN §8). */
function Line_push(to, messages) {
  throw new Error('Line_push: not implemented (phase 1)');
}

/**
 * Verifies a LIFF ID token with LINE (PLAN §6) and returns {userId, displayName}.
 * Throws Api_error('AUTH') when the token is missing, invalid or expired.
 */
function Line_verifyIdToken(idToken) {
  if (!idToken) throw Api_error('AUTH', 'Missing idToken');
  const cache = CacheService.getScriptCache();
  const cacheKey = 'idt_' + Line_sha256Hex_(idToken);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const channelId = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!channelId) throw new Error('LINE_LOGIN_CHANNEL_ID is not set');
  const res = UrlFetchApp.fetch(LINE_API_BASE + '/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw Api_error('AUTH', 'ID token rejected: ' + res.getContentText());
  }
  const body = JSON.parse(res.getContentText());
  const user = { userId: body.sub, displayName: body.name || '' };

  // Never cache past the token's own expiry.
  const ttl = Math.min(LINE_IDTOKEN_CACHE_SECONDS, Math.floor(body.exp - Date.now() / 1000));
  if (ttl > 0) cache.put(cacheKey, JSON.stringify(user), ttl);
  return user;
}

function Line_accessToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  return token;
}

function Line_sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
