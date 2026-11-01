// Job state machine and permissions (PLAN §2–3). Pure logic: no Google services.
// Every permission rule lives here so open questions (REQUIREMENTS Q3/Q5) change in one place.

const STATUS = {
  NEW: 'NEW', ASSIGNED: 'ASSIGNED', ACCEPTED: 'ACCEPTED', IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE', CLOSED: 'CLOSED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED',
};
const STATUS_OPEN = ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS'];
const STATUS_ROLES = ['STAFF', 'MANAGER', 'TECH', 'ADMIN', 'VIEWER'];
const STATUS_LABEL_TH = {
  NEW: 'รอจ่ายงาน', ASSIGNED: 'รอช่างรับงาน', ACCEPTED: 'รับงานแล้ว', IN_PROGRESS: 'กำลังซ่อม',
  DONE: 'รอรับทราบ', CLOSED: 'ปิดงานแล้ว', REJECTED: 'ถูกปฏิเสธ', CANCELLED: 'ยกเลิก',
};
const STATUS_REASON_MAX = 500;
const STATUS_TEXT_MAX = 2000;
const STATUS_PARTS_MAX = 30;
const STATUS_PRIORITIES = ['EMERGENCY', 'URGENT', 'NORMAL', 'PREVENTIVE'];
// Sla_tick acts as this role (auto_ack); no Users row can have it because it is not in STATUS_ROLES.
const STATUS_SYSTEM_ROLE = 'SYSTEM';
const STATUS_SYSTEM_ACTOR = { userId: 'AUTO', name: 'ระบบ', role: 'SYSTEM', branch_code: '' };

