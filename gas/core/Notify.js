// Who gets the optional push cards (PLAN §8). Pure logic: no Google services.
// activeIds: userIds of active users (the caller filters Users with Routing_isActiveUser).

/** Config switches for these cards are on unless set to FALSE (blank or a missing row = on). */
function Notify_flag(value) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  return s === '' || !/^(false|0|no)$/i.test(s);
}

/** job_accepted: the reporter, unless they accepted it themselves or are no longer active. */
function Notify_acceptRecipients(job, actor, activeIds) {
  return Notify_one_(job && job.reporter_id, actor, activeIds);
}

/**
 * job_acked: the technician, only when they closed the job with nobody at the site
 * (onsite_note), since otherwise the reporter usually acknowledges in front of them.
 */
function Notify_ackRecipients(job, actor, activeIds) {
  if (!job || !String(job.onsite_note || '').trim()) return [];
  return Notify_one_(job.assignee_id, actor, activeIds);
}

function Notify_one_(userId, actor, activeIds) {
  const id = String(userId || '').trim();
  if (!id || (actor && String(actor.userId) === id)) return [];
  return (activeIds || []).indexOf(id) !== -1 ? [id] : [];
}

if (typeof module !== 'undefined') module.exports = { Notify_flag, Notify_acceptRecipients, Notify_ackRecipients };
