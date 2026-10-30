// Sheet access. Columns are always resolved by header name (row 1), never by index.
// Every write is wrapped in the script lock.

const REPO_LOCK_TIMEOUT_MS = 10000;

let Repo_ss_cache_ = null;

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

/** All data rows of a tab as objects keyed by header. */
function Repo_readAll(name) {
  const sheet = Repo_sheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = (values.shift() || []).map(String);
  return values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}

/** Config tab as {key: value}. Values are returned as stored (strings from a plain-text column). */
function Repo_getConfig() {
  const config = {};
  Repo_readAll('Config').forEach(function (r) {
    if (r.key) config[String(r.key)] = r.value;
  });
  return config;
}

/** Appends one row; keys of `obj` are matched to headers, unknown keys are ignored. */
function Repo_append(name, obj) {
  return Repo_withLock(function () {
    const sheet = Repo_sheet(name);
    const row = Repo_headers(sheet).map(function (h) {
      return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
    });
    sheet.appendRow(row);
  });
}

function Repo_withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(REPO_LOCK_TIMEOUT_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
