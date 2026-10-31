import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateTrajectory, evaluatePromptfooTrajectory } from './trajectory.mjs';
import { bindRegression, runRegression } from './regression.mjs';

const suite = JSON.parse(await readFile(new URL('./fixtures/learning-trajectories.json', import.meta.url), 'utf8'));
const fixture = id => structuredClone(suite.cases.find(item => item.id === id).input);
const simple = () => ({ trace: { steps: [{ id: 'one', tool: 'output.emit', args: { target: 'right', count: 1 } }] },
  checks: [{ op: 'tool_used', tool: 'output.emit', min: 1, max: 1 }] });

test('five explicitly synthetic cross-domain recordings match their expected results', () => {
  assert.equal(suite.synthetic, true);
  assert.equal(suite.evaluator, 'jh.trajectory.v1');
  assert.equal(suite.cases.length, 5);
  for (const item of suite.cases) assert.deepEqual(evaluateTrajectory(item.input), item.expected, item.id);
});

test('real regression replay binds the trajectory evaluator type and all positive/negative fixtures', async () => {
  const definition = { id: 'trajectory-policy-v1', domain: 'orchestration', operation: 'trace.check',
    engine: 'synthetic', context: { platform: 'node', version: '1', environment: 'synthetic-test' },
    guidance: 'Compare recorded steps, targets, and evidence without claiming live execution.',
    ruleVersion: '1', evidenceRefs: ['fixture:jh-learning-trajectories'] };
  const lesson = bindRegression(definition, suite);
  const result = await runRegression(lesson, suite, evaluateTrajectory);
  assert.equal(result.evaluation.passed, 5);
  assert.equal(result.evaluation.failed, 0);
  let calls = 0;
  await assert.rejects(runRegression(lesson, { ...suite, evaluator: 'jh.constraints.v1' }, () => { calls++; }));
  assert.equal(calls, 0);
});

test('fixing the pane makes the device trace pass, without inventing a new live result', () => {
  const input = fixture('device-wrong-pane');
  input.trace.steps[0].args.target.pane = 'right';
  input.trace.steps[1].args.target.pane = 'right';
  input.trace.steps[1].evidenceRefs = ['fixture:right-pane-state'];
  input.trace.claims[0].evidenceRefs = ['fixture:right-pane-state'];
  assert.deepEqual(evaluateTrajectory(input), { passed: true, failed: [] });
});

test('research success needs a verified result beyond a successful HTTP receipt', () => {
  const input = fixture('research-http-ack-is-not-verified-success');
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [2] });
  input.trace.steps.push({ id: 'verify', tool: 'research.evidence.verify', args: { sourceId: 'fixture-paper' },
    status: 'success_verified', source: 'host_verified', evidenceRefs: ['fixture:content-verified'] });
  input.trace.claims[0].stepId = 'verify';
  input.trace.claims[0].evidenceRefs = ['fixture:content-verified'];
  assert.deepEqual(evaluateTrajectory(input), { passed: true, failed: [] });
});

test('output omission and reordering fail the explicit field-order contract', () => {
  for (const sections of [['summary', 'next'], ['evidence', 'summary', 'next']]) {
    const input = fixture('output-required-sections');
    input.trace.steps[2].args.sections = sections;
    assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [1] });
  }
});

test('all selected attempts must use the correct arguments; a later correct call cannot hide the wrong target', () => {
  const input = simple();
  input.trace.steps.push({ id: 'two', tool: 'output.emit', args: { target: 'left', count: 1 } });
  input.checks = [{ op: 'tool_args', tool: 'output.emit', mode: 'exact', expected: { target: 'right', count: 1 } }];
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
  input.checks[0].stepId = 'one';
  assert.deepEqual(evaluateTrajectory(input), { passed: true, failed: [] });
  input.checks[0].stepId = 'missing';
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
});

test('path matching never coerces values and missing arguments fail', () => {
  const input = simple();
  input.checks = [{ op: 'tool_args', tool: 'output.emit', mode: 'path', path: ['count'], expected: '1' }];
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
  input.checks[0].expected = 1;
  assert.deepEqual(evaluateTrajectory(input), { passed: true, failed: [] });
  input.checks[0].path = ['missing'];
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
  delete input.trace.steps[0].args;
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
});

