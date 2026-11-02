/** SYNTHETIC private-file scenarios only; no actual personal dialogue state. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCommand } from './cli.mjs';

const D = globalThis.JHPersonalDialogue;
const at = second => new Date(Date.parse('2026-11-02T00:00:00Z') + second * 1000).toISOString();
const SCOPE = { topic: 'synthetic-task', project: 'synthetic-project', aspect: 'setup' };
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'jh-dialogue-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { store: join(dir, 'JH_Personal_Dialogue_v1.json'), owner: 'synthetic-owner' };
  await executeCommand('init', { ...options, input: { now: at(0) } });
  return { ...options, dir };
}
const subject = { expectedRevision: 0, subjectId: 'synthetic-subject', scope: SCOPE,
  label: 'Synthetic local setup', reason: 'Reduce repeated synthetic setup work.', sourceKind: 'user_explicit', externalRef: null,
  sourceRef: 'source:synthetic-subject', at: at(1) };
const question = { expectedRevision: 1, questionId: 'synthetic-question', subjectId: 'synthetic-subject', threadId: 'synthetic-thread',
  kind: 'proposal', rationale: 'This may reduce synthetic manual work.', proposal: 'Consider the synthetic local option.',
  questionText: 'Would you like to try this synthetic option?', basedOnFeedbackId: null,
  sourceRef: 'source:synthetic-question', at: at(2) };
const asked = { expectedRevision: 2, presentationId: 'synthetic-presentation', questionId: 'synthetic-question', threadId: 'synthetic-thread',
  sourceRef: 'source:synthetic-presentation', at: at(3) };
const readInput = { scope: SCOPE, threadId: 'synthetic-thread', at: at(20) };

test('both feedback routes survive file reload and exact retries preserve answered and parked questions', async t => {
  const f = await fixture(t);
  await executeCommand('subject', { ...f, input: subject });
  await executeCommand('question', { ...f, input: question });
  const draftPlan = await executeCommand('plan', { ...f, input: readInput });
  assert.equal(draftPlan.result.shouldAsk, true);
  await executeCommand('asked', { ...f, input: asked });
  const spontaneous = { expectedRevision: 3, feedbackId: 'synthetic-spontaneous', subjectId: 'synthetic-subject', threadId: 'synthetic-thread',
    route: 'spontaneous', questionId: null, phase: 'experience', signal: 'negative',
    summary: 'Synthetic user volunteers that an earlier trial needed too many steps.', reason: 'Repeated synthetic setup was cumbersome.',
    appliesTo: 'unspecified', preferenceKey: null, useEvidenceRef: 'source:synthetic-user-use-report',
    sourceRef: 'source:synthetic-spontaneous', at: at(4) };
  await executeCommand('feedback', { ...f, input: spontaneous });
  assert.equal(D.validateState(JSON.parse(await readFile(f.store, 'utf8'))).questions['synthetic-question'].status, 'asked');
  const elicited = { expectedRevision: 4, feedbackId: 'synthetic-elicited', subjectId: 'synthetic-subject', threadId: 'synthetic-thread',
    route: 'elicited', questionId: 'synthetic-question', phase: 'considering', signal: 'chosen',
    summary: 'Synthetic user chooses to try the newly proposed option.', reason: null,
    appliesTo: 'unspecified', preferenceKey: null, useEvidenceRef: null,
    sourceRef: 'source:synthetic-elicited', at: at(5) };
  await executeCommand('feedback', { ...f, input: elicited });
  await executeCommand('question', { ...f, input: { ...question, expectedRevision: 5, questionId: 'synthetic-experience-question',
    kind: 'experience', proposal: null, questionText: 'How did the synthetic trial work?', basedOnFeedbackId: 'synthetic-spontaneous',
    sourceRef: 'source:synthetic-experience-question', at: at(6) } });
  await executeCommand('park', { ...f, input: { expectedRevision: 6, parkingId: 'synthetic-parking', questionId: 'synthetic-experience-question',
    threadId: 'synthetic-thread', reason: 'Synthetic conversation moved to a different task.', sourceRef: 'source:synthetic-parking', at: at(7) } });
  const bytes = await readFile(f.store, 'utf8');
  const state = D.validateState(JSON.parse(bytes));
  assert.equal(state.revision, 7);
  assert.equal(Object.keys(state.feedback).length, 2);
  assert.equal(state.questions['synthetic-question'].status, 'answered');
  assert.equal(state.questions['synthetic-experience-question'].status, 'parked');
  for (const [command, input] of [['asked', asked], ['feedback', spontaneous], ['feedback', elicited]]) {
    const retry = await executeCommand(command, { ...f, input });
    assert.equal(retry.result.duplicate, true);
    assert.equal(retry.result.changed, false);
    assert.equal(retry.revision, 7);
  }
  await assert.rejects(executeCommand('feedback', { ...f, input: { ...elicited, summary: 'Conflicting synthetic content.' } }),
    { code: 'DIALOGUE_ID_CONFLICT' });
  const view = await executeCommand('context', { ...f, input: readInput });
  assert.deepEqual(view.result.items.map(item => item.route), ['elicited', 'spontaneous']);
  assert.deepEqual(view.result.items.map(item => item.afterUseReported), [false, true]);
  assert.equal(view.result.knownPreferences.length, 0);
  assert.equal(view.result.pendingQuestion, null);
  assert.equal((await executeCommand('plan', { ...f, input: readInput })).result.shouldAsk, false);
  assert.equal((await executeCommand('validate', f)).result.valid, true);
  assert.equal(await readFile(f.store, 'utf8'), bytes);
  assert.deepEqual(await readdir(f.dir), ['JH_Personal_Dialogue_v1.json']);
});

test('concurrent writers serialize under the private-file lock and exactly one stale CAS write is rejected', async t => {
  const f = await fixture(t);
  if (process.platform !== 'win32') assert.equal((await stat(f.store)).mode & 0o777, 0o600);
  const writes = await Promise.allSettled([
    executeCommand('subject', { ...f, input: { ...subject, subjectId: 'synthetic-a' } }),
    executeCommand('subject', { ...f, input: { ...subject, subjectId: 'synthetic-b' } }),
  ]);
  assert.equal(writes.filter(item => item.status === 'fulfilled').length, 1);
  const rejected = writes.filter(item => item.status === 'rejected');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'DIALOGUE_REVISION_CONFLICT');
  const state = D.validateState(JSON.parse(await readFile(f.store, 'utf8')));
  assert.equal(state.revision, 1);
  assert.equal(Object.keys(state.subjects).length, 1);
  assert.equal(Object.keys(state.events).length, 1);
  const bytes = await readFile(f.store, 'utf8');
  await assert.rejects(executeCommand('subject', { ...f, input: { ...subject, subjectId: 'synthetic-stale-new' } }),
    { code: 'DIALOGUE_REVISION_CONFLICT' });
  assert.equal(await readFile(f.store, 'utf8'), bytes);
  assert.deepEqual(await readdir(f.dir), ['JH_Personal_Dialogue_v1.json']);
});

test('wrong owners, missing stores, malformed JSON, and tampered states are preserved without reset or replacement', async t => {
  const f = await fixture(t);
  const original = await readFile(f.store, 'utf8');
  await assert.rejects(executeCommand('context', { ...f, owner: 'synthetic-stranger', input: readInput }),
    { code: 'DIALOGUE_OWNER_MISMATCH' });
  await assert.rejects(executeCommand('init', { ...f, input: { now: at(0) } }), { code: 'DIALOGUE_STORE_EXISTS' });
  assert.equal(await readFile(f.store, 'utf8'), original);
  await assert.rejects(executeCommand('validate', { ...f, store: join(f.dir, 'missing.json') }), { code: 'DIALOGUE_STORE_MISSING' });
  assert.deepEqual(await readdir(f.dir), ['JH_Personal_Dialogue_v1.json']);
  const malformed = '{"synthetic":"interrupted write"';
  await writeFile(f.store, malformed, { mode: 0o600 });
  await assert.rejects(executeCommand('subject', { ...f, input: subject }), { code: 'DIALOGUE_STORE_INVALID_JSON' });
  await assert.rejects(executeCommand('init', { ...f, input: { now: at(0) } }), { code: 'DIALOGUE_STORE_EXISTS' });
  assert.equal(await readFile(f.store, 'utf8'), malformed);
  const tampered = JSON.stringify({ ...JSON.parse(original), revision: 1 });
  await writeFile(f.store, tampered, { mode: 0o600 });
  await assert.rejects(executeCommand('validate', f), { code: 'DIALOGUE_STATE_INVALID' });
  await assert.rejects(executeCommand('subject', { ...f, input: subject }), { code: 'DIALOGUE_STATE_INVALID' });
  assert.equal(await readFile(f.store, 'utf8'), tampered);
  assert.deepEqual(await readdir(f.dir), ['JH_Personal_Dialogue_v1.json']);
});
