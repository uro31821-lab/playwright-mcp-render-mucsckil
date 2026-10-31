import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, ingest, recall, propose, addLesson, evaluateLesson, setProposalStatus,
} from './engine.mjs';

const NOW = '2026-10-31T01:00:00.000Z';
const CONTEXT = { platform: 'android', version: '2', environment: 'synthetic-test' };
const FINGERPRINT = 'a'.repeat(64);
const DOMAINS = ['connection', 'device', 'web', 'output', 'research', 'calculation',
  'routine', 'development', 'orchestration'];

function event(id, overrides = {}) {
  return {
    eventId: id, taskId: `task-${id}`, attemptId: `attempt-${id}`, sequence: 1,
    timestamp: '2026-10-31T00:00:00.000Z', domain: 'connection',
    operation: 'connection.check', engine: 'jh-synthetic', context: { ...CONTEXT },
    outcome: 'failure_verified', source: 'host_verified', evidenceRefs: [`fixture:${id}`],
    errorCode: 'E_SYNTHETIC', ...overrides,
  };
}

function ingestAll(events, state = createState()) {
  for (const item of events) state = ingest(state, item).state;
  return state;
}

function proposalsOf(state, kind) {
  return propose(state, { now: NOW }).proposals.filter(item => item.kind === kind);
}

function lesson(id = 'lesson-connection', overrides = {}) {
  return {
    id, domain: 'connection', operation: 'connection.check', engine: 'jh-synthetic',
    context: { ...CONTEXT }, guidance: 'Inspect the existing completion receipt before planning another attempt.',
    evidenceRefs: ['fixture:reviewed-cause', 'fixture:reviewed-fix'],
    ruleVersion: '1', inputFingerprint: FINGERPRINT, ...overrides,
  };
}

function query(overrides = {}) {
  return { domain: 'connection', operation: 'connection.check', engine: 'jh-synthetic',
    context: { ...CONTEXT }, ...overrides };
}

function evaluation(overrides = {}) {
  return { ruleVersion: '1', inputFingerprint: FINGERPRINT,
    passed: 2, failed: 0, skipped: 0, evidenceRefs: ['fixture:executed-regression'], ...overrides };
}

function activeState() {
  return evaluateLesson(addLesson(createState(), lesson()), 'lesson-connection', evaluation());
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('same event is idempotent, while a conflicting reuse of its ID is rejected', () => {
  const original = event('event-dedupe');
  const first = ingest(createState(), original);
  assert.equal(first.duplicate, false);
  assert.equal(first.changed, true);
  const again = ingest(first.state, structuredClone(original));
  assert.equal(again.duplicate, true);
  assert.equal(again.changed, false);
  assert.deepEqual(again.state, first.state);
  const before = structuredClone(first.state);
  assert.throws(() => ingest(first.state, { ...original, errorCode: 'DIFFERENT_ERROR' }));
  assert.deepEqual(first.state, before);
});

test('repeated polling of one attempt does not count as independent failures', () => {
  const polls = Array.from({ length: 6 }, (_, index) => event(`poll-${index}`, {
    taskId: 'task-one', attemptId: 'attempt-one', sequence: index + 1,
  }));
  const state = ingestAll(polls);
  assert.equal(Object.values(state.attempts).length, 1);
  assert.equal(proposalsOf(state, 'rule_fix').length, 0);
  const withAnotherTask = ingest(state, event('independent-failure')).state;
  const fixes = proposalsOf(withAnotherTask, 'rule_fix');
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].independentTaskCount, 2);
});

test('two failed attempts inside one task still represent one independent task', () => {
  const state = ingestAll([
    event('same-task-a', { taskId: 'shared-task', attemptId: 'attempt-a' }),
    event('same-task-b', { taskId: 'shared-task', attemptId: 'attempt-b' }),
  ]);
  assert.equal(proposalsOf(state, 'rule_fix').length, 0);
});

