// Sheet access. Columns are always resolved by header name (row 1), never by index.
// Every write is wrapped in the script lock.

const REPO_LOCK_TIMEOUT_MS = 10000;

let Repo_ss_cache_ = null;
let Repo_headers_cache_ = {};
let Repo_lock_depth_ = 0;

function Repo_ss() {
  if (!Repo_ss_cache_) {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw new Error('SHEET_ID is not set. Run Setup_init first.');
    Repo_ss_cache_ = SpreadsheetApp.openById(id);
  }
  return Repo_ss_cache_;
}

function Repo_sheet(name) {
  const sheet = Repo_ss().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab: ' + name);
  return sheet;
}

function Repo_headers(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

/** Headers of a tab, read once per execution. */
function Repo_headersOf_(name) {
  if (!Repo_headers_cache_[name]) Repo_headers_cache_[name] = Repo_headers(Repo_sheet(name));
  return Repo_headers_cache_[name];
}

function Repo_toObject_(headers, row) {
  const obj = {};
  headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
  return obj;
}

/** All data rows of a tab as objects keyed by header. */
function Repo_readAll(name) {
  const sheet = Repo_sheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = (values.shift() || []).map(String);
  Repo_headers_cache_[name] = headers;
  return values.map(function (row) { return Repo_toObject_(headers, row); });
}

/** Config tab as {key: value}. Values are returned as stored (strings from a plain-text column). */
function Repo_getConfig() {
  const config = {};
  Repo_readAll('Config').forEach(function (r) {
    if (r.key) config[String(r.key)] = r.value;
  });
  return config;
}

/**
 * First row whose `header` cell equals `value` exactly (case-sensitive).
 * Returns {rowIndex, record} or null. Uses TextFinder so only the matching row is read.
 */
function Repo_findBy(name, header, value) {
  const key = String(value === undefined || value === null ? '' : value).trim();
  if (!key) return null;
  const sheet = Repo_sheet(name);
  const headers = Repo_headersOf_(name);
  const col = headers.indexOf(header) + 1;
  if (col === 0) throw new Error('Tab ' + name + ' has no column ' + header);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const cell = sheet.getRange(2, col, lastRow - 1, 1).createTextFinder(key)
    .matchCase(true).matchEntireCell(true).findNext();
  if (!cell) return null;
  const rowIndex = cell.getRow();
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  return { rowIndex: rowIndex, record: Repo_toObject_(headers, row) };
}

/** Writes `changes` (by header) into one row; other cells keep their values. Returns the merged record. */
function Repo_update(name, rowIndex, changes) {
  return Repo_withLock(function () {
    const sheet = Repo_sheet(name);
    const headers = Repo_headersOf_(name);
    Object.keys(changes).forEach(function (k) {
      if (headers.indexOf(k) === -1) throw new Error('Tab ' + name + ' has no column ' + k);
    });
    const range = sheet.getRange(rowIndex, 1, 1, headers.length);
    const row = range.getValues()[0].map(function (v, i) {
      const h = headers[i];
      return h && Object.prototype.hasOwnProperty.call(changes, h) ? changes[h] : v;
    });
    range.setValues([row]);
    return Repo_toObject_(headers, row);
  });
}

/** Appends one row; keys of `obj` are matched to headers, unknown keys are ignored. */
function Repo_append(name, obj) {
  Repo_appendRows(name, [obj]);
}

/** Appends several rows with a single write. */
function Repo_appendRows(name, objs) {
  if (!objs || !objs.length) return;
  Repo_withLock(function () {
    const sheet = Repo_sheet(name);
    const headers = Repo_headersOf_(name);
    const rows = objs.map(function (obj) {
      return headers.map(function (h) {
        return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
      });
    });
    const start = sheet.getLastRow() + 1;
    const missing = start + rows.length - 1 - sheet.getMaxRows();
    if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
    sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
  });
}

/**
 * Runs fn holding the script lock. Re-entrant within one execution, so a use-case can hold
 * the lock around read-check-write while the Repo_* writes inside it take the lock again.
 */
function Repo_withLock(fn) {
  if (Repo_lock_depth_ > 0) {
    Repo_lock_depth_++;
    try {
      return fn();
    } finally {
      Repo_lock_depth_--;
    }
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(REPO_LOCK_TIMEOUT_MS)) {
    throw Status_error('CONFLICT', 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง');
  }
  Repo_lock_depth_ = 1;
  try {
    return fn();
  } finally {
    Repo_lock_depth_ = 0;
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// --- Jobs -----------------------------------------------------------------------

/** {rowIndex, job} or null. */
function Repo_findJob(jobId) {
  const found = Repo_findBy('Jobs', 'job_id', jobId);
  return found ? { rowIndex: found.rowIndex, job: found.record } : null;
}

/**
 * Allocates the next MT-YYMM-NNNN id (PLAN §4). The month's counter lives in Script
 * Properties (JOB_SEQ_YYMM) and is incremented under the script lock.
 */
function Repo_nextJobId(prefix, now) {
  return Repo_withLock(function () {
    const props = PropertiesService.getScriptProperties();
    const next = JobId_next(prefix, now, props.getProperty(JobId_counterKey(JobId_yymm(now))));
    props.setProperty(next.key, String(next.seq));
    return next.id;
  });
}

/** Appends one JobLog row from a Status_transition log entry. */
function Repo_appendJobLog(jobId, actor, log, now) {
  Repo_append('JobLog', {
    log_id: Utilities.getUuid(),
    job_id: jobId,
    at: now,
    actor_id: actor.userId,
    actor_name: actor.name || '',
    action: log.action,
    from_status: log.from_status,
    to_status: log.to_status,
    reason: log.reason || '',
    old_value: log.old_value || '',
    new_value: log.new_value || '',
  });
}

// --- Users ----------------------------------------------------------------------

/** {rowIndex, user} or null. */
function Repo_findUser(userId) {
  const found = Repo_findBy('Users', 'line_user_id', userId);
  return found ? { rowIndex: found.rowIndex, user: found.record } : null;
}
