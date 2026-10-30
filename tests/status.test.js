const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS, Status_transition, Status_parts, Status_canView, Status_allowedActions,
  Status_canListScope, Status_inScope, Status_isOpen,
} = require('../gas/core/Status.js');

const NOW = new Date('2026-11-05T03:00:00Z');
const ALL_STATUSES = Object.keys(STATUS);

const U = {
  reporter: { userId: 'U_REP', name: 'ผู้แจ้ง', role: 'STAFF', branch_code: 'PPP' },
  tech1: { userId: 'U_T1', name: 'ช่างหนึ่ง', role: 'TECH', branch_code: '' },
  tech2: { userId: 'U_T2', name: 'ช่างสอง', role: 'TECH', branch_code: '' },
  techOther: { userId: 'U_T3', name: 'ช่างสาม', role: 'TECH', branch_code: '' },
  admin: { userId: 'U_ADM', name: 'แตงกวา', role: 'ADMIN', branch_code: '' },
  admin2: { userId: 'U_ADM2', name: 'แอดมินสอง', role: 'ADMIN', branch_code: '' },
  manager: { userId: 'U_MGR', name: 'ผจก PPP', role: 'MANAGER', branch_code: 'PPP' },
  managerOther: { userId: 'U_MGR2', name: 'ผจก GIR', role: 'MANAGER', branch_code: 'GIR' },
  staffOther: { userId: 'U_STF', name: 'พนักงานอื่น', role: 'STAFF', branch_code: 'PPP' },
  viewer: { userId: 'U_VW', name: 'ผู้บริหาร', role: 'VIEWER', branch_code: '' },
};

/** A job in `status`; candidates tech1+tech2, assignee tech1 once accepted. */
function job(status, extra) {
  const accepted = ['ACCEPTED', 'IN_PROGRESS', 'DONE', 'CLOSED'].indexOf(status) !== -1;
  return Object.assign({
    job_id: 'MT-2611-0001', status: status, branch_code: 'PPP',
    reporter_id: U.reporter.userId, candidate_ids: 'U_T1,U_T2',
    assignee_id: accepted ? 'U_T1' : '', assignee_name: accepted ? 'ช่างหนึ่ง' : '',
    reject_count: 0, vendor: '',
  }, extra || {});
}

const VALID_INPUT = {
  create: { candidate_ids: ['U_T1', 'U_T2'] },
  accept: {},
  reject: { reason: 'ไม่มีอะไหล่' },
  forward: { reason: 'ต้องใช้ช่างแอร์', admin_ids: ['U_ADM', 'U_ADM2'] },
  reassign: { target: { userId: 'U_T3', role: 'TECH' } },
  checkin: {},
  close: { cause: 'หลอดขาด', fix: 'เปลี่ยนหลอด', photos_after: ['F1'], parts: [] },
  ack: {},
};

function run(j, action, actor, input) {
  return Status_transition(j, action, actor, Object.assign({ now: NOW }, VALID_INPUT[action], input || {}));
}

function assertCode(fn, code) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code, 'expected ' + code + ' but got ' + err.code + ': ' + err.message);
    return true;
  });
}

// Each phase-1 action: allowed from-statuses, a permitted actor, and the expected to-status.
const MATRIX = [
  { action: 'accept', from: ['ASSIGNED'], actor: U.tech2, to: 'ACCEPTED', stateCode: 'CONFLICT' },
  { action: 'reject', from: ['ASSIGNED', 'ACCEPTED'], actor: U.tech1, to: 'REJECTED' },
  { action: 'forward', from: ['ASSIGNED', 'ACCEPTED'], actor: U.tech1, to: 'ASSIGNED' },
  { action: 'reassign', from: ['NEW', 'REJECTED', 'ASSIGNED', 'ACCEPTED'], actor: U.admin, to: 'ASSIGNED' },
  { action: 'checkin', from: ['ACCEPTED'], actor: U.tech1, to: 'IN_PROGRESS' },
  { action: 'close', from: ['ACCEPTED', 'IN_PROGRESS'], actor: U.tech1, to: 'DONE' },
  { action: 'ack', from: ['DONE'], actor: U.reporter, to: 'CLOSED' },
];

// --- transitions -------------------------------------------------------------

