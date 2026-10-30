export const meta = {
  name: 'review-against-plan',
  description: 'Review the repo against docs/PLAN.md with 5 reviewers, then a skeptic tries to refute every finding',
  whenToUse: 'End of phase 1 or phase 2, before a pilot, or before a prod deploy',
  phases: [
    { title: 'Review', detail: 'one reviewer per risk area' },
    { title: 'Verify', detail: 'one skeptic per finding, refutes by default' },
  ],
}

// Optional focus, e.g. "/review-against-plan gas/Api.js" -> args = "gas/Api.js"
const FOCUS = typeof args === 'string' ? args.trim() : (args && typeof args.focus === 'string' ? args.focus.trim() : '')
const SCOPE = FOCUS
  ? 'Limit the review to: ' + FOCUS + '. '
  : 'Review the whole repo: gas/, web/, tests/ and .github/workflows/. '

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          plan_ref: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'line', 'severity', 'plan_ref', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted', 'reason'],
}

const AREAS = [
  {
    key: 'permissions',
    ask: 'Permissions and identity: every API action and every webhook postback enforces the role and ownership rules in docs/PLAN.md sections 2 and 6. The acting userId must come only from a LINE ID token verified on the server, or from a webhook request that passed WEBHOOK_KEY. Nothing may trust a userId or role sent by the browser.',
  },
  {
    key: 'state-machine',
    ask: 'State machine: every status change goes through Status_transition() and matches the table in docs/PLAN.md section 3 (allowed source statuses, who may act, side effects). Every change writes exactly one JobLog row. Accept is first-wins: status is re-checked inside LockService. tests/ cover both allowed and disallowed transitions.',
  },
  {
    key: 'secrets',
    ask: 'Secrets and configuration: no token, secret or WEBHOOK_KEY anywhere in the repo; web/js/config.js holds only LIFF_ID and API_URL. Secrets are read from the Script Properties keys in docs/PLAN.md section 5. The webhook rejects a wrong key before doing any work. WebhookLog is written only when ENV=test. CI workflows never print secrets.',
  },
  {
    key: 'line-messaging',
    ask: 'LINE messaging: the webhook dedupes by webhookEventId and ignores non-user sources (docs/PLAN.md section 7). Each card is sent by reply or push exactly as the table in section 8 says; reply must be used wherever the table says reply, to save message quota. Postback data is parsed defensively. LINE API errors are caught and logged without breaking the request.',
  },
  {
    key: 'data',
    ask: 'Data integrity: sheet access goes through Repo_* by header name, with no hard-coded column numbers. Writes are wrapped in LockService. job_id follows MT-YYMM-NNNN, resets monthly and never duplicates. Timestamps use Asia/Bangkok. The photo count and size limits in docs/PLAN.md section 12 are enforced on the server. Inputs are validated before anything is written.',
  },
]

const RANK = { high: 0, medium: 1, low: 2 }
const MAX_VERIFY = 25

phase('Review')
const reviews = await parallel(AREAS.map(a => () =>
  agent(
    SCOPE + 'You are reviewing one risk area of this LINE OA maintenance system. ' + a.ask +
      ' Read the actual code and docs/PLAN.md. Report only concrete problems you can point to with a file and line, where the code breaks the rule or the plan. Do not report style issues, do not report things that are already correct, and do not edit any files. Return an empty list if you find nothing.',
    { label: 'review:' + a.key, phase: 'Review', schema: FINDINGS, effort: 'high' },
  ).then(r => (r ? r.findings.map(f => Object.assign({ area: a.key }, f)) : [])),
))

// Barrier is intentional: dedupe across all areas before paying for verification.
const byKey = {}
for (const f of reviews.filter(Boolean).flat()) {
  const k = f.file + ':' + f.line
  if (!byKey[k] || RANK[f.severity] < RANK[byKey[k].severity]) byKey[k] = f
}
const unique = Object.values(byKey).sort((x, y) => RANK[x.severity] - RANK[y.severity])
const toVerify = unique.slice(0, MAX_VERIFY)
const dropped = unique.slice(MAX_VERIFY)
log(unique.length + ' unique findings; verifying ' + toVerify.length + (dropped.length ? ', ' + dropped.length + ' low-priority findings not verified' : ''))

const verdicts = await pipeline(toVerify, f =>
  agent(
    'You are a skeptic. Try to REFUTE this code-review finding by reading the actual code at the cited file and line, and docs/PLAN.md. Set refuted=true if the code is actually correct, the finding misreads the plan, or you cannot confirm the problem from the code. Do not edit any files. Finding: ' + JSON.stringify(f),
    { label: 'verify:' + f.file + ':' + f.line, phase: 'Verify', schema: VERDICT, effort: 'high' },
  ).then(v => ({ finding: f, verdict: v })),
)

const done = verdicts.filter(Boolean)
const confirmed = done.filter(x => x.verdict && !x.verdict.refuted).map(x => x.finding)
const unverified = done.filter(x => !x.verdict).map(x => x.finding)
return {
  confirmed: confirmed,
  refuted_count: done.filter(x => x.verdict && x.verdict.refuted).length,
  unverified: unverified,
  not_verified_due_to_cap: dropped,
}
