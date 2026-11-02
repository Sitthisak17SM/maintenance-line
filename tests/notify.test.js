const test = require('node:test');
const assert = require('node:assert/strict');
const { Notify_flag, Notify_acceptRecipients, Notify_ackRecipients } = require('../gas/core/Notify.js');

const ACTIVE = ['U_REP', 'U_TECH', 'U_ADM'];
const tech = { userId: 'U_TECH', role: 'TECH' };
const reporter = { userId: 'U_REP', role: 'STAFF' };
const job = (extra) => Object.assign({ job_id: 'MT-2611-0001', reporter_id: 'U_REP', assignee_id: 'U_TECH', onsite_note: '' }, extra);

test('Notify_flag: on unless FALSE', () => {
  for (const v of [undefined, null, '', ' ', 'TRUE', true, '1', 'yes']) assert.equal(Notify_flag(v), true, String(v));
  for (const v of ['FALSE', 'false', false, '0', 0, 'no']) assert.equal(Notify_flag(v), false, String(v));
});

test('accept: the reporter, not the person who accepted, only if active', () => {
  assert.deepEqual(Notify_acceptRecipients(job(), tech, ACTIVE), ['U_REP']);
  assert.deepEqual(Notify_acceptRecipients(job({ reporter_id: 'U_TECH' }), tech, ACTIVE), []); // reported it themselves
  assert.deepEqual(Notify_acceptRecipients(job({ reporter_id: 'U_GONE' }), tech, ACTIVE), []);
  assert.deepEqual(Notify_acceptRecipients(job({ reporter_id: '' }), tech, ACTIVE), []);
});

test('ack: the technician, only for a job closed with nobody at the site', () => {
  assert.deepEqual(Notify_ackRecipients(job(), reporter, ACTIVE), []);
  assert.deepEqual(Notify_ackRecipients(job({ onsite_note: '  ' }), reporter, ACTIVE), []);
  const away = job({ onsite_note: 'ร้านยังไม่เปิด' });
  assert.deepEqual(Notify_ackRecipients(away, reporter, ACTIVE), ['U_TECH']);
  assert.deepEqual(Notify_ackRecipients(away, { userId: 'AUTO', role: 'SYSTEM' }, ACTIVE), ['U_TECH']); // auto_ack
  assert.deepEqual(Notify_ackRecipients(away, tech, ACTIVE), []); // the assignee acked it (e.g. an ADMIN)
  assert.deepEqual(Notify_ackRecipients(job({ onsite_note: 'x', assignee_id: 'U_GONE' }), reporter, ACTIVE), []);
});
