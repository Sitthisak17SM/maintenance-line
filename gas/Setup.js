// One-time setup (PLAN §4). Safe to re-run: existing spreadsheet, tabs, headers,
// rows and folder are kept; only what is missing gets created.

// The environment comes from the Apps Script project name: "Maintenance LINE (prod)" sets up
// the real sheet (ENV=prod), anything else the test one (PLAN §16).
const SETUP_NAME_PREFIX = 'Maintenance LINE';

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

// Columns that must stay text: IDs, phones (leading zeros), config values, and every free-text
// column users type into, so "1/2" stays "1/2" instead of a date and "=..." is never a formula.
// Re-running Setup_init applies new entries to an existing sheet.
const SETUP_TEXT_COLUMNS = {
  Jobs: [
    'job_id', 'area', 'title', 'detail', 'reporter_id', 'reporter_name', 'reporter_phone', 'photos_before',
    'candidate_ids', 'assignee_id', 'assignee_name', 'vendor', 'ext_reason', 'cause', 'fix', 'photos_after',
    'onsite_note', 'ack_by', 'alert_flags', 'related_job_id',
  ],
  JobLog: ['log_id', 'job_id', 'actor_id', 'actor_name', 'reason', 'old_value', 'new_value'],
  Parts: ['job_id', 'item', 'vendor', 'note'],
  Users: ['line_user_id', 'display_name', 'real_name', 'phone', 'note'],
  Areas: ['area_name'],
  Vendors: ['vendor_id', 'name', 'contact', 'note'],
  Config: ['value'],
  WebhookLog: ['user_id', 'webhook_event_id', 'payload'],
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
    ['FLEX_SHOW_PHOTO', 'TRUE', 'แสดงรูปแรกบนการ์ด job_new (ไม่มีแถวนี้ = TRUE)'],
  ],
};

function Setup_init() {
  const props = PropertiesService.getScriptProperties();
  const env = Setup_env_();
  const ss = Setup_spreadsheet_(props, env);
  const created = [];
  Object.keys(SETUP_TABS).forEach(function (name) {
    if (Setup_ensureTab_(ss, name, env)) created.push(name);
  });
  Setup_userDropdowns_(ss);
  const folder = Setup_driveFolder_(props, env);
  console.log('Setup_init done (ENV=%s). Sheet: %s | Folder: %s | New tabs: %s',
    env, ss.getUrl(), folder.getUrl(), created.length ? created.join(', ') : '(none)');
}

/** 'prod' when this Apps Script project's name contains "(prod)", otherwise 'test'. */
function Setup_env_() {
  const name = DriveApp.getFileById(ScriptApp.getScriptId()).getName();
  return /\(prod\)/i.test(name) ? 'prod' : 'test';
}

function Setup_spreadsheet_(props, env) {
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // Never silently create a second sheet while a SHEET_ID is configured.
      throw new Error('SHEET_ID is set but cannot be opened (' + err.message + '). Fix or delete SHEET_ID, then re-run.');
    }
  }
  const ss = SpreadsheetApp.create(SETUP_NAME_PREFIX + ' (' + env + ')');
  ss.setSpreadsheetTimeZone('Asia/Bangkok');
  ss.getSheets()[0].setName('Jobs'); // reuse the default blank sheet
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

/** Creates the tab with headers and seed rows if missing. Returns true when the tab was created. */
function Setup_ensureTab_(ss, name, env) {
  const headers = SETUP_TABS[name];
  let sheet = ss.getSheetByName(name);
  const isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(name);

  // Seed rows only go into a tab whose headers are written right here, so their column order
  // is ours and a tab an Admin emptied on purpose stays empty on a re-run.
  const fresh = sheet.getLastRow() === 0;
  if (fresh) {
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

  // Config ENV follows the project (only written into a brand-new Config tab).
  const seed = name === 'Config' ? SETUP_SEED.Config.map(function (r) { return r[0] === 'ENV' ? [r[0], env, r[2]] : r; }) : SETUP_SEED[name];
  if (seed && fresh) {
    Repo_withLock(function () { sheet.getRange(2, 1, seed.length, seed[0].length).setValues(seed); });
  }
  return isNew;
}

/**
 * Users.role and Users.branch_code become dropdowns, so the Admin picks a role instead of typing
 * it (a typo would silently make the user a nobody). Runs after every tab exists (Branches is
 * created after Users). Blank stays allowed: TECH and ADMIN often have no branch.
 */
function Setup_userDropdowns_(ss) {
  const users = ss.getSheetByName('Users');
  const branches = ss.getSheetByName('Branches');
  const headers = Repo_headers(users);
  const rows = users.getMaxRows() - 1;
  const roleCol = headers.indexOf('role') + 1;
  const branchCol = headers.indexOf('branch_code') + 1;
  if (roleCol > 0) {
    users.getRange(2, roleCol, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_ROLES, true).setAllowInvalid(false)
      .setHelpText('STAFF = พนักงาน, MANAGER = ผู้จัดการร้าน, TECH = ช่าง, ADMIN = ผู้ดูแล, VIEWER = ผู้บริหาร (ดูอย่างเดียว)').build());
  }
  if (branchCol > 0 && branches) {
    users.getRange(2, branchCol, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(branches.getRange('A2:A'), true).setAllowInvalid(false)
      .setHelpText('รหัสร้านจากแท็บ Branches (ช่างหรือ Admin เว้นว่างได้)').build());
  }
}

