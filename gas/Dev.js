// Developer helpers, run from the Apps Script editor. They refuse to run unless Config ENV = test.

const DEV_SAMPLE_PHOTO_URL = 'https://www.gstatic.com/webp/gallery/1.jpg';

/**
 * Creates a sample job reported by the first active ADMIN and pushes job_new to the
 * candidates from routing, so the card flow can be tested without the LIFF pages.
 * The editor cannot pass arguments; use Dev_smokeTestElec / Dev_smokeTestKitchen there.
 */
function Dev_smokeTest(categoryCode) {
  Dev_requireTest_();
  const code = String(categoryCode || 'ELEC').trim().toUpperCase();
  const admin = Repo_readAll('Users').find(function (u) {
    return Routing_isActiveUser(u) && String(u.role || '').trim().toUpperCase() === 'ADMIN';
  });
  if (!admin) throw new Error('No active ADMIN in Users. Register a LINE account, then set its role to ADMIN.');
  const actor = Jobs_actorFromUser_(admin);

  const branch = actor.branch_code || String((Jobs_active_('Branches')[0] || {}).branch_code || '');
  const photo = Dev_samplePhoto_();
  const result = Jobs_create(actor, {
    branch_code: branch,
    area: 'บาร์',
    category_code: code,
    title: '[ทดสอบ] ' + code + ' ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HH:mm'),
    detail: 'งานทดสอบจาก Dev_smokeTest ไม่ต้องไปหน้างานจริง',
    priority: 'NORMAL',
    phone: actor.phone,
    photos: photo ? [photo] : [],
  });

  const job = result.job;
  const names = Jobs_ids_(job.candidate_ids).map(function (id) {
    const u = Jobs_tab_('Users').find(function (x) { return Routing_userId_(x) === id; });
    return u ? (u.real_name || u.display_name) + ' (' + u.role + ')' : id;
  });
  console.log('Created %s status=%s route_to=%s', job.job_id, job.status, job.route_to);
  console.log('job_new pushed to: %s', names.length ? names.join(', ') : '(nobody, job is NEW)');
  console.log('Photo: %s', job.photos_before ? Drive_flexImageUrl(Jobs_ids_(job.photos_before)[0]) : '(none)');
  return job.job_id;
}

function Dev_smokeTestElec() {
  return Dev_smokeTest('ELEC');
}

function Dev_smokeTestKitchen() {
  return Dev_smokeTest('KITCHEN');
}

/**
 * Phase 2 SLA check without waiting: creates an ELEC job and moves its dates into the past so
 * 75% of the response window and the response deadline are both passed, then runs Sla_tick.
 * Expect one alert carousel per person (TECH: R75, ADMIN: RB), and none on a second run.
 */
function Dev_slaDemo() {
  Dev_requireTest_();
  const jobId = Dev_smokeTest('ELEC');
  const h = 3600 * 1000;
  const now = Date.now();
  Repo_withLock(function () {
    const found = Repo_findJob(jobId);
    Repo_update('Jobs', found.rowIndex, {
      created_at: new Date(now - 80 * h),
      response_due_at: new Date(now - 8 * h),
      due_at: new Date(now + 88 * h),
    });
  });
  const first = Sla_tick();
  const second = Sla_tick();
  console.log('%s: first tick %s, second tick %s (second must flag 0 jobs)', jobId, JSON.stringify(first), JSON.stringify(second));
  return jobId;
}

/**
 * Phase 2A acceptance in one run (ENV=test): extension request + approval, priority change,
 * cancel, and migration re-run. Uses the first active TECH and ADMIN in Users (they may be the
 * same LINE account). Pushes real cards, like the LINE flow would. Logs PASS/FAIL per check.
 */
