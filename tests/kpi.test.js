const test = require('node:test');
const assert = require('node:assert/strict');
const { Kpi_compute, Kpi_tech, Kpi_responseHours } = require('../gas/core/Kpi.js');

const H = 3600 * 1000;
const NOW = new Date('2026-11-20T05:00:00Z'); // 20 Nov 12:00 Bangkok
const at = (iso) => new Date(iso);
// Bangkok midnight for a calendar day.
const day = (ymd) => new Date(ymd + 'T00:00:00+07:00');

function job(id, extra) {
  return Object.assign({
    job_id: id, branch_code: 'PPP', category_code: 'ELEC', area: 'บาร์', status: 'CLOSED', priority: 'NORMAL',
    created_at: at('2026-11-10T03:00:00Z'), accepted_at: '', checkin_at: '', done_at: '', closed_at: '',
    response_due_at: at('2026-11-13T03:00:00Z'), due_at: at('2026-11-17T03:00:00Z'),
    assignee_name: 'ช่างตุน', vendor: '', cost_total: 0, is_repeat: false, title: 'งาน ' + id,
  }, extra || {});
}

const JOBS = [
  // closed on time, response 2h via check-in, cost 500 done in November
  job('A', { checkin_at: at('2026-11-10T05:00:00Z'), accepted_at: at('2026-11-10T04:00:00Z'), done_at: at('2026-11-12T03:00:00Z'), closed_at: at('2026-11-12T04:00:00Z'), cost_total: 500 }),
  // closed late, response 4h via acceptance only, cost 300 done in October
  job('B', { created_at: at('2026-10-20T03:00:00Z'), accepted_at: at('2026-10-20T07:00:00Z'), done_at: at('2026-10-30T03:00:00Z'), due_at: at('2026-10-27T03:00:00Z'), closed_at: at('2026-10-31T03:00:00Z'), cost_total: '300' }),
  // open and overdue (due 17 Nov < now)
  job('C', { status: 'IN_PROGRESS', branch_code: 'GIR', checkin_at: at('2026-11-10T09:00:00Z'), assignee_name: '', vendor: 'Daikin', category_code: 'AC' }),
  // open, not overdue
  job('D', { status: 'ASSIGNED', due_at: at('2026-11-25T03:00:00Z'), assignee_name: '' }),
  // cancelled
  job('E', { status: 'CANCELLED' }),
  // migrated: no dates at all
  job('F', { status: 'IN_PROGRESS', created_at: '', response_due_at: '', due_at: '', assignee_name: "P'Nut", area: '' }),
];

test('cards: open, overdue, average response and cost this month', () => {
  const r = Kpi_compute(JOBS, { now: NOW });
  assert.equal(r.cards.open_count, 3); // C, D, F
  assert.equal(r.cards.overdue_count, 1); // C only (F has no due date)
  // A: 2h (check-in), B: 4h (accepted), C: 6h (check-in) -> 4.0
  assert.equal(r.cards.avg_response_hours, 4);
  assert.equal(r.cards.cost_this_month, 500); // B was done in October
});

test('kpi: maintenance (closed / not cancelled), lead time, totals', () => {
  const r = Kpi_compute(JOBS, { now: NOW });
  assert.equal(r.kpi.total, 6); // no date range -> migrated row counts
  assert.equal(r.kpi.maintenance_rate, 0.4); // A, B closed of 5 not cancelled
  assert.equal(r.kpi.lead_time_rate, 0.5); // A on time, B late
  assert.equal(r.kpi.repeat_rate, 0);
});

test('date range filters period figures and drops undated rows; "now" cards ignore it', () => {
  const r = Kpi_compute(JOBS, { now: NOW, from: day('2026-11-01'), to: day('2026-11-30') });
  assert.equal(r.kpi.total, 4); // A, C, D, E (B is October, F undated)
  assert.equal(r.cards.open_count, 3);
  assert.equal(r.cards.overdue_count, 1);
  assert.equal(r.cards.avg_response_hours, 4); // A 2h, C 6h
  assert.equal(r.kpi.lead_time_rate, 1);
});

test('`to` is inclusive to the end of that Bangkok day', () => {
  const j = [job('X', { created_at: new Date('2026-11-10T23:59:00+07:00') })];
  assert.equal(Kpi_compute(j, { now: NOW, from: day('2026-11-10'), to: day('2026-11-10') }).kpi.total, 1);
  assert.equal(Kpi_compute(j, { now: NOW, from: day('2026-11-11'), to: day('2026-11-11') }).kpi.total, 0);
});

test('branch, category and tech filters', () => {
  assert.equal(Kpi_compute(JOBS, { now: NOW, branch_code: 'GIR' }).kpi.total, 1);
  assert.equal(Kpi_compute(JOBS, { now: NOW, branch_code: 'GIR' }).cards.overdue_count, 1);
  assert.equal(Kpi_compute(JOBS, { now: NOW, category_code: 'AC' }).kpi.total, 1);
  assert.equal(Kpi_compute(JOBS, { now: NOW, tech: 'Daikin' }).kpi.total, 1);
  assert.equal(Kpi_compute(JOBS, { now: NOW, tech: 'ช่างตุน' }).kpi.total, 3); // A, B, E
  assert.equal(Kpi_compute(JOBS, { now: NOW, tech: '(ไม่ระบุ)' }).kpi.total, 1); // D
});