function Setup_driveFolder_(props, env) {
  const id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      throw new Error('DRIVE_FOLDER_ID is set but cannot be opened (' + err.message + '). Fix or delete it, then re-run.');
    }
  }
  const folder = DriveApp.createFolder(SETUP_NAME_PREFIX + ' (' + env + ') photos');
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Run from the editor to diagnose the webhook: which Script Properties are set (never their
 * values), whether the LINE token works, and the last webhook steps recorded by Webhook_trace_.
 */
function Setup_check() {
  const props = PropertiesService.getScriptProperties();
  ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_LOGIN_CHANNEL_ID', 'LIFF_ID', 'WEBHOOK_KEY', 'WEB_BASE_URL', 'SHEET_ID', 'DRIVE_FOLDER_ID']
    .forEach(function (key) {
      const value = props.getProperty(key);
      console.log('%s: %s', key, value ? 'set (' + value.length + ' chars)' : 'MISSING');
    });
  const others = props.getKeys().filter(function (k) { return !/^JOB_SEQ_/.test(k) && !Object.prototype.hasOwnProperty.call(SETUP_KNOWN_PROPS, k); });
  if (others.length) console.warn('Unexpected property names (typo?): %s', others.join(', '));

  const token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (token) {
    const res = UrlFetchApp.fetch(LINE_API_BASE + '/v2/bot/info', {
      headers: { Authorization: 'Bearer ' + token.trim() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      const info = JSON.parse(res.getContentText());
      console.log('LINE token OK: bot %s (%s)', info.displayName, info.basicId);
    } else {
      console.error('LINE token rejected: HTTP %s %s', res.getResponseCode(), res.getContentText());
    }
  }

  const trace = JSON.parse(CacheService.getScriptCache().get('diag_webhook') || '[]');
  console.log('Last webhook steps:\n%s', trace.length ? trace.join('\n') : '(none recorded since the last deploy)');
}

const SETUP_KNOWN_PROPS = {
  LINE_CHANNEL_ACCESS_TOKEN: 1, LINE_LOGIN_CHANNEL_ID: 1, LIFF_ID: 1, WEBHOOK_KEY: 1,
  WEB_BASE_URL: 1, SHEET_ID: 1, DRIVE_FOLDER_ID: 1,
};

// Values-only copy of the legacy "Maintenance List" (the 7 shop tabs), made on 1 Nov 2026 so the
// original file is never touched. Not a secret: the file is private to its owner.
const SETUP_LEGACY_SHEET_ID = '10NMXQlpB5M4y2_6myVNZikRERMHtVfhtQmkNdSAofKo';

/** Editor entry points (the editor cannot pass arguments). Dry run first, then the real run. */
function Setup_migrateLegacyDryRun() {
  return Setup_migrateLegacy(SETUP_LEGACY_SHEET_ID, { dryRun: true });
}

function Setup_migrateLegacyRun() {
  return Setup_migrateLegacy(SETUP_LEGACY_SHEET_ID);
}

/**
 * Copies legacy jobs into Jobs (PLAN §14): no notifications, no JobLog, source = MIGRATED,
 * job_id LG-{BRANCH}-{NNN}. Safe to re-run: rows whose branch + title + date already exist are skipped.
 * opts.dryRun: only log what would be added.
 */
function Setup_migrateLegacy(sourceSheetId, opts) {
  opts = opts || {};
  if (!sourceSheetId) throw new Error('Setup_migrateLegacy: sourceSheetId is required');
  const src = SpreadsheetApp.openById(sourceSheetId);
  const now = new Date();

  const existing = Repo_readAll('Jobs').filter(function (j) { return String(j.source) === 'MIGRATED'; });
  const keys = {};
  const lastNo = {};
  existing.forEach(function (j) {
    keys[Migrate_key(j)] = true;
    const m = /^LG-([A-Z]+)-(\d+)$/.exec(String(j.job_id));
    if (m) lastNo[m[1]] = Math.max(lastNo[m[1]] || 0, Number(m[2]));
  });

  const rows = [];
  const report = [];
  let skipped = 0;
  Object.keys(MIGRATE_TABS).forEach(function (tab) {
    const sheet = src.getSheetByName(tab);
    if (!sheet) {
      report.push(tab + ': tab not found');
      return;
    }
    const values = sheet.getDataRange().getValues();
    const headers = (values[MIGRATE_HEADER_ROW - 1] || []).map(function (h) { return String(h).trim(); });
    const branch = MIGRATE_TABS[tab];
    let added = 0;
    for (let i = MIGRATE_HEADER_ROW; i < values.length; i++) {
      const row = {};
      headers.forEach(function (h, c) { if (h) row[h] = values[i][c]; });
      const m = Migrate_row(tab, row);
      if (!m) continue;
      m.warnings.forEach(function (w) { report.push(tab + ' row ' + (i + 1) + ': ' + w); });
      const key = Migrate_key(m.job);
      if (keys[key]) {
        skipped++;
        continue;
      }
      keys[key] = true;
      lastNo[branch] = (lastNo[branch] || 0) + 1;
      rows.push(Object.assign(m.job, { job_id: Migrate_jobId(branch, lastNo[branch]), updated_at: now }));
      added++;
    }
    report.push(tab + ' -> ' + branch + ': ' + added + ' new');
  });

  if (!opts.dryRun && rows.length) Repo_appendRows('Jobs', rows);
  console.log('%s: %s new, %s already migrated (skipped)\n%s',
    opts.dryRun ? 'Dry run (nothing written)' : 'Migrated', rows.length, skipped, report.join('\n'));
  return { added: rows.length, skipped: skipped };
}