for (const m of MATRIX) {
  for (const s of ALL_STATUSES) {
    const allowed = m.from.indexOf(s) !== -1;
    test(`${m.action} from ${s} is ${allowed ? 'allowed' : 'rejected'}`, () => {
      if (allowed) {
        const r = run(job(s), m.action, m.actor);
        assert.equal(r.status, m.to);
        assert.equal(r.fields.status, m.to);
        assert.equal(r.fields.updated_at, NOW);
        assert.equal(r.log.action, m.action);
        assert.equal(r.log.from_status, s);
        assert.equal(r.log.to_status, m.to);
      } else {
        // Make the actor the holder in every status so only the status decides.
        const j = job(s, { assignee_id: m.actor.userId, assignee_name: m.actor.name });
        assertCode(() => run(j, m.action, m.actor), m.stateCode || 'INVALID_STATE');
      }
    });
  }
}

test('unknown action is rejected', () => {
  assertCode(() => Status_transition(job('ASSIGNED'), 'request_ext', U.tech1, { now: NOW }), 'VALIDATION');
  assertCode(() => Status_transition(job('ASSIGNED'), 'toString', U.tech1, { now: NOW }), 'VALIDATION');
});

test('missing job is NOT_FOUND, missing actor is FORBIDDEN', () => {
  assertCode(() => run(null, 'accept', U.tech1), 'NOT_FOUND');
  assertCode(() => run(job('ASSIGNED'), 'accept', null), 'FORBIDDEN');
  assertCode(() => run(job('ASSIGNED'), 'accept', { role: 'ADMIN' }), 'FORBIDDEN');
});

test('input.now must be a Date', () => {
  assert.throws(() => Status_transition(job('ASSIGNED'), 'accept', U.tech1, {}), /input.now/);
});

// --- create ------------------------------------------------------------------

test('create with candidates -> ASSIGNED with assigned_at', () => {
  const r = run(null, 'create', U.reporter);
  assert.equal(r.status, 'ASSIGNED');
  assert.equal(r.fields.created_at, NOW);
  assert.equal(r.fields.assigned_at, NOW);
  assert.equal(r.fields.candidate_ids, 'U_T1,U_T2');
  assert.equal(r.fields.reject_count, 0);
  assert.equal(r.log.from_status, '');
  assert.equal(r.log.to_status, 'ASSIGNED');
});

test('create without candidates -> NEW and no assigned_at', () => {
  const r = run(null, 'create', U.reporter, { candidate_ids: [] });
  assert.equal(r.status, 'NEW');
  assert.equal(r.fields.assigned_at, '');
  assert.equal(r.fields.candidate_ids, '');
});

test('create: STAFF, MANAGER, TECH, ADMIN may report; VIEWER and unknown roles may not', () => {
  for (const a of [U.reporter, U.manager, U.tech1, U.admin]) assert.equal(run(null, 'create', a).status, 'ASSIGNED');
  assertCode(() => run(null, 'create', U.viewer), 'FORBIDDEN');
  assertCode(() => run(null, 'create', { userId: 'U_X', role: '' }), 'FORBIDDEN');
  assertCode(() => run(null, 'create', { userId: 'U_X', role: 'admin' }), 'FORBIDDEN');
});

// --- accept ------------------------------------------------------------------

test('accept sets assignee and accepted_at', () => {
  const r = run(job('ASSIGNED'), 'accept', U.tech2);
  assert.equal(r.fields.assignee_id, 'U_T2');
  assert.equal(r.fields.assignee_name, 'ช่างสอง');
  assert.equal(r.fields.accepted_at, NOW);
});

test('accept: any candidate or ADMIN; others FORBIDDEN', () => {
  assert.equal(run(job('ASSIGNED'), 'accept', U.tech1).status, 'ACCEPTED');
  assert.equal(run(job('ASSIGNED'), 'accept', U.admin).status, 'ACCEPTED');
  for (const a of [U.techOther, U.reporter, U.manager, U.viewer, U.staffOther]) {
    assertCode(() => run(job('ASSIGNED'), 'accept', a), 'FORBIDDEN');
  }
});

test('second accept gets CONFLICT naming who took the job', () => {
  const first = run(job('ASSIGNED'), 'accept', U.tech1);
  const after = Object.assign(job('ASSIGNED'), first.fields);
  assert.throws(() => run(after, 'accept', U.tech2), (err) => err.code === 'CONFLICT' && /ช่างหนึ่ง/.test(err.message));
  // Tapping again on your own accepted job is also a CONFLICT, not a second accept.
  assertCode(() => run(after, 'accept', U.tech1), 'CONFLICT');
});

test('candidate ids with spaces still match', () => {
  assert.equal(run(job('ASSIGNED', { candidate_ids: ' U_T1 , U_T2 ' }), 'accept', U.tech2).status, 'ACCEPTED');
});

