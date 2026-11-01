import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These are synthetic provider fixtures. No installed App, owner memory,
// credentials, network, device, or production write is used by this suite.
const SOURCE = readFileSync(new URL('./host-memory-federation.js', import.meta.url), 'utf8');
const NOW = '2026-11-01T16:00:00.000Z';
const QUERY = Object.freeze({ domain: 'development', operation: 'memory.federation',
  query: 'synthetic memory federation', limit: 3, maxChars: 12000 });
const HOST_SCOPE = Object.freeze({ domain: QUERY.domain, operation: QUERY.operation,
  engine: 'jh-agent', context: Object.freeze({ platform: 'chatgpt',
    version: 'operational-learning-v1', environment: 'personal' }) });
const clone = value => structuredClone(value);
const mcp = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

function loadRuntime(timers = {}) {
  const sandbox = Object.create(null);
  const unexpected = [];
  const forbiddenFetch = (...args) => {
    unexpected.push(args);
    throw new Error('SYNTHETIC_UNEXPECTED_EXTERNAL_CALL');
  };
  // Match the host's plain V8 evaluation path, without changing Node globals.
  // Shadow Node-only conveniences so portability cannot depend on them.
  const evaluate = new Function('globalThis', 'setTimeout', 'clearTimeout',
    'fetch', 'process', 'require', 'module', 'Buffer',
    SOURCE + '\nreturn globalThis.JHMemoryFederation;');
  const api = evaluate(sandbox, timers.setTimeout ?? setTimeout,
    timers.clearTimeout ?? clearTimeout, forbiddenFetch,
    undefined, undefined, undefined, undefined);
  return { api, unexpected };
}

