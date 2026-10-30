// One-time setup (PLAN §4). Safe to re-run: existing spreadsheet, tabs, headers,
// rows and folder are kept; only what is missing gets created.

const SETUP_SPREADSHEET_NAME = 'Maintenance LINE (test)';
const SETUP_DRIVE_FOLDER_NAME = 'Maintenance LINE (test) photos';

const SETUP_TABS = {
  Jobs: [
    'job_id', 'created_at', 'branch_code', 'area', 'category_code', 'title', 'detail',
    'priority_reported', 'priority', 'reporter_id', 'reporter_name', 'reporter_phone',
    'photos_before', 'route_to', 'candidate_ids', 'assignee_id', 'assignee_name', 'vendor',
    'status', 'assigned_at', 'accepted_at', 'checkin_at', 'done_at', 'closed_at',
    'response_due_at', 'due_at', 'ext_pending', 'ext_requested_due_at', 'ext_reason',
    'reject_count', 'ext_count', 'cause', 'fix', 'cost_total', 'photos_after', 'onsite_note',
    'ack_by', 'ack_at', 'alert_flags', 'is_repeat', 'related_job_id', 'source', 'updated_at',
  ],
  JobLog: ['log_id', 'job_id', 'at', 'actor_id', 'actor_name', 'action', 'from_status', 'to_status', 'reason', 'old_value', 'new_value'],
  Parts: ['job_id', 'line_no', 'item', 'qty', 'unit_price', 'amount', 'vendor', 'note'],
  Users: ['line_user_id', 'display_name', 'real_name', 'phone', 'role', 'branch_code', 'active', 'registered_at', 'note'],
  Branches: ['branch_code', 'name', 'active', 'sort'],
  Areas: ['branch_code', 'area_name', 'sort', 'active'],
  Categories: ['category_code', 'name_th', 'route_to', 'assignee_user_id', 'sort', 'active'],
  SLA: ['priority', 'label_th', 'response_hours', 'resolve_hours', 'sort'],
  Vendors: ['vendor_id', 'type', 'name', 'contact', 'branch_code', 'note', 'active'],
  Config: ['key', 'value', 'note'],
  WebhookLog: ['at', 'event_type', 'user_id', 'webhook_event_id', 'payload'],
  Budget: ['branch_code', 'month', 'budget_thb'],
  PM_Plan: ['pm_id', 'branch_code', 'asset', 'category_code', 'every_months', 'next_due', 'assignee_user_id', 'note'],
};

// Columns that must stay text (leading zeros, IDs, config values).
const SETUP_TEXT_COLUMNS = {
  Jobs: ['job_id', 'reporter_phone', 'related_job_id'],
  Users: ['line_user_id', 'phone'],
  Vendors: ['vendor_id', 'contact'],
  Config: ['value'],
  Budget: ['month'],
};

