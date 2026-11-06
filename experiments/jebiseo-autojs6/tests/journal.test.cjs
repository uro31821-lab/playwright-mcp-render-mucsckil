'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createJournal } = require('../journal.js');

function backend(initial = null) {
  let persisted = initial;
  return { load: () => persisted, saveAtomic: state => { persisted = structuredClone(state); return true; } };
}

test('journal blocks the same request across independent engine instances', () => {
  const disk = backend();
  const first = createJournal(disk);
  assert.equal(first.claim('run-1', { status: 'running', stage: 'select' }), true);
  const restarted = createJournal(disk);
  assert.equal(restarted.claim('run-1', { status: 'running' }), false);
  assert.deepEqual(restarted.unresolved(), [{ requestId: 'run-1', status: 'running', stage: 'select' }]);
});

test('failed persistence does not expose an in-memory successful claim', () => {
  const disk = backend();
  disk.saveAtomic = () => false;
  const journal = createJournal(disk);
  assert.throws(() => journal.claim('run-2', { status: 'running' }), /JOURNAL_WRITE_FAILED/);
  assert.equal(journal.get('run-2'), null);
});

test('unknown submit remains unresolved, including after a restart', () => {
  const disk = backend();
  const journal = createJournal(disk);
  journal.claim('run-3', { status: 'running' });
  journal.put('run-3', { status: 'submit_intent', stage: 'submit' });
  journal.put('run-3', { status: 'completion_unknown', stage: 'observe' });
  assert.equal(createJournal(disk).unresolved()[0].status, 'completion_unknown');
});

test('menu handoff intent survives interruption before a draft is observed', () => {
  const disk = backend();
  const journal = createJournal(disk);
  journal.claim('menu-interrupted', { status: 'running' });
  journal.put('menu-interrupted', { status: 'handoff_intent', stage: 'gemini_menu' });
  assert.equal(createJournal(disk).unresolved()[0].status, 'handoff_intent');
});

test('finished attempts are retained and not automatically replayable', () => {
  const journal = createJournal(backend());
  journal.claim('run-4', { status: 'running' });
  journal.put('run-4', { status: 'submission_observed', result: { submissionObserved: true } });
  assert.deepEqual(journal.unresolved(), []);
  assert.equal(journal.claim('run-4', {}), false);
  const exposed = journal.get('run-4');
  exposed.result.submissionObserved = false;
  assert.equal(journal.get('run-4').result.submissionObserved, true);
});

test('corrupt journal is not silently reset and unclaimed updates are rejected', () => {
  assert.throws(() => createJournal(backend({ records: [] })), /JOURNAL_INVALID/);
  const journal = createJournal(backend());
  assert.throws(() => journal.put('absent', {}), /JOURNAL_CLAIM_REQUIRED/);
  assert.throws(() => journal.claim('../escape', {}), /REQUEST_ID_INVALID/);
});