test('two independent failures create one stable proposal rather than repeated suggestions', () => {
  const state = ingestAll([event('failure-a'), event('failure-b')]);
  const first = propose(state, { now: NOW });
  const second = propose(first.state, { now: '2026-10-31T02:00:00.000Z' });
  const initialFixes = first.proposals.filter(p => p.kind === 'rule_fix');
  const laterFixes = Object.values(second.state.proposals).filter(p => p.kind === 'rule_fix');
  assert.equal(initialFixes.length, 1);
  assert.equal(second.proposals.length, 0);
  assert.equal(laterFixes.length, 1);
  assert.equal(laterFixes[0].id, initialFixes[0].id);
  assert.equal(laterFixes[0].createdAt, initialFixes[0].createdAt);
  assert.equal(laterFixes[0].patternKey, initialFixes[0].patternKey);
});

test('learning handles all JH work domains, including non-development work', () => {
  const state = ingestAll(DOMAINS.flatMap(domain => [1, 2].map(n => event(`${domain}-${n}`, {
    domain, operation: `${domain}.synthetic-case`,
  }))));
  const fixes = proposalsOf(state, 'rule_fix');
  assert.equal(fixes.length, DOMAINS.length);
  assert.deepEqual(new Set(fixes.map(p => p.scope.domain)), new Set(DOMAINS));
  for (const item of fixes) assert.equal(item.independentTaskCount, 2);
});

test('late verified completion replaces uncertainty without creating a retry recommendation', () => {
  const first = event('unknown', { outcome: 'completion_unknown', errorCode: 'COMPLETION_UNKNOWN' });
  let state = ingest(createState(), first).state;
  state = ingest(state, event('late-success', {
    taskId: first.taskId, attemptId: first.attemptId, sequence: 2,
    timestamp: '2026-10-31T00:01:00.000Z', outcome: 'success_verified', errorCode: undefined,
  })).state;
  const attempts = Object.values(state.attempts);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].outcome, 'success_verified');
  assert.equal(proposalsOf(state, 'rule_fix').length, 0);
  assert.equal(proposalsOf(state, 'verification_gap').length, 0);
  assert.ok(!propose(state, { now: NOW }).proposals.some(p => /retry|replay/.test(p.kind)));
});

test('an out-of-order observation cannot regress the latest verified result', () => {
  const good = event('latest-result', { outcome: 'success_verified', sequence: 3, errorCode: undefined });
  let state = ingest(createState(), good).state;
  state = ingest(state, event('stale-result', {
    taskId: good.taskId, attemptId: good.attemptId, sequence: 1,
    timestamp: '2026-10-31T00:05:00.000Z', outcome: 'failure_verified',
  })).state;
  const current = Object.values(state.attempts)[0];
  assert.equal(current.sequence, 3);
  assert.equal(current.outcome, 'success_verified');
  assert.equal(proposalsOf(state, 'rule_fix').length, 0);
});

test('observed and pending states are not verified outcomes or proposal evidence', () => {
  const observations = ['observed', 'pending'].flatMap(outcome => [1, 2, 3].map(n => event(outcome + '-' + n, {
    outcome, errorCode: undefined, evidenceRefs: [],
  })));
  const state = ingestAll(observations);
  assert.equal(Object.keys(state.attempts).length, 6);
  assert.equal(propose(state, { now: NOW }).proposals.length, 0);
});

test('new observation and pending events cannot downgrade an existing verified outcome', () => {
  for (const verified of ['success_verified', 'failure_verified']) {
    const original = event('verified-' + verified, { outcome: verified });
    let state = ingest(createState(), original).state;
    for (const [index, outcome] of ['observed', 'pending'].entries()) state = ingest(state, event('after-' + outcome, {
      taskId: original.taskId, attemptId: original.attemptId, sequence: index + 2,
      outcome, evidenceRefs: [], errorCode: undefined,
    })).state;
    assert.equal(Object.values(state.attempts)[0].outcome, verified);
  }
});

