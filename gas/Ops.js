// Ops Hub heartbeat: sends a status summary of this system to the personal Ops Hub dashboard.
//
// Script Properties (set separately in prod and test):
//   OPS_HUB_URL    URL of the Ops Hub "ingest" deployment (…/exec)
//   OPS_TOKEN      token of this system's row in the Ops Hub Systems tab
//   OPS_SYSTEM_ID  maintenance-prod or maintenance-test
// If any of them is missing nothing is sent and the system works as before.
//
// Called from:
//   Triggers.js  Sla_tick  -> after a successful pass: Ops_heartbeat_('sla_tick')
//                          -> in its catch:            Ops_error_('sla_tick', e)
//   editor       Ops_test  -> run by hand to test the connection
//
// Rule: nothing in this file may throw. A broken monitor must never break the main system.
// Only summary numbers are sent: no names, user IDs, phone numbers or photos.

const OPS_REQUIRED_PROPS = [
  'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_LOGIN_CHANNEL_ID', 'LIFF_ID',
  'WEBHOOK_KEY', 'WEB_BASE_URL', 'SHEET_ID', 'DRIVE_FOLDER_ID'
];

/** Statuses not counted as open work (PLAN §3): DONE = closed by the technician, waiting for ack. */
const OPS_DONE_STATUSES = ['DONE', 'CLOSED', 'CANCELLED'];

const OPS_QUOTA_WARN_PCT = 80;
const OPS_QUOTA_ERROR_PCT = 95;

/** Regular heartbeat (end of Sla_tick). */
function Ops_heartbeat_(event, log) {
  try {
    const checks = [];
    Ops_try_(checks, 'Script Properties', Ops_checkProps_);
    Ops_try_(checks, 'งานค้าง (ยังไม่จบ)', Ops_checkOpenJobs_);
    Ops_try_(checks, 'JobLog 24 ชม.', Ops_checkJobLog_);
    Ops_try_(checks, 'โควตา LINE push เดือนนี้', Ops_checkLineQuota_);
    Ops_send_({ event: event || 'heartbeat', log: !!log, checks: checks });
  } catch (e) {
    console.warn('Ops_heartbeat_', e);
  }
}

/** Reports an error (call inside a catch). Never rethrows; the caller keeps its own throw. */
function Ops_error_(where, err) {
  try {
    const msg = String(err && err.message || err);
    Ops_send_({
      status: 'error', event: String(where || 'error'), log: true,
      message: String(where) + ': ' + msg.slice(0, 400),
      checks: [{ name: 'ข้อผิดพลาดล่าสุด', value: msg.slice(0, 180), status: 'error' }]
    });
  } catch (e) {
    console.warn('Ops_error_', e);
  }
}

/** Run from the editor. */
function Ops_test() {
  const r = Ops_send_({ event: 'manual_test', log: true, message: 'ทดสอบจาก editor', checks: [] }, true);
  Logger.log(r);
  Ops_heartbeat_('manual_test', true);
}

/* ── checks ── */

function Ops_checkProps_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const missing = OPS_REQUIRED_PROPS.filter(function (k) { return !props[k]; });
  return missing.length
    ? { value: 'ขาด ' + missing.length + ' ค่า', status: 'error', detail: missing.join(', ') }
    : { value: 'ครบ ' + OPS_REQUIRED_PROPS.length + ' ค่า', status: 'ok' };
}

/** Open jobs per status, from the Jobs `status` column (PLAN §4). */
function Ops_checkOpenJobs_() {
  const byStatus = {};
  let open = 0;
  Repo_readAll('Jobs').forEach(function (job) {
    if (!job.job_id) return;
    const s = String(job.status || '').trim().toUpperCase();
    if (!s || OPS_DONE_STATUSES.indexOf(s) >= 0) return;
    open++;
    byStatus[s] = (byStatus[s] || 0) + 1;
  });
  const detail = Object.keys(byStatus).sort().map(function (k) { return k + ' ' + byStatus[k]; }).join(' · ');
  return { value: open + ' งาน', status: 'ok', detail: detail };
}

/** JobLog rows in the last 24 hours, from the `at` column (PLAN §4). */
function Ops_checkJobLog_() {
  const since = Date.now() - 24 * 3600 * 1000;
  let n = 0;
  Repo_readAll('JobLog').forEach(function (row) {
    const t = row.at instanceof Date ? row.at.getTime() : new Date(row.at).getTime();
    if (t >= since) n++;
  });
  return { value: n + ' รายการ', status: 'ok' };
}

/** Straight from the LINE API (the same number as in OA Manager). Cached for 1 hour. */
function Ops_checkLineQuota_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ops:line_quota');
  if (hit) return JSON.parse(hit);

  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return { value: 'ไม่มี token', status: 'warn' };
  const opt = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  const q = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota', opt);
  const u = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota/consumption', opt);
  if (q.getResponseCode() !== 200 || u.getResponseCode() !== 200) {
    return { value: 'อ่านไม่ได้ (HTTP ' + q.getResponseCode() + '/' + u.getResponseCode() + ')', status: 'warn' };
  }
  const quota = JSON.parse(q.getContentText());
  const used = Number(JSON.parse(u.getContentText()).totalUsage) || 0;
  let res;
  if (quota.type !== 'limited') {
    res = { value: used + ' (ไม่จำกัด)', status: 'ok' };
  } else {
    const limit = Number(quota.value) || 0;
    const pct = limit ? Math.round(used * 100 / limit) : 0;
    res = {
      value: used + ' / ' + limit + ' (' + pct + '%)',
      status: pct >= OPS_QUOTA_ERROR_PCT ? 'error' : pct >= OPS_QUOTA_WARN_PCT ? 'warn' : 'ok',
      detail: 'reply ไม่นับโควตา · ปิดการ์ดแจ้งผู้แจ้งในแท็บ Config เพื่อประหยัด'
    };
  }
  cache.put('ops:line_quota', JSON.stringify(res), 3600);
  return res;
}

/* ── plumbing ── */

function Ops_send_(payload, returnResponse) {
  try {
    const p = PropertiesService.getScriptProperties();
    const url = p.getProperty('OPS_HUB_URL');
    const token = p.getProperty('OPS_TOKEN');
    const id = p.getProperty('OPS_SYSTEM_ID');
    if (!url || !token || !id) return 'OPS_* ยังไม่ได้ตั้ง — ข้าม';
    payload.system = id;
    payload.token = token;
    payload.source = 'app';
    payload.at = new Date().toISOString();
    if (!payload.version) payload.version = p.getProperty('APP_VERSION') || '';
    const r = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: true
    });
    return returnResponse ? r.getResponseCode() + ' ' + r.getContentText() : true;
  } catch (e) {
    console.warn('Ops_send_', e);
    return 'ส่งไม่สำเร็จ: ' + e;
  }
}

function Ops_try_(checks, name, fn) {
  try {
    const r = fn();
    r.name = name;
    checks.push(r);
  } catch (e) {
    checks.push({ name: name, value: 'ตรวจไม่ได้', status: 'warn', detail: String(e && e.message || e).slice(0, 200) });
  }
}
