const test = require('node:test');
const assert = require('node:assert/strict');
const { JobId_yymm, JobId_counterKey, JobId_format, JobId_next, JobId_isValid } = require('../gas/core/JobId.js');

test('JobId_yymm uses Asia/Bangkok time', () => {
  assert.equal(JobId_yymm(new Date('2026-11-05T03:00:00Z')), '2611');
  // 31 Oct 18:00 UTC is already 1 Nov 01:00 in Bangkok
  assert.equal(JobId_yymm(new Date('2026-10-31T18:00:00Z')), '2611');
  assert.equal(JobId_yymm(new Date('2026-10-31T16:59:59Z')), '2610');
});

test('JobId_counterKey is per month', () => {
  assert.equal(JobId_counterKey('2611'), 'JOB_SEQ_2611');
});

test('JobId_format pads the sequence to 4 digits', () => {
  assert.equal(JobId_format('MT', '2611', 1), 'MT-2611-0001');
  assert.equal(JobId_format('MT', '2611', 9999), 'MT-2611-9999');
});

test('JobId_format rejects out-of-range sequences', () => {
  assert.throws(() => JobId_format('MT', '2611', 0), RangeError);
  assert.throws(() => JobId_format('MT', '2611', 10000), RangeError);
  assert.throws(() => JobId_format('MT', '2611', 1.5), RangeError);
});

test('JobId_next continues the counter within a month', () => {
  const r = JobId_next('MT', new Date('2026-11-05T03:00:00Z'), 41);
  assert.deepEqual(r, { yymm: '2611', key: 'JOB_SEQ_2611', seq: 42, id: 'MT-2611-0042' });
});

test('JobId_next starts at 1 when the month has no counter yet', () => {
  for (const last of [null, undefined, '', 0]) {
    assert.equal(JobId_next('MT', new Date('2026-12-01T00:00:00Z'), last).id, 'MT-2612-0001');
  }
});

test('JobId_next accepts the stored counter as a string', () => {
  assert.equal(JobId_next('MT', new Date('2026-11-05T03:00:00Z'), '7').id, 'MT-2611-0008');
});

test('JobId_isValid matches MT-YYMM-NNNN', () => {
  assert.equal(JobId_isValid('MT-2611-0001'), true);
  assert.equal(JobId_isValid(' MT-2611-0001'), false);
  assert.equal(JobId_isValid('MT-261-0001'), false);
  assert.equal(JobId_isValid('XX-2611-0001'), false);
  assert.equal(JobId_isValid('XX-2611-0001', 'XX'), true);
  assert.equal(JobId_isValid(null), false);
});