// --- reject ------------------------------------------------------------------

test('reject requires a reason, increments reject_count and clears assignee', () => {
  assertCode(() => run(job('ASSIGNED'), 'reject', U.tech1, { reason: '  ' }), 'VALIDATION');
  assertCode(() => run(job('ASSIGNED'), 'reject', U.tech1, { reason: undefined }), 'VALIDATION');
  assertCode(() => run(job('ASSIGNED'), 'reject', U.tech1, { reason: 'x'.repeat(501) }), 'VALIDATION');
  const r = run(job('ACCEPTED', { reject_count: 2 }), 'reject', U.tech1, { reason: ' ไม่มีอะไหล่ ' });
  assert.equal(r.fields.reject_count, 3);
  assert.equal(r.fields.assignee_id, '');
  assert.equal(r.fields.assignee_name, '');
  assert.equal(r.log.reason, 'ไม่มีอะไหล่');
});

test('reject: candidate while ASSIGNED, only the assignee once ACCEPTED', () => {
  assert.equal(run(job('ASSIGNED'), 'reject', U.tech2).status, 'REJECTED');
  assertCode(() => run(job('ACCEPTED'), 'reject', U.tech2), 'FORBIDDEN');
  for (const a of [U.admin, U.reporter, U.manager, U.viewer, U.techOther]) {
    assertCode(() => run(job('ASSIGNED'), 'reject', a), 'FORBIDDEN');
  }
});

test('reject: an ADMIN who is a candidate (ADMIN-routed category) may reject', () => {
  assert.equal(run(job('ASSIGNED', { candidate_ids: 'U_ADM' }), 'reject', U.admin).status, 'REJECTED');
});

// --- forward -----------------------------------------------------------------

test('forward sends the job to every ADMIN with the reason', () => {
  const r = run(job('ACCEPTED'), 'forward', U.tech1);
  assert.equal(r.status, 'ASSIGNED');
  assert.equal(r.fields.route_to, 'ADMIN');
  assert.equal(r.fields.candidate_ids, 'U_ADM,U_ADM2');
  assert.equal(r.fields.assignee_id, '');
  assert.equal(r.fields.assigned_at, NOW);
  assert.equal(r.log.reason, 'ต้องใช้ช่างแอร์');
});

test('forward without any ADMIN leaves the job NEW', () => {
  const r = run(job('ASSIGNED'), 'forward', U.tech1, { admin_ids: [] });
  assert.equal(r.status, 'NEW');
  assert.equal(r.fields.candidate_ids, '');
});

test('forward requires a reason', () => {
  assertCode(() => run(job('ASSIGNED'), 'forward', U.tech1, { reason: '' }), 'VALIDATION');
});

test('forward: only a TECH who holds the job', () => {
  assert.equal(run(job('ASSIGNED'), 'forward', U.tech2).status, 'ASSIGNED');
  assertCode(() => run(job('ACCEPTED'), 'forward', U.tech2), 'FORBIDDEN');
  assertCode(() => run(job('ASSIGNED'), 'forward', U.techOther), 'FORBIDDEN');
  // An ADMIN candidate is not a TECH, so cannot forward to themselves.
  assertCode(() => run(job('ASSIGNED', { candidate_ids: 'U_ADM' }), 'forward', U.admin), 'FORBIDDEN');
  for (const a of [U.reporter, U.manager, U.viewer]) assertCode(() => run(job('ASSIGNED'), 'forward', a), 'FORBIDDEN');
});

// --- reassign ----------------------------------------------------------------

test('reassign to a TECH makes them the only candidate', () => {
  const r = run(job('REJECTED', { vendor: 'Daikin' }), 'reassign', U.admin);
  assert.equal(r.status, 'ASSIGNED');
  assert.equal(r.fields.candidate_ids, 'U_T3');
  assert.equal(r.fields.route_to, 'TECH');
  assert.equal(r.fields.vendor, '');
  assert.equal(r.fields.assignee_id, '');
  assert.equal(r.fields.assigned_at, NOW);
  assert.deepEqual(JSON.parse(r.log.old_value), { candidate_ids: 'U_T1,U_T2', assignee_id: '', vendor: 'Daikin' });
  assert.deepEqual(JSON.parse(r.log.new_value), { candidate_ids: 'U_T3', assignee_id: '', vendor: '' });
});