test('by_branch_status, by_month_category, by_tech', () => {
  const r = Kpi_compute(JOBS, { now: NOW });
  assert.deepEqual(r.by_branch_status.find((x) => x.branch === 'PPP' && x.status === 'CLOSED'), { branch: 'PPP', status: 'CLOSED', count: 2 });
  assert.deepEqual(r.by_month_category.find((x) => x.month === '2026-10'), { month: '2026-10', category: 'ELEC', count: 1 });
  assert.equal(r.by_month_category.some((x) => x.month === ''), false); // undated rows have no month
  const tun = r.by_tech.find((x) => x.tech === 'ช่างตุน');
  assert.deepEqual(tun, { tech: 'ช่างตุน', jobs: 3, avg_response_hours: 3, on_time_rate: 0.5 });
});

test('cost_by_branch_month uses done_at and the date range', () => {
  assert.deepEqual(Kpi_compute(JOBS, { now: NOW }).cost_by_branch_month, [
    { branch: 'PPP', month: '2026-10', cost: 300, budget: null },
    { branch: 'PPP', month: '2026-11', cost: 500, budget: null },
  ]);
  assert.deepEqual(Kpi_compute(JOBS, { now: NOW, from: day('2026-11-01') }).cost_by_branch_month.map((x) => x.month), ['2026-11']);
});

test('overdue_list: open past due, oldest due first, with hours overdue', () => {
  const r = Kpi_compute(JOBS, { now: NOW });
  assert.equal(r.overdue_list.length, 1);
  assert.equal(r.overdue_list[0].job_id, 'C');
  assert.equal(r.overdue_list[0].tech, 'Daikin');
  assert.equal(r.overdue_list[0].hours_overdue, 74); // 17 Nov 03:00Z -> 20 Nov 05:00Z
  const many = Array.from({ length: 30 }, (_, i) => job('O' + i, { status: 'ASSIGNED', due_at: new Date(NOW.getTime() - (i + 1) * H) }));
  const list = Kpi_compute(many, { now: NOW }).overdue_list;
  assert.equal(list.length, 20);
  assert.equal(list[0].job_id, 'O29');
});

test('repeat_candidates: same branch + area + category within 7 days after the earlier one closed', () => {
  const first = job('R1', { closed_at: at('2026-11-05T00:00:00Z'), created_at: at('2026-11-01T00:00:00Z') });
  const again = job('R2', { created_at: at('2026-11-11T23:00:00Z') }); // 6d23h later
  const late = job('R3', { created_at: at('2026-11-20T00:00:00Z'), area: 'ครัว' });
  const otherArea = job('R4', { created_at: at('2026-11-06T00:00:00Z'), area: 'ห้องน้ำชาย' });
  const r = Kpi_compute([first, again, late, otherArea], { now: NOW });
  assert.deepEqual(r.repeat_candidates.map((x) => [x.job_id, x.previous_job_id]), [['R2', 'R1']]);
  const tooLate = job('R5', { created_at: at('2026-11-12T00:01:00Z') }); // 7d0h1m later
  assert.deepEqual(Kpi_compute([first, tooLate], { now: NOW }).repeat_candidates, []);
  const noArea = [job('N1', { area: '', closed_at: at('2026-11-05T00:00:00Z') }), job('N2', { area: '', created_at: at('2026-11-06T00:00:00Z') })];
  assert.deepEqual(Kpi_compute(noArea, { now: NOW }).repeat_candidates, []);
});

test('techs list and helpers', () => {
  assert.deepEqual(Kpi_compute(JOBS, { now: NOW }).techs, ['(ไม่ระบุ)', 'Daikin', "P'Nut", 'ช่างตุน'].sort());
  assert.equal(Kpi_tech({ assignee_name: ' ', vendor: '' }), '(ไม่ระบุ)');
  assert.equal(Kpi_responseHours({ created_at: at('2026-11-10T00:00:00Z'), accepted_at: at('2026-11-09T00:00:00Z') }), null);
});

test('empty input gives empty results, no division by zero', () => {
  const r = Kpi_compute([], { now: NOW });
  assert.deepEqual(r.cards, { open_count: 0, overdue_count: 0, avg_response_hours: null, cost_this_month: 0 });
  assert.equal(r.kpi.maintenance_rate, null);
  assert.equal(r.kpi.lead_time_rate, null);
});

test('dashboard permission: ADMIN and VIEWER only', () => {
  const { Status_canViewDashboard } = require('../gas/core/Status.js');
  for (const role of ['ADMIN', 'VIEWER']) assert.equal(Status_canViewDashboard({ userId: 'U', role }), true, role);
  for (const role of ['STAFF', 'MANAGER', 'TECH', 'SYSTEM', '']) assert.equal(Status_canViewDashboard({ userId: 'U', role }), false, role);
  assert.equal(Status_canViewDashboard(null), false);
});
