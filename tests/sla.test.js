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

// --- Sla_pendingAlerts / Sla_autoAckDue (PLAN §11) ---------------------------------

const { Sla_pendingAlerts, Sla_autoAckDue, Sla_addFlags } = require('../gas/core/Sla.js');

// Window: created 00:00, response due +4h, resolve due +24h.
const C0 = new Date('2026-11-05T00:00:00Z');
function slaJob(status, extra) {
  return Object.assign({
    status: status, created_at: C0,
    response_due_at: new Date(C0.getTime() + 4 * H), due_at: new Date(C0.getTime() + 24 * H),
    checkin_at: '', done_at: '', alert_flags: '',
  }, extra || {});
}
const at = (hours) => new Date(C0.getTime() + hours * H);

test('Sla_pendingAlerts: response phase R75 at 75% and RB after the deadline', () => {
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(2.9), 75), []);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(3), 75), ['R75']);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(4), 75), ['R75']);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(4.01), 75), ['R75', 'RB']);
  for (const s of ['NEW', 'REJECTED']) assert.deepEqual(Sla_pendingAlerts(slaJob(s), at(5), 75), ['R75', 'RB']);
});

test('Sla_pendingAlerts: check-in ends the response phase', () => {
  assert.deepEqual(Sla_pendingAlerts(slaJob('IN_PROGRESS', { checkin_at: at(1) }), at(5), 75), []);
});

test('Sla_pendingAlerts: an ACCEPTED job is in both phases', () => {
  assert.deepEqual(Sla_pendingAlerts(slaJob('ACCEPTED'), at(18), 75), ['R75', 'RB', 'D75']);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ACCEPTED'), at(25), 75), ['R75', 'RB', 'D75', 'DB']);
});

test('Sla_pendingAlerts: repair phase D75/DB for IN_PROGRESS', () => {
  const j = slaJob('IN_PROGRESS', { checkin_at: at(1) });
  assert.deepEqual(Sla_pendingAlerts(j, at(17.9), 75), []);
  assert.deepEqual(Sla_pendingAlerts(j, at(18), 75), ['D75']);
  assert.deepEqual(Sla_pendingAlerts(j, at(24.5), 75), ['D75', 'DB']);
});

test('Sla_pendingAlerts: flags already sent are not repeated', () => {
  const j = slaJob('IN_PROGRESS', { checkin_at: at(1), alert_flags: 'R75,RB,D75' });
  assert.deepEqual(Sla_pendingAlerts(j, at(30), 75), ['DB']);
  assert.deepEqual(Sla_pendingAlerts(Object.assign(j, { alert_flags: 'D75, DB' }), at(30), 75), []);
});

test('Sla_pendingAlerts: closed, done and cancelled jobs never alert', () => {
  for (const s of ['DONE', 'CLOSED', 'CANCELLED']) assert.deepEqual(Sla_pendingAlerts(slaJob(s, { done_at: at(2) }), at(99), 75), []);
  assert.deepEqual(Sla_pendingAlerts(slaJob('CANCELLED'), at(99), 75), []);
});

test('Sla_pendingAlerts: REMIND_AT_PERCENT is configurable, bad values fall back to 75', () => {
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(2), 50), ['R75']);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(2), ''), []);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED'), at(3), 'abc'), ['R75']);
});

test('Sla_pendingAlerts: an approved extension (new due_at) re-arms D75/DB only after they are cleared', () => {
  const j = slaJob('IN_PROGRESS', { checkin_at: at(1), due_at: at(100), alert_flags: 'R75,RB' });
  assert.deepEqual(Sla_pendingAlerts(j, at(30), 75), []);
  assert.deepEqual(Sla_pendingAlerts(j, at(80), 75), ['D75']);
});

test('Sla_pendingAlerts: jobs without dates (e.g. migrated rows) are skipped', () => {
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED', { created_at: '' }), at(99), 75), []);
  assert.deepEqual(Sla_pendingAlerts(slaJob('ASSIGNED', { response_due_at: '', due_at: '' }), at(99), 75), []);
});

test('Sla_autoAckDue', () => {
  const done = slaJob('DONE', { done_at: at(10) });
  assert.equal(Sla_autoAckDue(done, at(57), 48), false);
  assert.equal(Sla_autoAckDue(done, at(58), 48), true);
  assert.equal(Sla_autoAckDue(done, at(999), 0), false);
  assert.equal(Sla_autoAckDue(done, at(999), ''), false);
  assert.equal(Sla_autoAckDue(slaJob('CLOSED', { done_at: at(10) }), at(999), 1), false);
  assert.equal(Sla_autoAckDue(slaJob('DONE', { done_at: '' }), at(999), 1), false);
});

test('Sla_addFlags keeps order and drops duplicates', () => {
  assert.equal(Sla_addFlags('', ['RB', 'R75']), 'R75,RB');
  assert.equal(Sla_addFlags('D75', ['D75', 'DB']), 'D75,DB');
  assert.equal(Sla_addFlags('R75,RB', []), 'R75,RB');
});
