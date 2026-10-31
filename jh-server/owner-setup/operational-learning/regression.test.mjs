import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRegression, runRegression } from './regression.mjs';
import { addLesson, createState, evaluateLesson, recall } from './engine.mjs';

const scope = { domain: 'calculation', operation: 'invoice.total', engine: 'synthetic',
  context: { platform: 'node', version: '1', environment: 'synthetic-test' } };
const definition = { id: 'calculation-rounding-v1', ...scope,
  guidance: 'Keep calculation inputs and expected totals explicit.', ruleVersion: '1', evidenceRefs: ['fixture:rounding-correction'] };
const suite = { id: 'invoice-rounding', version: '1', cases: [
  { id: 'positive', input: [0.1, 0.2], expected: 0.3 },
  { id: 'zero', input: [], expected: 0 },
  { id: 'negative', input: [-1, 0.2], expected: -0.8 },
] };
const sum = xs => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

test('actual effect-free replay passes all cases and activates only matching lesson', async () => {
  const lesson = bindRegression(definition, suite);
  let calls = 0;
  const result = await runRegression(lesson, suite, input => { calls++; return sum(input); });
  assert.equal(calls, 3);
  assert.equal(result.evaluation.passed, 3);
  assert.equal(result.evaluation.failed, 0);
  assert.equal(result.evaluation.evidenceRefs[0].startsWith('regression:'), true);
  const active = evaluateLesson(addLesson(createState(), lesson), lesson.id, result.evaluation);
  assert.equal(recall(active, scope).length, 1);
});

test('a real failing replay quarantines guidance and never reports a pass', async () => {
  const lesson = bindRegression(definition, suite);
  const result = await runRegression(lesson, suite, () => 999);
  assert.equal(result.evaluation.passed, 0);
  assert.equal(result.evaluation.failed, 3);
  const bad = evaluateLesson(addLesson(createState(), lesson), lesson.id, result.evaluation);
  assert.equal(bad.lessons[lesson.id].state, 'quarantined');
  assert.deepEqual(recall(bad, scope), []);
});

test('changed fixture or rule requires a new fingerprint before any evaluator call', async () => {
  const lesson = bindRegression(definition, suite);
  let calls = 0;
  const changed = structuredClone(suite);
  changed.cases[0].expected = 999;
  await assert.rejects(runRegression(lesson, changed, () => { calls++; return 999; }));
  await assert.rejects(runRegression({ ...lesson, guidance: 'Changed rule' }, suite, () => { calls++; return 999; }));
  assert.equal(calls, 0);
});

test('empty suites cannot activate a rule and evaluator exception text is not persisted', async () => {
  assert.throws(() => bindRegression(definition, { ...suite, cases: [] }));
  const lesson = bindRegression(definition, suite);
  const result = await runRegression(lesson, suite, () => { throw new Error('private-example-message'); });
  assert.equal(result.evaluation.failed, 3);
  assert.equal(JSON.stringify(result).includes('private-example-message'), false);
});