function controlledTimers() {
  let next = 1;
  const pending = new Map();
  return {
    setTimeout(callback, delay) {
      const id = next++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { pending.delete(id); },
    get size() { return pending.size; },
    expire() {
      const current = [...pending.entries()];
      pending.clear();
      for (const [, { callback }] of current) callback();
    },
  };
}

async function drainMicrotasks() {
  for (let index = 0; index < 50; index++) await Promise.resolve();
}

function jhContext(options = {}) {
  const projection = { eventId: 'host-observation-' + '3'.repeat(64),
    observationRef: 'source:synthetic-federation-observation', sequence: 1,
    timestamp: NOW, outcome: 'success_verified', source: 'host_verified',
    evidenceRefs: ['source:synthetic-federation-observation', 'test:synthetic-federation-result'],
    evidenceRefsOmitted: 0, evidenceRefsTruncated: false };
  const lessons = options.lessons ?? [{ id: 'synthetic-reviewed-rule', ruleVersion: 'synthetic-rule-v1',
    state: 'active', advisoryOnly: true, scope: clone(HOST_SCOPE), guidance: 'Use the synthetic reviewed procedure.',
    memoryKind: 'procedure', provenance: 'host_verified',
    evidenceRefs: ['test:synthetic-reviewed-rule'], evidenceRefsOmitted: 0,
    validFrom: null, validUntil: null }];
  const episodes = options.episodes ?? [{ taskId: 'host-task-' + '1'.repeat(64),
    attemptId: 'host-attempt-' + '2'.repeat(64), scope: clone(HOST_SCOPE), eventCount: 1,
    projection, latestObservation: clone(projection),
    sourceAuthentication: 'authenticated_owner_attestation', sourceRetrievalVerified: false,
    liveExecutionVerified: false, episodesRequireReview: true }];
  const arrays = { lessons, conflicts: options.conflicts ?? [],
    proposals: options.proposals ?? [], episodes };
  return { schema: 'jh.host-memory-context.v1', ok: true, revision: 17,
    scope: clone(HOST_SCOPE), commonScope: { ...clone(HOST_SCOPE),
      domain: 'orchestration', operation: 'learning.scope' }, observedAt: NOW, ...arrays,
    omitted: { lessons: 0, conflicts: 0, proposals: 0, episodes: 0 },
    counts: { scopedProjectedAttempts: episodes.length, futureEpisodesOmitted: 0,
      returnedEpisodes: episodes.length, returnedLessons: lessons.length,
      returnedProposals: arrays.proposals.length, returnedConflicts: arrays.conflicts.length },
    budget: { maxChars: 16000, selectedChars: JSON.stringify(arrays).length, limit: 3,
      limitScope: 'per_array', scope: 'serialized_lessons_conflicts_proposals_episodes_arrays' },
    fingerprint: '4'.repeat(64), advisoryOnly: true, externalEffects: false,
    replayAllowed: false, authorizesExecution: false,
    sourceAuthentication: 'authenticated_owner_attestation', sourceRetrievalVerified: false,
    independentOutcomeVerification: false, liveExecutionVerified: false,
    librarySync: 'not_connected', ordinaryChatsObserved: false,
    episodesRequireReview: true, activatedByThisCall: false, readOnly: true };
}

function search(memories = [{ id: 'synthetic-memory-1', content: 'Synthetic search excerpt.' }]) {
  return { query: QUERY.query, count: memories.length, memories: clone(memories) };
}

function fullRecord(id = 'synthetic-memory-1', content = 'Synthetic personal reference.', extra = {}) {
  return { found: true, memory: { id, content, category: 'general', media: [], ...extra } };
}

function fixture(overrides = {}, options = {}) {
  const runtime = loadRuntime(options.timers);
  const calls = [];
  const defaults = { jhContext: jhContext(), memoriaSearch: search(),
    memoriaFetch: ({ memory_id }) => fullRecord(memory_id) };
  const callback = name => async args => {
    calls.push({ name, args: clone(args) });
    const value = Object.hasOwn(overrides, name) ? overrides[name] : defaults[name];
    return typeof value === 'function' ? value(args) : clone(value);
  };
  const orchestrator = runtime.api.createHostMemoryOrchestrator({
    jhContext: callback('jhContext'), memoriaSearch: callback('memoriaSearch'),
    memoriaFetch: callback('memoriaFetch'), clock: options.clock ?? (() => NOW),
    timeoutMs: options.timeoutMs ?? 250,
  });
  return { ...runtime, orchestrator, calls,
    retrieve: input => orchestrator.retrieve(input ?? clone(QUERY)) };
}

function assertReadOnly(result, f) {
  assert.equal(result.readOnly, true);
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.automaticSynchronization, false);
  assert.equal(result.ordinaryChatsObserved, false);
  assert.equal(result.librarySync, 'not_connected');
  assert.deepEqual(f.unexpected, []);
  assert.ok(f.calls.every(call => ['jhContext', 'memoriaSearch', 'memoriaFetch'].includes(call.name)));
}

test('federation loads through plain V8 evaluation with no Node dependency or external call', () => {
  const { api, unexpected } = loadRuntime();
  assert.equal(typeof api.createHostMemoryOrchestrator, 'function');
  assert.equal(typeof api.selectMemoryWriteTarget, 'function');
  assert.deepEqual(unexpected, []);
});

