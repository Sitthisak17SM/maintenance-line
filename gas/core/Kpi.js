// Dashboard KPI calculations (PLAN §13). Pure logic: no Google services.
// Returns only aggregates (plus the short overdue / repeat lists), never the raw rows.

const KPI_OPEN = ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS'];
const KPI_TZ_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok
const KPI_HOUR_MS = 3600 * 1000;
const KPI_LIST_MAX = 20;
const KPI_REPEAT_DAYS = 7;
const KPI_NO_TECH = '(ไม่ระบุ)';
const KPI_STAGES = ['accept', 'travel', 'repair', 'ack', 'total'];
const KPI_ACCEPT_TARGET_HOURS = 1; // when Config ACCEPT_TARGET_HOURS is blank or missing
// accepted_at is not cleared when a job is sent back out (reject, forward, reassign), so it only
// counts once the job is accepted again.
const KPI_UNACCEPTED = ['NEW', 'ASSIGNED', 'REJECTED'];

/**
 * jobs: Jobs rows. opts: {now: Date, from?: Date, to?: Date, branch_code?, category_code?, tech?,
 * accept_target_hours?}.
 * Filters by branch/category/tech apply everywhere. The date range (on created_at, `to` inclusive
 * to the end of that day) applies to the period figures; "now" figures (open, overdue,
 * cost this month) ignore it. Jobs without created_at (migrated, PLAN §14) only count when no
 * date range is given, and never in time-based KPIs.
 */
function Kpi_compute(jobs, opts) {
  opts = opts || {};
  const now = opts.now instanceof Date ? opts.now : new Date();
  const from = Kpi_time_(opts.from);
  const to = Kpi_time_(opts.to);
  const toEnd = to === null ? null : to + 24 * KPI_HOUR_MS - 1;
  const ranged = from !== null || to !== null;

  const base = (jobs || []).filter(function (j) {
    return j && j.job_id &&
      (!opts.branch_code || String(j.branch_code) === String(opts.branch_code)) &&
      (!opts.category_code || String(j.category_code) === String(opts.category_code)) &&
      (!opts.tech || Kpi_tech(j) === String(opts.tech));
  });
  const period = base.filter(function (j) {
    const c = Kpi_time_(j.created_at);
    if (c === null) return !ranged;
    return (from === null || c >= from) && (toEnd === null || c <= toEnd);
  });

  const open = base.filter(function (j) { return KPI_OPEN.indexOf(String(j.status)) !== -1; });
  const overdue = open.filter(function (j) { const d = Kpi_time_(j.due_at); return d !== null && d < now.getTime(); });
  const month = Kpi_month_(now.getTime());
  const costThisMonth = base.reduce(function (s, j) {
    const d = Kpi_time_(j.done_at);
    return d !== null && Kpi_month_(d) === month ? s + Kpi_num_(j.cost_total) : s;
  }, 0);

  const notCancelled = period.filter(function (j) { return String(j.status) !== 'CANCELLED'; });
  const closed = period.filter(function (j) { return String(j.status) === 'CLOSED'; });

  return {
    cards: {
      open_count: open.length,
      overdue_count: overdue.length,
      avg_response_hours: Kpi_avgResponse_(period),
      cost_this_month: Kpi_round_(costThisMonth, 2),
    },
    kpi: {
      total: period.length,
      maintenance_rate: Kpi_rate_(closed.length, notCancelled.length),
      lead_time_rate: Kpi_onTimeRate_(period),
      repeat_rate: Kpi_rate_(closed.filter(function (j) { return Kpi_true_(j.is_repeat); }).length, closed.length),
    },
    by_branch_status: Kpi_count_(period, function (j) { return [String(j.branch_code || ''), String(j.status || '')]; }, ['branch', 'status']),
    by_month_category: Kpi_count_(period.filter(function (j) { return Kpi_time_(j.created_at) !== null; }), function (j) {
      return [Kpi_month_(Kpi_time_(j.created_at)), String(j.category_code || '')];
    }, ['month', 'category']),
    by_tech: Kpi_byTech_(period),
    timing: Kpi_timing_(period, now, opts.accept_target_hours),
    cost_by_branch_month: Kpi_costByBranchMonth_(base, from, toEnd),
    overdue_list: overdue
      .sort(function (a, b) { return Kpi_time_(a.due_at) - Kpi_time_(b.due_at); })
      .slice(0, KPI_LIST_MAX)
      .map(function (j) {
        return {
          job_id: j.job_id, title: j.title, branch_code: j.branch_code, category_code: j.category_code,
          priority: j.priority, status: j.status, tech: Kpi_tech(j), due_at: new Date(Kpi_time_(j.due_at)).toISOString(),
          hours_overdue: Kpi_round_((now.getTime() - Kpi_time_(j.due_at)) / KPI_HOUR_MS, 1),
        };
      }),
    repeat_candidates: Kpi_repeats_(base),
    techs: base.map(Kpi_tech).filter(function (t, i, all) { return all.indexOf(t) === i; }).sort(),
    period_from: from === null ? '' : new Date(from).toISOString(),
    period_to: toEnd === null ? '' : new Date(toEnd).toISOString(),
  };
}