test('subsequence allows intermediate work while contiguous explicitly requires adjacency', () => {
  const input = { trace: { steps: ['prepare', 'observe', 'emit'].map(tool => ({ id: tool, tool })) },
    checks: [{ op: 'ordered_tools', tools: ['prepare', 'emit'], mode: 'subsequence' },
      { op: 'ordered_tools', tools: ['prepare', 'emit'], mode: 'contiguous' }] };
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [1] });
  input.trace.steps.reverse();
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0, 1] });
});

test('repeated tool expectations need distinct calls and forbidden tools count failed attempts too', () => {
  const input = simple();
  input.checks = [{ op: 'ordered_tools', tools: ['output.emit', 'output.emit'], mode: 'subsequence' },
    { op: 'tool_used', tool: 'apk.uninstall', min: 0, max: 0 }];
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
  input.trace.steps.push({ id: 'delete', tool: 'apk.uninstall', status: 'failure_verified' });
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0, 1] });
});

test('step counts include every recorded call and use inclusive bounds', () => {
  const input = simple();
  input.checks = [{ op: 'step_count', min: 1, max: 1 }];
  assert.deepEqual(evaluateTrajectory(input), { passed: true, failed: [] });
  input.trace.steps.push({ id: 'two', tool: 'output.check' });
  assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [0] });
});

test('a claim needs the same result ID, host source, verified status, and bound evidence', () => {
  const base = fixture('output-required-sections');
  const variations = [
    input => { input.trace.claims[0].stepId = 'missing'; },
    input => { input.trace.claims[0].evidenceRefs = ['fixture:unrelated']; },
    input => { input.trace.steps[1].source = 'user_reported'; },
    input => { input.trace.steps[1].source = 'user_explicit'; },
    input => { input.trace.steps[1].status = 'pending'; },
    input => { input.trace.steps[1].status = 'completion_unknown'; },
    input => { input.trace.steps[1].status = 'failure_verified'; },
    input => { input.trace.steps[1].evidenceRefs = []; },
  ];
  for (const change of variations) {
    const input = structuredClone(base); change(input);
    assert.deepEqual(evaluateTrajectory(input), { passed: false, failed: [3] });
  }
});

test('success claims cannot bypass verification by omitting its check; absent claims do not vacuously pass', () => {
  const input = fixture('output-required-sections');
  input.checks = input.checks.filter(rule => rule.op !== 'claims_verified');
  assert.throws(() => evaluateTrajectory(input), TypeError);
  const noClaims = simple();
  noClaims.checks = [{ op: 'claims_verified' }];
  assert.deepEqual(evaluateTrajectory(noClaims), { passed: false, failed: [0] });
});

test('missing trace, empty steps, and empty checks never pass', () => {
  for (const input of [null, {}, { checks: [] }, { trace: { steps: [] }, checks: [{ op: 'step_count' }] },
    { trace: { steps: [{ id: 'a', tool: 'read' }] }, checks: [] }]) {
    assert.throws(() => evaluateTrajectory(input), TypeError);
  }
});

test('unsupported operators, undeclared sequence modes, extra fields, invalid bounds and duplicate IDs are rejected', () => {
  const variations = [
    input => { input.checks = [{ op: 'javascript', value: 'return true' }]; },
    input => { input.checks = [{ op: 'ordered_tools', tools: ['output.emit'] }]; },
    input => { input.checks = [{ op: 'tool_used', tool: 'output.emit', min: 0 }]; },
    input => { input.checks = [{ op: 'step_count', min: 2, max: 1 }]; },
    input => { input.checks = [{ op: 'step_count', min: 1.5 }]; },
    input => { input.checks = [{ op: 'claims_verified', min: 0 }]; },
    input => { input.trace.steps.push({ id: 'one', tool: 'output.emit' }); },
    input => { input.trace.steps[0].status = 'HTTP_OK'; },
    input => { input.extra = 'ignored'; },
  ];
  for (const change of variations) {
    const input = simple(); change(input); assert.throws(() => evaluateTrajectory(input), TypeError);
  }
});