function Dev_phase2Check() {
  Dev_requireTest_();
  const users = Repo_readAll('Users').filter(Routing_isActiveUser);
  const pick = function (role) {
    const u = users.find(function (x) { return String(x.role || '').trim().toUpperCase() === role; });
    if (!u) throw new Error('Need an active ' + role + ' in Users');
    return Jobs_actorFromUser_(u);
  };
  const tech = pick('TECH');
  const admin = pick('ADMIN');
  const results = [];
  const check = function (name, ok, detail) {
    results.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  };
  const h = 3600 * 1000;

  // 1. Extension: tech accepts, asks for +3 days, admin approves.
  const a = Dev_smokeTest('ELEC');
  Jobs_accept(tech, a);
  const before = Repo_findJob(a).job;
  const newDue = new Date(new Date(before.due_at).getTime() + 72 * h);
  Jobs_requestExtension(tech, a, { reason: '[ทดสอบ] รออะไหล่', new_due_at: newDue.toISOString() });
  const pending = Repo_findJob(a).job;
  check('request_ext sets ext_pending', Routing_isTrue(pending.ext_pending), a);
  let blocked = false;
  try { Jobs_requestExtension(tech, a, { reason: 'x', new_due_at: new Date(newDue.getTime() + h).toISOString() }); } catch (e) { blocked = e.code === 'INVALID_STATE'; }
  check('second request while pending is refused', blocked);
  const decided = Jobs_decideExtension(admin, a, { approve: true, note: '[ทดสอบ] ok' });
  const after = Repo_findJob(a).job;
  check('approve moves due_at', new Date(after.due_at).getTime() === newDue.getTime(), Utilities.formatDate(new Date(after.due_at), 'Asia/Bangkok', 'dd/MM HH:mm'));
  check('approve clears ext_pending and counts', decided.approved && !Routing_isTrue(after.ext_pending) && Number(after.ext_count) === 1);

  // 2. Priority: NORMAL -> EMERGENCY recomputes both deadlines from created_at.
  const b = Dev_smokeTest('ELEC');
  Jobs_setPriority(admin, b, { priority: 'EMERGENCY', reason: '[ทดสอบ] ฉุกเฉินจริง' });
  const pb = Repo_findJob(b).job;
  const created = new Date(pb.created_at).getTime();
  check('set_priority EMERGENCY: response = created + 4h', new Date(pb.response_due_at).getTime() - created === 4 * h);
  check('set_priority EMERGENCY: due = created + 24h', new Date(pb.due_at).getTime() - created === 24 * h);
  const logB = Repo_findAllBy('JobLog', 'job_id', b).filter(function (l) { return l.action === 'set_priority'; })[0];
  check('JobLog keeps old and new priority', !!logB && /NORMAL/.test(logB.old_value) && /EMERGENCY/.test(logB.new_value));

  // 3. Cancel.
  const c = Dev_smokeTest('ELEC');
  Jobs_cancel(admin, c, '[ทดสอบ] แจ้งซ้ำ');
  check('cancel -> CANCELLED', Repo_findJob(c).job.status === 'CANCELLED', c);

  // 4. Migration re-run adds nothing.
  const mig = Setup_migrateLegacy(SETUP_LEGACY_SHEET_ID, { dryRun: true });
  check('migration re-run adds 0 rows', mig.added === 0, mig.skipped + ' already migrated');

  const failed = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('Dev_phase2Check: %s\n%s', failed ? failed + ' FAILED' : 'ALL PASS', results.join('\n'));
  return { failed: failed, results: results };
}

/** Runs Sla_tick once by hand (same as the 15-minute trigger). */
function Dev_slaTickNow() {
  Dev_requireTest_();
  return Sla_tick();
}

/**
 * PLAN §18: pushes one carousel to the first active ADMIN with the latest job photo in two
 * URL forms (direct googleusercontent and Drive thumbnail) to see which one LINE shows.
 */
function Dev_testFlexImage() {
  Dev_requireTest_();
  const admin = Repo_readAll('Users').find(function (u) {
    return Routing_isActiveUser(u) && String(u.role || '').trim().toUpperCase() === 'ADMIN';
  });
  if (!admin) throw new Error('No active ADMIN in Users.');
  const withPhoto = Repo_readAll('Jobs').filter(function (j) { return j.photos_before; });
  if (!withPhoto.length) throw new Error('No job with a photo yet. Run Dev_smokeTestElec first.');
  Jobs_sortNewest_(withPhoto);
  const fileId = Jobs_ids_(withPhoto[0].photos_before)[0];

  const bubble = function (label, url) {
    return {
      type: 'bubble',
      hero: { type: 'image', url: url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' },
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: label, wrap: true, weight: 'bold' }] },
    };
  };
  const res = Line_push(Routing_userId_(admin), [{
    type: 'flex',
    altText: 'ทดสอบรูปบนการ์ด',
    contents: {
      type: 'carousel',
      contents: [
        bubble('A: lh3.googleusercontent.com/d/...', Drive_flexImageUrl(fileId)),
        bubble('B: drive.google.com/thumbnail?...', Drive_thumbnailUrl(fileId)),
      ],
    },
  }]);
  console.log('Pushed image test for file %s: %s', fileId, res.ok ? 'OK' : 'FAILED ' + res.status + ' ' + res.body);
}

function Dev_requireTest_() {
  const env = String(Repo_getConfig().ENV || '').trim();
  if (env !== 'test') throw new Error('Dev_* functions only run when Config ENV = test (now: "' + env + '")');
}

/** A real JPEG for the sample job, or null if it cannot be fetched (the job is still created). */
function Dev_samplePhoto_() {
  try {
    const res = UrlFetchApp.fetch(DEV_SAMPLE_PHOTO_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
    return { mime: 'image/jpeg', b64: Utilities.base64Encode(res.getBlob().getBytes()) };
  } catch (err) {
    console.warn('Sample photo not available (%s); creating the job without a photo', err);
    return null;
  }
}
