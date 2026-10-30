// Job state machine (PLAN §3). Pure logic: no Google services.

function Status_transition(job, action, actor, input) {
  throw new Error('Status_transition: not implemented (phase 1)');
}

if (typeof module !== 'undefined') module.exports = { Status_transition };