const SETUP_SEED = {
  Branches: [
    ['PPP', 'PPP', true, 1],
    ['TICHUCA', 'Tichuca', true, 2],
    ['SANCTUARY', 'Sanctuary', true, 3],
    ['TAHONA', 'Tahona', true, 4],
    ['GIR', 'GIR', true, 5],
    ['SCOFFLAWS', 'Scofflaws', true, 6],
    ['LLOYDS', "Lloyd's", true, 7],
  ],
  Areas: [
    'บาร์', 'ครัว', 'ห้องน้ำชาย', 'ห้องน้ำหญิง', 'ทางเข้า / หน้าร้าน', 'โซนลูกค้า',
    'Outdoor', 'ห้องเก็บของ / สโตร์', 'ห้องเครื่องเสียง / ดีเจ', 'อื่นๆ',
  ].map(function (name, i) { return ['*', name, i + 1, true]; }),
  Categories: [
    ['ELEC', 'ระบบไฟฟ้า / หลอดไฟ', 'TECH', '', 1, true],
    ['WATER', 'ระบบน้ำ / ประปา / สุขภัณฑ์', 'TECH', '', 2, true],
    ['AC', 'เครื่องปรับอากาศ', 'ADMIN', '', 3, true],
    ['KITCHEN', 'เครื่องมือประกอบอาหาร / เครื่องจักร / เครื่องใช้ไฟฟ้า', 'ADMIN', '', 4, true],
    ['STRUCT', 'โครงสร้างร้าน / ป้าย / งานเฟอร์นิเจอร์', 'TECH', '', 5, true],
    ['IT', 'ระบบ IT / POS / กล้องวงจรปิด', 'ADMIN', '', 6, true],
    ['MISC', 'จิปาถะ อื่นๆ', 'ADMIN', '', 7, true],
  ],
  SLA: [
    ['EMERGENCY', 'Emergency (ภายใน 2–4 ชม.)', 4, 24, 1],
    ['URGENT', 'Urgent (ภายใน 24 ชม.)', 24, 72, 2],
    ['NORMAL', 'Normal (ภายใน 2–3 วัน)', 72, 168, 3],
    ['PREVENTIVE', 'Preventive (ภายใน 7–30 วัน)', 720, 720, 4],
  ],
  // Contractors seen in the job history. Rows from the legacy `supplier` tab are added later.
  Vendors: [
    ['V001', '', 'Daikin', '', '', '', true],
    ['V002', '', '66 Kitchen', '', '', '', true],
    ['V003', '', 'VJ Group', '', '', '', true],
  ],
  Config: [
    ['ENV', 'test', 'test หรือ prod'],
    ['JOB_ID_PREFIX', 'MT', ''],
    ['AUTO_ACK_HOURS', '0', '0 = ไม่ปิดงานอัตโนมัติ'],
    ['NOTIFY_REPORTER_ON_ACCEPT', 'FALSE', 'push แจ้งผู้แจ้งตอนช่างรับงาน'],
    ['REMIND_AT_PERCENT', '75', 'เตือนเมื่อใช้เวลาไปถึงกี่ %'],
    ['PHOTO_MAX_COUNT', '4', 'ต่อการส่ง 1 ครั้ง'],
    ['PHOTO_MAX_EDGE_PX', '1280', 'ย่อด้านยาวก่อนอัปโหลด'],
    ['VIDEO_MAX_MB', '0', '0 = ยังไม่รับวิดีโอ (เปิดในเฟส 2 หลังทดสอบ)'],
  ],
};

function Setup_init() {
  const props = PropertiesService.getScriptProperties();
  const ss = Setup_spreadsheet_(props);
  const created = [];
  Object.keys(SETUP_TABS).forEach(function (name) {
    if (Setup_ensureTab_(ss, name)) created.push(name);
  });
  const folder = Setup_driveFolder_(props);
  console.log('Setup_init done. Sheet: %s | Folder: %s | New tabs: %s',
    ss.getUrl(), folder.getUrl(), created.length ? created.join(', ') : '(none)');
}

function Setup_spreadsheet_(props) {
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // Never silently create a second sheet while a SHEET_ID is configured.
      throw new Error('SHEET_ID is set but cannot be opened (' + err.message + '). Fix or delete SHEET_ID, then re-run.');
    }
  }
  const ss = SpreadsheetApp.create(SETUP_SPREADSHEET_NAME);
  ss.setSpreadsheetTimeZone('Asia/Bangkok');
  ss.getSheets()[0].setName('Jobs'); // reuse the default blank sheet
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

/** Creates the tab with headers and seed rows if missing. Returns true when the tab was created. */
function Setup_ensureTab_(ss, name) {
  const headers = SETUP_TABS[name];
  let sheet = ss.getSheetByName(name);
  const isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    const existing = Repo_headers(sheet);
    const missing = headers.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) console.warn('Tab %s is missing columns (not changed): %s', name, missing.join(', '));
  }

  (SETUP_TEXT_COLUMNS[name] || []).forEach(function (h) {
    const col = Repo_headers(sheet).indexOf(h) + 1;
    if (col > 0) sheet.getRange(1, col, sheet.getMaxRows(), 1).setNumberFormat('@');
  });

  const seed = SETUP_SEED[name];
  if (seed && sheet.getLastRow() <= 1) {
    sheet.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
  }
  return isNew;
}

function Setup_driveFolder_(props) {
  const id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      throw new Error('DRIVE_FOLDER_ID is set but cannot be opened (' + err.message + '). Fix or delete it, then re-run.');
    }
  }
  const folder = DriveApp.createFolder(SETUP_DRIVE_FOLDER_NAME);
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

/** Phase 2 (PLAN §14). */
function Setup_migrateLegacy(sourceSheetId) {
  throw new Error('Setup_migrateLegacy: not implemented (phase 2)');
}
