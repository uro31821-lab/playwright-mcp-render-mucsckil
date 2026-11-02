# JH decision learning runtime contract

Version: **1.0.0**. Global: **JHDecisionLearning**. State schema:
**jh.decision-learning.v1**.

The module is portable JavaScript with no imports, network, filesystem, timers,
credentials, model training, or background work. Source references and authority
labels are host attestations; the runtime cannot independently prove their truth.
The host or CLI authorizes access to the immutable ownerScope.

## Shared persistence rules

createState({ownerScope, now}) returns a state containing schema, apiVersion,
ownerScope, createdAt, updatedAt, revision, goals, decisions, predictions,
outcomes, reviews, and events. All record collections are ID-keyed objects.
validateState(state) returns a validated clone. It replays immutable events and
requires the reconstructed state to equal the supplied materialized state.
fingerprint(value) is a SHA-256 digest of canonical JSON.

All mutations take (state, input) and return
{state, result: {duplicate, changed, revision, ...recordIds}}. Common input fields
are expectedRevision, sourceRef, and at. A new event requires an exact revision
match and at >= state.updatedAt. An identical event ID and normalized payload is
an idempotent retry even with an old expectedRevision. Changed content under an
existing event ID is rejected. The original input state is never modified.

UTC timestamps are normalized to ISO milliseconds. Scope is
{topic, project?, aspect?}; keys and identifier values are explicit normalized
tokens, with no semantic inference or wildcard matching. Where this module links
goals or history by scope, all supplied dimensions must match exactly.

State is limited to 2 MiB and is never pruned. Complete reader output is limited
to 512 KiB; overflow throws DECISION_OUTPUT_CAPACITY rather than removing
evidence silently. Map limits: 200 goals, 1,000 decisions, 500 predictions,
1,000 outcomes, 1,000 reviews, 3,000 total events. A smaller byte limit can bind
before a record-count limit.

## Mutation inputs

### recordGoal

Required additional fields:

- goalId, scope, goal, reason
- basis: user_explicit | host_inferred
- priorities: [{key, direction: higher | lower, weight: 1..5, reason, sourceRef}]
- constraints: [{key, operator: gte | lte, value: 0..1, reason, sourceRef}]
- validUntil: ISO timestamp | null
- supersedes: goalId | null

Priority keys are unique; constraint key/operator pairs are unique. Each array
has at most 20 items. A non-null validUntil must be after at.

A user_explicit goal starts active; a host_inferred goal starts proposed.
Replacement requires user_explicit, an existing nonterminal goal, and exactly
the same scope. The old goal becomes superseded and records supersededBy. Its
original goal, reasons, evidence and immutable events remain available. A
completed, dismissed, or superseded goal cannot be revived or replaced through
a status transition. A new independent goal can always use a new goalId.

Result adds goalId.

### setGoalStatus

Additional fields: decisionId, goalId, status, basis, reason.

status: active | paused | completed | dismissed.
basis: user_explicit | host_verified.

Proposed-to-active and paused-to-active transitions require user_explicit.
Completed, dismissed, and superseded are terminal; only an identical prior event
retry is accepted for them. Status changes are recorded in decisions and events.
Result adds decisionId and goalId.

### recordPrediction

Additional fields:

- predictionId, goalId, optionId
- expected: [{key, unit, min: number | null, max: number | null}]
- expectedBenefit, expectedBurden
- uncertainties: [string]

The goal must be active and unexpired at at. The prediction stores an immutable
goalSnapshot and goalRevision. expected has 1..20 unique metric keys; each range
has at least one non-null bound and min <= max when both exist. Numeric
measurements and bounds are finite and have absolute magnitude <= 1e12. Units
are normalized strings compared exactly, with no unit conversion. uncertainties
has at most 10 entries. Result adds predictionId and goalId.

### recordOutcome

Additional fields: outcomeId, predictionId,
observed: [{key, unit, value: number | null}], summary,
basis: user_report | host_verified.

An existing prediction must precede the outcome in event order and time.
Observed keys are unique and must exist in the prediction with exactly matching
units. An empty observed array is allowed and means no known measurements.
Missing and null observations never count as success. Multiple later outcomes
may cite the same immutable prediction. No post-hoc prediction is created.
Result adds outcomeId and predictionId.

### recordReview

Additional fields: reviewId, outcomeId, cause, explanation, proposedAdjustment,
basis: reviewed_inference | user_explicit, evidenceRefs: [string].

cause: candidate_information | priority_interpretation | context_changed |
preference_changed | execution_issue | unknown.

The outcome must already exist. evidenceRefs contains 1..6 explicit references.
A review preserves its original basis and proposed adjustment. It never changes
goals, criteria or permanent preferences automatically and does not prove a
cause. Result adds reviewId and outcomeId.

## Readers

### goalContext(state, {goalId, at})

Requires at >= state.updatedAt. Returns goalId, eligible, eligibilityReason,
status, scope, goal, reason, sourceRef, priorities, constraints, validUntil,
goalRevision, and current status provenance. reason remains the original goal's
reason; eligibilityReason explains active/expired/proposed/paused/terminal state.
Expiry occurs at at >= validUntil. Readers do not change stored status.

### compare(state, {predictionId, outcomeId})

The outcome must refer to that prediction. No current goal value is substituted
for the prediction's saved data. Returns predictionId, outcomeId, goalId,
goalRevision, metrics, overall, and source/basis metadata.