test('federation reads both providers, preserves complete source records, and performs no writes', async () => {
  const original = jhContext();
  const f = fixture({ jhContext: original });
  const result = await f.retrieve();
  assert.equal(result.schema, 'jh.host-memory-federation.v1');
  assert.equal(result.providers.jh.status, 'ok');
  assert.equal(result.providers.memoria.status, 'ok');
  assert.equal(result.partial, false);
  assert.deepEqual(result.scope, { domain: QUERY.domain, operation: QUERY.operation });
  assert.equal(result.jh.revision, original.revision);
  assert.equal(result.jh.observedAt, original.observedAt);
  assert.equal(result.jh.fingerprint, original.fingerprint);
  for (const key of ['lessons', 'conflicts', 'proposals', 'episodes']) {
    assert.deepEqual(result.jh[key], original[key]);
  }
  assert.equal(result.memoria.sources.length, 1);
  const external = result.memoria.sources[0];
  assert.equal(external.provider, 'memoria_cloud_v3');
  assert.equal(external.sourceId, 'memoria_cloud_v3:synthetic-memory-1');
  assert.equal(external.memoryId, 'synthetic-memory-1');
  assert.equal(external.content, 'Synthetic personal reference.');
  assert.equal(external.changedSinceSearch, true);
  assert.equal(external.fetchedFullRecord, true);
  assert.equal(external.referenceOnly, true);
  assert.equal(external.requiresReview, true);
  assert.equal(external.authorizesExecution, false);
  assert.equal(external.retrievedAt, NOW);
  assert.deepEqual(f.calls.filter(call => call.name === 'memoriaSearch'), [
    { name: 'memoriaSearch', args: { query: QUERY.query, limit: 3 } },
  ]);
  assert.deepEqual(f.calls.filter(call => call.name === 'memoriaFetch'), [
    { name: 'memoriaFetch', args: { memory_id: 'synthetic-memory-1' } },
  ]);
  const requestedContext = f.calls.find(call => call.name === 'jhContext').args;
  assert.equal(requestedContext.domain, QUERY.domain);
  assert.equal(requestedContext.operation, QUERY.operation);
  assert.equal(requestedContext.limit, 3);
  assert.ok(Number.isInteger(requestedContext.max_chars));
  assert.ok(requestedContext.max_chars >= 256 && requestedContext.max_chars <= 16000);
  assertReadOnly(result, f);
});

test('plain provider objects, MCP text JSON, and MCP structuredContent give equivalent memories', async () => {
  const body = jhContext();
  const searched = search();
  const fetched = fullRecord();
  const base = await fixture({ jhContext: body, memoriaSearch: searched, memoriaFetch: fetched }).retrieve();
  for (const wrap of [mcp, value => ({ structuredContent: value, content: [] })]) {
    const f = fixture({ jhContext: wrap(body), memoriaSearch: wrap(searched), memoriaFetch: wrap(fetched) });
    const result = await f.retrieve();
    assert.deepEqual(result.jh, base.jh);
    assert.deepEqual(result.memoria, base.memoria);
    assert.deepEqual(result.providers, base.providers);
    assertReadOnly(result, f);
  }
});

test('MCP error and malformed JSON are provider failures, never empty success or leaked raw errors', async () => {
  const privateText = 'SYNTHETIC_PRIVATE_PROVIDER_FAILURE';
  for (const response of [
    { isError: true, content: [{ type: 'text', text: privateText }] },
    { content: [{ type: 'text', text: '{' + privateText }] },
    { ok: false, code: privateText },
    { content: [{ type: 'text', text: JSON.stringify(search()) },
      { type: 'text', text: JSON.stringify(search([])) }] },
    { content: [{ type: 'text', text: '{"query":"' + QUERY.query + '","count":1,"count":0,"memories":[]}' }] },
  ]) {
    const f = fixture({ memoriaSearch: response });
    const result = await f.retrieve();
    assert.equal(result.providers.jh.status, 'ok');
    assert.ok(['error', 'invalid'].includes(result.providers.memoria.status));
    assert.equal(result.partial, true);
    assert.equal(result.jh.lessons.length, 1);
    assert.deepEqual(result.memoria.sources, []);
    assert.equal(f.calls.filter(call => call.name === 'memoriaFetch').length, 0);
    assert.equal(JSON.stringify(result).includes(privateText), false);
    assertReadOnly(result, f);
  }
});

test('one provider can fail while the other remains usable, without a retry or alternate write', async () => {
  for (const failed of ['jhContext', 'memoriaSearch']) {
    const f = fixture({ [failed]: () => { throw new Error('SYNTHETIC_PRIVATE_EXCEPTION'); } });
    const result = await f.retrieve();
    assert.equal(result.partial, true);
    assert.equal(f.calls.filter(call => call.name === failed).length, 1);
    if (failed === 'jhContext') {
      assert.equal(result.providers.jh.status, 'error');
      assert.equal(result.providers.memoria.status, 'ok');
      assert.deepEqual(result.jh.lessons, []);
      assert.equal(result.memoria.sources.length, 1);
    } else {
      assert.equal(result.providers.jh.status, 'ok');
      assert.equal(result.providers.memoria.status, 'error');
      assert.equal(result.jh.lessons.length, 1);
      assert.deepEqual(result.memoria.sources, []);
    }
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_EXCEPTION'), false);
    assertReadOnly(result, f);
  }
});

