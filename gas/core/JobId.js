// Pure job-id helpers. The counter itself is stored in Script Properties
// (key from JobId_counterKey) and incremented under a lock by the caller.

const JOBID_TZ_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok, no DST

/** 'YYMM' of the given instant in Asia/Bangkok. */
function JobId_yymm(date) {
  const d = new Date(date.getTime() + JOBID_TZ_OFFSET_MS);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return yy + mm;
}

function JobId_counterKey(yymm) {
  return 'JOB_SEQ_' + yymm;
}

function JobId_format(prefix, yymm, seq) {
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) {
    throw new RangeError('JobId_format: seq out of range: ' + seq);
  }
  return prefix + '-' + yymm + '-' + String(seq).padStart(4, '0');
}

/** Next id for `date`, given the month's last stored counter (empty = none yet). */
function JobId_next(prefix, date, lastSeq) {
  const yymm = JobId_yymm(date);
  const seq = (Number(lastSeq) || 0) + 1;
  return { yymm: yymm, key: JobId_counterKey(yymm), seq: seq, id: JobId_format(prefix, yymm, seq) };
}

function JobId_isValid(id, prefix) {
  if (typeof id !== 'string') return false;
  const m = /^([A-Za-z0-9]+)-\d{4}-\d{4}$/.exec(id);
  return m !== null && m[1] === (prefix || 'MT');
}

if (typeof module !== 'undefined') module.exports = { JobId_yymm, JobId_counterKey, JobId_format, JobId_next, JobId_isValid };
