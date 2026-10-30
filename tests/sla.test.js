const test = require('node:test');
const assert = require('node:assert/strict');
const { Sla_computeDueDates } = require('../gas/core/Sla.js');

const SLA_ROWS = [
  { priority: 'EMERGENCY', response_hours: 4, resolve_hours: 24 },
  { priority: 'URGENT', response_hours: 24, resolve_hours: 72 },
  { priority: 'NORMAL', response_hours: 72, resolve_hours: 168 },
  { priority: 'PREVENTIVE', response_hours: 720, resolve_hours: 720 },
];
const CREATED = new Date('2026-11-05T03:00:00Z');
const H = 3600 * 1000;

test('Sla_computeDueDates adds calendar hours for each priority', () => {
  for (const row of SLA_ROWS) {
    const r = Sla_computeDueDates(CREATED, row.priority, SLA_ROWS);
    assert.equal(r.response_due_at.getTime(), CREATED.getTime() + row.response_hours * H);
    assert.equal(r.due_at.getTime(), CREATED.getTime() + row.resolve_hours * H);
  }
});

test('Sla_computeDueDates returns Date objects and does not mutate createdAt', () => {
  const created = new Date(CREATED);
  const r = Sla_computeDueDates(created, 'URGENT', SLA_ROWS);
  assert.ok(r.response_due_at instanceof Date);
  assert.ok(r.due_at instanceof Date);
  assert.equal(created.getTime(), CREATED.getTime());
});

test('Sla_computeDueDates recomputes from createdAt when priority changes', () => {
  const normal = Sla_computeDueDates(CREATED, 'NORMAL', SLA_ROWS);
  const emergency = Sla_computeDueDates(CREATED, 'EMERGENCY', SLA_ROWS);
  assert.equal(emergency.due_at.getTime(), CREATED.getTime() + 24 * H);
  assert.ok(emergency.due_at < normal.due_at);
});

test('Sla_computeDueDates accepts hours read from the sheet as strings', () => {
  const rows = [{ priority: 'NORMAL', response_hours: '72', resolve_hours: '168' }];
  assert.equal(Sla_computeDueDates(CREATED, 'NORMAL', rows).due_at.getTime(), CREATED.getTime() + 168 * H);
});

test('Sla_computeDueDates rejects unknown priority, bad hours and bad date', () => {
  assert.throws(() => Sla_computeDueDates(CREATED, 'LOW', SLA_ROWS), /priority/);
  assert.throws(() => Sla_computeDueDates(CREATED, 'NORMAL', [{ priority: 'NORMAL', response_hours: '', resolve_hours: 1 }]), /hours/);
  assert.throws(() => Sla_computeDueDates(new Date('x'), 'NORMAL', SLA_ROWS), /createdAt/);
});