test('JH data from a different domain, operation, or host context is withheld rather than relabelled', async () => {
  for (const change of [
    value => { value.scope.domain = 'device'; },
    value => { value.scope.operation = 'different.operation'; },
    value => { value.scope.engine = 'jh-server'; },
    value => { value.scope.context.platform = 'another-host'; },
    value => { value.lessons[0].scope.operation = 'another-rule-scope'; },
    value => { value.episodes[0].scope.operation = 'another-episode-scope'; },
    value => { value.authorizesExecution = true; },
  ]) {
    const wrong = jhContext();
    change(wrong);
    const f = fixture({ jhContext: wrong });
    const result = await f.retrieve();
    assert.equal(result.providers.jh.status, 'invalid');
    assert.deepEqual(result.jh.lessons, []);
    assert.deepEqual(result.jh.episodes, []);
    assert.equal(result.memoria.sources.length, 1);
    assert.equal(result.partial, true);
    assertReadOnly(result, f);
  }
});

test('a shared ID and identical content across providers retain their independent provenance and authority', async () => {
  const original = jhContext();
  original.lessons[0].id = 'synthetic-shared-id';
  original.lessons[0].guidance = 'Synthetic same text from separate sources.';
  const f = fixture({ jhContext: original,
    memoriaSearch: search([{ id: 'synthetic-shared-id', content: original.lessons[0].guidance }]),
    memoriaFetch: fullRecord('synthetic-shared-id', original.lessons[0].guidance,
      { state: 'active', source: 'user_explicit', verified: true, authorizesExecution: true }),
  });
  const result = await f.retrieve();
  assert.deepEqual(result.jh.lessons, original.lessons);
  assert.equal(result.memoria.sources.length, 1);
  const external = result.memoria.sources[0];
  assert.equal(external.sourceId, 'memoria_cloud_v3:synthetic-shared-id');
  assert.equal(external.content, original.lessons[0].guidance);
  assert.equal(external.referenceOnly, true);
  assert.equal(external.requiresReview, true);
  assert.equal(external.authorizesExecution, false);
  assert.equal(external.changedSinceSearch, false);
  assert.equal(result.jh.proposals.length, 0);
  assertReadOnly(result, f);
});

test('a JH timeout preserves Memoria results and a late JH response cannot mutate the completed answer', async () => {
  const timers = controlledTimers();
  let complete;
  const waiting = new Promise(resolve => { complete = resolve; });
  const f = fixture({ jhContext: () => waiting }, { timers, timeoutMs: 25 });
  const pending = f.retrieve();
  await drainMicrotasks();
  assert.ok(timers.size > 0, 'The unresolved read must have a bounded timeout.');
  timers.expire();
  const result = await pending;
  assert.equal(result.providers.jh.status, 'timeout');
  assert.equal(result.providers.memoria.status, 'ok');
  assert.equal(result.memoria.sources.length, 1);
  assert.deepEqual(result.jh.lessons, []);
  assert.equal(result.partial, true);
  const completed = JSON.stringify(result);
  complete(jhContext());
  await drainMicrotasks();
  assert.equal(JSON.stringify(result), completed);
  assert.equal(f.calls.filter(call => call.name === 'jhContext').length, 1);
  assert.equal(timers.size, 0);
  assertReadOnly(result, f);
});