/**
 * Who handled the job: the contractor, else the technician's name, else "(ไม่ระบุ)". The
 * contractor comes first because on a vendor job the assignee is the ADMIN acting for them.
 */
function Kpi_tech(j) {
  return String(j.vendor || '').trim() || String(j.assignee_name || '').trim() || KPI_NO_TECH;
}

/** Response time (PLAN §11): check-in, else acceptance, minus created_at, in hours. */
function Kpi_responseHours(j) {
  const c = Kpi_time_(j.created_at);
  const r = Kpi_time_(j.checkin_at) !== null ? Kpi_time_(j.checkin_at) : Kpi_time_(j.accepted_at);
  return c === null || r === null || r < c ? null : (r - c) / KPI_HOUR_MS;
}

function Kpi_avgResponse_(jobs) {
  const hours = jobs.map(Kpi_responseHours).filter(function (h) { return h !== null; });
  return hours.length ? Kpi_round_(hours.reduce(function (s, h) { return s + h; }, 0) / hours.length, 1) : null;
}

/**
 * Hours spent in each stage of one job (PLAN §13), null where the stage has not happened:
 * accept = reported -> accepted, travel = accepted -> check-in, repair = check-in -> done
 * (accepted -> done when there was no check-in, so travel is inside it), ack = done -> closed,
 * total = reported -> done.
 */
function Kpi_stageHours(j) {
  const c = Kpi_time_(j.created_at);
  const a = KPI_UNACCEPTED.indexOf(String(j.status)) === -1 ? Kpi_time_(j.accepted_at) : null;
  const k = Kpi_time_(j.checkin_at);
  const d = Kpi_time_(j.done_at);
  const checkedIn = a !== null && k !== null && k >= a;
  return {
    accept: Kpi_span_(c, a),
    travel: checkedIn ? Kpi_span_(a, k) : null,
    repair: Kpi_span_(checkedIn ? k : a, d),
    ack: Kpi_span_(d, Kpi_time_(j.closed_at)),
    total: Kpi_span_(c, d),
  };
}

function Kpi_span_(start, end) {
  return start === null || end === null || end < start ? null : (end - start) / KPI_HOUR_MS;
}

/**
 * Stage medians (a few stuck jobs would drag an average), the share accepted within the target
 * (open jobs still waiting past it count as misses), the share of finished jobs that had a
 * check-in, and the same medians per technician and per branch.
 */
function Kpi_timing_(jobs, now, targetHours) {
  const target = Number(targetHours) > 0 ? Number(targetHours) : KPI_ACCEPT_TARGET_HOURS;
  const rows = jobs.map(function (j) { return { job: j, h: Kpi_stageHours(j) }; });
  let hit = 0;
  let counted = 0;
  rows.forEach(function (r) {
    if (r.h.accept !== null) {
      counted++;
      if (r.h.accept <= target) hit++;
      return;
    }
    const c = Kpi_time_(r.job.created_at);
    if (c !== null && KPI_UNACCEPTED.indexOf(String(r.job.status)) !== -1 && now.getTime() - c > target * KPI_HOUR_MS) counted++;
  });
  const worked = rows.filter(function (r) { return r.h.repair !== null; });
  return {
    accept_target_hours: target,
    stages: Kpi_stageMedians_(rows, true),
    accept_on_time_rate: Kpi_rate_(hit, counted),
    accept_on_time_jobs: counted,
    checkin_rate: Kpi_rate_(worked.filter(function (r) { return r.h.travel !== null; }).length, worked.length),
    by_tech: Kpi_timingBy_(rows, 'tech', Kpi_tech),
    by_branch: Kpi_timingBy_(rows, 'branch', function (j) { return String(j.branch_code || ''); }),
  };
}

/** {stage: {median_hours, jobs}} when withCounts, else {stage: median_hours}. */
function Kpi_stageMedians_(rows, withCounts) {
  const out = {};
  KPI_STAGES.forEach(function (s) {
    const hours = rows.map(function (r) { return r.h[s]; }).filter(function (h) { return h !== null; });
    const m = Kpi_median_(hours);
    out[s] = withCounts ? { median_hours: m, jobs: hours.length } : m;
  });
  return out;
}

