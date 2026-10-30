// LIFF API (PLAN §6). Request body: {"action": "...", "idToken": "...", "data": {...}}.

const API_ACTIONS = {
  ping: function () {
    return { pong: true, at: new Date().toISOString() };
  },
  whoami: function (req) {
    const user = Line_verifyIdToken(req.idToken);
    return { userId: user.userId, displayName: user.displayName };
  },
};

function Api_handle(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return Api_json_({ ok: false, error: { code: 'VALIDATION', message: 'Invalid JSON body' } });
  }
  const handler = Object.prototype.hasOwnProperty.call(API_ACTIONS, req.action) ? API_ACTIONS[req.action] : null;
  if (!handler) {
    return Api_json_({ ok: false, error: { code: 'VALIDATION', message: 'Unknown action: ' + req.action } });
  }
  try {
    return Api_json_({ ok: true, data: handler(req) });
  } catch (err) {
    if (err.code) return Api_json_({ ok: false, error: { code: err.code, message: err.message } });
    console.error('API %s failed: %s', req.action, err.stack || err);
    return Api_json_({ ok: false, error: { code: 'INTERNAL', message: 'Internal error' } });
  }
}

/** Error with one of the API error codes in PLAN §6. */
function Api_error(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function Api_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