test('reassign to a vendor makes the acting ADMIN the candidate', () => {
  const r = run(job('ACCEPTED'), 'reassign', U.admin2, { target: null, vendor: ' Daikin ' });
  assert.equal(r.fields.candidate_ids, 'U_ADM2');
  assert.equal(r.fields.vendor, 'Daikin');
  assert.equal(r.fields.route_to, 'ADMIN');
  assert.equal(r.fields.assignee_id, '');
});

test('reassign validates the target', () => {
  assertCode(() => run(job('NEW'), 'reassign', U.admin, { target: null }), 'VALIDATION');
  assertCode(() => run(job('NEW'), 'reassign', U.admin, { vendor: 'Daikin' }), 'VALIDATION');
  assertCode(() => run(job('NEW'), 'reassign', U.admin, { target: { userId: 'U_REP', role: 'STAFF' } }), 'VALIDATION');
  assert.equal(run(job('NEW'), 'reassign', U.admin, { target: { userId: 'U_ADM2', role: 'ADMIN' } }).fields.route_to, 'ADMIN');
});

test('reassign: ADMIN only', () => {
  for (const a of [U.tech1, U.manager, U.reporter, U.viewer]) assertCode(() => run(job('REJECTED'), 'reassign', a), 'FORBIDDEN');
});

// --- checkin -----------------------------------------------------------------

test('checkin sets checkin_at; assignee or ADMIN only', () => {
  assert.equal(run(job('ACCEPTED'), 'checkin', U.tech1).fields.checkin_at, NOW);
  assert.equal(run(job('ACCEPTED'), 'checkin', U.admin).status, 'IN_PROGRESS');
  for (const a of [U.tech2, U.reporter, U.manager, U.viewer]) assertCode(() => run(job('ACCEPTED'), 'checkin', a), 'FORBIDDEN');
});

// --- close -------------------------------------------------------------------

test('close records the repair and totals the parts', () => {
  const r = run(job('IN_PROGRESS'), 'close', U.tech1, {
    cause: ' หลอดขาด ', fix: 'เปลี่ยนหลอด', photos_after: ['F1', 'F2'], onsite_note: 'ร้านยังไม่เปิด',
    parts: [
      { item: 'หลอด LED', qty: 2, unit_price: 120, vendor: 'โฮมโปร' },
      { item: '', qty: '', unit_price: '' }, // blank row from the form is dropped
      { item: 'สายไฟ', qty: '1.5', unit_price: '35.5' },
    ],
  });
  assert.equal(r.status, 'DONE');
  assert.equal(r.fields.done_at, NOW);
  assert.equal(r.fields.cause, 'หลอดขาด');
  assert.equal(r.fields.cost_total, 293.25);
  assert.equal(r.fields.photos_after, 'F1,F2');
  assert.equal(r.fields.onsite_note, 'ร้านยังไม่เปิด');
  assert.equal(r.parts.length, 2);
  assert.deepEqual(r.parts[1], { line_no: 2, item: 'สายไฟ', qty: 1.5, unit_price: 35.5, amount: 53.25, vendor: '', note: '' });
  assert.equal(r.log.new_value, '293.25');
});

test('close without parts costs 0', () => {
  const r = run(job('ACCEPTED'), 'close', U.admin, { parts: undefined });
  assert.equal(r.fields.cost_total, 0);
  assert.deepEqual(r.parts, []);
});

test('close requires cause, fix and at least one After photo', () => {
  assertCode(() => run(job('ACCEPTED'), 'close', U.tech1, { cause: '' }), 'VALIDATION');
  assertCode(() => run(job('ACCEPTED'), 'close', U.tech1, { fix: ' ' }), 'VALIDATION');
  assertCode(() => run(job('ACCEPTED'), 'close', U.tech1, { photos_after: [] }), 'VALIDATION');
});

test('close: assignee or ADMIN only', () => {
  for (const a of [U.tech2, U.reporter, U.manager, U.viewer]) assertCode(() => run(job('IN_PROGRESS'), 'close', a), 'FORBIDDEN');
});

test('Status_parts rejects bad rows', () => {
  assertCode(() => Status_parts('x'), 'VALIDATION');
  assertCode(() => Status_parts([{ item: '', qty: 1, unit_price: 10 }]), 'VALIDATION');
  assertCode(() => Status_parts([{ item: 'a', qty: 0, unit_price: 10 }]), 'VALIDATION');
  assertCode(() => Status_parts([{ item: 'a', qty: 'abc', unit_price: 10 }]), 'VALIDATION');
  assertCode(() => Status_parts([{ item: 'a', qty: 1, unit_price: -1 }]), 'VALIDATION');
  assertCode(() => Status_parts(Array.from({ length: 31 }, () => ({ item: 'a', qty: 1, unit_price: 1 }))), 'VALIDATION');
  assert.deepEqual(Status_parts(null), []);
});