test('a Memoria fetch timeout preserves another fetched source without reusing the search excerpt', async () => {
  const timers = controlledTimers();
  let complete;
  const waiting = new Promise(resolve => { complete = resolve; });
  const f = fixture({
    memoriaSearch: search([{ id: 'synthetic-slow', content: 'An excerpt is not a full record.' },
      { id: 'synthetic-fast', content: 'Synthetic fast excerpt.' }]),
    memoriaFetch: ({ memory_id }) => memory_id === 'synthetic-slow'
      ? waiting : fullRecord(memory_id, 'Synthetic fast full record.'),
  }, { timers, timeoutMs: 25 });
  const pending = f.retrieve();
  await drainMicrotasks();
  assert.ok(timers.size > 0);
  timers.expire();
  const result = await pending;
  assert.equal(result.providers.jh.status, 'ok');
  assert.equal(result.partial, true);
  assert.equal(result.providers.memoria.fetches.find(item => item.memoryId === 'synthetic-slow').status, 'timeout');
  assert.deepEqual(result.memoria.sources.map(item => item.memoryId), ['synthetic-fast']);
  assert.equal(result.memoria.sources[0].content, 'Synthetic fast full record.');
  assert.equal(JSON.stringify(result).includes('An excerpt is not a full record.'), false);
  const completed = JSON.stringify(result);
  complete(fullRecord('synthetic-slow', 'Synthetic late full record.'));
  await drainMicrotasks();
  assert.equal(JSON.stringify(result), completed);
  assert.equal(f.calls.filter(call => call.name === 'memoriaFetch').length, 2);
  assert.equal(timers.size, 0);
  assertReadOnly(result, f);
});

test('only selected search IDs are fetched and extra provider results cannot exceed three full-record reads', async () => {
  const memories = Array.from({ length: 3 }, (_, index) => ({
    id: 'synthetic-choice-' + index, content: 'Synthetic excerpt ' + index,
  }));
  const f = fixture({ memoriaSearch: search(memories) });
  const result = await f.retrieve();
  const reads = f.calls.filter(call => call.name === 'memoriaFetch');
  assert.equal(reads.length, 3);
  assert.ok(reads.every(call => memories.some(memory => memory.id === call.args.memory_id)));
  assert.equal(new Set(reads.map(call => call.args.memory_id)).size, 3);
  assert.equal(result.memoria.sources.length, 3);
  assertReadOnly(result, f);

  const selected = fixture({ memoriaSearch: search(memories) });
  const selectedResult = await selected.retrieve({ ...QUERY,
    selection: ['synthetic-choice-2', 'synthetic-choice-0'] });
  assert.deepEqual(selected.calls.filter(call => call.name === 'memoriaFetch')
    .map(call => call.args.memory_id).sort(), ['synthetic-choice-0', 'synthetic-choice-2']);
  assert.deepEqual(selectedResult.memoria.sources.map(item => item.memoryId).sort(),
    ['synthetic-choice-0', 'synthetic-choice-2']);
  assertReadOnly(selectedResult, selected);

  const oversized = fixture({ memoriaSearch: search([...memories,
    { id: 'synthetic-extra-1', content: 'Synthetic excess result.' },
    { id: 'synthetic-extra-2', content: 'Synthetic excess result.' }]) });
  const rejected = await oversized.retrieve();
  assert.equal(rejected.providers.memoria.status, 'invalid');
  assert.deepEqual(rejected.memoria.sources, []);
  assert.equal(oversized.calls.filter(call => call.name === 'memoriaFetch').length, 0);
  assertReadOnly(rejected, oversized);

  const unknown = fixture({ memoriaSearch: search(memories) });
  const unknownResult = await unknown.retrieve({ ...QUERY, selection: ['synthetic-not-in-search'] });
  assert.equal(unknownResult.providers.memoria.status, 'invalid');
  assert.equal(unknown.calls.filter(call => call.name === 'memoriaFetch').length, 0);
  assertReadOnly(unknownResult, unknown);
});

test('Memoria records with empty optional dates and an offset timestamp retain the actual provider shape', async () => {
  const record = { id: 'synthetic-offset-memory', content: 'Synthetic provider record with optional date fields.',
    category: 'general', created_at: '', updated_at: '', deleted_at: '',
    timestamp: '2026-10-10T06:18:32+00:00' };
  const f = fixture({ memoriaSearch: search([record]),
    memoriaFetch: { found: true, memory: { ...record, media: [] } } });
  const result = await f.retrieve();
  assert.equal(result.providers.memoria.status, 'ok');
  assert.equal(result.memoria.sources.length, 1);
  const source = result.memoria.sources[0];
  assert.equal(source.memoryId, record.id);
  assert.equal(source.content, record.content);
  assert.equal(source.recordedAt, record.timestamp);
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.createdAt, undefined);
  assert.equal(source.changedSinceSearch, false);
  assert.equal(result.omitted.memoria.deleted, 0);
  assertReadOnly(result, f);
});

