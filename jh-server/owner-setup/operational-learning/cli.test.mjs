import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execute } from './cli.mjs';
import { evaluateConstraints } from './constraints.mjs';

test('CLI ingestion, recall, validation and suggestions survive independent invocations', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-learning-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const flags = ['--store', path.join(directory, 'memory.json'), '--owner', 'synthetic-owner'];
  const scope = { domain: 'output', operation: 'summary.format', engine: 'jh-test', context: { platform: 'chat', version: '1', environment: 'synthetic' } };
  const event = n => ({ eventId: 'event-' + n, taskId: 'task-' + n, attemptId: 'attempt-' + n,
    sequence: 1, timestamp: '2026-10-31T10:00:00.000Z', ...scope,
    outcome: 'correction', source: 'user_explicit', errorCode: 'OUTPUT_SOURCE_MISSING', evidenceRefs: ['fixture:output-' + n] });
  assert.equal((await execute(['status', ...flags])).persisted, false);
  const first = await execute(['ingest', ...flags], event(1));
  assert.equal(first.recorded, 1); assert.equal(first.newProposals.length, 0);
  const second = await execute(['ingest', ...flags], event(2));
  assert.equal(second.newProposals.length, 1);
  assert.equal((await execute(['ingest', ...flags], event(2))).duplicates, 1);
  const lesson = { id: 'output-format-v1', ...scope, guidance: 'A verified source identifier is required for a source-based summary.',
    ruleVersion: '1', evidenceRefs: ['fixture:format-correction'] };
  const suite = { id: 'source-format', version: '1', cases: [
    { id: 'present', input: { value: { source: 'fixture:article' }, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
    { id: 'missing', input: { value: {}, constraints: [{ path: ['source'], op: 'exists' }] }, expected: { passed: false, failed: [0] } },
  ] };
  const candidate = await execute(['candidate', ...flags], { lesson, suite });
  assert.equal(candidate.lesson.state, 'candidate');
  assert.deepEqual((await execute(['recall', ...flags], scope)).lessons, []);
  const checked = await execute(['check', ...flags], { lesson, suite });
  assert.equal(checked.report.passed, 2); assert.equal(checked.lessonState, 'active');
  assert.equal((await execute(['recall', ...flags], scope)).lessons.length, 1);
  const status = await execute(['status', ...flags]);
  assert.equal(status.persisted, true); assert.equal(status.counts.events, 2);
  assert.equal(status.counts.lessons, 1);
});

test('constraints cover numeric and text output with explicit missing-field failures', () => {
  const constraints = [
    { path: ['count'], op: 'between', expected: { min: 2, max: 4 } },
    { path: ['text'], op: 'includes', expected: 'source' },
    { path: ['text'], op: 'excludes', expected: 'password' },
    { path: ['verified'], op: 'equals', expected: true },
  ];
  assert.deepEqual(evaluateConstraints({ value: { count: 3, text: 'source checked', verified: true }, constraints }), { passed: true, failed: [] });
  assert.deepEqual(evaluateConstraints({ value: {}, constraints }), { passed: false, failed: [0, 1, 2, 3] });
  assert.throws(() => evaluateConstraints({ value: {}, constraints: [{ path: ['__proto__'], op: 'exists' }] }));
  assert.throws(() => evaluateConstraints({ value: {}, constraints: [{ path: [], op: 'execute', expected: 'shell' }] }));
});

test('CLI rejects unsupported executable input and unknown commands', async () => {
  const flags = ['--store', path.join(tmpdir(), 'not-written-learning-test.json'), '--owner', 'synthetic-owner'];
  await assert.rejects(execute(['check', ...flags], { lesson: {}, suite: {}, script: 'anything' }));
  await assert.rejects(execute(['dispatch', ...flags], {}));
});