// Who may run each phase-1 action, and from which statuses (PLAN §3 table).
// `stateError` is the code returned when the status is wrong: a late "accept" is a CONFLICT
// (someone else got the job first), everything else is INVALID_STATE.
const STATUS_RULES = {
  create: {
    from: null,
    who: function (job, a) { return ['STAFF', 'MANAGER', 'TECH', 'ADMIN'].indexOf(a.role) !== -1; },
  },
  accept: {
    from: ['ASSIGNED'],
    stateError: 'CONFLICT',
    who: function (job, a) { return Status_isCandidate(job, a) || a.role === 'ADMIN'; },
  },
  reject: {
    from: ['ASSIGNED', 'ACCEPTED'],
    who: function (job, a) { return Status_isHolder_(job, a); },
  },
  forward: {
    from: ['ASSIGNED', 'ACCEPTED'],
    who: function (job, a) { return a.role === 'TECH' && Status_isHolder_(job, a); },
  },
  reassign: {
    from: ['NEW', 'REJECTED', 'ASSIGNED', 'ACCEPTED'],
    who: function (job, a) { return a.role === 'ADMIN'; },
  },
  checkin: {
    from: ['ACCEPTED'],
    who: function (job, a) { return Status_isAssignee(job, a) || a.role === 'ADMIN'; },
  },
  close: {
    from: ['ACCEPTED', 'IN_PROGRESS'],
    who: function (job, a) { return Status_isAssignee(job, a) || a.role === 'ADMIN'; },
  },
  ack: {
    from: ['DONE'],
    who: function (job, a) {
      return Status_isReporter(job, a) || a.role === 'ADMIN' ||
        (a.role === 'MANAGER' && Status_sameBranch_(job, a));
    },
  },

  // --- phase 2 (PLAN §3). These keep the status; `when` is an extra precondition on the job
  // (checked after `from`, reported as INVALID_STATE) and also hides the action in allowedActions.
  request_ext: {
    from: ['ACCEPTED', 'IN_PROGRESS'],
    who: function (job, a) { return Status_isAssignee(job, a); },
    when: function (job) { return Status_isTrue_(job.ext_pending) ? 'งานนี้มีคำขอเลื่อนที่รออนุมัติอยู่แล้ว' : ''; },
  },
  decide_ext: {
    from: ['ACCEPTED', 'IN_PROGRESS'],
    who: function (job, a) { return a.role === 'ADMIN'; },
    when: function (job) { return Status_isTrue_(job.ext_pending) ? '' : 'งานนี้ไม่มีคำขอเลื่อนที่รออนุมัติ'; },
  },
  set_priority: {
    from: ['NEW', 'ASSIGNED', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS', 'DONE'],
    who: function (job, a) { return a.role === 'ADMIN'; },
  },
  cancel: {
    from: STATUS_OPEN,
    who: function (job, a) { return a.role === 'ADMIN'; },
  },
  // Run by Sla_tick with the system actor, never by a person.
  auto_ack: {
    from: ['DONE'],
    who: function (job, a) { return a.role === STATUS_SYSTEM_ROLE; },
  },
};

/**
 * Validates `action` on `job` by `actor` and returns what to write:
 *   {status, fields: {column: value}, log: {action, from_status, to_status, reason, old_value, new_value}, parts?}
 * Throws Status_error with code FORBIDDEN, INVALID_STATE, CONFLICT or VALIDATION.
 *
 * job:   a Jobs row (null for create).
 * actor: {userId, name, role, branch_code}.
 * input: {now: Date, ...action-specific values, see each case below}.
 */
function Status_transition(job, action, actor, input) {
  const rule = Object.prototype.hasOwnProperty.call(STATUS_RULES, action) ? STATUS_RULES[action] : null;
  if (!rule) throw Status_error('VALIDATION', 'ไม่รู้จักคำสั่ง: ' + action);
  if (!actor || !actor.userId) throw Status_error('FORBIDDEN', 'ไม่ทราบผู้ใช้');
  input = input || {};
  const now = input.now;
  if (!(now instanceof Date) || isNaN(now.getTime())) throw new Error('Status_transition: input.now must be a Date');

  if (action !== 'create' && !job) throw Status_error('NOT_FOUND', 'ไม่พบงาน');
  if (!rule.who(job, actor)) throw Status_error('FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้กับงานนี้');
  const from = job ? String(job.status || '') : '';
  if (rule.from && rule.from.indexOf(from) === -1) {
    throw Status_error(rule.stateError || 'INVALID_STATE', Status_stateMessage_(action, job));
  }
  const blocked = rule.when ? rule.when(job) : '';
  if (blocked) throw Status_error('INVALID_STATE', blocked);

  const r = Status_apply_[action](job, actor, input, now);
  r.fields.status = r.status;
  r.fields.updated_at = now;
  r.log = {
    action: action,
    from_status: from,
    to_status: r.status,
    reason: r.reason || '',
    old_value: r.old_value || '',
    new_value: r.new_value || '',
  };
  delete r.reason;
  delete r.old_value;
  delete r.new_value;
  return r;
}

const Status_apply_ = {
  // input.candidate_ids: userIds from Routing_route (empty -> NEW, nobody to send to).
  create: function (job, actor, input, now) {
    const candidates = Status_ids_(input.candidate_ids);
    const status = candidates.length ? 'ASSIGNED' : 'NEW';
    return {
      status: status,
      fields: {
        created_at: now,
        candidate_ids: candidates.join(','),
        assigned_at: candidates.length ? now : '',
        assignee_id: '', assignee_name: '',
        reject_count: 0, ext_count: 0, ext_pending: false,
      },
    };
  },

  accept: function (job, actor, input, now) {
    return {
      status: 'ACCEPTED',
      fields: { accepted_at: now, assignee_id: actor.userId, assignee_name: actor.name || '' },
    };
  },

  // input.reason (required).
  reject: function (job, actor, input, now) {
    return {
      status: 'REJECTED',
      reason: Status_requireText_(input.reason, 'เหตุผล', STATUS_REASON_MAX),
      fields: { reject_count: (Number(job.reject_count) || 0) + 1, assignee_id: '', assignee_name: '' },
    };
  },

  // input.reason (required), input.admin_ids: active ADMIN userIds (empty -> NEW).
  forward: function (job, actor, input, now) {
    const admins = Status_ids_(input.admin_ids);
    return {
      status: admins.length ? 'ASSIGNED' : 'NEW',
      reason: Status_requireText_(input.reason, 'เหตุผล', STATUS_REASON_MAX),
      fields: {
        route_to: 'ADMIN', candidate_ids: admins.join(','),
        assignee_id: '', assignee_name: '', assigned_at: now,
      },
    };
  },

  // Either input.target {userId, role} (an active TECH or ADMIN) or input.vendor (name);
  // for a vendor job the acting ADMIN becomes the only candidate (PLAN §2).
  reassign: function (job, actor, input, now) {
    const vendor = String(input.vendor || '').trim();
    const target = input.target;
    if (!vendor && !(target && target.userId)) throw Status_error('VALIDATION', 'กรุณาเลือกช่างหรือช่างนอก');
    if (vendor && target && target.userId) throw Status_error('VALIDATION', 'เลือกช่างหรือช่างนอกอย่างใดอย่างหนึ่ง');
    let candidate, routeTo;
    if (vendor) {
      candidate = actor.userId;
      routeTo = 'ADMIN';
    } else {
      if (target.role !== 'TECH' && target.role !== 'ADMIN') {
        throw Status_error('VALIDATION', 'จ่ายงานได้เฉพาะช่าง (TECH) หรือ ADMIN');
      }
      candidate = target.userId;
      routeTo = target.role;
    }
    const before = { candidate_ids: String(job.candidate_ids || ''), assignee_id: String(job.assignee_id || ''), vendor: String(job.vendor || '') };
    const after = { candidate_ids: candidate, assignee_id: '', vendor: vendor };
    return {
      status: 'ASSIGNED',
      reason: String(input.reason || '').trim().slice(0, STATUS_REASON_MAX),
      old_value: JSON.stringify(before),
      new_value: JSON.stringify(after),
      fields: {
        route_to: routeTo, candidate_ids: candidate, vendor: vendor,
        assignee_id: '', assignee_name: '', assigned_at: now,
      },
    };
  },

  checkin: function (job, actor, input, now) {
    return { status: 'IN_PROGRESS', fields: { checkin_at: now } };
  },

  // input: cause, fix (optional since 30 Oct 2026, see REQUIREMENTS R12), parts
  // [{item, qty, unit_price, vendor, note}], photos_after (file IDs, at least 1, PLAN §9), onsite_note.
  close: function (job, actor, input, now) {
    const cause = String(input.cause || '').trim().slice(0, STATUS_TEXT_MAX);
    const fix = String(input.fix || '').trim().slice(0, STATUS_TEXT_MAX);
    const photos = Status_ids_(input.photos_after);
    if (!photos.length) throw Status_error('VALIDATION', 'ต้องแนบรูปหลังซ่อมอย่างน้อย 1 รูป');
    const parts = Status_parts(input.parts);
    const total = parts.reduce(function (sum, p) { return sum + p.amount; }, 0);
    return {
      status: 'DONE',
      new_value: String(total),
      parts: parts,
      fields: {
        done_at: now, cause: cause, fix: fix, cost_total: total,
        photos_after: photos.join(','),
        onsite_note: String(input.onsite_note || '').trim().slice(0, STATUS_TEXT_MAX),
      },
    };
  },

  ack: function (job, actor, input, now) {
    return { status: 'CLOSED', fields: { closed_at: now, ack_by: actor.userId, ack_at: now } };
  },

  // input.reason (required), input.new_due_at (Date after now and after the current due_at).
  request_ext: function (job, actor, input, now) {
    const reason = Status_requireText_(input.reason, 'เหตุผล', STATUS_REASON_MAX);
    const newDue = Status_date_(input.new_due_at);
    if (!newDue) throw Status_error('VALIDATION', 'กรุณาเลือกวันเสร็จใหม่');
    if (newDue.getTime() <= now.getTime()) throw Status_error('VALIDATION', 'วันเสร็จใหม่ต้องอยู่หลังเวลาปัจจุบัน');
    const due = Status_date_(job.due_at);
    if (due && newDue.getTime() <= due.getTime()) throw Status_error('VALIDATION', 'วันเสร็จใหม่ต้องอยู่หลังกำหนดเดิม');
    return {
      status: job.status,
      reason: reason,
      old_value: Status_iso_(due),
      new_value: newDue.toISOString(),
      fields: { ext_pending: true, ext_requested_due_at: newDue, ext_reason: reason },
    };
  },

  // input.approve (boolean), input.note (optional). Approval moves due_at and clears D75/DB.
  decide_ext: function (job, actor, input, now) {
    const approve = input.approve === true;
    const requested = Status_date_(job.ext_requested_due_at);
    if (approve && !requested) throw Status_error('VALIDATION', 'คำขอเลื่อนไม่มีวันที่ใหม่');
    const fields = { ext_pending: false };
    if (approve) {
      fields.due_at = requested;
      fields.ext_count = (Number(job.ext_count) || 0) + 1;
      fields.alert_flags = Status_flags_(job.alert_flags).filter(function (f) { return f !== 'D75' && f !== 'DB'; }).join(',');
    }
    return {
      status: job.status,
      reason: String(input.note || '').trim().slice(0, STATUS_REASON_MAX),
      old_value: Status_iso_(Status_date_(job.due_at)),
      new_value: approve ? requested.toISOString() : 'ไม่อนุมัติ',
      fields: fields,
      approved: approve,
    };
  },

  // input.priority, input.due {response_due_at, due_at} computed from created_at by the caller
  // (Sla_computeDueDates), input.reason (optional). Clears every alert flag.
  set_priority: function (job, actor, input, now) {
    const priority = String(input.priority || '').trim().toUpperCase();
    if (STATUS_PRIORITIES.indexOf(priority) === -1) throw Status_error('VALIDATION', 'กรุณาเลือกความเร่งด่วน');
    if (priority === String(job.priority || '')) throw Status_error('VALIDATION', 'ความเร่งด่วนเหมือนเดิม');
    const due = input.due || {};
    if (!Status_date_(due.response_due_at) || !Status_date_(due.due_at)) throw new Error('set_priority: input.due is required');
    return {
      status: job.status,
      reason: String(input.reason || '').trim().slice(0, STATUS_REASON_MAX),
      old_value: JSON.stringify({ priority: job.priority, response_due_at: Status_iso_(Status_date_(job.response_due_at)), due_at: Status_iso_(Status_date_(job.due_at)) }),
      new_value: JSON.stringify({ priority: priority, response_due_at: Status_iso_(due.response_due_at), due_at: Status_iso_(due.due_at) }),
      fields: { priority: priority, response_due_at: due.response_due_at, due_at: due.due_at, alert_flags: '' },
    };
  },

  // input.reason (required). A pending extension request is dropped with the job.
  cancel: function (job, actor, input, now) {
    return {
      status: 'CANCELLED',
      reason: Status_requireText_(input.reason, 'เหตุผล', STATUS_REASON_MAX),
      fields: { ext_pending: false },
    };
  },

  auto_ack: function (job, actor, input, now) {
    return { status: 'CLOSED', fields: { closed_at: now, ack_by: 'AUTO', ack_at: now } };
  },
};

/** Normalizes closeJob parts: drops blank rows, validates numbers, computes amount = qty × unit_price. */
function Status_parts(parts) {
  if (parts === undefined || parts === null || parts === '') return [];
  if (!Array.isArray(parts)) throw Status_error('VALIDATION', 'รายการอะไหล่ไม่ถูกต้อง');
  const rows = parts.filter(function (p) {
    return p && (String(p.item || '').trim() || p.qty || p.unit_price);
  });
  if (rows.length > STATUS_PARTS_MAX) throw Status_error('VALIDATION', 'รายการอะไหล่เกิน ' + STATUS_PARTS_MAX + ' รายการ');
  return rows.map(function (p, i) {
    const n = i + 1;
    const item = String(p.item || '').trim();
    if (!item) throw Status_error('VALIDATION', 'อะไหล่แถวที่ ' + n + ': กรุณาใส่ชื่อรายการ');
    const qty = Number(p.qty);
    const price = Number(p.unit_price);
    if (!isFinite(qty) || qty <= 0) throw Status_error('VALIDATION', 'อะไหล่แถวที่ ' + n + ': จำนวนต้องมากกว่า 0');
    if (!isFinite(price) || price < 0) throw Status_error('VALIDATION', 'อะไหล่แถวที่ ' + n + ': ราคาต่อหน่วยไม่ถูกต้อง');
    return {
      line_no: n, item: item.slice(0, 200), qty: qty, unit_price: price,
      amount: Math.round(qty * price * 100) / 100,
      vendor: String(p.vendor || '').trim().slice(0, 200),
      note: String(p.note || '').trim().slice(0, 500),
    };
  });
}

/** getJob permission (PLAN §6): reporter, candidate/assignee, MANAGER of the branch, ADMIN, VIEWER. */
function Status_canView(job, actor) {
  if (!job || !actor || !actor.userId) return false;
  return actor.role === 'ADMIN' || actor.role === 'VIEWER' ||
    Status_isReporter(job, actor) || Status_isCandidate(job, actor) || Status_isAssignee(job, actor) ||
    (actor.role === 'MANAGER' && Status_sameBranch_(job, actor));
}

/** Phase-1 actions (except create) the actor may run on the job right now; drives the buttons in job.html. */
function Status_allowedActions(job, actor) {
  if (!job || !actor || !actor.userId) return [];
  return Object.keys(STATUS_RULES).filter(function (action) {
    const rule = STATUS_RULES[action];
    return action !== 'create' && action !== 'auto_ack' && rule.from.indexOf(String(job.status)) !== -1 &&
      rule.who(job, actor) && !(rule.when && rule.when(job));
  });
}

// listJobs scopes (PLAN §6): mine = reported by me, assigned = sent to me,
// branch = my branch (MANAGER) or any branch (ADMIN, VIEWER), all = ADMIN, VIEWER.
const STATUS_SCOPE_ROLES = {
  mine: ['STAFF', 'MANAGER', 'TECH', 'ADMIN', 'VIEWER'],
  assigned: ['STAFF', 'MANAGER', 'TECH', 'ADMIN', 'VIEWER'],
  branch: ['MANAGER', 'ADMIN', 'VIEWER'],
  all: ['ADMIN', 'VIEWER'],
};

/** PLAN §13: the dashboard is for ADMIN and VIEWER only. */
function Status_canViewDashboard(actor) {
  return !!actor && (actor.role === 'ADMIN' || actor.role === 'VIEWER');
}

function Status_canListScope(scope, actor) {
  const roles = Object.prototype.hasOwnProperty.call(STATUS_SCOPE_ROLES, scope) ? STATUS_SCOPE_ROLES[scope] : null;
  return !!(roles && actor && roles.indexOf(actor.role) !== -1);
}

/** True if the job belongs in `scope` for `actor`. `branchCode` narrows branch/all scopes for ADMIN and VIEWER. */
function Status_inScope(job, scope, actor, branchCode) {
  switch (scope) {
    case 'mine': return Status_isReporter(job, actor);
    case 'assigned': return Status_isCandidate(job, actor) || Status_isAssignee(job, actor);
    case 'branch':
      if (actor.role === 'MANAGER') return Status_sameBranch_(job, actor);
      return !branchCode || String(job.branch_code) === String(branchCode);
    case 'all': return !branchCode || String(job.branch_code) === String(branchCode);
    default: return false;
  }
}

function Status_isOpen(status) {
  return STATUS_OPEN.indexOf(String(status)) !== -1;
}

function Status_isReporter(job, a) {
  return !!job && String(job.reporter_id || '').trim() === a.userId;
}

function Status_isAssignee(job, a) {
  return !!job && String(job.assignee_id || '').trim() === a.userId;
}

function Status_isCandidate(job, a) {
  return !!job && Status_ids_(job.candidate_ids).indexOf(a.userId) !== -1;
}

/** Candidate while waiting for someone to accept; once accepted, only the assignee. */
function Status_isHolder_(job, a) {
  if (String(job.status) === 'ACCEPTED') return Status_isAssignee(job, a);
  return Status_isCandidate(job, a) || Status_isAssignee(job, a);
}

function Status_sameBranch_(job, a) {
  return !!a.branch_code && String(job.branch_code || '') === String(a.branch_code);
}

/** Accepts "U1,U2", ["U1", "U2"] or empty; returns trimmed, non-empty ids. */
/** Sheet booleans arrive as true/false or as text ("TRUE"). */
function Status_isTrue_(value) {
  return value === true || /^(true|1|yes)$/i.test(String(value === undefined || value === null ? '' : value).trim());
}

/** A valid Date from a Date or a date string, else null. */
function Status_date_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function Status_iso_(date) {
  return date ? date.toISOString() : '';
}

function Status_flags_(value) {
  return String(value === undefined || value === null ? '' : value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function Status_ids_(value) {
  const list = Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split(',');
  return list.map(function (s) { return String(s).trim(); }).filter(Boolean);
}

function Status_requireText_(value, label, max) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw Status_error('VALIDATION', 'กรุณากรอก' + label);
  if (text.length > max) throw Status_error('VALIDATION', label + 'ยาวเกิน ' + max + ' ตัวอักษร');
  return text;
}

function Status_stateMessage_(action, job) {
  const label = STATUS_LABEL_TH[job.status] || job.status;
  if (action === 'accept') {
    return job.assignee_id
      ? 'มีคนรับงานนี้แล้ว (' + (job.assignee_name || 'ไม่ทราบชื่อ') + ')'
      : 'งานนี้ไม่ได้รอรับแล้ว (สถานะ: ' + label + ')';
  }
  return 'ทำรายการนี้ไม่ได้ เพราะงานอยู่ในสถานะ ' + label;
}

/** Error carrying one of the API error codes (PLAN §6); Api_handle passes code and message through. */
function Status_error(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

if (typeof module !== 'undefined') {
  module.exports = {
    STATUS, STATUS_OPEN, STATUS_ROLES, STATUS_LABEL_TH, STATUS_RULES, STATUS_PRIORITIES, STATUS_SYSTEM_ACTOR,
    Status_transition, Status_parts, Status_canView, Status_allowedActions,
    Status_canListScope, Status_canViewDashboard, Status_inScope, Status_isOpen,
    Status_isReporter, Status_isAssignee, Status_isCandidate, Status_error,
  };
}
