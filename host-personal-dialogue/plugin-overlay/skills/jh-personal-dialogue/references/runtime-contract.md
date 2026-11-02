# JH personal dialogue runtime contract

API version: 1.0.0. Global: JHPersonalDialogue.
State schema: jh.personal-dialogue.v1.

Portable, pure JavaScript: no imports, network, filesystem, timers, LLM,
background schedule, preference inference, or automatic external actions.
The host owns access control for ownerScope and the truth of source attestations.

## State and shared mutation rules

createState({ownerScope,now}) returns schema, apiVersion, ownerScope, createdAt,
updatedAt, revision and the ID-keyed maps subjects, questions, presentations,
feedback, parkings, events. validateState returns a validated clone by replaying immutable
events and comparing the reconstructed state. fingerprint hashes canonical JSON
with SHA-256.

Every mutation takes (state,input), with expectedRevision, sourceRef and at,
and returns {state,result:{duplicate,changed,revision,...recordIds}}. New writes
require the current revision and at >= state.updatedAt. An exact normalized
event retry succeeds before CAS checking; changed content under the same event
ID is rejected. Input state is never mutated, including on failure.

Scopes are {topic,project?,aspect?}. All declared dimensions must match exactly.
Identifiers and scope values are normalized explicit tokens, not semantic
classifications. Dates normalize to UTC ISO milliseconds.

Limits: state 2 MiB, each reader output 512 KiB; no pruning. Maximum map counts:
300 subjects, 500 questions, 1,000 presentations, 2,000 feedback, 1,000 parkings,
4,000 events.
The byte limit can bind first. Text limits: label160, summary1200, reason800,
rationale800, proposal1000, questionText500, references500, tokens160.

## recordSubject

Additional fields:

{subjectId,scope,label,reason,sourceKind,externalRef}

sourceKind: user_explicit | host_reviewed.
externalRef: null | {system: personalization | decision_learning |
proactive_research, id}.

External references are host attestations, not validated external records.
Subject records remain immutable. Result adds subjectId.

## recordQuestion

Additional fields:

{questionId,subjectId,threadId,kind,rationale,proposal,questionText,basedOnFeedbackId}

kind: proposal | experience | clarification.
proposal is nonempty text only for kind proposal; it must be null otherwise.
basedOnFeedbackId is null or an existing feedback ID for exactly that subject.

New questions start draft. An existing question with the same subjectId,
threadId and kind prevents a new ID, regardless of its current status. The
original question is reused. A genuinely new decision can use a new subject;
fabricating subjects to evade duplicate protection is not authorized.
Result adds questionId and subjectId.

## markAsked

Additional fields: {presentationId,questionId,threadId}.

The question must be draft and the thread must match exactly. No other asked
question may exist in that thread, even for another scope. The question becomes
asked and the presentation records a host output handoff attempt, with
userReadVerified:false. This is not proof of receipt or approval.

Result adds presentationId and questionId. Exact replay is safe after the
question has subsequently been answered.

## recordFeedback

Additional fields:

{feedbackId,subjectId,threadId,route,questionId,phase,signal,summary,reason,
 appliesTo,preferenceKey,useEvidenceRef}

- route: spontaneous | elicited.
- phase considering: interested | chosen | declined | paused | uncertain |
  change_requested.
- phase experience: positive | mixed | negative | uncertain | not_used.
- phase preference: confirmed | corrected | uncertain.
- appliesTo: this_task | ongoing | unspecified.
- reason: nonempty text | null.
- preferenceKey: required token for phase preference, null for other phases.
- useEvidenceRef: only allowed for experience. Required for positive, mixed and
  negative; null for not_used; optional for uncertain.

The runtime derives sourceAuthority:user_explicit; callers cannot supply an
inferred authority. This means the host attests an explicit user report, not that
the runtime independently verifies the report.
afterUseReported is true only for experience with a non-null useEvidenceRef and
a signal other than not_used.

spontaneous requires questionId:null. It records feedback for the real subject
without inventing a question or closing any asked question.

elicited requires an existing asked question with exactly matching subjectId
and threadId. Proposal questions accept considering feedback; experience
questions accept experience feedback; clarification questions accept any phase.
The answer changes the question to answered, except paused -> deferred and
declined -> dismissed. Those terminal questions are not reopened in this phase.
A reply to a draft, answered, deferred or dismissed question is rejected unless
it is an exact retry of the already recorded feedback event.

Result adds feedbackId, subjectId and questionId. Neither interest, choice nor
positive experience creates an ongoing preference automatically.

## parkQuestion

Additional fields: {parkingId,questionId,threadId,reason}.

