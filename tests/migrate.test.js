const test = require('node:test');
const assert = require('node:assert/strict');
const { Migrate_row, Migrate_key, Migrate_date, Migrate_jobId } = require('../gas/core/Migrate.js');

const ROW = {
  Date: 46249, Details: 'ไฟทางลงชั้น 46 ไป 45 ดับ\nเปลี่ยนหลอด 2 ดวง', Technician: "P'Nut",
  Type: 'ระบบไฟ', Priority: 'Urgent', Process: 'Done', Note: 'ช่างเข้าซ่อม 25/06',
};

test('Migrate_row maps a legacy row per PLAN §14', () => {
  const { job, warnings } = Migrate_row('Tichuca', ROW);
  assert.deepEqual(warnings, []);
  assert.equal(job.branch_code, 'TICHUCA');
  assert.equal(job.category_code, 'ELEC');
  assert.equal(job.priority, 'URGENT');
  assert.equal(job.priority_reported, 'URGENT');
  assert.equal(job.status, 'CLOSED');
  assert.equal(job.title, 'ไฟทางลงชั้น 46 ไป 45 ดับ');
  assert.equal(job.detail, 'ไฟทางลงชั้น 46 ไป 45 ดับ\nเปลี่ยนหลอด 2 ดวง\nหมายเหตุเดิม: ช่างเข้าซ่อม 25/06');
  assert.equal(job.assignee_name, "P'Nut");
  assert.equal(job.vendor, '');
  assert.equal(job.source, 'MIGRATED');
  assert.equal(job.response_due_at, '');
  assert.equal(job.due_at, '');
});

test('Migrate_row: tab names map to branch codes', () => {
  const expected = { PPP: 'PPP', Tichuca: 'TICHUCA', Santuary: 'SANCTUARY', Tahona: 'TAHONA', Gir: 'GIR', Scofflaws: 'SCOFFLAWS', Lloyds: 'LLOYDS' };
  for (const [tab, code] of Object.entries(expected)) assert.equal(Migrate_row(tab, ROW).job.branch_code, code);
  assert.throws(() => Migrate_row('supplier', ROW));
});

test('Migrate_row: category table', () => {
  const cases = {
    'ระบบไฟ': 'ELEC', 'ระบบท่อ': 'WATER', 'ระบบน้ำ': 'WATER', 'แอร์': 'AC', 'ระบบแอร์': 'AC',
    'เฟอร์นิเจอร์': 'STRUCT', 'งานไม้โครงสร้าง': 'STRUCT', 'โครงสร้าง': 'STRUCT', 'พื้น': 'STRUCT',
    'อื่นๆ': 'MISC', '': 'MISC',
  };
  for (const [type, code] of Object.entries(cases)) assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Type: type })).job.category_code, code, type);
  const odd = Migrate_row('PPP', Object.assign({}, ROW, { Type: 'ลิฟต์' }));
  assert.equal(odd.job.category_code, 'MISC');
  assert.equal(odd.warnings.length, 1);
});

test('Migrate_row: priority and status defaults', () => {
  assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Priority: '' })).job.priority, 'NORMAL');
  assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Priority: 'Emergency' })).job.priority, 'EMERGENCY');
  assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Process: 'On process' })).job.status, 'IN_PROGRESS');
  assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Process: '' })).job.status, 'NEW');
});

test('Migrate_row: contractors in Technician go to vendor', () => {
  for (const [tech, vendor] of [['Daikin', 'Daikin'], ['ช่างเซอร์วิส\n66 kitchen', '66 Kitchen'], ['ช่างเซอร์วิส\nVJ Group', 'VJ Group']]) {
    const { job } = Migrate_row('PPP', Object.assign({}, ROW, { Technician: tech }));
    assert.equal(job.vendor, vendor);
    assert.equal(job.assignee_name, '');
  }
  assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Technician: 'ช่างเครื่อง\nซักผ้า' })).job.assignee_name, 'ช่างเครื่อง ซักผ้า');
});

test('Migrate_row: title is the first non-empty line, max 80 chars; no note -> no suffix', () => {
  const long = 'ก'.repeat(100);
  const { job } = Migrate_row('PPP', Object.assign({}, ROW, { Details: '\n  ' + long + '\nบรรทัดสอง', Note: '' }));
  assert.equal(job.title.length, 80);
  assert.ok(!job.detail.includes('หมายเหตุเดิม'));
});

test('Migrate_row: empty rows are skipped, blank date is kept blank', () => {
  assert.equal(Migrate_row('PPP', {}), null);
  assert.equal(Migrate_row('PPP', { Details: '  ', Note: '' }), null);
  assert.equal(Migrate_row('PPP', Object.assign({}, ROW, { Date: '' })).job.created_at, '');
});

test('Migrate_date: Excel serial = midnight in Bangkok; Date and strings pass through', () => {
  assert.equal(Migrate_date(46249).toISOString(), '2026-08-14T17:00:00.000Z'); // 15 Aug 2026 00:00 +07
  assert.equal(Migrate_date('46249').toISOString(), '2026-08-14T17:00:00.000Z');
  const d = new Date('2026-08-15T00:00:00+07:00');
  assert.equal(Migrate_date(d), d);
  assert.equal(Migrate_date('2026-08-16').getTime(), new Date('2026-08-16').getTime());
  assert.equal(Migrate_date(''), null);
  assert.equal(Migrate_date('ไม่ระบุ'), null);
});

test('Migrate_key: branch + title + Bangkok day; same key whether the date came as serial or Date', () => {
  const a = Migrate_row('PPP', ROW).job;
  const b = Object.assign({}, a, { created_at: new Date('2026-08-15T09:30:00+07:00') });
  assert.equal(Migrate_key(a), 'PPP|ไฟทางลงชั้น 46 ไป 45 ดับ|2026-08-15');
  assert.equal(Migrate_key(a), Migrate_key(b));
  assert.equal(Migrate_key(Object.assign({}, a, { created_at: '' })), 'PPP|ไฟทางลงชั้น 46 ไป 45 ดับ|');
});

test('Migrate_jobId', () => {
  assert.equal(Migrate_jobId('GIR', 7), 'LG-GIR-007');
});