test('a reviewed lesson begins as a candidate and does not affect recall', () => {
  const state = addLesson(createState(), lesson());
  assert.deepEqual(recall(state, query()), []);
  assert.throws(() => addLesson(createState(), lesson('illicit-active', { state: 'active' })));
});

test('real passing evidence for the exact rule and input activates an advisory lesson', () => {
  const state = activeState();
  const recalled = recall(state, query());
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].id, 'lesson-connection');
  assert.equal(recalled[0].advisoryOnly, true);
});

test('missing, stale, zero-test, or skipped evaluation proof cannot activate a lesson', () => {
  const invalid = [
    { passed: 0 }, { skipped: 1 }, { evidenceRefs: [] },
    { ruleVersion: '2' }, { inputFingerprint: 'b'.repeat(64) },
  ];
  for (const mismatch of invalid) {
    const state = freezeDeep(addLesson(createState(), lesson()));
    const before = structuredClone(state);
    assert.throws(() => evaluateLesson(state, 'lesson-connection', evaluation(mismatch)), JSON.stringify(mismatch));
    assert.deepEqual(state, before);
    assert.deepEqual(recall(state, query()), []);
  }
});

test('recall excludes another domain, operation, engine, version, platform, or environment', () => {
  const state = activeState();
  const mismatches = [
    { domain: 'device' }, { operation: 'connection.other' }, { engine: 'other-engine' },
    { context: { ...CONTEXT, platform: 'windows' } },
    { context: { ...CONTEXT, version: '3' } },
    { context: { ...CONTEXT, environment: 'production' } },
  ];
  for (const mismatch of mismatches) assert.deepEqual(recall(state, query(mismatch)), [], JSON.stringify(mismatch));
});

test('a later failing evaluation quarantines a formerly active lesson', () => {
  const state = evaluateLesson(activeState(), 'lesson-connection', evaluation({ passed: 1, failed: 1 }));
  assert.deepEqual(recall(state, query()), []);
});

test('dismissed suggestions remain dismissed as matching evidence grows', () => {
  const initial = propose(ingestAll([event('dismiss-a'), event('dismiss-b')]), { now: NOW });
  const fix = initial.proposals.find(p => p.kind === 'rule_fix');
  let state = setProposalStatus(initial.state, fix.id, 'dismissed');
  state = ingest(state, event('dismiss-c')).state;
  const next = propose(state, { now: '2026-10-31T03:00:00.000Z' });
  const same = Object.values(next.state.proposals).find(p => p.id === fix.id);
  assert.ok(same);
  assert.equal(same.status, 'dismissed');
  assert.equal(next.proposals.length, 0);
  assert.equal(Object.values(next.state.proposals).filter(p => p.kind === 'rule_fix').length, 1);
});

test('without timing evidence the engine does not invent a saving', () => {
  const fix = proposalsOf(ingestAll([event('no-metrics-a'), event('no-metrics-b')]), 'rule_fix')[0];
  assert.equal(fix.expectedBenefit.basis, 'unmeasured');
  assert.equal(fix.expectedBenefit.baseline, null);
  assert.equal(fix.expectedBenefit.savings, null);
});

test('observed cost is reported as a baseline, not as a claimed saving', () => {
  const metrics = { durationMs: 1000, userSteps: 2, toolCalls: 3 };
  const fix = proposalsOf(ingestAll([
    event('measured-a', { metrics }), event('measured-b', { metrics: { ...metrics } }),
  ]), 'rule_fix')[0];
  assert.equal(fix.expectedBenefit.basis, 'measured');
  assert.deepEqual(fix.expectedBenefit.baseline, metrics);
  assert.equal(fix.expectedBenefit.savings, null);
});

