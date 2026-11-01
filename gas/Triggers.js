// Time-driven triggers (PLAN §11). Sla_tick runs every 15 minutes once Triggers_install has been
// run from the editor (it asks for the "run when you are not present" permission).

const TRIGGERS_SLA_MINUTES = 15;
const TRIGGERS_SLA_HANDLER = 'Sla_tick';

/**
 * One pass: send R75/D75 to the technician and RB/DB to ADMINs, one push per person (a carousel
 * of all their jobs), then record the flags so the next tick does not repeat them. Also runs
 * auto_ack when Config AUTO_ACK_HOURS > 0.
 */
function Sla_tick() {
  const now = new Date();
  const config = Jobs_config_();
  const users = Jobs_tab_('Users');
  const admins = Routing_idsWithRole(users, 'ADMIN');
  const activeIds = users.filter(Routing_isActiveUser).map(Routing_userId_);
  const jobs = Repo_readAll('Jobs').filter(function (j) { return j.job_id; });

  // recipient -> [{job, flags}], and job_id -> flags to record.
  const inbox = {};
  const due = {};
  function add(to, job, flag) {
    if (!to || activeIds.indexOf(to) === -1) return;
    const list = inbox[to] = inbox[to] || [];
    let item = list.find(function (x) { return x.job.job_id === job.job_id; });
    if (!item) list.push(item = { job: job, flags: [] });
    if (item.flags.indexOf(flag) === -1) item.flags.push(flag);
  }

  jobs.forEach(function (job) {
    const flags = Sla_pendingAlerts(job, now, config.REMIND_AT_PERCENT);
    if (!flags.length) return;
    due[job.job_id] = flags;
    const holders = String(job.assignee_id || '').trim() ? [String(job.assignee_id).trim()] : Jobs_ids_(job.candidate_ids);
    flags.forEach(function (f) {
      if (f === 'R75' || f === 'D75') holders.forEach(function (id) { add(id, job, f); });
      else admins.forEach(function (id) { add(id, job, f); });
    });
  });

  // A flag is recorded once at least one of its recipients got the push (or it had none), so a
  // LINE outage retries on the next tick instead of losing the alert.
  const delivered = {};
  Object.keys(inbox).forEach(function (to) {
    let ok = false;
    try {
      ok = Line_push(to, Flex_slaAlerts(inbox[to])).ok;
    } catch (err) {
      console.error('sla_alert to %s failed: %s', to, err.stack || err);
    }
    inbox[to].forEach(function (it) {
      it.flags.forEach(function (f) {
        const k = it.job.job_id + '|' + f;
        delivered[k] = delivered[k] || ok;
      });
    });
  });

  let recorded = 0;
  Object.keys(due).forEach(function (jobId) {
    const flags = due[jobId].filter(function (f) { return delivered[jobId + '|' + f] !== false; });
    if (!flags.length) return;
    Repo_withLock(function () {
      const found = Repo_findJob(jobId);
      if (!found) return;
      // The pushes took seconds; if an extension or priority change reset the deadlines
      // meanwhile, only record flags that are still due on the job as it is now.
      const still = Sla_pendingAlerts(found.job, now, config.REMIND_AT_PERCENT);
      const keep = flags.filter(function (f) { return still.indexOf(f) !== -1; });
      if (!keep.length) return;
      const merged = Sla_addFlags(found.job.alert_flags, keep);
      if (merged !== String(found.job.alert_flags || '')) {
        Repo_update('Jobs', found.rowIndex, { alert_flags: merged });
        recorded++;
      }
    });
  });

  const closed = Sla_autoAck_(jobs, now, config.AUTO_ACK_HOURS);
  console.log('Sla_tick: %s people alerted, %s jobs flagged, %s auto-acked', Object.keys(inbox).length, recorded, closed);
  return { alerted: Object.keys(inbox).length, flagged: recorded, autoAcked: closed };
}

/** auto_ack (PLAN §3): DONE jobs older than AUTO_ACK_HOURS become CLOSED with ack_by = AUTO. */
function Sla_autoAck_(jobs, now, hours) {
  let n = 0;
  jobs.forEach(function (job) {
    if (!Sla_autoAckDue(job, now, hours)) return;
    try {
      Jobs_transition_(STATUS_SYSTEM_ACTOR, job.job_id, 'auto_ack', {});
      n++;
    } catch (err) {
      // Someone acked it between the read and the lock; nothing to do.
      if (!err.code) console.error('auto_ack %s failed: %s', job.job_id, err.stack || err);
    }
  });
  return n;
}

/** Run once from the editor per environment. Replaces any existing Sla_tick trigger. */
function Triggers_install() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === TRIGGERS_SLA_HANDLER) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(TRIGGERS_SLA_HANDLER).timeBased().everyMinutes(TRIGGERS_SLA_MINUTES).create();
  console.log('Installed %s every %s minutes', TRIGGERS_SLA_HANDLER, TRIGGERS_SLA_MINUTES);
}