test('missing, empty, deleted, and mismatched full records never become usable search-only memories', async () => {
  const cases = [
    { name: 'missing', response: { found: false, memory: null } },
    { name: 'empty', response: fullRecord('synthetic-absent', '  \n\t ') },
    { name: 'deleted', response: fullRecord('synthetic-absent', null, { deleted: true }) },
    { name: 'invalid', response: fullRecord('synthetic-unrequested-id', 'Synthetic wrong record.') },
  ];
  for (const item of cases) {
    const f = fixture({ memoriaSearch: search([{ id: 'synthetic-absent', content: 'SYNTHETIC_UNFETCHED_EXCERPT' }]),
      memoriaFetch: item.response });
    const result = await f.retrieve();
    assert.deepEqual(result.memoria.sources, []);
    assert.equal(result.providers.memoria.fetches[0].status, item.name);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_UNFETCHED_EXCERPT'), false);
    if (item.name !== 'invalid') assert.equal(result.omitted.memoria[item.name], 1);
    assert.equal(result.jh.lessons.length, 1);
    assertReadOnly(result, f);
  }
});

test('a subsequently deleted Memoria record is not resurrected from an earlier successful retrieval', async () => {
  let deleted = false;
  const f = fixture({ memoriaFetch: () => deleted
    ? fullRecord('synthetic-memory-1', null, { deleted_at: NOW })
    : fullRecord('synthetic-memory-1', 'Synthetic record before deletion.') });
  const first = await f.retrieve();
  assert.equal(first.memoria.sources.length, 1);
  deleted = true;
  const second = await f.retrieve();
  assert.deepEqual(second.memoria.sources, []);
  assert.equal(second.omitted.memoria.deleted, 1);
  assert.equal(second.providers.memoria.fetches[0].status, 'deleted');
  assert.equal(JSON.stringify(second).includes('Synthetic record before deletion.'), false);
  assert.equal(first.memoria.sources[0].content, 'Synthetic record before deletion.');
  assert.equal(f.calls.filter(call => call.name === 'memoriaFetch').length, 2);
  assertReadOnly(second, f);
});

test('duplicate search IDs are fetched once and conflicting copies cannot silently overwrite a source', async () => {
  const identical = { id: 'synthetic-duplicate', content: 'Synthetic duplicate search text.' };
  const same = fixture({ memoriaSearch: search([identical, identical]) });
  const sameResult = await same.retrieve();
  assert.equal(same.calls.filter(call => call.name === 'memoriaFetch').length, 1);
  assert.equal(sameResult.memoria.sources.length, 1);
  assert.ok(sameResult.omitted.memoria.duplicates >= 1);
  assertReadOnly(sameResult, same);

  const conflicting = fixture({ memoriaSearch: search([identical,
    { ...identical, content: 'Synthetic conflicting search text.' }]) });
  const conflictResult = await conflicting.retrieve();
  assert.deepEqual(conflictResult.memoria.sources, []);
  assert.equal(conflictResult.memoria.conflicts.length, 1);
  assert.ok(conflictResult.omitted.memoria.conflicts >= 1);
  assertReadOnly(conflictResult, conflicting);
});