// --- ack (REQUIREMENTS Q3 default) --------------------------------------------

test('ack sets closed_at, ack_by and ack_at', () => {
  const r = run(job('DONE'), 'ack', U.manager);
  assert.equal(r.fields.closed_at, NOW);
  assert.equal(r.fields.ack_by, 'U_MGR');
  assert.equal(r.fields.ack_at, NOW);
});

test('ack: reporter, MANAGER of the branch or ADMIN; others FORBIDDEN', () => {
  for (const a of [U.reporter, U.manager, U.admin]) assert.equal(run(job('DONE'), 'ack', a).status, 'CLOSED');
  for (const a of [U.managerOther, U.staffOther, U.tech1, U.viewer]) assertCode(() => run(job('DONE'), 'ack', a), 'FORBIDDEN');
});

test('ack: a MANAGER without a branch cannot ack a job with no branch', () => {
  assertCode(() => run(job('DONE', { branch_code: '' }), 'ack', Object.assign({}, U.manager, { branch_code: '' })), 'FORBIDDEN');
});

// --- role table: VIEWER is read-only ------------------------------------------

test('VIEWER cannot run any action in any status', () => {
  for (const m of MATRIX) {
    for (const s of ALL_STATUSES) assert.throws(() => run(job(s), m.action, U.viewer));
  }
});

// --- view / list / allowed actions --------------------------------------------

test('Status_canView follows PLAN §6 getJob', () => {
  const j = job('ACCEPTED');
  for (const a of [U.reporter, U.tech1, U.tech2, U.manager, U.admin, U.viewer]) assert.equal(Status_canView(j, a), true, a.userId);
  for (const a of [U.techOther, U.managerOther, U.staffOther]) assert.equal(Status_canView(j, a), false, a.userId);
  assert.equal(Status_canView(null, U.admin), false);
});

test('Status_allowedActions lists the buttons for each actor', () => {
  assert.deepEqual(Status_allowedActions(job('ASSIGNED'), U.tech1), ['accept', 'reject', 'forward']);
  assert.deepEqual(Status_allowedActions(job('ASSIGNED'), U.admin), ['accept', 'reassign']);
  assert.deepEqual(Status_allowedActions(job('ACCEPTED'), U.tech1), ['reject', 'forward', 'checkin', 'close']);
  assert.deepEqual(Status_allowedActions(job('ACCEPTED'), U.tech2), []);
  assert.deepEqual(Status_allowedActions(job('DONE'), U.reporter), ['ack']);
  assert.deepEqual(Status_allowedActions(job('CLOSED'), U.admin), []);
  assert.deepEqual(Status_allowedActions(job('DONE'), U.viewer), []);
});

test('Status_canListScope', () => {
  assert.equal(Status_canListScope('mine', U.reporter), true);
  assert.equal(Status_canListScope('assigned', U.tech1), true);
  assert.equal(Status_canListScope('branch', U.reporter), false);
  assert.equal(Status_canListScope('branch', U.manager), true);
  assert.equal(Status_canListScope('all', U.manager), false);
  assert.equal(Status_canListScope('all', U.viewer), true);
  assert.equal(Status_canListScope('all', U.admin), true);
  assert.equal(Status_canListScope('constructor', U.admin), false);
});

test('Status_inScope', () => {
  const j = job('ASSIGNED');
  assert.equal(Status_inScope(j, 'mine', U.reporter), true);
  assert.equal(Status_inScope(j, 'mine', U.tech1), false);
  assert.equal(Status_inScope(j, 'assigned', U.tech2), true);
  assert.equal(Status_inScope(j, 'assigned', U.techOther), false);
  assert.equal(Status_inScope(j, 'branch', U.manager), true);
  assert.equal(Status_inScope(j, 'branch', U.managerOther), false);
  // A MANAGER cannot widen branch scope to another branch.
  assert.equal(Status_inScope(j, 'branch', U.managerOther, 'PPP'), false);
  assert.equal(Status_inScope(j, 'branch', U.admin, 'GIR'), false);
  assert.equal(Status_inScope(j, 'all', U.admin), true);
  assert.equal(Status_inScope(j, 'all', U.admin, 'PPP'), true);
});

test('Status_isOpen', () => {
  for (const s of ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS']) assert.equal(Status_isOpen(s), true);
  for (const s of ['DONE', 'CLOSED', 'CANCELLED']) assert.equal(Status_isOpen(s), false);
});
