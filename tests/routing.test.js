const test = require('node:test');
const assert = require('node:assert/strict');
const { Routing_route, Routing_idsWithRole, Routing_isActiveUser, Routing_isTrue } = require('../gas/core/Routing.js');

const USERS = [
  { line_user_id: 'U_T1', role: 'TECH', active: true },
  { line_user_id: 'U_T2', role: 'TECH', active: 'TRUE' },
  { line_user_id: 'U_T_OFF', role: 'TECH', active: false },
  { line_user_id: 'U_ADM', role: 'ADMIN', active: true },
  { line_user_id: 'U_ADM_OFF', role: 'ADMIN', active: 'FALSE' },
  { line_user_id: 'U_STF', role: 'STAFF', active: true },
];
const ELEC = { category_code: 'ELEC', route_to: 'TECH', assignee_user_id: '' };
const KITCHEN = { category_code: 'KITCHEN', route_to: 'ADMIN', assignee_user_id: '' };

test('TECH category goes to every active TECH', () => {
  assert.deepEqual(Routing_route(ELEC, USERS), { route_to: 'TECH', candidate_ids: ['U_T1', 'U_T2'] });
});

test('ADMIN category goes to every active ADMIN', () => {
  assert.deepEqual(Routing_route(KITCHEN, USERS), { route_to: 'ADMIN', candidate_ids: ['U_ADM'] });
});

test('a fixed assignee_user_id wins over route_to', () => {
  const cat = Object.assign({}, KITCHEN, { assignee_user_id: ' U_T2 ' });
  assert.deepEqual(Routing_route(cat, USERS), { route_to: 'ADMIN', candidate_ids: ['U_T2'] });
});

test('an inactive or unknown fixed assignee falls back to the role rule', () => {
  assert.deepEqual(Routing_route(Object.assign({}, ELEC, { assignee_user_id: 'U_T_OFF' }), USERS).candidate_ids, ['U_T1', 'U_T2']);
  assert.deepEqual(Routing_route(Object.assign({}, KITCHEN, { assignee_user_id: 'U_GONE' }), USERS).candidate_ids, ['U_ADM']);
});

test('no active TECH -> active ADMINs, route_to stays TECH', () => {
  const users = USERS.filter((u) => u.role !== 'TECH');
  assert.deepEqual(Routing_route(ELEC, users), { route_to: 'TECH', candidate_ids: ['U_ADM'] });
});

test('nobody to send to -> empty candidates (job becomes NEW)', () => {
  const users = USERS.filter((u) => u.role === 'STAFF');
  assert.deepEqual(Routing_route(ELEC, users), { route_to: 'TECH', candidate_ids: [] });
  assert.deepEqual(Routing_route(KITCHEN, []), { route_to: 'ADMIN', candidate_ids: [] });
});

test('route_to is read case-insensitively; anything but TECH means ADMIN', () => {
  assert.equal(Routing_route({ route_to: ' tech ' }, USERS).route_to, 'TECH');
  assert.equal(Routing_route({ route_to: 'ADMIN (รอคอนเฟิร์ม)' }, USERS).route_to, 'ADMIN');
  assert.equal(Routing_route({ route_to: '' }, USERS).route_to, 'ADMIN');
  assert.equal(Routing_route(null, USERS).route_to, 'ADMIN');
});

test('Routing_idsWithRole skips inactive users and rows without an id', () => {
  assert.deepEqual(Routing_idsWithRole(USERS.concat([{ line_user_id: '', role: 'ADMIN', active: true }]), 'ADMIN'), ['U_ADM']);
});

test('Routing_isTrue handles sheet booleans', () => {
  for (const v of [true, 'TRUE', 'true', ' True ', '1', 1, 'yes']) assert.equal(Routing_isTrue(v), true, String(v));
  for (const v of [false, 'FALSE', '', null, undefined, 0, 'no']) assert.equal(Routing_isTrue(v), false, String(v));
});

test('Routing_isActiveUser', () => {
  assert.equal(Routing_isActiveUser(USERS[0]), true);
  assert.equal(Routing_isActiveUser(USERS[2]), false);
  assert.equal(Routing_isActiveUser({ line_user_id: 'U', role: 'TECH' }), false);
  assert.equal(Routing_isActiveUser(null), false);
});
