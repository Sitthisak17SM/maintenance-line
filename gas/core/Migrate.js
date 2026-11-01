// Legacy "Maintenance List" -> Jobs rows (PLAN §14). Pure logic: no Google services.
// Setup_migrateLegacy reads the source sheet and writes the rows this returns.

const MIGRATE_TABS = {
  PPP: 'PPP', Tichuca: 'TICHUCA', Santuary: 'SANCTUARY', Tahona: 'TAHONA',
  Gir: 'GIR', Scofflaws: 'SCOFFLAWS', Lloyds: 'LLOYDS',
};
const MIGRATE_HEADER_ROW = 2; // row 1 is the shop name
const MIGRATE_CATEGORY = {
  'ระบบไฟ': 'ELEC',
  'ระบบท่อ': 'WATER', 'ระบบน้ำ': 'WATER',
  'แอร์': 'AC', 'ระบบแอร์': 'AC',
  'เฟอร์นิเจอร์': 'STRUCT', 'งานไม้โครงสร้าง': 'STRUCT', 'โครงสร้าง': 'STRUCT', 'พื้น': 'STRUCT',
  'อื่นๆ': 'MISC',
};
const MIGRATE_STATUS = { 'done': 'CLOSED', 'on process': 'IN_PROGRESS' };
// Contractors named in the Technician column go to `vendor` (matched inside the text,
// e.g. "ช่างเซอร์วิส\n66 kitchen"), using the Vendors tab spelling.
const MIGRATE_VENDORS = ['Daikin', '66 Kitchen', 'VJ Group'];
const MIGRATE_TITLE_MAX = 80;
const MIGRATE_EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MIGRATE_TZ_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok

/**
 * One legacy row -> a Jobs record (without job_id), or null for an empty row.
 * row: {Date, Details, Technician, Type, Priority, Process, Note} as read from the sheet;
 * Date may be a Date, an Excel serial number or a date string.
 * Returns {job, warnings[]}; warnings name values that fell back to a default.
 */
function Migrate_row(tabName, row) {
  const branch = MIGRATE_TABS[tabName];
  if (!branch) throw new Error('Migrate_row: unknown tab ' + tabName);
  const text = function (k) { return String(row[k] === undefined || row[k] === null ? '' : row[k]).trim(); };
  const details = text('Details');
  if (![details, text('Technician'), text('Type'), text('Priority'), text('Process'), text('Note')].some(Boolean) &&
      !Migrate_date(row.Date)) {
    return null;
  }
  const warnings = [];

  const type = text('Type');
  let category = MIGRATE_CATEGORY[type] || 'MISC';
  if (type && !MIGRATE_CATEGORY[type]) warnings.push('Type "' + type + '" -> MISC');

  const pr = text('Priority').toUpperCase();
  const priority = ['EMERGENCY', 'URGENT', 'NORMAL', 'PREVENTIVE'].indexOf(pr) !== -1 ? pr : 'NORMAL';
  if (pr && priority !== pr) warnings.push('Priority "' + text('Priority') + '" -> NORMAL');

  const proc = text('Process').toLowerCase();
  const status = MIGRATE_STATUS[proc] || 'NEW';
  if (proc && !MIGRATE_STATUS[proc]) warnings.push('Process "' + text('Process') + '" -> NEW');

  const tech = text('Technician');
  const vendor = MIGRATE_VENDORS.find(function (v) { return tech.toLowerCase().indexOf(v.toLowerCase()) !== -1; }) || '';

  const note = text('Note');
  const title = (details.split(/\r?\n/).map(function (s) { return s.trim(); }).find(Boolean) || '(ไม่มีรายละเอียด)')
    .slice(0, MIGRATE_TITLE_MAX);

  return {
    warnings: warnings,
    job: {
      created_at: Migrate_date(row.Date) || '',
      branch_code: branch,
      area: '',
      category_code: category,
      title: title,
      detail: details + (note ? '\nหมายเหตุเดิม: ' + note : ''),
      priority_reported: priority,
      priority: priority,
      reporter_id: '', reporter_name: '', reporter_phone: '',
      photos_before: '', route_to: '', candidate_ids: '', assignee_id: '',
      assignee_name: vendor ? '' : tech.replace(/\s*\n\s*/g, ' '),
      vendor: vendor,
      status: status,
      // No due dates: SLA alerts and on-time KPIs skip migrated jobs (PLAN §14).
      response_due_at: '', due_at: '',
      ext_pending: false, reject_count: 0, ext_count: 0, cost_total: 0,
      alert_flags: '', is_repeat: false, related_job_id: '',
      source: 'MIGRATED',
    },
  };
}

/** Re-run key (PLAN §14): branch + title + created date (yyyy-MM-dd in Bangkok, '' if none). */
function Migrate_key(job) {
  const d = Migrate_date(job.created_at);
  const day = d ? new Date(d.getTime() + MIGRATE_TZ_OFFSET_MS).toISOString().slice(0, 10) : '';
  return [String(job.branch_code || ''), String(job.title || '').trim(), day].join('|');
}

/** Date from a Date, an Excel serial day number (Bangkok midnight) or a date string; null if blank/invalid. */
function Migrate_date(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const n = Number(value);
  if (typeof value === 'number' || (/^\d+(\.\d+)?$/.test(String(value).trim()) && n > 20000 && n < 80000)) {
    return new Date(MIGRATE_EXCEL_EPOCH_MS + Math.round(n * 86400000) - MIGRATE_TZ_OFFSET_MS);
  }
  const d = new Date(String(value).trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Legacy job ids: LG-{BRANCH}-{NNN}, numbered per branch in source order. */
function Migrate_jobId(branchCode, n) {
  return 'LG-' + branchCode + '-' + String(n).padStart(3, '0');
}

if (typeof module !== 'undefined') {
  module.exports = { MIGRATE_TABS, MIGRATE_HEADER_ROW, Migrate_row, Migrate_key, Migrate_date, Migrate_jobId };
}
