// Job routing (PLAN §10). Pure logic: no Google services.

/**
 * category: a Categories row ({category_code, route_to, assignee_user_id, ...}).
 * users:    Users rows ({line_user_id, role, active, ...}).
 * Returns {route_to, candidate_ids: [userId]}; an empty list means nobody to send to (job stays NEW).
 */
function Routing_route(category, users) {
  const routeTo = String((category && category.route_to) || '').trim().toUpperCase() === 'TECH' ? 'TECH' : 'ADMIN';
  const active = (users || []).filter(Routing_isActiveUser);

  let candidates = [];
  const fixed = String((category && category.assignee_user_id) || '').trim();
  // A fixed assignee who left or unfollowed falls back to the role rule, so the job is not lost.
  if (fixed && active.some(function (u) { return Routing_userId_(u) === fixed; })) {
    candidates = [fixed];
  } else {
    candidates = Routing_idsWithRole(active, routeTo);
  }
  if (!candidates.length) candidates = Routing_idsWithRole(active, 'ADMIN');
  return { route_to: routeTo, candidate_ids: candidates };
}

/** userIds of active users with `role`, in sheet order. */
function Routing_idsWithRole(users, role) {
  return (users || [])
    .filter(function (u) { return Routing_isActiveUser(u) && String(u.role || '').trim().toUpperCase() === role; })
    .map(Routing_userId_);
}

function Routing_isActiveUser(u) {
  return !!u && !!Routing_userId_(u) && Routing_isTrue(u.active);
}

/** Sheet booleans arrive as true/false or as text ("TRUE", "true", "1"). Blank is false. */
function Routing_isTrue(value) {
  if (value === true) return true;
  return /^(true|1|yes)$/i.test(String(value === undefined || value === null ? '' : value).trim());
}

function Routing_userId_(u) {
  return String(u.line_user_id || '').trim();
}

if (typeof module !== 'undefined') module.exports = { Routing_route, Routing_idsWithRole, Routing_isActiveUser, Routing_isTrue };