test('credential-shaped record content is withheld and URL query data is not returned', async () => {
  const syntheticCredential = 'sk-proj-' + 'X'.repeat(32);
  const sensitive = fixture({ memoriaFetch: fullRecord('synthetic-memory-1',
    'Synthetic test credential ' + syntheticCredential) });
  const denied = await sensitive.retrieve();
  assert.deepEqual(denied.memoria.sources, []);
  assert.equal(JSON.stringify(denied).includes(syntheticCredential), false);
  assertReadOnly(denied, sensitive);

  const url = fixture({ memoriaFetch: fullRecord('synthetic-memory-1',
    'Synthetic link https://example.test/reference?token=SYNTHETIC_PRIVATE_QUERY for review.') });
  const sanitized = await url.retrieve();
  assert.equal(sanitized.memoria.sources.length, 1);
  assert.equal(sanitized.memoria.sources[0].contentSanitized, true);
  assert.ok(sanitized.memoria.sources[0].content.includes('https://example.test/reference'));
  assert.equal(JSON.stringify(sanitized).includes('SYNTHETIC_PRIVATE_QUERY'), false);
  assertReadOnly(sanitized, url);
});

test('the complete serialized envelope stays within its budget without truncating retained content', async () => {
  const lesson = jhContext({ episodes: [] }).lessons[0];
  const original = jhContext({ episodes: [], lessons: Array.from({ length: 3 }, (_, index) => ({ ...clone(lesson),
    id: 'synthetic-budget-rule-' + index, guidance: ('완전한 기억 🧭 ' + index + ' ').repeat(120) })) });
  const memories = Array.from({ length: 3 }, (_, index) => ({ id: 'synthetic-budget-memory-' + index,
    content: 'Synthetic bounded excerpt ' + index }));
  const contents = new Map(memories.map((item, index) =>
    [item.id, ('출처를 보존하는 완전한 내용 🧪 ' + index + ' ').repeat(180)]));
  for (const maxChars of [2048, 4096, 12000]) {
    const f = fixture({ jhContext: original, memoriaSearch: search(memories),
      memoriaFetch: ({ memory_id }) => fullRecord(memory_id, contents.get(memory_id)) });
    const result = await f.retrieve({ ...QUERY, maxChars });
    const serialized = JSON.stringify(result);
    assert.ok(serialized.length <= maxChars, 'The limit includes provenance and envelope metadata.');
    assert.equal(result.budget.maxChars, maxChars);
    assert.equal(result.budget.serializedChars, serialized.length);
    for (const lesson of result.jh.lessons) {
      assert.deepEqual(lesson, original.lessons.find(item => item.id === lesson.id));
    }
    for (const source of result.memoria.sources) {
      assert.equal(source.content, contents.get(source.memoryId));
      assert.equal(source.sourceId, 'memoria_cloud_v3:' + source.memoryId);
      assert.equal(source.referenceOnly, true);
    }
    assert.ok(result.omitted.jh.lessons + result.omitted.memoria.budget > 0);
    assertReadOnly(result, f);
  }
});

test('invalid request bounds and duplicated selections fail before any provider invocation', async () => {
  for (const change of [
    { limit: 0 }, { limit: 4 }, { limit: 1.5 },
    { maxChars: 2047 }, { maxChars: 65537 },
    { domain: 'unknown-domain' }, { operation: 'invalid operation with spaces' },
    { selection: ['synthetic-a', 'synthetic-a'] },
    { selection: ['synthetic-a', 'synthetic-b', 'synthetic-c', 'synthetic-d'] },
  ]) {
    const f = fixture();
    await assert.rejects(f.retrieve({ ...QUERY, ...change }));
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.unexpected, []);
  }
});

test('write target selection only produces a nonexecuting plan and exposes no write or replay API', () => {
  const f = fixture();
  for (const [kind, target] of [
    ['personal_memory', 'memoria'], ['verified_outcome', 'jh'],
    ['both', 'review'], ['unspecified', 'review'],
  ]) {
    const plan = f.api.selectMemoryWriteTarget({ kind });
    assert.equal(plan.schema, 'jh.memory-write-plan.v1');
    assert.equal(plan.kind, kind);
    assert.equal(plan.target, target);
    assert.equal(plan.allowed, false);
    assert.equal(plan.planOnly, true);
    assert.equal(plan.execution, 'none');
    assert.equal(plan.writePerformed, false);
    assert.equal(plan.automaticSynchronization, false);
  }
  assert.equal(f.orchestrator.observe, undefined);
  assert.equal(f.orchestrator.write, undefined);
  assert.equal(f.orchestrator.replay, undefined);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.unexpected, []);
});
