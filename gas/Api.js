// LIFF API (PLAN §6). Request body: {"action": "...", "idToken": "...", "data": {...}}.
// The caller is always the `sub` of the verified ID token; any userId inside `data` is ignored.

const API_ERROR_CODES = ['AUTH', 'NOT_REGISTERED', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_STATE', 'VALIDATION', 'CONFLICT', 'INTERNAL'];

const API_ACTIONS = {
  ping: function () {
    return { pong: true, at: new Date().toISOString() };
  },
  whoami: function (req) {
    const user = Line_verifyIdToken(req.idToken);
    return { userId: user.userId, displayName: user.displayName };
  },
  me: function (req) {
    return Jobs_me(Line_verifyIdToken(req.idToken));
  },
  register: function (req) {
    return Jobs_register(Line_verifyIdToken(req.idToken), req.data);
  },
  createJob: function (req) {
    return Jobs_create(Api_actor_(req), req.data);
  },
  getJob: function (req) {
    return Jobs_get(Api_actor_(req), Api_jobId_(req));
  },
  listJobs: function (req) {
    return Jobs_list(Api_actor_(req), req.data);
  },
  acceptJob: function (req) {
    return Jobs_accept(Api_actor_(req), Api_jobId_(req));
  },
  rejectJob: function (req) {
    return Jobs_reject(Api_actor_(req), Api_jobId_(req), req.data.reason);
  },
  forwardJob: function (req) {
    return Jobs_forward(Api_actor_(req), Api_jobId_(req), req.data.reason);
  },
  reassignJob: function (req) {
    return Jobs_reassign(Api_actor_(req), Api_jobId_(req), req.data);
  },
  checkin: function (req) {
    return Jobs_checkin(Api_actor_(req), Api_jobId_(req));
  },
  closeJob: function (req) {
    return Jobs_close(Api_actor_(req), Api_jobId_(req), req.data);
  },
  ackJob: function (req) {
    return Jobs_ack(Api_actor_(req), Api_jobId_(req));
  },
  // --- phase 2 ---
  requestExtension: function (req) {
    return Jobs_requestExtension(Api_actor_(req), Api_jobId_(req), req.data);
  },
  decideExtension: function (req) {
    return Jobs_decideExtension(Api_actor_(req), Api_jobId_(req), req.data);
  },
  setPriority: function (req) {
    return Jobs_setPriority(Api_actor_(req), Api_jobId_(req), req.data);
  },
  cancelJob: function (req) {
    return Jobs_cancel(Api_actor_(req), Api_jobId_(req), req.data.reason);
  },
  dashboard: function (req) {
    return Jobs_dashboard(Api_actor_(req), req.data);
  },
};

// Job actions also return the getJob view as `detail`, so job.html redraws without a second
// request (each one costs about 2 s, PLAN §6).
const API_DETAIL_ACTIONS = ['acceptJob', 'rejectJob', 'forwardJob', 'reassignJob', 'checkin', 'closeJob', 'ackJob',
  'requestExtension', 'decideExtension', 'setPriority', 'cancelJob'];

/** Adds `detail` when the caller may still view the job; otherwise the page reloads as before. */
function Api_withDetail_(req, result) {
  if (!result || typeof result !== 'object') return result;
  try {
    result.detail = Jobs_get(Api_actor_(req), result.job_id || Api_jobId_(req));
  } catch (err) {
    // e.g. a technician who just rejected the job may no longer see it
  }
  return result;
}

/** Registered, active user behind the request's ID token. */
function Api_actor_(req) {
  return Jobs_actor(Line_verifyIdToken(req.idToken).userId);
}

function Api_jobId_(req) {
  const id = String((req.data && req.data.job_id) || '').trim();
  if (!id) throw Api_error('VALIDATION', 'ไม่ได้ระบุเลขงาน');
  return id;
}

function Api_handle(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return Api_json_({ ok: false, error: { code: 'VALIDATION', message: 'Invalid JSON body' } });
  }
  const handler = req && Object.prototype.hasOwnProperty.call(API_ACTIONS, req.action) ? API_ACTIONS[req.action] : null;
  if (!handler) {
    return Api_json_({ ok: false, error: { code: 'VALIDATION', message: 'Unknown action: ' + (req && req.action) } });
  }
  if (!req.data || typeof req.data !== 'object') req.data = {};
  try {
    const data = handler(req);
    return Api_json_({ ok: true, data: API_DETAIL_ACTIONS.indexOf(req.action) !== -1 ? Api_withDetail_(req, data) : data });
  } catch (err) {
    if (API_ERROR_CODES.indexOf(err.code) !== -1) {
      return Api_json_({ ok: false, error: { code: err.code, message: err.message } });
    }
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
