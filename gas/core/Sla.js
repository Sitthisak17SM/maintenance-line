// Pure SLA logic (PLAN §11). Hours are calendar hours, 24/7.

const SLA_HOUR_MS = 3600 * 1000;

/** slaRows: objects from the SLA tab ({priority, response_hours, resolve_hours, ...}). */
function Sla_computeDueDates(createdAt, priority, slaRows) {
  if (!(createdAt instanceof Date) || isNaN(createdAt.getTime())) {
    throw new Error('Sla_computeDueDates: invalid createdAt');
  }
  const row = (slaRows || []).find(function (r) { return r.priority === priority; });
  if (!row) throw new Error('Sla_computeDueDates: unknown priority ' + priority);
  const responseHours = Sla_hours_(row.response_hours, 'response_hours');
  const resolveHours = Sla_hours_(row.resolve_hours, 'resolve_hours');
  const t = createdAt.getTime();
  return {
    response_due_at: new Date(t + responseHours * SLA_HOUR_MS),
    due_at: new Date(t + resolveHours * SLA_HOUR_MS),
  };
}

function Sla_hours_(value, name) {
  const n = value === '' || value === null || value === undefined ? NaN : Number(value);
  if (!isFinite(n) || n < 0) throw new Error('Sla_computeDueDates: invalid ' + name + ': ' + value);
  return n;
}

// Alert flags (PLAN §11). R* = response phase (until check-in), D* = repair phase (until done).
// *75 = REMIND_AT_PERCENT of the window has passed (to the technician), *B = breached (to ADMIN).
const SLA_FLAGS = ['R75', 'RB', 'D75', 'DB'];
const SLA_RESPONSE_STATUSES = ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED'];
const SLA_REPAIR_STATUSES = ['ACCEPTED', 'IN_PROGRESS'];

/**
 * Flags to send for `job` at `now`, leaving out those already in job.alert_flags.
 * remindPct defaults to 75 when blank or out of range.
 */
function Sla_pendingAlerts(job, now, remindPct) {
  const pct = Number(remindPct) > 0 && Number(remindPct) < 100 ? Number(remindPct) : 75;
  const sent = Sla_flags(job.alert_flags);
  const status = String(job.status || '');
  const created = Sla_time_(job.created_at);
  const t = now.getTime();
  const out = [];
  if (created === null) return out;

  if (SLA_RESPONSE_STATUSES.indexOf(status) !== -1 && !job.checkin_at && !job.done_at) {
    const due = Sla_time_(job.response_due_at);
    if (due !== null) {
      if (t >= created + (due - created) * pct / 100) out.push('R75');
      if (t > due) out.push('RB');
    }
  }
  if (SLA_REPAIR_STATUSES.indexOf(status) !== -1 && !job.done_at) {
    const due = Sla_time_(job.due_at);
    if (due !== null) {
      if (t >= created + (due - created) * pct / 100) out.push('D75');
      if (t > due) out.push('DB');
    }
  }
  return out.filter(function (f) { return sent.indexOf(f) === -1; });
}

/** True when a DONE job has waited AUTO_ACK_HOURS since done_at (0 or blank = never). */
function Sla_autoAckDue(job, now, hours) {
  const h = Number(hours);
  const done = Sla_time_(job.done_at);
  return String(job.status) === 'DONE' && h > 0 && done !== null && now.getTime() >= done + h * SLA_HOUR_MS;
}

/** alert_flags text -> list. */
function Sla_flags(value) {
  return String(value === undefined || value === null ? '' : value).split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
}

/** Adds flags to an alert_flags value without duplicates, in SLA_FLAGS order. */
function Sla_addFlags(value, flags) {
  const all = Sla_flags(value).concat(flags || []);
  return SLA_FLAGS.filter(function (f) { return all.indexOf(f) !== -1; })
    .concat(all.filter(function (f, i) { return SLA_FLAGS.indexOf(f) === -1 && all.indexOf(f) === i; }))
    .join(',');
}

function Sla_time_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return isNaN(t) ? null : t;
}

if (typeof module !== 'undefined') {
  module.exports = { SLA_FLAGS, Sla_computeDueDates, Sla_pendingAlerts, Sla_autoAckDue, Sla_flags, Sla_addFlags };
}
