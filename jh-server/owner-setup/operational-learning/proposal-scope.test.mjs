import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServerLearning } from './server-runtime.mjs';
import { FileLearningStore } from './store.mjs';
import { createState, ingest, propose, setProposalStatus } from './engine.mjs';

// These are independent synthetic tasks in a private temporary store. They are
// evidence for proposal delivery only, not real user work or device operations.
const NOW = '2026-11-01T00:00:00.000Z';
const CONTEXT = { platform: 'server', version: 'fixture-v1', environment: 'proposal-scope-test' };
const OUTPUT = { domain: 'output', operation: 'life_output_format.table', engine: 'jh-server', context: CONTEXT };
const DEVICE = { domain: 'device', operation: 'life_android_open', engine: 'jh-server', context: CONTEXT };

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jh-proposal-scope-'));
  const file = path.join(directory, 'memory.json');
  const ownerScope = 'synthetic-proposal-owner';
  const options = { file, ownerScope, runtimeId: 'synthetic-proposal-runtime', context: CONTEXT, clock: () => NOW };
  const controllers = [];
  const controller = async () => {
    const runtime = await createServerLearning(options);
    controllers.push(runtime);
    return runtime;
  };
  t.after(async () => {
    for (const runtime of controllers) await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { runtime: await controller(), controller, store: new FileLearningStore({ file, ownerScope }) };
}

function event(id, scope, overrides = {}) {
  return { ...structuredClone(scope), eventId: 'fixture-event-' + id, taskId: 'fixture-task-' + id,
    attemptId: 'fixture-attempt-' + id, sequence: 1, timestamp: NOW,
    outcome: 'failure_verified', source: 'host_verified', errorCode: 'SYNTHETIC_FAILURE',
    evidenceRefs: ['fixture:' + id], ...overrides };
}

function createRuleProposal(id, scope = OUTPUT) {
  let state = createState();
  for (let n = 0; n < 2; n++) {
    state = ingest(state, event(id + '-' + n, scope, { errorCode: 'FIXTURE_' + id })).state;
  }
  const generated = propose(state, { now: NOW });
  assert.equal(generated.proposals.length, 1, 'fixture must be produced by the existing proposal engine');
  assert.equal(generated.proposals[0].kind, 'rule_fix');
  return { state: generated.state, proposal: generated.proposals[0] };
}

async function seedRuleProposal(store, id, scope = OUTPUT) {
  const generated = createRuleProposal(id, scope);
  const result = await store.transact(state => {
    for (const item of Object.values(generated.state.events)) state = ingest(state, item).state;
    return propose(state, { now: NOW });
  });
  return result.state.proposals[generated.proposal.id];
}

async function seedLearningProposal(store, id, scope = OUTPUT) {
  const operations = ['life_output_format.table', 'life_output_format.table',
    'life_output_format.summary', 'life_output_format.holdout'];
  const result = await store.transact(state => {
    operations.forEach((operation, index) => {
      state = ingest(state, event(id + '-' + index, { ...scope, operation }, {
        errorCode: 'FIXTURE_LEARNING_FAILURE',
        labels: { reviewed: true, ruleRemediationTried: index < 3, holdout: index === 3 },
      })).state;
    });
    return propose(state, { now: NOW });
  });
  const proposal = result.proposals.find(item => item.kind === 'learning_evaluation');
  assert.ok(proposal, 'fixture must satisfy the existing separate-training/holdout thresholds');
  assert.equal(proposal.scope.operation, '*');
  return proposal;
}

function response() {
  return { content: [{ type: 'text', text: '{"ok":true,"signed":"UNMODIFIED"}' }],
    structuredContent: { ok: true, signed: 'UNMODIFIED' } };
}

function call(id, extra = {}) {
  return { name: 'life_output_format', mode: 'TABLE', commandId: 'fixture-command-' + id,
    requestId: 'fixture-request-' + id, ...extra };
}

function notice(result) {
  return result.content.slice(1).map(item => JSON.parse(item.text))
    .find(item => item.type === 'jh_operational_learning');
}

const offeredIds = result => (notice(result)?.proposals ?? []).map(item => item.id);

test('matching proposal advice carries only its safe exact scope and preserves the target result', async t => {
  const { runtime, store } = await setup(t);
  const proposal = await seedRuleProposal(store, 'exact');
  const original = response();
  let executions = 0;
  const result = await runtime.invoke(call('exact'), () => { executions++; return original; });
  assert.equal(executions, 1);
  assert.deepEqual(offeredIds(result), [proposal.id]);
  assert.strictEqual(result.content[0], original.content[0]);
  assert.strictEqual(result.structuredContent, original.structuredContent);
  assert.equal(original.content.length, 1);
  const advice = notice(result);
  assert.equal(advice.advisoryOnly, true);
  assert.equal(advice.externalEffects, false);
  assert.deepEqual(advice.proposals[0].scope, OUTPUT);
  assert.deepEqual(Object.keys(advice.proposals[0].scope).sort(), ['context', 'domain', 'engine', 'operation']);
  assert.deepEqual(Object.keys(advice.proposals[0].scope.context).sort(), ['environment', 'platform', 'version']);
  advice.proposals[0].scope.context.version = 'changed-response-copy';
  assert.deepEqual((await store.read()).proposals[proposal.id].scope, OUTPUT);
});

test('different domains, operation names and tool modes do not receive an unrelated proposal', async t => {
  const cases = [
    { label: 'domain', scope: { ...OUTPUT, domain: 'device' } },
    { label: 'operation', scope: { ...OUTPUT, operation: 'life_output_export.table' } },
    { label: 'mode', scope: { ...OUTPUT, operation: 'life_output_format.summary' } },
  ];
  for (const item of cases) {
    const { runtime, store } = await setup(t);
    await seedRuleProposal(store, item.label, item.scope);
    const original = response();
    assert.strictEqual(await runtime.invoke(call(item.label), () => original), original, item.label);
  }
});

test('engine, platform, version and environment are exact proposal-delivery boundaries', async t => {
  const cases = [
    { label: 'engine', scope: { ...OUTPUT, engine: 'another-engine' } },
    ...['platform', 'version', 'environment'].map(key => ({ label: key,
      scope: { ...OUTPUT, context: { ...CONTEXT, [key]: 'another-' + key } } })),
  ];
  for (const item of cases) {
    const { runtime, store } = await setup(t);
    await seedRuleProposal(store, item.label, item.scope);
    const original = response();
    assert.strictEqual(await runtime.invoke(call(item.label), () => original), original, item.label);
  }
});

test('missing or malformed scopes and ordinary wildcard proposals remain stored but are not offered', async t => {
  const { runtime, store } = await setup(t);
  const malformed = [
    undefined, null, [], {},
    { ...OUTPUT, context: null },
    { ...OUTPUT, context: { platform: CONTEXT.platform, version: CONTEXT.version } },
    { ...OUTPUT, operation: 1 },
    { ...OUTPUT, operation: '*' },
    { ...OUTPUT, engine: '' },
  ];
  // A damaged imported scope cannot be produced by ingest. Alter only these
  // disposable fixture records, keeping a valid proposal from propose as a base.
  await store.transact(state => {
    malformed.forEach((scope, index) => {
      const proposal = createRuleProposal('malformed-' + index).proposal;
      if (scope === undefined) delete proposal.scope;
      else proposal.scope = structuredClone(scope);
      state.proposals[proposal.id] = proposal;
    });
    state.revision++;
    return state;
  });
  const original = response();
  assert.strictEqual(await runtime.invoke(call('malformed'), () => original), original);
  const current = await store.read();
  assert.equal(Object.keys(current.proposals).length, malformed.length, 'filtering must not delete stored proposals');
  assert.equal((await runtime.status()).degraded, false);
});

test('unrelated proposals do not occupy the three available advice slots', async t => {
  const { runtime, store } = await setup(t);
  const matching = await seedRuleProposal(store, 'budget-matching');
  // The old implementation sorted every open proposal before taking three.
  // Select three independently generated unrelated records that sort first.
  const earlier = [];
  for (let index = 0; index < 256 && earlier.length < 3; index++) {
    const candidate = createRuleProposal('budget-unrelated-' + index, DEVICE);
    if (candidate.proposal.id.localeCompare(matching.id) < 0) earlier.push(candidate);
  }
  assert.equal(earlier.length, 3, 'budget fixture needs three unrelated records before the relevant one');
  await store.transact(state => {
    for (const fixture of earlier) {
      for (const item of Object.values(fixture.state.events)) state = ingest(state, item).state;
    }
    return propose(state, { now: NOW });
  });
  assert.deepEqual(offeredIds(await runtime.invoke(call('budget'), () => response())), [matching.id]);
});

test('an unrelated operation in the same task cannot consume relevant proposal deduplication', async t => {
  const { runtime, store } = await setup(t);
  const proposal = await seedRuleProposal(store, 'dedupe');
  const unrelated = response();
  assert.strictEqual(await runtime.invoke(call('same-task', {
    name: 'life_android_open', mode: undefined, requestId: 'fixture-unrelated-first',
  }), () => unrelated), unrelated);
  const relevant = await runtime.invoke(call('same-task', { requestId: 'fixture-relevant-next' }), () => response());
  assert.deepEqual(offeredIds(relevant), [proposal.id]);
  const repeated = response();
  assert.strictEqual(await runtime.invoke(call('same-task', { requestId: 'fixture-relevant-again' }), () => repeated), repeated);
});

test('learning-evaluation wildcard applies across operations only within its exact domain and environment', async t => {
  const { runtime, store } = await setup(t);
  const proposal = await seedLearningProposal(store, 'wildcard');
  for (const mode of ['PREVIEW', 'EXPORT']) {
    const result = await runtime.invoke(call('wildcard-' + mode, { mode }), () => response());
    assert.deepEqual(offeredIds(result), [proposal.id]);
    assert.deepEqual(notice(result).proposals[0].scope, { ...OUTPUT, operation: '*' });
  }
});

test('learning-evaluation wildcard does not cross domain, engine or any context field', async t => {
  const cases = [
    { label: 'domain', scope: { ...OUTPUT, domain: 'device' } },
    { label: 'engine', scope: { ...OUTPUT, engine: 'other-learning-engine' } },
    ...['platform', 'version', 'environment'].map(key => ({ label: key,
      scope: { ...OUTPUT, context: { ...CONTEXT, [key]: 'other-' + key } } })),
  ];
  for (const item of cases) {
    const { runtime, store } = await setup(t);
    await seedLearningProposal(store, 'wildcard-' + item.label, item.scope);
    const original = response();
    assert.strictEqual(await runtime.invoke(call(item.label, { mode: 'PREVIEW' }), () => original), original, item.label);
  }
});

test('status retains the complete owner proposal overview while task advice is scoped', async t => {
  const { runtime, store } = await setup(t);
  const relevant = await seedRuleProposal(store, 'overview-relevant');
  const unrelated = await seedRuleProposal(store, 'overview-unrelated', DEVICE);
  const allIds = [relevant.id, unrelated.id].sort();
  const before = await runtime.status();
  assert.deepEqual(before.proposals.map(item => item.id).sort(), allIds);
  assert.deepEqual(offeredIds(await runtime.invoke(call('overview'), () => response())), [relevant.id]);
  const after = await runtime.status();
  assert.deepEqual(after.proposals.map(item => item.id).sort(), allIds);
  assert.equal(after.counts.proposals, 2);
  assert.equal(after.availableAdvice.proposals, 2, 'status is the global owner overview, not the last task filter');
});

test('dismissed proposals remain suppressed across controllers and restart without deletion', async t => {
  const { runtime, store, controller } = await setup(t);
  const proposal = await seedRuleProposal(store, 'dismissed');
  assert.deepEqual(offeredIds(await runtime.invoke(call('before-dismissal'), () => response())), [proposal.id]);
  // Reuse the existing engine transition. This test does not create a new MCP
  // status API or claim that one exists in the currently connected client.
  await store.transact(state => setProposalStatus(state, proposal.id, 'dismissed'));
  const other = await controller();
  const original = response();
  assert.strictEqual(await other.invoke(call('other-controller'), () => original), original);
  await runtime.close();
  await other.close();
  const restarted = await controller();
  const afterRestart = response();
  assert.strictEqual(await restarted.invoke(call('after-restart'), () => afterRestart), afterRestart);
  const status = await restarted.status();
  assert.equal(status.counts.proposals, 1);
  assert.equal(status.availableAdvice.proposals, 0);
  assert.equal(status.proposals.find(item => item.id === proposal.id).status, 'dismissed');
});
