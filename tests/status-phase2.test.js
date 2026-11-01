// Phase 2 actions (PLAN §3): request_ext, decide_ext, set_priority, cancel, auto_ack.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, STATUS_SYSTEM_ACTOR, Status_transition } = require('../gas/core/Status.js');

const NOW = new Date('2026-11-05T03:00:00Z');
const H = 3600 * 1000;
const ALL = Object.keys(STATUS);
const U = {
  reporter: { userId: 'U_REP', name: 'ผู้แจ้ง', role: 'STAFF', branch_code: 'PPP' },
  tech1: { userId: 'U_T1', name: 'ช่างหนึ่ง', role: 'TECH', branch_code: '' },
  tech2: { userId: 'U_T2', name: 'ช่างสอง', role: 'TECH', branch_code: '' },
  admin: { userId: 'U_ADM', name: 'แตงกวา', role: 'ADMIN', branch_code: '' },
  manager: { userId: 'U_MGR', name: 'ผจก', role: 'MANAGER', branch_code: 'PPP' },
  viewer: { userId: 'U_VW', name: 'ผู้บริหาร', role: 'VIEWER', branch_code: '' },
};

function job(status, extra) {
  const accepted = ['ACCEPTED', 'IN_PROGRESS', 'DONE', 'CLOSED'].indexOf(status) !== -1;
  return Object.assign({
    job_id: 'MT-2611-0001', status: status, branch_code: 'PPP', priority: 'NORMAL',
    reporter_id: 'U_REP', candidate_ids: 'U_T1,U_T2', assignee_id: accepted ? 'U_T1' : '',
    created_at: new Date(NOW.getTime() - 10 * H),
    response_due_at: new Date(NOW.getTime() + 62 * H), due_at: new Date(NOW.getTime() + 158 * H),
    ext_pending: false, ext_requested_due_at: '', ext_count: 0, alert_flags: '',
  }, extra || {});
}

function run(j, action, actor, input) {
  return Status_transition(j, action, actor, Object.assign({ now: NOW }, input || {}));
}

function assertCode(fn, code) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code, 'expected ' + code + ' but got ' + err.code + ': ' + err.message);
    return true;
  });
}

const LATER = new Date(NOW.getTime() + 300 * H);

// --- request_ext ----------------------------------------------------------------

test('request_ext: assignee asks for a later date; status does not change', () => {
  for (const s of ['ACCEPTED', 'IN_PROGRESS']) {
    const r = run(job(s), 'request_ext', U.tech1, { reason: 'รออะไหล่', new_due_at: LATER.toISOString() });
    assert.equal(r.status, s);
    assert.equal(r.fields.ext_pending, true);
    assert.equal(r.fields.ext_requested_due_at.getTime(), LATER.getTime());
    assert.equal(r.fields.ext_reason, 'รออะไหล่');
    assert.equal(r.log.action, 'request_ext');
    assert.equal(r.log.new_value, LATER.toISOString());
    assert.ok(r.log.old_value);
  }
});

test('request_ext: only the assignee, only while working', () => {
  for (const a of [U.tech2, U.admin, U.reporter, U.manager, U.viewer]) {
    assertCode(() => run(job('ACCEPTED'), 'request_ext', a, { reason: 'x', new_due_at: LATER }), 'FORBIDDEN');
  }
  for (const s of ALL.filter((x) => x !== 'ACCEPTED' && x !== 'IN_PROGRESS')) {
    assertCode(() => run(job(s, { assignee_id: 'U_T1' }), 'request_ext', U.tech1, { reason: 'x', new_due_at: LATER }), 'INVALID_STATE');
  }
});

test('request_ext: one pending request at a time', () => {
  assertCode(() => run(job('ACCEPTED', { ext_pending: 'TRUE' }), 'request_ext', U.tech1, { reason: 'x', new_due_at: LATER }), 'INVALID_STATE');
});

test('request_ext validates reason and date', () => {
  assertCode(() => run(job('ACCEPTED'), 'request_ext', U.tech1, { reason: '', new_due_at: LATER }), 'VALIDATION');
  assertCode(() => run(job('ACCEPTED'), 'request_ext', U.tech1, { reason: 'x' }), 'VALIDATION');
  assertCode(() => run(job('ACCEPTED'), 'request_ext', U.tech1, { reason: 'x', new_due_at: 'not a date' }), 'VALIDATION');
  assertCode(() => run(job('ACCEPTED'), 'request_ext', U.tech1, { reason: 'x', new_due_at: new Date(NOW.getTime() - H) }), 'VALIDATION');
  // Must be after the current due date, otherwise it is not an extension.
  assertCode(() => run(job('ACCEPTED'), 'request_ext', U.tech1, { reason: 'x', new_due_at: new Date(NOW.getTime() + 10 * H) }), 'VALIDATION');
});