test('prototype paths and hidden or inherited data are rejected before traversing arguments', () => {
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const input = simple();
    input.checks = [{ op: 'tool_args', tool: 'output.emit', mode: 'path', path: [key], expected: true }];
    assert.throws(() => evaluateTrajectory(input), TypeError);
    const malicious = JSON.parse('{"trace":{"steps":[{"id":"a","tool":"read","args":{"' + key + '":{}}}]},"checks":[{"op":"step_count"}]}');
    assert.throws(() => evaluateTrajectory(malicious), TypeError);
  }
  const input = simple();
  input.trace.steps[0].args = Object.create({ target: 'right' });
  assert.throws(() => evaluateTrajectory(input), TypeError);
  input.trace.steps[0].args = { target: 'right' };
  Object.defineProperty(input.trace.steps[0].args, 'hidden', { value: true });
  assert.throws(() => evaluateTrajectory(input), TypeError);
});

test('getters and proxies cannot run input-defined behavior', () => {
  let calls = 0;
  const input = simple();
  Object.defineProperty(input.trace.steps[0].args, 'trap', { enumerable: true, get() { calls++; return true; } });
  assert.throws(() => evaluateTrajectory(input), TypeError);
  const proxy = new Proxy({}, { getPrototypeOf() { calls++; return Object.prototype; }, get() { calls++; return true; } });
  assert.throws(() => evaluateTrajectory(proxy), TypeError);
  assert.equal(calls, 0);
});

test('data is never executed, and errors or adapter results never echo credential input', () => {
  const input = simple();
  const payload = 'globalThis.__jhTrajectoryExecuted = true';
  input.trace.steps[0].args.note = payload;
  input.checks = [{ op: 'tool_args', tool: 'output.emit', mode: 'path', path: ['note'], expected: payload }];
  assert.equal(evaluateTrajectory(input).passed, true);
  assert.equal(Object.hasOwn(globalThis, '__jhTrajectoryExecuted'), false);
  for (const args of [{ api_key: 'PRIVATE_SENTINEL' }, { note: 'Bearer abcdefghijklmnop' },
    { note: 'sk-' + 'a'.repeat(32) }, { note: '-----BEGIN PRIVATE KEY-----' }]) {
    input.trace.steps[0].args = args;
    assert.throws(() => evaluateTrajectory(input), error => error instanceof TypeError && !error.message.includes('PRIVATE_SENTINEL'));
    const result = evaluatePromptfooTrajectory(input);
    assert.equal(result.pass, false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
});

test('cyclic, sparse, deep, oversized, function, symbol and non-finite data fail within fixed bounds', () => {
  const mutations = [
    input => { input.trace.steps[0].args.self = input; },
    input => { input.trace.steps[0].args.values = Array(2); },
    input => { input.trace.steps[0].args.fn = () => true; },
    input => { input.trace.steps[0].args.n = Infinity; },
    input => { input.trace.steps[0].args[Symbol('hidden')] = true; },
    input => { input.trace.steps[0].args.text = 'x'.repeat(4097); },
    input => { input.trace.steps = Array.from({ length: 257 }, (_, index) => ({ id: `s${index}`, tool: 'read' })); },
    input => { input.checks = Array.from({ length: 101 }, () => ({ op: 'step_count' })); },
    input => { let at = input.trace.steps[0].args; for (let i = 0; i < 20; i++) at = at.child = {}; },
  ];
  for (const change of mutations) {
    const input = simple(); change(input); assert.throws(() => evaluateTrajectory(input), TypeError);
  }
});

test('pure promptfoo adapter grades supplied JSON and fails closed on malformed or excessive data', () => {
  const input = fixture('apk-reuse-update-once');
  const before = structuredClone(input);
  for (const value of [input, JSON.stringify(input)]) {
    const result = evaluatePromptfooTrajectory(value);
    assert.equal(result.pass, true); assert.equal(result.score, 1);
    assert.match(result.reason, /live effects are not verified/);
  }
  assert.deepEqual(input, before);
  const failed = evaluatePromptfooTrajectory(fixture('device-wrong-pane'));
  assert.equal(failed.pass, false); assert.equal(failed.score, 0);
  assert.match(failed.reason, /indexes: 1/);
  for (const value of [undefined, null, '', '{', 'true', JSON.stringify({}), 'x'.repeat(262145)]) {
    const result = evaluatePromptfooTrajectory(value);
    assert.equal(result.pass, false); assert.equal(result.score, 0);
  }
});