test('three independent successful routines propose automation without scheduling or executing it', () => {
  const routine = id => event(id, { domain: 'routine', operation: 'routine.synthetic-summary',
    outcome: 'success_verified', errorCode: undefined });
  let state = ingestAll([routine('routine-a'), routine('routine-b')]);
  assert.equal(proposalsOf(state, 'workflow_automation').length, 0);
  state = ingest(state, routine('routine-c')).state;
  const before = structuredClone(state);
  const suggestions = proposalsOf(state, 'workflow_automation');
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].status, 'open');
  assert.equal(suggestions[0].independentTaskCount, 3);
  assert.deepEqual(state, before);
  assert.equal(Object.hasOwn(state, 'scheduledActions'), false);
  assert.equal(Object.hasOwn(state, 'executedActions'), false);
});

function trainingEvents({ reviewed = true, remediation = true, diverse = true, holdout = true,
  overlappingHoldout = false } = {}) {
  const train = [1, 2, 3].map(n => event(`training-${n}`, {
    domain: 'research', operation: diverse && n === 3 ? 'research.compare' : 'research.extract',
    labels: { reviewed, ruleRemediationTried: remediation, holdout: false },
  }));
  if (holdout) train.push(event('holdout-one', {
    taskId: overlappingHoldout ? train[0].taskId : 'holdout-task', attemptId: 'holdout-attempt',
    domain: 'research', operation: 'research.compare',
    labels: { reviewed: true, ruleRemediationTried: true, holdout: true },
  }));
  return train;
}

test('additional-learning evaluation requires reviewed varied cases, tried remediation, and separate holdout', () => {
  const proposals = proposalsOf(ingestAll(trainingEvents()), 'learning_evaluation');
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].status, 'open');
  assert.equal(proposals[0].expectedBenefit.savings, null);
});

test('missing training readiness conditions do not trigger an additional-learning proposal', () => {
  const insufficient = [
    { reviewed: false }, { remediation: false }, { diverse: false },
    { holdout: false }, { overlappingHoldout: true },
  ];
  for (const options of insufficient) {
    assert.equal(proposalsOf(ingestAll(trainingEvents(options)), 'learning_evaluation').length,
      0, JSON.stringify(options));
  }
  const tooFew = trainingEvents();
  tooFew.splice(1, 1);
  assert.equal(proposalsOf(ingestAll(tooFew), 'learning_evaluation').length, 0);
});

test('all state transitions preserve caller-owned state and event objects', () => {
  const initial = freezeDeep(createState());
  const input = freezeDeep(event('immutable-first'));
  const inputCopy = structuredClone(input);
  const initialCopy = structuredClone(initial);
  const received = ingest(initial, input);
  assert.deepEqual(initial, initialCopy);
  assert.deepEqual(input, inputCopy);
  const candidateInput = freezeDeep(received.state);
  const candidateCopy = structuredClone(candidateInput);
  const candidate = addLesson(candidateInput, freezeDeep(lesson()));
  assert.deepEqual(candidateInput, candidateCopy);
  const frozenCandidate = freezeDeep(candidate);
  const candidateBefore = structuredClone(frozenCandidate);
  const activated = evaluateLesson(frozenCandidate, 'lesson-connection', freezeDeep(evaluation()));
  assert.deepEqual(frozenCandidate, candidateBefore);
  const activeBefore = structuredClone(activated);
  recall(freezeDeep(activated), query());
  assert.deepEqual(activated, activeBefore);
  const failures = freezeDeep(ingestAll([event('immutable-failure-a'), event('immutable-failure-b')]));
  const failuresBefore = structuredClone(failures);
  const offered = propose(failures, { now: NOW });
  assert.deepEqual(failures, failuresBefore);
  const offeredBefore = structuredClone(offered.state);
  setProposalStatus(freezeDeep(offered.state), offered.proposals.find(p => p.kind === 'rule_fix').id, 'dismissed');
  assert.deepEqual(offered.state, offeredBefore);
});