// --- decide_ext -----------------------------------------------------------------

const PENDING = { ext_pending: true, ext_requested_due_at: LATER, alert_flags: 'R75,D75,DB', ext_count: 1 };

test('decide_ext approve: due_at moves, ext_count +1, D75/DB cleared, flag off', () => {
  const r = run(job('IN_PROGRESS', PENDING), 'decide_ext', U.admin, { approve: true, note: 'ok' });
  assert.equal(r.status, 'IN_PROGRESS');
  assert.equal(r.approved, true);
  assert.equal(r.fields.ext_pending, false);
  assert.equal(r.fields.due_at.getTime(), LATER.getTime());
  assert.equal(r.fields.ext_count, 2);
  assert.equal(r.fields.alert_flags, 'R75');
  assert.equal(r.log.reason, 'ok');
  assert.equal(r.log.new_value, LATER.toISOString());
});

test('decide_ext reject: only the flag goes off', () => {
  const r = run(job('ACCEPTED', PENDING), 'decide_ext', U.admin, { approve: false });
  assert.equal(r.approved, false);
  assert.deepEqual(Object.keys(r.fields).sort(), ['ext_pending', 'status', 'updated_at']);
  assert.equal(r.fields.ext_pending, false);
});

test('decide_ext: ADMIN only, and only with a pending request', () => {
  for (const a of [U.tech1, U.reporter, U.manager, U.viewer]) {
    assertCode(() => run(job('ACCEPTED', PENDING), 'decide_ext', a, { approve: true }), 'FORBIDDEN');
  }
  assertCode(() => run(job('ACCEPTED'), 'decide_ext', U.admin, { approve: true }), 'INVALID_STATE');
  assertCode(() => run(job('DONE', PENDING), 'decide_ext', U.admin, { approve: true }), 'INVALID_STATE');
});

// Option B (review 2 Nov 2026): a request belongs to its assignee and to the open job.
test('reject, forward, reassign and close drop a pending extension request', () => {
  const p = { ext_pending: true, ext_requested_due_at: LATER };
  assert.equal(run(job('ACCEPTED', p), 'reject', U.tech1, { reason: 'ไม่ว่าง' }).fields.ext_pending, false);
  assert.equal(run(job('ACCEPTED', p), 'forward', U.tech1, { reason: 'ต้องใช้ช่างนอก', admin_ids: ['U_ADM'] }).fields.ext_pending, false);
  assert.equal(run(job('ACCEPTED', p), 'reassign', U.admin, { target: { userId: 'U_T2', role: 'TECH' } }).fields.ext_pending, false);
  assert.equal(run(job('IN_PROGRESS', p), 'close', U.tech1, { photos_after: ['F1'] }).fields.ext_pending, false);
});

test('decide_ext: anything but approve === true is a rejection', () => {
  for (const approve of [undefined, 'true', 1]) {
    const r = run(job('ACCEPTED', PENDING), 'decide_ext', U.admin, { approve: approve });
    assert.equal(r.approved, false);
    assert.equal(r.fields.due_at, undefined);
  }
});

// --- set_priority -----------------------------------------------------------------

const DUE = { response_due_at: new Date(NOW.getTime() + 4 * H), due_at: new Date(NOW.getTime() + 24 * H) };

test('set_priority: new due dates, flags cleared, old and new values logged', () => {
  const r = run(job('ASSIGNED', { priority: 'EMERGENCY', alert_flags: 'R75,RB' }), 'set_priority', U.admin,
    { priority: 'urgent', due: DUE, reason: 'ไม่ได้ฉุกเฉินจริง' });
  assert.equal(r.status, 'ASSIGNED');
  assert.equal(r.fields.priority, 'URGENT');
  assert.equal(r.fields.response_due_at, DUE.response_due_at);
  assert.equal(r.fields.due_at, DUE.due_at);
  assert.equal(r.fields.alert_flags, '');
  assert.equal(JSON.parse(r.log.old_value).priority, 'EMERGENCY');
  assert.equal(JSON.parse(r.log.new_value).priority, 'URGENT');
  assert.equal(r.log.reason, 'ไม่ได้ฉุกเฉินจริง');
});