/** [{<key>, jobs, accept, travel, repair, ack, total}] for groups with at least one timed stage. */
function Kpi_timingBy_(rows, key, keyFn) {
  const groups = {};
  rows.forEach(function (r) {
    if (!KPI_STAGES.some(function (s) { return r.h[s] !== null; })) return;
    const k = keyFn(r.job);
    (groups[k] = groups[k] || []).push(r);
  });
  return Object.keys(groups).sort().map(function (k) {
    const row = {};
    row[key] = k;
    row.jobs = groups[k].length;
    return Object.assign(row, Kpi_stageMedians_(groups[k], false));
  });
}

function Kpi_median_(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort(function (a, b) { return a - b; });
  const mid = Math.floor(s.length / 2);
  return Kpi_round_(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, 2);
}

/** Lead Time KPI: done on or before due_at, over jobs that are done and had a due date. */
function Kpi_onTimeRate_(jobs) {
  const done = jobs.filter(function (j) { return Kpi_time_(j.done_at) !== null && Kpi_time_(j.due_at) !== null; });
  return Kpi_rate_(done.filter(function (j) { return Kpi_time_(j.done_at) <= Kpi_time_(j.due_at); }).length, done.length);
}

function Kpi_byTech_(jobs) {
  const groups = {};
  jobs.forEach(function (j) { (groups[Kpi_tech(j)] = groups[Kpi_tech(j)] || []).push(j); });
  return Object.keys(groups).sort().map(function (t) {
    return { tech: t, jobs: groups[t].length, avg_response_hours: Kpi_avgResponse_(groups[t]), on_time_rate: Kpi_onTimeRate_(groups[t]) };
  });
}

/** Cost by the month the job was done (done_at), within the date range when one is given. */
function Kpi_costByBranchMonth_(jobs, from, toEnd) {
  const sums = {};
  jobs.forEach(function (j) {
    const d = Kpi_time_(j.done_at);
    if (d === null || (from !== null && d < from) || (toEnd !== null && d > toEnd)) return;
    const k = String(j.branch_code || '') + '|' + Kpi_month_(d);
    sums[k] = (sums[k] || 0) + Kpi_num_(j.cost_total);
  });
  return Object.keys(sums).sort().map(function (k) {
    const p = k.split('|');
    return { branch: p[0], month: p[1], cost: Kpi_round_(sums[k], 2), budget: null };
  });
}

/**
 * PLAN §13: a job in the same branch + area + category created within 7 days after an earlier
 * one was closed (closed_at, else done_at). Jobs without an area are skipped (too broad).
 */
function Kpi_repeats_(jobs) {
  const groups = {};
  jobs.forEach(function (j) {
    const area = String(j.area || '').trim();
    if (!area || Kpi_time_(j.created_at) === null) return;
    const k = [j.branch_code, area, j.category_code].join('|');
    (groups[k] = groups[k] || []).push(j);
  });
  const out = [];
  Object.keys(groups).forEach(function (k) {
    const list = groups[k].sort(function (a, b) { return Kpi_time_(a.created_at) - Kpi_time_(b.created_at); });
    list.forEach(function (j) {
      const c = Kpi_time_(j.created_at);
      const prev = list.filter(function (p) {
        const end = Kpi_time_(p.closed_at) !== null ? Kpi_time_(p.closed_at) : Kpi_time_(p.done_at);
        return p !== j && end !== null && end <= c && c - end <= KPI_REPEAT_DAYS * 24 * KPI_HOUR_MS;
      }).pop();
      if (prev) {
        out.push({
          job_id: j.job_id, previous_job_id: prev.job_id, branch_code: j.branch_code, area: String(j.area).trim(),
          category_code: j.category_code, title: j.title, created_at: new Date(c).toISOString(),
        });
      }
    });
  });
  return out.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, KPI_LIST_MAX);
}

/** [{<keys[0]>, <keys[1]>, count}] for the pair returned by keyFn, sorted by key. */
function Kpi_count_(jobs, keyFn, keys) {
  const counts = {};
  jobs.forEach(function (j) { const k = keyFn(j).join('|'); counts[k] = (counts[k] || 0) + 1; });
  return Object.keys(counts).sort().map(function (k) {
    const p = k.split('|');
    const row = {};
    row[keys[0]] = p[0];
    row[keys[1]] = p[1];
    row.count = counts[k];
    return row;
  });
}

/** 'YYYY-MM' of an instant in Asia/Bangkok. */
function Kpi_month_(t) {
  return new Date(t + KPI_TZ_OFFSET_MS).toISOString().slice(0, 7);
}

function Kpi_rate_(n, d) {
  return d ? Kpi_round_(n / d, 4) : null;
}

function Kpi_round_(x, digits) {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

function Kpi_num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function Kpi_true_(v) {
  return v === true || /^(true|1)$/i.test(String(v === undefined || v === null ? '' : v).trim());
}

function Kpi_time_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return isNaN(t) ? null : t;
}

if (typeof module !== 'undefined') module.exports = { Kpi_compute, Kpi_tech, Kpi_responseHours, Kpi_stageHours };