The question must be draft or asked and belong to the exact thread. It becomes
parked and a parking record saves basis:host_context_change. The host records why
the current conversation no longer calls for this question. No user feedback,
dislike, satisfaction, read proof or preference is fabricated. Parking an asked
question removes the thread's pending-question block.

Result adds parkingId and questionId. An exact retry is safe. Parked questions
are not automatically asked again, and duplicate identity protection remains
in force. Explicit user feedback saying paused still uses the existing
elicited-feedback/deferred path; host parking is a distinct event.

## planQuestion(state,{threadId,scope,at})

Requires at >= state.updatedAt.

- Any asked question in the thread: shouldAsk:false, reason:awaiting_reply.
- Otherwise choose the oldest draft revision for the exact scope and thread:
  shouldAsk:true, reason:draft_available.
- No matching draft: shouldAsk:false, reason:no_draft.

Returns {threadId,scope,shouldAsk,reason,question,subject,promptPreview,sourceRefs,
authorizesExecution:false,userReadVerified:false}.

question and subject are the applicable saved records, or null. If an asked
question in another scope blocks the thread, its own subject scope remains
visible; it is not reclassified into the requested scope. promptPreview is
non-null only when shouldAsk is true, and equals rationale + one space +
(proposal + one space when present) + questionText.
sourceRefs retains the subject, question and any based-on feedback reference.

The queue is an author's plan, not a schedule. The host reviews the current
conversation before asking and records markAsked only for its actual output
handoff attempt. These flags describe module effects, not a revocation of
authorization the user already gave.

## dialogueContext(state,{scope,threadId,at,limit?})

Requires at >= state.updatedAt. limit: 1..10, default5.

Returns {scope,threadId,items,totalAvailable,omitted,limit,pendingQuestion,
draftQuestions,draftsOmitted,recentQuestions,questionsOmitted,knownPreferences,unresolvedPreferences,
currentTaskPreferences,authorizesExecution:false,userReadVerified:false,
infersPreferences:false}.

items are the latest feedback by event revision for exactly the supplied scope,
from both routes equally. omitted counts matching feedback outside the item
limit. Every summary retains id, subjectId, threadId, summary, reason, scope,
sourceRef, route, phase, signal, appliesTo, preferenceKey, useEvidenceRef,
afterUseReported, sourceAuthority and at.

pendingQuestion is the current thread's asked question with its own subject
record, or null. It can belong to another scope, since it blocks further
questions in that thread. It never exposes another thread's pending question.
draftQuestions contains up to10 oldest drafts for the exact scope and current
thread, each with its subject. draftsOmitted records additional matching drafts.
recentQuestions contains at most5 questions for the exact scope and current
thread, newest status revision first, as {question,subject,parking}. parking is
the saved host-context-change record or null. questionsOmitted records additional
matching questions, so a parked question's reason remains reviewable without
inventing a user answer.

Preference views use all matching feedback, not only items:

- For phase preference and appliesTo ongoing, choose the latest event for each
  preferenceKey. confirmed/corrected goes to knownPreferences; uncertain goes
  to unresolvedPreferences. An older confirmation is never revived.
- For phase preference and appliesTo this_task, choose the latest event per key
  in the current thread only, and return it separately in currentTaskPreferences.
  Uncertain task preferences remain uncertain there; they do not become ongoing.
- appliesTo unspecified, considering feedback and experience feedback remain
  recorded evidence but are not promoted into an ongoing preference.

There is no automatic ranking or profile rewrite. Full output overflow raises
DIALOGUE_OUTPUT_CAPACITY rather than silently discarding history or sources.
All views are read-only and make no inference about approval, emotion or cause.

## Errors

Error.code is one of:
DIALOGUE_INPUT_INVALID, DIALOGUE_STATE_INVALID, DIALOGUE_STATE_CAPACITY,
DIALOGUE_OUTPUT_CAPACITY, DIALOGUE_REVISION_CONFLICT, DIALOGUE_ID_CONFLICT,
DIALOGUE_TIME_ORDER, DIALOGUE_SUBJECT_NOT_FOUND, DIALOGUE_QUESTION_NOT_FOUND,
DIALOGUE_FEEDBACK_NOT_FOUND, DIALOGUE_QUESTION_DUPLICATE, DIALOGUE_QUESTION_STATE,
DIALOGUE_THREAD_MISMATCH, DIALOGUE_SUBJECT_MISMATCH, DIALOGUE_PHASE_MISMATCH,
DIALOGUE_PENDING_QUESTION.

No raw natural-language classification is performed. A host can use a separate
interpreter, but the resulting feedback must still satisfy the exact linkage,
phase and evidence requirements above.
