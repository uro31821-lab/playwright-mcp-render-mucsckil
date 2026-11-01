/** Isolated HTTP fixture: real generated owner/runtime, synthetic private volume.
 * All non-loopback network requests are rejected; no real device is registered.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateOwnerConfiguration, loadOwnerKey } from '../deployment/owner-config.mjs';
import { takeStorageSecrets, materializeStorageKeys } from '../deployment/storage-secret-bridge.mjs';
import { prepareOperationalStorage } from '../deployment/operational-service-entry.mjs';
import { prepareOrVerifyDurableRelease, INITIAL_MODE, READY_MODE } from '../deployment/durable-live-release.mjs';
import { buildPendingApprovalOperatorEntrypoint56 } from '../server-integration/pending-approval-operator-entry.mjs';
import { FileLearningStore } from './store.mjs';
import { ingest, propose } from './engine.mjs';

const root = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const phase = process.argv[3];
const originalFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.fetch = (url, options) => {
  if (new URL(url).hostname !== '127.0.0.1') {
    externalRequests++;
    throw Error('SYNTHETIC_EXTERNAL_REQUEST_FORBIDDEN');
  }
  return originalFetch(url, options);
};
const built = await buildPendingApprovalOperatorEntrypoint56(root, process.env);
const { startUnifiedOwnerServer } = await import(pathToFileURL(built.unifiedFile).href);
const config = validateOwnerConfiguration(data.input);
const secrets = takeStorageSecrets({
  JH_OWNER_STORAGE_SECRET: Buffer.alloc(32, 71).toString('base64'),
  JH_LIFE_STORAGE_SECRET: Buffer.alloc(32, 72).toString('base64'),
});
const files = materializeStorageKeys(config, secrets, data.keys);
secrets.owner.fill(0); secrets.life.fill(0);
const prepared = prepareOperationalStorage(config, files, {
  confirmation: 'EXPLICIT_ONE_TIME', storageObservations: data.observations,
});
const key = loadOwnerKey(files.ownerKeyFile, config);
let running;
try {
  prepareOrVerifyDurableRelease({ config, key, storageObservations: data.observations,
    mode: phase === 'first' ? INITIAL_MODE : READY_MODE });
  running = await startUnifiedOwnerServer({ config, key, lifeStorage: prepared.lifeStorage,
    storageObservations: data.observations, port: 0, bindAddress: '127.0.0.1' });
  assert.equal(running.operationalLearningInstalled, true);
  assert.equal(running.trustCreated, false);
  assert.equal(running.sessionCreated, false);
  const origin = 'http://127.0.0.1:' + running.port;
  const file = path.join(config.stateDir, 'operational-learning-v1.json');
  const call = async (id, name, args = {}, authorized = true) => {
    const response = await fetch(origin + '/mcp', { method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(authorized ? { authorization: 'Bearer ' + process.env.LIFE_HUB_TOKEN } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(10000) });
    const envelope = await response.json();
    if (!authorized) return { status: response.status, envelope };
    assert.equal(response.status, 200);
    assert.ok(envelope.result?.content, JSON.stringify(envelope));
    return JSON.parse(envelope.result.content[0].text);
  };
  // This is an explicit synthetic owner attestation, not a fetched chat or source document.
  const instructionText = 'Preserve verified result evidence before reporting success in every JH task.';
  const instruction = { lessonId: 'synthetic-http-common-rule-v1', ruleVersion: '1', text: instructionText,
    sourceRef: 'user:synthetic-http-common-rule',
    sourceSha256: createHash('sha256').update(instructionText, 'utf8').digest('hex'),
    sourceRecordRef: 'artifact:synthetic-http-instruction-record', appliesTo: { kind: 'all_jh_tasks' },
    confirmation: 'explicit_user_instruction' };
  const instructionSuite = { id: 'synthetic-http-evidence-contract', version: '1', evaluator: 'jh.constraints.v1',
    synthetic: true, cases: [
      { id: 'present', input: { value: { evidence: 'fixture:verified-result' },
        constraints: [{ path: ['evidence'], op: 'exists' }] }, expected: { passed: true, failed: [] } },
      { id: 'missing', input: { value: {}, constraints: [{ path: ['evidence'], op: 'exists' }] },
        expected: { passed: false, failed: [0] } },
    ] };
  const assertCommonAdvice = result => {
    assert.equal(result.ok, true);
    assert.equal(result.targetExecuted, false);
    assert.equal(result.externalEffects, false);
    assert.equal(result.delivery, 'before_execution');
    assert.equal(result.librarySync, 'not_connected');
    const rule = result.lessons.find(item => item.id === instruction.lessonId);
    assert.ok(rule, 'activated common instruction is recalled for this target');
    assert.equal(rule.guidance, instructionText);
    assert.equal(rule.provenance, 'user_explicit');
    assert.equal(rule.appliesTo, 'all_jh_tasks');
    for (const ref of [instruction.sourceRef, 'sha256:' + instruction.sourceSha256, instruction.sourceRecordRef]) {
      assert.ok(rule.evidenceRefs.includes(ref));
    }
  };
  const first = await call(phase + '-room-a', 'life_status');
  assert.equal(first.version, '1.5.0-fix5-local-prompts');
  assert.equal(first.secureBridgeVersion, 56);
  assert.equal(first.registeredAndroidDevices, 0);
  assert.equal(first.operationalLearning.enabled, true);
  assert.equal(first.operationalLearning.degraded, false);
  assert.equal(first.operationalLearning.stateAvailable, true);
  assert.equal(first.operationalLearning.librarySync, 'not_connected');
  assert.equal(first.operationalLearning.apiVersion, 3);
  assert.equal(first.operationalLearning.capabilities.explicitInstructions, true);
  assert.equal(first.operationalLearning.capabilities.commonRules, true);
  assert.equal(first.operationalLearning.capabilities.scopedProposals, true);
  assert.equal(first.operationalLearning.capabilities.proposalDecisions, true);
  const beforeUnauthorized = readFileSync(file);
  const preflight = await call(phase + '-preflight', 'life_learning_context', { target_tool: 'life_android_open' });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.delivery, 'before_execution');
  assert.equal(preflight.targetExecuted, false);
  assert.equal(preflight.scope.operation, 'life_android_open');
  assert.equal(preflight.revision, first.operationalLearning.revision);
  if (phase === 'first') assert.deepEqual(preflight.lessons, []);
  else assertCommonAdvice(preflight);
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const deniedMemory = await call('unauthorized-context', 'life_learning_context', { target_tool: 'life_android_open' }, false);
  assert.equal(deniedMemory.envelope.result.isError, true);
  assert.ok(deniedMemory.envelope.result._meta['mcp/www_authenticate'].length > 0);
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const deniedReview = await call('unauthorized-review', 'life_learning_review', { mode: 'CANDIDATE',
    payload: JSON.stringify({ instruction, suite: instructionSuite, expectedRevision: first.operationalLearning.revision }) }, false);
  assert.equal(deniedReview.envelope.result.isError, true);
  assert.ok(deniedReview.envelope.result._meta['mcp/www_authenticate'].length > 0);
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const invalidReview = await call('invalid-review', 'life_learning_review', { mode: 'PREPARE', payload: '{"proposalId":"missing"}' });
  assert.equal(invalidReview.code, 'LEARNING_REQUEST_INVALID');
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const invalidInstruction = await call('invalid-instruction-hash', 'life_learning_review', { mode: 'CANDIDATE',
    payload: JSON.stringify({ instruction: { ...instruction, sourceSha256: 'f'.repeat(64) },
      suite: instructionSuite, expectedRevision: first.operationalLearning.revision }) });
  assert.equal(invalidInstruction.ok, false);
  assert.equal(invalidInstruction.code, 'LEARNING_REQUEST_INVALID');
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const ambiguousInstruction = await call('ambiguous-instruction', 'life_learning_review', { mode: 'CANDIDATE',
    payload: JSON.stringify({ instruction, review: {}, suite: instructionSuite,
      expectedRevision: first.operationalLearning.revision }) });
  assert.equal(ambiguousInstruction.code, 'LEARNING_REQUEST_INVALID');
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const catalogResponse = await fetch(origin + '/mcp', { method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
      authorization: 'Bearer ' + process.env.LIFE_HUB_TOKEN },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'memory-catalog', method: 'tools/list' }),
    signal: AbortSignal.timeout(10000) });
  const catalog = (await catalogResponse.json()).result.tools;
  for (const name of ['life_learning_context', 'life_learning_review']) {
    const tool = catalog.find(item => item.name === name);
    assert.ok(tool, name);
    assert.equal(tool.description.includes('Start each NEW user instruction'), false);
    assert.ok(tool.securitySchemes?.some(item => item.type === 'oauth2') || tool._meta?.securitySchemes?.some(item => item.type === 'oauth2'));
  }
  const reviewTool = catalog.find(item => item.name === 'life_learning_review');
  assert.deepEqual(reviewTool.inputSchema.properties.mode.enum, ['PREPARE', 'CANDIDATE', 'CHECK', 'DECIDE']);
  assert.equal(reviewTool.annotations.readOnlyHint, false);
  const unauthorized = await call('unauthorized', 'life_status', {}, false);
  assert.equal(unauthorized.status, 200); // Existing MCP authentication challenge contract.
  assert.equal(unauthorized.envelope.result.isError, true);
  assert.ok(unauthorized.envelope.result._meta['mcp/www_authenticate'].length > 0);
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  for (let i = 0; i < 3; i++) await call('receipt-' + i, 'life_job_status', { job_id: 'job_99999' });
  assert.deepEqual(readFileSync(file), beforeUnauthorized);
  const beforeDirectives = JSON.parse(readFileSync(file, 'utf8')).state;
  if (phase === 'first') {
    const candidate = await call('instruction-candidate', 'life_learning_review', { mode: 'CANDIDATE',
      payload: JSON.stringify({ instruction, suite: instructionSuite, expectedRevision: beforeDirectives.revision }) });
    assert.equal(candidate.ok, true);
    assert.equal(candidate.lesson.state, 'candidate');
    assert.equal(candidate.lesson.provenance, 'user_explicit');
    assert.equal(candidate.lesson.guidance, instructionText);
    assert.equal(candidate.activatedByThisCall, false);
    assert.equal(candidate.externalEffects, false);
    assert.equal(candidate.instructionSummary.sourceAuthentication, 'authenticated_owner_attestation');
    const dormant = await call('instruction-before-check', 'life_learning_context', { target_tool: 'life_status' });
    assert.deepEqual(dormant.lessons, []);
    assert.equal(dormant.targetExecuted, false);
    const beforeStale = readFileSync(file);
    const stale = await call('instruction-stale-check', 'life_learning_review', { mode: 'CHECK',
      payload: JSON.stringify({ lesson: candidate.lesson, suite: instructionSuite, expectedRevision: beforeDirectives.revision }) });
    assert.equal(stale.code, 'LEARNING_REVISION_CONFLICT');
    assert.deepEqual(readFileSync(file), beforeStale);
    const checked = await call('instruction-check', 'life_learning_review', { mode: 'CHECK',
      payload: JSON.stringify({ lesson: candidate.lesson, suite: instructionSuite, expectedRevision: candidate.revision }) });
    assert.equal(checked.ok, true);
    assert.equal(checked.lessonState, 'active');
    assert.equal(checked.report.passed, instructionSuite.cases.length);
    assert.equal(checked.report.failed, 0);
    assert.equal(checked.liveExecutionVerified, false);
    assert.equal(checked.externalEffects, false);
  } else {
    assert.equal(beforeDirectives.lessons[instruction.lessonId].state, 'active');
    assert.equal(beforeDirectives.lessons[instruction.lessonId].guidance, instructionText);
  }
  const beforeContextReads = readFileSync(file);
  assertCommonAdvice(await call(phase + '-common-status', 'life_learning_context', { target_tool: 'life_status' }));
  assertCommonAdvice(await call(phase + '-common-android', 'life_learning_context',
    { target_tool: 'life_android_open', target_mode: 'SCROLL_ONCE' }));
  assert.deepEqual(readFileSync(file), beforeContextReads);
  const afterDirectives = JSON.parse(readFileSync(file, 'utf8')).state;
  for (const key of ['events', 'attempts', 'proposals']) assert.deepEqual(afterDirectives[key], beforeDirectives[key]);

  // Seed only independent synthetic fixture observations through the real engine.
  // Decisions themselves must never create observations, run a target, or activate a rule.
  const syntheticFailureIds = [1, 2].map(n => 'synthetic-http-proposal-failure-' + n);
  const seededAttempts = phase === 'first' ? syntheticFailureIds.length : 0;
  if (phase === 'first') {
    const envelope = JSON.parse(readFileSync(file, 'utf8'));
    const fixtureStore = new FileLearningStore({ file, ownerScope: envelope.ownerScope });
    await fixtureStore.transact(state => {
      for (const [index, eventId] of syntheticFailureIds.entries()) {
        state = ingest(state, { eventId, taskId: 'synthetic-http-proposal-task-' + index,
          attemptId: 'synthetic-http-proposal-attempt-' + index, sequence: 1,
          timestamp: '2026-10-31T00:00:00.000Z', domain: 'output', operation: 'life_output_format.table',
          engine: preflight.scope.engine, context: preflight.scope.context,
          outcome: 'failure_verified', source: 'host_verified', errorCode: 'SYNTHETIC_OUTPUT_FIELD_MISSING',
          evidenceRefs: ['fixture:synthetic-http-output-' + index] }).state;
      }
      return propose(state, { now: '2026-10-31T00:00:00.000Z' });
    }, { expectedRevision: afterDirectives.revision });
  }
  const beforeDecisions = JSON.parse(readFileSync(file, 'utf8')).state;
  assert.equal(Object.keys(beforeDecisions.proposals).length, 1);
  const proposalId = Object.keys(beforeDecisions.proposals)[0];
  const decisionView = async id => {
    const before = readFileSync(file);
    const response = await call(id, 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ view: 'decision', proposalId }) });
    assert.equal(response.ok, true);
    assert.equal(response.view.schema, 'jh.learning-proposal-decision-view.v1');
    assert.equal(response.view.proposalId, proposalId);
    assert.equal(response.view.readOnly, true);
    assert.equal(response.view.advisoryOnly, true);
    assert.equal(response.view.externalEffects, false);
    assert.equal(response.view.liveExecutionVerified, false);
    assert.deepEqual(readFileSync(file), before);
    return response.view;
  };
  const inputFromReceipt = receipt => ({ proposalId: receipt.proposalId, decisionId: receipt.decisionId,
    decision: receipt.decision, expectedRevision: receipt.baseRevision,
    packetFingerprint: receipt.packetFingerprint, maxAttempts: receipt.maxAttempts,
    reviewer: receipt.reviewer, sourceRef: receipt.sourceRef, reason: receipt.reason,
    eventIds: receipt.eventIds });
  const decide = (id, input, authorized = true) => call(id, 'life_learning_review', {
    mode: 'DECIDE', payload: JSON.stringify(input) }, authorized);
  const assertDecision = (response, status, duplicate) => {
    assert.equal(response.ok, true);
    assert.equal(response.mode, 'DECIDE');
    assert.equal(response.proposal.id, proposalId);
    assert.equal(response.proposal.status, status);
    assert.equal(response.duplicate, duplicate);
    assert.equal(response.externalEffects, false);
    assert.equal(response.activatedByThisCall, false);
    assert.equal(response.liveExecutionVerified, false);
  };
  if (phase === 'first') {
    const emptyView = await decisionView('decision-view-before');
    assert.equal(emptyView.currentStatus, 'open');
    assert.deepEqual(emptyView.decisionHistory, []);
    assert.equal(emptyView.latestDecision, null);
    const preparedDecision = await call('decision-prepare-accept', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ proposalId }) });
    assert.equal(preparedDecision.ok, true);
    const packet = preparedDecision.packet;
    assert.deepEqual(packet.attempts.map(item => item.eventId).sort(), syntheticFailureIds);
    const acceptInput = { proposalId, decisionId: 'synthetic-http-accept-v1', decision: 'accept',
      expectedRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
      maxAttempts: packet.maxAttempts, reviewer: 'agent', sourceRef: 'source:synthetic-http-agent-review',
      reason: 'Select the fixture proposal for review without executing its suggested action.',
      eventIds: packet.attempts.map(item => item.eventId).sort() };
    const beforeAccept = readFileSync(file);
    const deniedDecision = await decide('unauthorized-decision', acceptInput, false);
    assert.equal(deniedDecision.envelope.result.isError, true);
    assert.ok(deniedDecision.envelope.result._meta['mcp/www_authenticate'].length > 0);
    assert.deepEqual(readFileSync(file), beforeAccept);
    const invalidDecision = await decide('invalid-decision', { ...acceptInput, decision: 'execute' });
    assert.equal(invalidDecision.code, 'LEARNING_REQUEST_INVALID');
    assert.deepEqual(readFileSync(file), beforeAccept);
    const staleDecision = await decide('stale-decision', { ...acceptInput, expectedRevision: packet.baseRevision - 1 });
    assert.equal(staleDecision.code, 'LEARNING_REVISION_CONFLICT');
    assert.deepEqual(readFileSync(file), beforeAccept);
    const accepted = await decide('proposal-accept', acceptInput);
    assertDecision(accepted, 'accepted', false);
    assert.equal(accepted.receipt.fromStatus, 'open');
    assert.equal(accepted.receipt.toStatus, 'accepted');
    assert.deepEqual(inputFromReceipt(accepted.receipt), acceptInput);
    const afterAccept = readFileSync(file);
    const acceptAgain = await decide('proposal-accept-retry', acceptInput);
    assertDecision(acceptAgain, 'accepted', true);
    assert.deepEqual(acceptAgain.receipt, accepted.receipt);
    assert.equal(acceptAgain.revision, accepted.revision);
    assert.deepEqual(readFileSync(file), afterAccept);
    const conflictingDecision = await decide('proposal-accept-conflict', {
      ...acceptInput, reason: 'A different decision body cannot reuse the same decision ID.' });
    assert.equal(conflictingDecision.code, 'LEARNING_DECISION_CONFLICT');
    assert.deepEqual(readFileSync(file), afterAccept);
    const acceptedView = await decisionView('decision-view-accepted');
    assert.equal(acceptedView.currentStatus, 'accepted');
    assert.deepEqual(acceptedView.decisionHistory, [accepted.receipt]);
    const prepareDismissal = await call('decision-prepare-dismiss', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ proposalId }) });
    assert.equal(prepareDismissal.ok, true);
    const dismissInput = { ...acceptInput, decisionId: 'synthetic-http-dismiss-v1', decision: 'dismiss',
      expectedRevision: prepareDismissal.packet.baseRevision, packetFingerprint: prepareDismissal.packet.packetFingerprint,
      reviewer: 'user', sourceRef: 'user:synthetic-http-dismissal',
      reason: 'Synthetic owner chooses to stop offering this fixture proposal.' };
    const dismissed = await decide('proposal-dismiss', dismissInput);
    assertDecision(dismissed, 'dismissed', false);
    assert.equal(dismissed.receipt.fromStatus, 'accepted');
    assert.equal(dismissed.receipt.toStatus, 'dismissed');
    assert.deepEqual(inputFromReceipt(dismissed.receipt), dismissInput);
  }
  const finalDecisionView = await decisionView(phase + '-decision-view-final');
  assert.equal(finalDecisionView.currentStatus, 'dismissed');
  assert.deepEqual(finalDecisionView.allowedDecisions, []);
  assert.deepEqual(finalDecisionView.decisionHistory.map(item => item.decisionId),
    ['synthetic-http-accept-v1', 'synthetic-http-dismiss-v1']);
  assert.equal(finalDecisionView.latestDecision.decisionId, 'synthetic-http-dismiss-v1');
  const lastReceipt = finalDecisionView.decisionHistory[1];
  const beforeRetry = readFileSync(file);
  const duplicateDismissal = await decide(phase + '-dismissal-retry', inputFromReceipt(lastReceipt));
  assertDecision(duplicateDismissal, 'dismissed', true);
  assert.deepEqual(duplicateDismissal.receipt, lastReceipt);
  assert.deepEqual(readFileSync(file), beforeRetry);
  const afterDecisions = JSON.parse(readFileSync(file, 'utf8')).state;
  for (const key of ['events', 'attempts', 'lessons']) assert.deepEqual(afterDecisions[key], beforeDecisions[key]);
  const second = await call(phase + '-room-b', 'life_status');
  assert.equal(second.registeredAndroidDevices, 0);
  assert.equal(second.operationalLearning.counts.attempts, first.operationalLearning.counts.attempts + seededAttempts + 1);
  assert.equal(second.operationalLearning.counts.proposals, 1);
  assert.equal(second.operationalLearning.availableAdvice.proposals, 0);
  assert.equal(second.operationalLearning.pending, 0);
  assert.equal(second.operationalLearning.attemptOutcomes.success_verified ?? 0, 0);
  const stored = readFileSync(file, 'utf8');
  assert.ok(!stored.includes(process.env.LIFE_HUB_TOKEN));
  assert.ok(!stored.includes(data.input.ownerSubject));
  assert.ok(!stored.includes('room-a'));
  assert.equal(externalRequests, 0);
  await running.close(); running = null;
  console.log('LEARNING_HTTP_RESULT ' + JSON.stringify({
    phase, firstAttempts: first.operationalLearning.counts.attempts,
    attempts: second.operationalLearning.counts.attempts,
    revision: second.operationalLearning.revision,
    authenticated: true, unauthorizedRejected: true, receiptDedupe: true,
    ownerBootstrapInstalled: true, memoryPreflight: true, memoryReviewAuth: true,
    explicitInstruction: true, commonRuleRecall: true, commonRulePersisted: phase === 'restart', externalRequests, realDevices: 0,
    syntheticProposalAttempts: seededAttempts, proposalDecisionCatalog: true, proposalDecisionAuth: phase === 'first',
    proposalDecisions: finalDecisionView.decisionHistory.length, decisionRetryNoop: true,
    proposalDecisionHistoryHash: createHash('sha256').update(JSON.stringify(finalDecisionView.decisionHistory)).digest('hex'),
    proposalDecisionPersisted: phase === 'restart',
  }));
} finally { key.fill(0); await running?.close(); }
