// LINE Messaging API and LINE Login helpers.

const LINE_API_BASE = 'https://api.line.me';
const LINE_IDTOKEN_CACHE_SECONDS = 600;

function Line_text(text) {
  return { type: 'text', text: text };
}

/** Reply is free (no quota). A reply token is single-use and short-lived. Returns {ok, status, body}. */
function Line_reply(replyToken, messages) {
  const res = UrlFetchApp.fetch(LINE_API_BASE + '/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + Line_accessToken_() },
    payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
    muteHttpExceptions: true,
  });
  const status = res.getResponseCode();
  if (status !== 200) console.error('LINE reply failed: %s %s', status, res.getContentText());
  return { ok: status === 200, status: status, body: status === 200 ? '' : res.getContentText() };
}

/**
 * Push to one user or several (multicast). Counts toward the monthly quota once per recipient,
 * so only use it for the notifications in PLAN §8. Never throws; returns {ok, status, body}.
 */
function Line_push(to, messages) {
  const ids = (Array.isArray(to) ? to : [to])
    .map(function (id) { return String(id || '').trim(); })
    .filter(function (id, i, all) { return id && all.indexOf(id) === i; });
  if (!ids.length) return { ok: true, status: 0, body: 'no recipients' };
  const multicast = ids.length > 1;
  try {
    const res = UrlFetchApp.fetch(LINE_API_BASE + (multicast ? '/v2/bot/message/multicast' : '/v2/bot/message/push'), {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + Line_accessToken_() },
      payload: JSON.stringify({ to: multicast ? ids : ids[0], messages: messages }),
      muteHttpExceptions: true,
    });
    const status = res.getResponseCode();
    if (status !== 200) console.error('LINE push to %s failed: %s %s', ids.join(','), status, res.getContentText());
    return { ok: status === 200, status: status, body: status === 200 ? '' : res.getContentText() };
  } catch (err) {
    console.error('LINE push to %s failed: %s', ids.join(','), err);
    return { ok: false, status: 0, body: String(err) };
  }
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
  return token.trim();
}

function Line_sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
