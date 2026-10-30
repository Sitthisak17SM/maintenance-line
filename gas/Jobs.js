// Job use-cases (create/accept/reject/forward/reassign/checkin/close/ack). State changes go through Status_transition.
// Callers resolve the actor first: the API from a verified ID token, the webhook from source.userId.

const JOBS_TITLE_MAX = 80;
const JOBS_TEXT_MAX = 2000;
const JOBS_LIST_MAX = 200;
const JOBS_MY_OPEN_MAX = 5;

let Jobs_config_cache_ = null;
let Jobs_tab_cache_ = {};

// --- actors and users ---------------------------------------------------------

/** Registered, active user -> actor {userId, name, role, branch_code, phone}. Throws NOT_REGISTERED or FORBIDDEN. */
function Jobs_actor(userId) {
  const found = Repo_findUser(userId);
  if (!found) throw Status_error('NOT_REGISTERED', 'กรุณาลงทะเบียนก่อนใช้งาน');
  if (!Routing_isTrue(found.user.active)) {
    throw Status_error('FORBIDDEN', 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }
  return Jobs_actorFromUser_(found.user);
}

function Jobs_actorFromUser_(u) {
  return {
    userId: String(u.line_user_id || '').trim(), // hand-typed rows can carry a stray tab/space
    name: String(u.real_name || u.display_name || ''),
    role: String(u.role || '').trim().toUpperCase(),
    branch_code: String(u.branch_code || '').trim(),
    phone: String(u.phone || ''),
  };
}

/** action=me: the caller's user row (null if not registered) and the lists the LIFF pages need. */
function Jobs_me(who) {
  const found = Repo_findUser(who.userId);
  const config = Jobs_config_();
  return {
    user: found ? Jobs_publicUser_(found.user) : null,
    branches: Jobs_active_('Branches').map(function (b) { return { branch_code: b.branch_code, name: b.name }; }),
    areas: Jobs_active_('Areas').map(function (a) { return { branch_code: a.branch_code, area_name: a.area_name }; }),
    categories: Jobs_active_('Categories').map(function (c) { return { category_code: c.category_code, name_th: c.name_th }; }),
    sla: Jobs_sorted_(Jobs_tab_('SLA')).map(function (s) {
      return { priority: s.priority, label_th: s.label_th, response_hours: s.response_hours, resolve_hours: s.resolve_hours };
    }),
    config: {
      PHOTO_MAX_COUNT: Number(config.PHOTO_MAX_COUNT) || 4,
      PHOTO_MAX_EDGE_PX: Number(config.PHOTO_MAX_EDGE_PX) || 1280,
      VIDEO_MAX_MB: Number(config.VIDEO_MAX_MB) || 0,
    },
  };
}

/** action=register: new users get role STAFF (PLAN §2); existing users update name, phone and branch. */
function Jobs_register(who, data) {
  data = data || {};
  const realName = Jobs_requireText_(data.real_name, 'ชื่อจริง', 100);
  const phone = Jobs_requireText_(data.phone, 'เบอร์โทร', 20);
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) throw Status_error('VALIDATION', 'เบอร์โทรไม่ถูกต้อง');
  const branch = Jobs_requireActive_('Branches', 'branch_code', data.branch_code, 'ร้าน');

  const user = Repo_withLock(function () {
    const found = Repo_findUser(who.userId);
    const fields = {
      display_name: who.displayName || '',
      real_name: realName,
      phone: phone,
      branch_code: branch.branch_code,
    };
    if (found) {
      if (!Routing_isTrue(found.user.active)) {
        throw Status_error('FORBIDDEN', 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }
      return Repo_update('Users', found.rowIndex, fields);
    }
    const row = Object.assign({ line_user_id: who.userId, role: 'STAFF', active: true, registered_at: new Date(), note: '' }, fields);
    Repo_append('Users', row);
    return row;
  });
  return { user: Jobs_publicUser_(user) };
}

/** Follow/unfollow (PLAN §7): only users who already registered have a row to update. */
function Jobs_setUserActive(userId, active) {
  Repo_withLock(function () {
    const found = Repo_findUser(userId);
    if (found && Routing_isTrue(found.user.active) !== active) Repo_update('Users', found.rowIndex, { active: active });
  });
}

// --- create -----------------------------------------------------------------------

function Jobs_create(actor, data) {
  data = data || {};
  const now = new Date();
  // Permission first, so a VIEWER gets FORBIDDEN rather than a form error.
  Status_transition(null, 'create', actor, { now: now, candidate_ids: [] });

  const config = Jobs_config_();
  const branch = Jobs_requireActive_('Branches', 'branch_code', data.branch_code, 'ร้าน');
  const category = Jobs_requireActive_('Categories', 'category_code', data.category_code, 'หมวด');
  const title = Jobs_requireText_(data.title, 'หัวข้อ', JOBS_TITLE_MAX);
  const priority = String(data.priority || '').trim().toUpperCase();
  const slaRows = Jobs_tab_('SLA');
  if (!slaRows.some(function (r) { return r.priority === priority; })) throw Status_error('VALIDATION', 'กรุณาเลือกความเร่งด่วน');
  const photos = Drive_decodePhotos(data.photos, Number(config.PHOTO_MAX_COUNT) || 4);

  const route = Routing_route(category, Jobs_tab_('Users'));
  const t = Status_transition(null, 'create', actor, { now: now, candidate_ids: route.candidate_ids });
  const due = Sla_computeDueDates(now, priority, slaRows);
  const jobId = Repo_nextJobId(String(config.JOB_ID_PREFIX || 'MT').trim(), now);
  const photoIds = Drive_savePhotos(jobId, 'before', photos, now);

  const job = Object.assign({
    job_id: jobId,
    branch_code: branch.branch_code,
    area: Jobs_optionalText_(data.area, 100),
    category_code: category.category_code,
    title: title,
    detail: Jobs_optionalText_(data.detail, JOBS_TEXT_MAX),
    priority_reported: priority,
    priority: priority,
    reporter_id: actor.userId,
    reporter_name: actor.name,
    reporter_phone: Jobs_optionalText_(data.phone, 20) || actor.phone,
    photos_before: photoIds.join(','),
    route_to: route.route_to,
    vendor: '',
    response_due_at: due.response_due_at,
    due_at: due.due_at,
    alert_flags: '',
    is_repeat: false,
    related_job_id: '',
    source: 'LINE',
  }, t.fields);

  Repo_withLock(function () {
    Repo_append('Jobs', job);
    Repo_appendJobLog(jobId, actor, t.log, now);
  });
  Jobs_notifyNew_(job, route.candidate_ids, '');
  return { job_id: jobId, status: job.status, job: Jobs_publicJob_(job) };
}

// --- read -------------------------------------------------------------------------

/** action=getJob: the job, its parts, history, photo URLs and the buttons the caller may use. */
function Jobs_get(actor, jobId) {
  const found = Repo_findJob(jobId);
  if (!found) throw Status_error('NOT_FOUND', 'ไม่พบงาน ' + (jobId || ''));
  const job = found.job;
  if (!Status_canView(job, actor)) throw Status_error('FORBIDDEN', 'คุณไม่มีสิทธิ์ดูงานนี้');

  const result = {
    job: Jobs_publicJob_(job),
    status_label: STATUS_LABEL_TH[job.status] || job.status,
    photos_before_urls: Jobs_ids_(job.photos_before).map(Drive_thumbnailUrl),
    photos_after_urls: Jobs_ids_(job.photos_after).map(Drive_thumbnailUrl),
    parts: Repo_findAllBy('Parts', 'job_id', job.job_id)
      .sort(function (a, b) { return Number(a.line_no) - Number(b.line_no); }),
    log: Repo_findAllBy('JobLog', 'job_id', job.job_id).map(function (l) {
      return { at: l.at, actor_name: l.actor_name, action: l.action, from_status: l.from_status, to_status: l.to_status, reason: l.reason };
    }),
    allowed_actions: Status_allowedActions(job, actor),
  };
  if (actor.role === 'ADMIN') result.reassign_options = Jobs_reassignOptions_();
  return result;
}

/** action=listJobs: data {scope, statuses[], branch_code}. Newest first, at most JOBS_LIST_MAX. */
function Jobs_list(actor, data) {
  data = data || {};
  const scope = String(data.scope || 'mine');
  if (!Status_canListScope(scope, actor)) throw Status_error('FORBIDDEN', 'คุณไม่มีสิทธิ์ดูรายการนี้');
  const statuses = Array.isArray(data.statuses) ? data.statuses.map(String) : [];
  const branchCode = String(data.branch_code || '').trim();
  const jobs = Repo_readAll('Jobs').filter(function (j) {
    return j.job_id && Status_inScope(j, scope, actor, branchCode) &&
      (!statuses.length || statuses.indexOf(String(j.status)) !== -1);
  });
  Jobs_sortNewest_(jobs);
  return {
    total: jobs.length,
    jobs: jobs.slice(0, JOBS_LIST_MAX).map(Jobs_summary_),
  };
}

/** Webhook "งานของฉัน": open jobs the user reported or holds, newest first. */
function Jobs_myOpen(actor) {
  const jobs = Repo_readAll('Jobs').filter(function (j) {
    return j.job_id && Status_isOpen(j.status) &&
      (Status_isReporter(j, actor) || Status_isAssignee(j, actor) || Status_isCandidate(j, actor));
  });
  Jobs_sortNewest_(jobs);
  return { total: jobs.length, jobs: jobs.slice(0, JOBS_MY_OPEN_MAX) };
}

// --- transitions ------------------------------------------------------------------

/** Concurrent taps are serialized by the lock; everyone after the first gets CONFLICT. */
function Jobs_accept(actor, jobId) {
  const r = Jobs_transition_(actor, jobId, 'accept', {});
  return Jobs_result_(r.job);
}

function Jobs_reject(actor, jobId, reason) {
  const r = Jobs_transition_(actor, jobId, 'reject', { reason: reason });
  const admins = Routing_idsWithRole(Jobs_tab_('Users'), 'ADMIN').filter(function (id) { return id !== actor.userId; });
  Line_push(admins, [Flex_jobRejected(r.job, Jobs_ref_(r.job), r.log.reason, actor.name)]);
  return Jobs_result_(r.job);
}

function Jobs_forward(actor, jobId, reason) {
  const admins = Routing_idsWithRole(Jobs_tab_('Users'), 'ADMIN');
  const r = Jobs_transition_(actor, jobId, 'forward', { reason: reason, admin_ids: admins });
  Jobs_notifyNew_(r.job, admins, 'ส่งต่อจาก ' + actor.name + ': ' + r.log.reason);
  return Jobs_result_(r.job);
}

/** data: {assignee_id} for a TECH/ADMIN, or {vendor} (a name from Vendors), plus optional reason. */
function Jobs_reassign(actor, jobId, data) {
  data = data || {};
  const input = { reason: data.reason };
  const assigneeId = String(data.assignee_id || '').trim();
  const vendor = String(data.vendor || '').trim();
  if (assigneeId) {
    const target = Jobs_tab_('Users').filter(Routing_isActiveUser).find(function (u) { return String(u.line_user_id) === assigneeId; });
    if (!target) throw Status_error('VALIDATION', 'ไม่พบผู้ใช้ที่เลือก หรือผู้ใช้ถูกปิดใช้งาน');
    input.target = { userId: assigneeId, role: String(target.role || '').trim().toUpperCase() };
  }
  if (vendor) {
    if (!Jobs_reassignOptions_().vendors.some(function (v) { return v.name === vendor; })) {
      throw Status_error('VALIDATION', 'ไม่พบช่างนอก "' + vendor + '" ในแท็บ Vendors');
    }
    input.vendor = vendor;
  }
  const r = Jobs_transition_(actor, jobId, 'reassign', input);
  // The acting ADMIN is already on the admin page, so only push to someone else.
  const others = Jobs_ids_(r.job.candidate_ids).filter(function (id) { return id !== actor.userId; });
  Jobs_notifyNew_(r.job, others, 'จ่ายงานโดย ' + actor.name);
  return Jobs_result_(r.job);
}

function Jobs_checkin(actor, jobId) {
  return Jobs_result_(Jobs_transition_(actor, jobId, 'checkin', {}).job);
}

/** data: {cause, fix, parts[], photos[], onsite_note}. Photos are saved only after the checks pass. */
function Jobs_close(actor, jobId, data) {
  data = data || {};
  const config = Jobs_config_();
  const photos = Drive_decodePhotos(data.photos, Number(config.PHOTO_MAX_COUNT) || 4);
  const input = { cause: data.cause, fix: data.fix, parts: data.parts, onsite_note: data.onsite_note };

  // Dry run without the lock, so a rejected request leaves no orphan files in Drive.
  const current = Repo_findJob(jobId);
  if (!current) throw Status_error('NOT_FOUND', 'ไม่พบงาน ' + (jobId || ''));
  Status_transition(current.job, 'close', actor, Object.assign({
    now: new Date(), photos_after: photos.map(function (p, i) { return 'pending' + i; }),
  }, input));

  input.photos_after = Drive_savePhotos(current.job.job_id, 'after', photos, new Date());
  const r = Jobs_transition_(actor, jobId, 'close', input);
  Jobs_notifyDone_(r.job);
  return Jobs_result_(r.job);
}

function Jobs_ack(actor, jobId) {
  return Jobs_result_(Jobs_transition_(actor, jobId, 'ack', {}).job);
}

/** Re-reads the job under the lock, applies the transition, writes Jobs + JobLog (+ Parts). */
function Jobs_transition_(actor, jobId, action, input) {
  return Repo_withLock(function () {
    const found = Repo_findJob(jobId);
    if (!found) throw Status_error('NOT_FOUND', 'ไม่พบงาน ' + (jobId || ''));
    const now = new Date();
    const t = Status_transition(found.job, action, actor, Object.assign({}, input, { now: now }));
    const job = Repo_update('Jobs', found.rowIndex, t.fields);
    Repo_appendJobLog(job.job_id, actor, t.log, now);
    if (t.parts && t.parts.length) {
      Repo_appendRows('Parts', t.parts.map(function (p) { return Object.assign({ job_id: job.job_id }, p); }));
    }
    return { job: job, log: t.log };
  });
}

// --- notifications (push, PLAN §8) --------------------------------------------------

function Jobs_notifyNew_(job, recipients, note) {
  if (!recipients.length) return;
  const config = Jobs_config_();
  const first = Jobs_ids_(job.photos_before)[0];
  const showPhoto = config.FLEX_SHOW_PHOTO === undefined || Routing_isTrue(config.FLEX_SHOW_PHOTO);
  const photoUrl = first && showPhoto ? Drive_flexImageUrl(first) : '';
  Line_push(recipients, [Flex_jobNew(job, Jobs_ref_(job), { note: note, photoUrl: photoUrl })]);
}

/** job_done goes to the reporter; if the reporter is inactive, to the branch MANAGERs. */
function Jobs_notifyDone_(job) {
  const users = Jobs_tab_('Users').filter(Routing_isActiveUser);
  const reporterActive = users.some(function (u) { return String(u.line_user_id) === String(job.reporter_id); });
  const to = reporterActive ? [String(job.reporter_id)] : users
    .filter(function (u) { return String(u.role).trim().toUpperCase() === 'MANAGER' && String(u.branch_code) === String(job.branch_code); })
    .map(function (u) { return String(u.line_user_id); });
  Line_push(to, [Flex_jobDone(job, Jobs_ref_(job))]);
}

// --- helpers ------------------------------------------------------------------------

/** Display names for cards. */
function Jobs_ref_(job) {
  const branch = Jobs_tab_('Branches').find(function (b) { return String(b.branch_code) === String(job.branch_code); });
  const category = Jobs_tab_('Categories').find(function (c) { return String(c.category_code) === String(job.category_code); });
  return { branchName: branch ? String(branch.name) : '', categoryName: category ? String(category.name_th) : '' };
}

function Jobs_reassignOptions_() {
  return {
    users: Jobs_tab_('Users').filter(function (u) {
      const role = String(u.role || '').trim().toUpperCase();
      return Routing_isActiveUser(u) && (role === 'TECH' || role === 'ADMIN');
    }).map(function (u) {
      return { user_id: String(u.line_user_id), name: String(u.real_name || u.display_name || ''), role: String(u.role).trim().toUpperCase() };
    }),
    vendors: Jobs_tab_('Vendors').filter(function (v) { return v.name && Routing_isTrue(v.active); })
      .map(function (v) { return { vendor_id: String(v.vendor_id), name: String(v.name) }; }),
  };
}

function Jobs_result_(job) {
  return { job_id: job.job_id, status: job.status, job: Jobs_publicJob_(job) };
}

function Jobs_publicJob_(job) {
  const out = {};
  Object.keys(job).forEach(function (k) { out[k] = job[k]; });
  return out;
}

function Jobs_summary_(j) {
  return {
    job_id: j.job_id, created_at: j.created_at, branch_code: j.branch_code, area: j.area,
    category_code: j.category_code, title: j.title, priority: j.priority, status: j.status,
    reporter_name: j.reporter_name, assignee_name: j.assignee_name, vendor: j.vendor,
    response_due_at: j.response_due_at, due_at: j.due_at, done_at: j.done_at,
  };
}

function Jobs_publicUser_(u) {
  return {
    line_user_id: String(u.line_user_id), display_name: u.display_name, real_name: u.real_name,
    phone: String(u.phone || ''), role: String(u.role || '').trim().toUpperCase(),
    branch_code: u.branch_code, active: Routing_isTrue(u.active),
  };
}

function Jobs_sortNewest_(jobs) {
  jobs.sort(function (a, b) { return Jobs_time_(b.created_at) - Jobs_time_(a.created_at); });
}

function Jobs_time_(v) {
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/** Config tab, read once per execution. */
function Jobs_config_() {
  if (!Jobs_config_cache_) Jobs_config_cache_ = Repo_getConfig();
  return Jobs_config_cache_;
}

/** Reference tab rows, read once per execution. */
function Jobs_tab_(name) {
  if (!Jobs_tab_cache_[name]) Jobs_tab_cache_[name] = Repo_readAll(name);
  return Jobs_tab_cache_[name];
}

function Jobs_active_(name) {
  return Jobs_sorted_(Jobs_tab_(name).filter(function (r) { return Routing_isTrue(r.active); }));
}

function Jobs_sorted_(rows) {
  return rows.slice().sort(function (a, b) { return (Number(a.sort) || 0) - (Number(b.sort) || 0); });
}

function Jobs_requireActive_(tab, key, value, label) {
  const code = String(value || '').trim();
  const row = code && Jobs_active_(tab).find(function (r) { return String(r[key]) === code; });
  if (!row) throw Status_error('VALIDATION', 'กรุณาเลือก' + label);
  return row;
}

function Jobs_requireText_(value, label, max) {
  const text = Jobs_optionalText_(value, Infinity);
  if (!text) throw Status_error('VALIDATION', 'กรุณากรอก' + label);
  if (text.length > max) throw Status_error('VALIDATION', label + 'ยาวเกิน ' + max + ' ตัวอักษร');
  return text;
}

function Jobs_optionalText_(value, max) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function Jobs_ids_(value) {
  return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
