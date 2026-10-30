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

if (typeof module !== 'undefined') module.exports = { Sla_computeDueDates };