test('set_priority: ADMIN only, any status that is not closed', () => {
  for (const a of [U.tech1, U.reporter, U.manager, U.viewer]) {
    assertCode(() => run(job('ASSIGNED'), 'set_priority', a, { priority: 'URGENT', due: DUE }), 'FORBIDDEN');
  }
  for (const s of ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS', 'DONE']) {
    assert.equal(run(job(s), 'set_priority', U.admin, { priority: 'URGENT', due: DUE }).fields.priority, 'URGENT');
  }
  for (const s of ['CLOSED', 'CANCELLED']) {
    assertCode(() => run(job(s), 'set_priority', U.admin, { priority: 'URGENT', due: DUE }), 'INVALID_STATE');
  }
});

test('set_priority validates the priority', () => {
  assertCode(() => run(job('ASSIGNED'), 'set_priority', U.admin, { priority: 'LOW', due: DUE }), 'VALIDATION');
  assertCode(() => run(job('ASSIGNED'), 'set_priority', U.admin, { priority: 'NORMAL', due: DUE }), 'VALIDATION');
  assert.throws(() => run(job('ASSIGNED'), 'set_priority', U.admin, { priority: 'URGENT' }));
});

// --- cancel ---------------------------------------------------------------------

test('cancel: ADMIN, open jobs, reason required, drops a pending extension', () => {
  for (const s of ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS']) {
    const r = run(job(s, { ext_pending: true }), 'cancel', U.admin, { reason: 'แจ้งซ้ำ' });
    assert.equal(r.status, 'CANCELLED');
    assert.equal(r.fields.ext_pending, false);
    assert.equal(r.log.reason, 'แจ้งซ้ำ');
  }
  for (const s of ['DONE', 'CLOSED', 'CANCELLED']) {
    assertCode(() => run(job(s), 'cancel', U.admin, { reason: 'x' }), 'INVALID_STATE');
  }
  for (const a of [U.tech1, U.reporter, U.manager, U.viewer]) {
    assertCode(() => run(job('ASSIGNED'), 'cancel', a, { reason: 'x' }), 'FORBIDDEN');
  }
  assertCode(() => run(job('ASSIGNED'), 'cancel', U.admin, { reason: ' ' }), 'VALIDATION');
});

// --- auto_ack -----------------------------------------------------------------------

test('auto_ack: system actor closes a DONE job with ack_by AUTO', () => {
  const r = run(job('DONE'), 'auto_ack', STATUS_SYSTEM_ACTOR);
  assert.equal(r.status, 'CLOSED');
  assert.equal(r.fields.ack_by, 'AUTO');
  assert.equal(r.fields.closed_at, NOW);
  assert.equal(r.fields.ack_at, NOW);
});

test('auto_ack: no person can run it, and only from DONE', () => {
  for (const a of Object.values(U)) assertCode(() => run(job('DONE'), 'auto_ack', a), 'FORBIDDEN');
  for (const s of ALL.filter((x) => x !== 'DONE')) {
    assertCode(() => run(job(s), 'auto_ack', STATUS_SYSTEM_ACTOR), 'INVALID_STATE');
  }
});

test('the system actor cannot run any person action', () => {
  for (const action of ['accept', 'reject', 'forward', 'reassign', 'checkin', 'close', 'ack', 'request_ext', 'decide_ext', 'set_priority', 'cancel']) {
    for (const s of ALL) assertCode(() => run(job(s, { ext_pending: true }), action, STATUS_SYSTEM_ACTOR, { reason: 'x' }), 'FORBIDDEN');
  }
});

// PLAN §3: permission first. Callers run this before validating photos, users or SLA input.
test('Status_assertCan: FORBIDDEN before any input is looked at', () => {
  const { Status_assertCan } = require('../gas/core/Status.js');
  assertCode(() => Status_assertCan(job('ACCEPTED'), 'reassign', U.tech1), 'FORBIDDEN');
  assertCode(() => Status_assertCan(job('ACCEPTED'), 'set_priority', U.viewer), 'FORBIDDEN');
  assertCode(() => Status_assertCan(job('IN_PROGRESS'), 'close', U.tech2), 'FORBIDDEN');
  assertCode(() => Status_assertCan(null, 'close', U.tech1), 'NOT_FOUND');
  assertCode(() => Status_assertCan(job('ACCEPTED'), 'nope', U.admin), 'VALIDATION');
  // Status is not part of the permission check: a closed job still passes for an ADMIN.
  assert.equal(typeof Status_assertCan(job('CLOSED'), 'set_priority', U.admin).who, 'function');
});
