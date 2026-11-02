/** File-backed tests use synthetic data and temporary directories only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, readdir, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { executeCommand, runCli } from './cli.mjs';

const R = globalThis.JHProactiveResearch;
const OWNER = 'synthetic-cli-owner';
const TOPIC = 'android.nested-scroll';
const at = seconds => new Date(Date.parse('2026-11-02T00:00:00.000Z') + seconds * 1000).toISOString();
const code = expected => error => error?.code === expected;

async function fixture(t, initialize = true) {
  const directory = await mkdtemp(join(tmpdir(), 'jh-proactive-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { store: join(directory, 'JH_Proactive_Research_v1.json'), owner: OWNER };
  if (initialize) await executeCommand('init', { ...options, input: { now: at(0) } });
  return { ...options, directory };
}

function observeInput(overrides = {}) {
  return {
    expectedRevision: 0,
    observationId: 'synthetic-observation-1',
    requestId: 'synthetic-request-1',
    sourceRef: 'source:synthetic-cli-question',
    at: at(1),
    topicId: TOPIC,
    label: 'Nested scrolling',
    need: 'Find a reliable nested scroll target.',
    publicQueries: ['Android accessibility nested scrolling official documentation'],
    queryReviewed: true,
    kind: 'explicit',
    ...overrides,
  };
}

function channels(input = '') {
  let out = '', err = '';
  return {
    stdin: Readable.from([input]),
    stdout: { write: chunk => { out += chunk; } },
    stderr: { write: chunk => { err += chunk; } },
    output: () => out,
    error: () => err,
  };
}

test('init needs an absolute explicit path and never replaces existing data', async t => {
  const f = await fixture(t, false);
  await assert.rejects(executeCommand('init', { owner: OWNER, input: { now: at(0) } }), code('PROACTIVE_STORE_PATH'));
  await assert.rejects(executeCommand('init', { ...f, store: 'state.json', input: { now: at(0) } }), code('PROACTIVE_STORE_PATH'));
  assert.deepEqual(await readdir(f.directory), []);
  await executeCommand('init', { ...f, input: { now: at(0) } });
  const original = await readFile(f.store, 'utf8');
  await assert.rejects(executeCommand('init', { ...f, input: { now: at(10) } }), code('PROACTIVE_STORE_EXISTS'));
  assert.equal(await readFile(f.store, 'utf8'), original);
  if (process.platform !== 'win32') assert.equal((await stat(f.store)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(f.directory), ['JH_Proactive_Research_v1.json']);
});

test('missing, malformed, and wrong-owner stores are preserved and never silently initialized', async t => {
  const f = await fixture(t, false);
  await assert.rejects(executeCommand('observe', { ...f, input: observeInput() }), code('PROACTIVE_STORE_MISSING'));
  assert.deepEqual(await readdir(f.directory), []);
  const malformed = '{private state is incomplete';
  await writeFile(f.store, malformed, { mode: 0o600 });
  await assert.rejects(executeCommand('observe', { ...f, input: observeInput() }), code('PROACTIVE_STORE_INVALID_JSON'));
  await assert.rejects(executeCommand('init', { ...f, input: { now: at(0) } }), code('PROACTIVE_STORE_EXISTS'));
  assert.equal(await readFile(f.store, 'utf8'), malformed);
  await rm(f.store);
  await executeCommand('init', { ...f, input: { now: at(0) } });
  const original = await readFile(f.store, 'utf8');
  await assert.rejects(executeCommand('observe', { ...f, owner: 'another-owner', input: observeInput() }), code('PROACTIVE_OWNER_MISMATCH'));
  assert.equal(await readFile(f.store, 'utf8'), original);
});

test('symlink and multiply-linked state files cannot redirect a write', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  const original = await readFile(f.store, 'utf8');
  const alias = join(f.directory, 'alias.json');
  await symlink(f.store, alias);
  await assert.rejects(executeCommand('observe', { ...f, store: alias, input: observeInput() }), code('PROACTIVE_STORE_UNSAFE'));
  assert.equal(await readFile(f.store, 'utf8'), original);
  await rm(alias);
  await link(f.store, alias);
  await assert.rejects(executeCommand('observe', { ...f, store: alias, input: observeInput() }), code('PROACTIVE_STORE_UNSAFE'));
  assert.equal(await readFile(f.store, 'utf8'), original);
});

test('exact retry is idempotent while stale new writes and reused event IDs fail without altering bytes', async t => {
  const f = await fixture(t);
  const input = observeInput();
  const recorded = await executeCommand('observe', { ...f, input });
  const original = await readFile(f.store, 'utf8');
  const replay = await executeCommand('observe', { ...f, input });
  assert.equal(replay.result.duplicate, true);
  assert.equal(replay.revision, recorded.revision);
  assert.equal(await readFile(f.store, 'utf8'), original);
  await assert.rejects(executeCommand('observe', { ...f, input: observeInput({ observationId: 'new-observation', requestId: 'new-request' }) }), code('PROACTIVE_REVISION_CONFLICT'));
  await assert.rejects(executeCommand('observe', { ...f, input: observeInput({ need: 'Changed event under the same ID.' }) }), code('PROACTIVE_ID_CONFLICT'));
  assert.equal(await readFile(f.store, 'utf8'), original);
  assert.deepEqual(await readdir(f.directory), ['JH_Proactive_Research_v1.json']);
});

test('concurrent new events with one expected revision produce one commit and one CAS rejection', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([
    executeCommand('observe', { ...f, input: observeInput() }),
    executeCommand('observe', { ...f, input: observeInput({ observationId: 'second-observation', requestId: 'second-request' }) }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'PROACTIVE_REVISION_CONFLICT');
  const state = R.validateState(JSON.parse(await readFile(f.store, 'utf8')));
  assert.equal(state.revision, 1);
  assert.equal(Object.keys(state.observations).length, 1);
  assert.deepEqual(await readdir(f.directory), ['JH_Proactive_Research_v1.json']);
});

test('an existing lock is not stolen or deleted', async t => {
  const f = await fixture(t);
  const original = await readFile(f.store, 'utf8');
  const lock = `${f.store}.lock`;
  await writeFile(lock, 'synthetic external writer', { mode: 0o600 });
  await assert.rejects(executeCommand('observe', { ...f, input: observeInput() }), code('PROACTIVE_STORE_BUSY'));
  assert.equal(await readFile(f.store, 'utf8'), original);
  assert.equal(await readFile(lock, 'utf8'), 'synthetic external writer');
});

test('CLI reads JSON stdin and files, reports a concise result, and preserves state on malformed input', async t => {
  const f = await fixture(t, false);
  const init = channels(JSON.stringify({ now: at(0) }));
  assert.equal(await runCli(['init', '--store', f.store, '--owner', OWNER], init), 0);
  assert.equal(JSON.parse(init.output()).revision, 0);
  assert.equal(init.output().includes('observations'), false);
  const inputPath = join(f.directory, 'synthetic-input.json');
  await writeFile(inputPath, JSON.stringify(observeInput()));
  const observe = channels();
  assert.equal(await runCli(['observe', '--store', f.store, '--owner', OWNER, '--input', inputPath], observe), 0);
  assert.equal(JSON.parse(observe.output()).revision, 1);
  const before = await readFile(f.store, 'utf8');
  const malformed = channels('{malformed-private-input');
  assert.equal(await runCli(['observe', '--store', f.store, '--owner', OWNER], malformed), 1);
  assert.equal(JSON.parse(malformed.error()).code, 'PROACTIVE_CLI_INPUT');
  assert.equal(malformed.error().includes('malformed-private-input'), false);
  assert.equal(await readFile(f.store, 'utf8'), before);
  const collect = channels('{}');
  assert.equal(await runCli(['collect', '--store', f.store, '--owner', OWNER], collect), 1);
  assert.equal(JSON.parse(collect.error()).code, 'PROACTIVE_CLI_COMMAND');
});

test('checkpoint survives reload and begin replay returns the saved packet for host-managed resume', async t => {
  const f = await fixture(t);
  const observed = await executeCommand('observe', { ...f, input: observeInput() });
  const begin = { expectedRevision: observed.revision, runId: 'synthetic-run', topicId: TOPIC, at: at(2) };
  const started = await executeCommand('begin', { ...f, input: begin });
  // Test-only adapters: the production CLI never supplies simulated research.
  const packet = await R.collect(started.result.run, {
    search: async () => [{ url: 'https://docs.example.org/guide', title: 'Synthetic guide' }],
    fetch: async ({ url }) => ({ url, title: 'Synthetic guide', text: 'Synthetic evidence about choosing the intended scrollable node.', retrievedAt: at(3), kind: 'official' }),
  });
  const checkpoint = { expectedRevision: started.revision, checkpointId: 'synthetic-checkpoint', runId: 'synthetic-run', at: at(4), packet };
  const saved = await executeCommand('checkpoint', { ...f, input: checkpoint });
  const original = await readFile(f.store, 'utf8');
  const replay = await executeCommand('checkpoint', { ...f, input: checkpoint });
  assert.equal(replay.result.duplicate, true);
  assert.equal(replay.revision, saved.revision);
  assert.equal(await readFile(f.store, 'utf8'), original);
  const resumed = await executeCommand('begin', { ...f, input: begin });
  assert.deepEqual(resumed.result.run.packet, packet);
  assert.equal(resumed.result.run.status, 'collecting');
  const validated = await executeCommand('validate', f);
  assert.equal(validated.result.valid, true);
  assert.equal(validated.revision, saved.revision);
});

test('decide and plan route through the persisted state without reviving a snoozed topic', async t => {
  const f = await fixture(t);
  const observed = await executeCommand('observe', { ...f, input: observeInput() });
  assert.equal((await executeCommand('plan', { ...f, input: { at: at(2) } })).result.topics.length, 1);
  const paused = await executeCommand('decide', { ...f, input: {
    expectedRevision: observed.revision, decisionId: 'synthetic-defer', topicId: TOPIC, status: 'snoozed', until: null,
    reason: 'Synthetic user postponement.', sourceRef: 'source:synthetic-user-decision', at: at(3),
  } });
  const before = await readFile(f.store, 'utf8');
  const plan = await executeCommand('plan', { ...f, input: { at: at(4) } });
  assert.equal(plan.result.topics.length, 0);
  assert.equal(plan.revision, paused.revision);
  assert.equal(await readFile(f.store, 'utf8'), before);
});