Each metric is:
{key, unit, target: {min, max}, value, status, observation, delta, sourceRefs}.
status is matched | missed | unknown. observation is observed | missing |
unknown. delta is zero inside the range, the signed distance from the violated
bound outside it, or null when unknown.

Overall:

- missed: at least one known miss, even if other measurements are unknown.
- matched: every expected metric is known and inside its inclusive range.
- partial: at least one match and at least one unknown, with no known miss.
- unknown: no known metric values.

No cause is inferred. Authority labels are preserved; host verification claims
are not independently verified by this module.

### reviewContext(state, {goalId, at, limit?})

Requires at >= state.updatedAt. limit is 1..10, default 3. Returns:

{goalId, scope, goalContext, items, totalAvailable, omitted, limit,
 reviewLimit: 10, causalityVerified: false, updatesGoalCriteria: false,
 updatesPreferences: false, authorizesExecution: false}.

items are ordered by newest outcome event revision, and have:
{prediction, outcome, comparison, reviews, reviewsOmitted}.
Each prediction includes the immutable goalSnapshot and goalRevision. Only
outcomes whose prediction snapshot has exactly the current goal's scope are
included. The old goal may be superseded. Other projects/aspects are excluded.
The reader remains available for paused, expired, or terminal goals.

No outcome means no success entry. The current goal context stays separate from
historical prediction snapshots. Each item's reviews are newest first, capped
at 10 with reviewsOmitted. omitted counts matching outcomes not returned due to
limit; an omitted record is not a statement that its adjustment was applied.
Full output overflow is explicit; callers can request a smaller limit.

### selectProposals(state, {goalId, at, mode, limit?, candidates})

Requires at >= state.updatedAt. mode is busy | normal | explore. Requested limit
is 1..3, default 1. busy and normal have an effective limit of 1; explore allows
up to the requested 3. candidates contains 0..20 unique IDs:

{id, goalId, label, sourceRefs, stage: ready | blocked | later,
 eligible: boolean | null, benefit, confidence, setupBurden, ongoingBurden,
 interruptionCost}.

All five numeric fields are 0..1 or null. Source references may be an empty array
to express unavailable evidence; such a candidate is deferred.

Inactive or expired goals defer all candidates. Other deferral reasons include
goal_mismatch, blocked, later, ineligible, eligibility_unknown, evidence_missing,
metrics_unknown, nonpositive_utility, and selection_limit.

For ready candidates with eligible === true, nonempty evidence and known
metrics:

score = benefit * confidence - 0.25 * setupBurden - 0.25 * ongoingBurden
        - modeMultiplier * 0.25 * interruptionCost

modeMultiplier is 2 for busy, 1 for normal, and 0.5 for explore. Scores are
rounded to 12 decimal places; score <= 0 is deferred. Positive candidates are
sorted by descending score, then stable ID. Coefficients are application design
choices; this is not a learned model, verified effectiveness, or probability.
Exploration permits additional high-scoring candidates only.

Returns {selected, deferred, goalContext, mode, limit, requestedLimit,
 scoreKind: "caller_supplied_expected_utility", effectivenessVerified: false,
 authorizesExecution: false, hypothesesRemainUnconfirmed: true}.
Selected entries retain the candidate's fields plus score and scoreComponents.
Deferred entries have id, goalId, label, reason, sourceRefs, and score when known;
unknownFields identifies absent metrics where applicable.

Caller-supplied eligible is a host assertion that relevant goal conditions have
been checked; candidate fields do not encode every arbitrary goal constraint.
The runtime does not invent an eligibility proof.

## Stateless short-turn interpretation

interpretTurn({text, taskId: string | null,
pendingQuestion: null | {id, kind: choice | preference | action, optionId?}})

This is an exact small Korean phrase recognizer, not a Korean language model.
It applies NFKC, trim and ending period/exclamation normalization. Question
marks, including full-width question marks, are preserved.

- 계속 / 계속진행 / 계속 진행 / 다음 작업 진행: continue_task with a task.
- 했어: reported_step_done with a task; not externally verified.
- 그래 / 응 / 네: acknowledge_pending only with a concrete pending question.
- 별로 / 별로야: negative_feedback_cause_unknown with a task.
- 나중에: pause_task with a task, without inventing a schedule.
- 중지: stop_task with a task.
- A recognized phrase lacking its required context: context_required.
- Other text, including 했어?: host_interpretation_required.

Returns intent, taskId, pendingQuestionId, pendingQuestionKind, optionId and
persistPreference:false, authorizesExecution:false, externallyVerified:false.
These flags describe this module's effects. They do not revoke authorization
already established by the user or require the host to ask again.

## Error codes

Errors have a stable .code: DECISION_INPUT_INVALID, DECISION_STATE_INVALID,
DECISION_STATE_CAPACITY, DECISION_OUTPUT_CAPACITY, DECISION_REVISION_CONFLICT,
DECISION_ID_CONFLICT, DECISION_TIME_ORDER, DECISION_GOAL_NOT_FOUND,
DECISION_GOAL_INELIGIBLE, DECISION_GOAL_TERMINAL, DECISION_SCOPE_MISMATCH,
DECISION_PREDICTION_NOT_FOUND, DECISION_OUTCOME_NOT_FOUND,
DECISION_EVIDENCE_INVALID, DECISION_UNIT_MISMATCH.

No raw provider errors, credentials or unbounded chat transcripts are retained.
