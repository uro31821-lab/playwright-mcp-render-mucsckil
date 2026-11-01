/** Isolated HTTP fixture: real generated owner/runtime, synthetic private volume.
 * All non-loopback network requests are rejected; no real device is registered.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateOwnerConfiguration, loadOwnerKey } from '../deployment/owner-config.mjs';
import { takeStorageSecrets, materializeStorageKeys } from '../deployment/storage-secret-bridge.mjs';
import { prepareOperationalStorage } from '../deployment/operational-service-entry.mjs';
import { prepareOrVerifyDurableRelease, INITIAL_MODE, READY_MODE } from '../deployment/durable-live-release.mjs';
import { buildPendingApprovalOperatorEntrypoint56 } from '../server-integration/pending-approval-operator-entry.mjs';
import { FileLearningStore } from './store.mjs';
import { ingest, propose } from './engine.mjs';
import { installOwnerLearning } from './owner-host.mjs';
import { TrustedDeviceRegistry, canonicalChallenge } from '../trusted-server/trusted-device-registry.mjs';
import { activationMaterial, receiptMaterial } from '../trusted-server/trusted-bridge-session-authority.mjs';

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
if (phase === 'inspect') {
  await inspectReceiptHttpFixture();
} else {
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
  assert.equal(first.operationalLearning.capabilities.proposalProgress, true);
  assert.equal(first.operationalLearning.capabilities.existingReceiptReconciliation, true);
  assert.equal(first.operationalLearning.capabilities.reviewReadiness, true);
  assert.equal(first.operationalLearning.capabilities.splitReadObservationReconciliation, true);
  assert.equal(first.operationalLearning.capabilities.splitFollowupClickReceiptReconciliation, true);
  assert.equal(first.operationalLearning.capabilities.computerInspectReceiptReconciliation, true);
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
  const proposalState = JSON.parse(readFileSync(file, 'utf8')).state;
  assert.equal(Object.keys(proposalState.proposals).length, 1);
  const proposalId = Object.keys(proposalState.proposals)[0];
  const progressView = async id => {
    const before = readFileSync(file);
    const response = await call(id, 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ view: 'progress', proposalId }) });
    assert.equal(response.ok, true);
    assert.equal(response.view.schema, 'jh.learning-proposal-progress.v1');
    assert.equal(response.view.proposalId, proposalId);
    assert.equal(response.view.readOnly, true);
    assert.equal(response.view.externalEffects, false);
    assert.equal(response.view.liveExecutionVerified, false);
    assert.equal(response.view.recallScope, 'candidate_and_common');
    assert.deepEqual(readFileSync(file), before);
    return response.view;
  };
  const linkedLessonId = 'synthetic-http-reviewed-candidate-v1';
  if (phase === 'first') {
    const empty = await progressView('progress-before-candidate');
    assert.deepEqual(empty.candidates, [], 'Existing explicit instructions are not inferred proposal links');
    const before = readFileSync(file);
    const denied = await call('unauthorized-progress', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ view: 'progress', proposalId }) }, false);
    assert.equal(denied.envelope.result.isError, true);
    assert.ok(denied.envelope.result._meta['mcp/www_authenticate'].length > 0);
    const invalid = await call('invalid-progress-write', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ view: 'progress', proposalId, status: 'verified' }) });
    assert.equal(invalid.code, 'LEARNING_REQUEST_INVALID');
    assert.deepEqual(readFileSync(file), before);
    const preparedCandidate = await call('prepare-linked-candidate', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ proposalId }) });
    const packet = preparedCandidate.packet;
    const review = { proposalId, baseRevision: packet.baseRevision, packetFingerprint: packet.packetFingerprint,
      lessonId: linkedLessonId, ruleVersion: '1', scope: packet.proposal.scope,
      cause: 'Synthetic fixture output omitted its required evidence field.',
      resolution: 'Check the evidence field in the recorded output contract.',
      expectedEffect: 'Reject the synthetic missing-evidence case before claiming a complete output.',
      guidance: 'Include the required evidence field in the synthetic output.',
      eventIds: syntheticFailureIds, reviewer: 'agent' };
    const suite = { ...instructionSuite, id: 'synthetic-http-linked-regression' };
    const candidate = await call('register-linked-candidate', 'life_learning_review', { mode: 'CANDIDATE',
      payload: JSON.stringify({ review, suite }) });
    assert.equal(candidate.ok, true);
    assert.equal(candidate.duplicate, false);
    assert.equal(candidate.lesson.id, linkedLessonId);
    assert.equal(candidate.link.lessonId, linkedLessonId);
    assert.equal(candidate.revision, packet.baseRevision + 1);
    const unchecked = await progressView('progress-before-check');
    assert.equal(unchecked.candidates.length, 1);
    assert.equal(unchecked.candidates[0].lessonState, 'candidate');
    assert.equal(unchecked.candidates[0].evaluation.status, 'not_run');
    assert.equal(unchecked.candidates[0].recallIncluded, false);
    const checked = await call('check-linked-candidate', 'life_learning_review', { mode: 'CHECK',
      payload: JSON.stringify({ lesson: candidate.lesson, suite: candidate.suite, expectedRevision: candidate.revision }) });
    assert.equal(checked.ok, true);
    assert.equal(checked.lessonState, 'active');
    assert.equal(checked.liveExecutionVerified, false);
    const refreshed = await call('prepare-linked-duplicate', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ proposalId }) });
    const duplicateReview = { ...review, baseRevision: refreshed.packet.baseRevision,
      packetFingerprint: refreshed.packet.packetFingerprint };
    const beforeDuplicate = readFileSync(file);
    const duplicate = await call('register-linked-duplicate', 'life_learning_review', { mode: 'CANDIDATE',
      payload: JSON.stringify({ review: duplicateReview, suite }) });
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.link, candidate.link);
    assert.equal(duplicate.lesson.state, 'active');
    assert.deepEqual(readFileSync(file), beforeDuplicate);
  }
  const beforeDecisions = JSON.parse(readFileSync(file, 'utf8')).state;
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
    const beforePrepare = readFileSync(file);
    const preparedDecision = await call('decision-prepare-accept', 'life_learning_review', { mode: 'PREPARE',
      payload: JSON.stringify({ proposalId }) });
    assert.equal(preparedDecision.ok, true);
    const packet = preparedDecision.packet;
    assert.deepEqual(packet.attempts.map(item => item.eventId).sort(), syntheticFailureIds);
    assert.equal(packet.evidenceReadiness.schema, 'jh.learning-evidence-readiness.v1');
    assert.equal(packet.evidenceReadiness.status, 'ready_for_review');
    assert.equal(packet.evidenceReadiness.currentVerifiedOutcomeCount, 2);
    assert.equal(packet.evidenceReadiness.currentEligibleCount, 2);
    assert.equal(packet.evidenceReadiness.visibleEligibleCount, 2);
    assert.equal(packet.evidenceReadiness.automaticReplayAllowed, false);
    assert.equal(packet.evidenceReadiness.outcomeInferenceAllowed, false);
    assert.equal(packet.evidenceReadiness.activationPerformed, false);
    assert.deepEqual(readFileSync(file), beforePrepare);
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
  const finalProgress = await progressView(phase + '-progress-after-decision');
  assert.equal(finalProgress.currentStatus, 'dismissed');
  assert.equal(finalProgress.candidates.length, 1);
  const progressCandidate = finalProgress.candidates[0];
  assert.equal(progressCandidate.link.lessonId, linkedLessonId);
  assert.equal(progressCandidate.bindingStatus, 'matched');
  assert.equal(progressCandidate.lessonState, 'active');
  assert.equal(progressCandidate.evaluation.status, 'passed');
  assert.equal(progressCandidate.evaluation.passed, 2);
  assert.equal(progressCandidate.recallIncluded, true);
  assert.equal(progressCandidate.pastApplicationVerified, false);
  assert.equal(progressCandidate.liveImprovementVerified, false);
  assert.equal(afterDecisions.proposals[proposalId].verification, undefined);
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
    proposalDecisionPersisted: phase === 'restart', reviewReadiness: phase === 'first',
    proposalProgress: true, proposalProgressPersisted: phase === 'restart',
    proposalProgressLinkHash: createHash('sha256').update(JSON.stringify(progressCandidate.link)).digest('hex'),
    existingReceiptReconciliationCapability: first.operationalLearning.capabilities.existingReceiptReconciliation,
    splitReadObservationReconciliationCapability: first.operationalLearning.capabilities.splitReadObservationReconciliation,
    splitFollowupClickReceiptReconciliationCapability: first.operationalLearning.capabilities.splitFollowupClickReceiptReconciliation,
    computerInspectReceiptReconciliationCapability: first.operationalLearning.capabilities.computerInspectReceiptReconciliation,
  }));
} finally { key.fill(0); await running?.close(); }
}

/** Actual generated MCP/HTTP routes, registry and HMAC verification. Only the
 * enrollment authority below is a synthetic fixture port; no real phone,
 * external identity provider, production memory or operator authority is used.
 */
async function inspectReceiptHttpFixture() {
  const config = validateOwnerConfiguration(data.input);
  mkdirSync(config.stateDir, { mode: 0o700 });
  process.env.PUBLIC_BASE_URL = config.serverOrigin;
  process.env.JH_CONNECTION_V2_RECOVERY = '0';
  const runtime = await import(pathToFileURL(built.runtimeFile).href);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const mac = (key, value) => createHmac('sha256', key).update(value).digest('hex');
  const token = () => randomBytes(24).toString('base64url');
  const enrollmentContext = {}, deviceId = 'synthetic-inspect-http-device';
  const registry = new TrustedDeviceRegistry({
    databasePath: path.join(config.stateDir, 'synthetic-inspect-registry.sqlite'),
    serverDigest: hash(config.serverOrigin + '/mcp|jh-secure-bridge56'), catalogDigest: config.catalogDigest,
    authorizeEnrollment: (context, expected) => context === enrollmentContext ? {
      ownerDigest: config.accountDigest, enrollmentId: expected.consentRequestId,
      exactConsentDigest: hash(JSON.stringify(expected)), expiresAt: Date.now() + 30000,
    } : null,
    authorizeRevocation: () => null,
  });
  let circuit, learning;
  try {
    runtime.installTrustedSessionRegistry56(registry);
    circuit = runtime.installDurableNativeCircuit56({
      file: path.join(config.stateDir, 'synthetic-inspect-circuit.sqlite'),
      key: Buffer.alloc(32, 73), namespace: hash('synthetic-inspect-http-circuit'), mode: 'EXPLICIT_ONE_TIME',
    });
    learning = await installOwnerLearning(runtime, { config, runtimeId: 'synthetic-inspect-http-runtime' });
    await new Promise((resolve, reject) => {
      runtime.httpServer.once('error', reject);
      runtime.httpServer.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + runtime.httpServer.address().port;
    const request = async (url, body, headers = {}, timeout = 10000) => {
      const response = await fetch(origin + url, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      const text = await response.text();
      let value; try { value = JSON.parse(text); } catch { value = text; }
      return { status: response.status, value };
    };
    let commandId, callId = 0;
    const call = async (name, args = {}, authorized = true, timeout = 10000) => {
      const result = await request('/mcp', { jsonrpc: '2.0', id: ++callId, method: 'tools/call',
        params: { name, arguments: { ...(commandId ? { command_id: commandId } : {}), ...args } } }, {
        accept: 'application/json, text/event-stream',
        ...(authorized ? { authorization: 'Bearer ' + process.env.LIFE_HUB_TOKEN } : {}),
      }, timeout);
      assert.equal(result.status, 200);
      if (!authorized) return result.value;
      assert.ok(result.value.result?.content, JSON.stringify(result.value));
      assert.notEqual(result.value.result.isError, true, JSON.stringify(result.value));
      return JSON.parse(result.value.result.content[0].text);
    };
    const deviceKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const trust = registry.enroll({
      publicKeySpki: deviceKey.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
      deviceDigest: hash('jh56|' + deviceId), requestedTrustMs: 300000, consentRequestId: token(),
    }, enrollmentContext);
    const challenged = await request('/device/trusted/challenge', { trustId: trust.trustId, clientNonce: token(), deviceId });
    assert.equal(challenged.status, 200);
    const reconnected = await request('/device/trusted/reconnect', { deviceId, proof: {
      challenge: challenged.value,
      signature: sign('sha256', canonicalChallenge(challenged.value), deviceKey.privateKey).toString('base64url'),
    } });
    assert.equal(reconnected.status, 200);
    const offer = reconnected.value, secret = Buffer.from(offer.secureSessionSecret, 'base64url');
    const activation = { deviceId, trustId: offer.trustId, challengeId: offer.challengeId,
      redemptionId: offer.redemptionId, sessionId: offer.secureSessionId, deviceDigest: offer.deviceDigest,
      sessionDigest: offer.sessionDigest, nonce: token(), expiresAt: Math.min(Date.now() + 10000, offer.activationExpiresAt),
      processEpoch: 'synthetic-inspect-process', restartDisposition: 'DISCARD_PREVIOUS' };
    activation.mac = mac(secret, activationMaterial(activation));
    const activated = await request('/device/trusted/activate', activation);
    assert.equal(activated.status, 200);
    assert.equal(activated.value.mac, mac(secret, receiptMaterial(activated.value)));
    const signedHeaders = (action, jobId, body) => {
      const nonce = token(), expires = Date.now() + 20000;
      const sid = offer.secureSessionId, device = offer.deviceDigest;
      const headers = { 'x-jh-session': sid, 'x-jh-device': device,
        'x-jh-nonce': nonce, 'x-jh-expires': String(expires) };
      let material = `poll|${sid}|${device}|${nonce}|${expires}`;
      if (action === 'complete') {
        headers['x-jh-result-digest'] = hash(JSON.stringify(body));
        material = `complete|${sid}|${jobId}|${device}|${nonce}|${expires}|${headers['x-jh-result-digest']}`;
      }
      headers['x-jh-mac'] = mac(secret, material); return headers;
    };
    const begun = await call('life_android_workflow_link', { mode: 'BEGIN_COMMAND', request_id: randomBytes(16).toString('hex') });
    assert.equal(begun.ok, true); commandId = begun.commandId;
    const taskDigest = hash('synthetic-inspect-task'), runDigest = hash('synthetic-inspect-run');
    const waiting = call('life_android_computer_inspect', { device_id: deviceId,
      task_digest: taskDigest, run_digest: runDigest, action: 'CLICK', effect: 'READ_ONLY' }, true, 25000);
    waiting.catch(() => {});
    let job;
    for (let attempt = 0; attempt < 60; attempt++) {
      const polled = await request('/device/poll?deviceId=' + deviceId, undefined, signedHeaders('poll'));
      if (polled.status === 200) { job = polled.value; break; }
      assert.equal(polled.status, 204, JSON.stringify(polled));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(job?.type, 'computer_use_inspect');
    assert.equal(job.mcpToolName, 'life_android_computer_inspect');
    assert.equal(job.secureRequestedEffect, 'READ_ONLY');
    // Let the actual existing 15-second wait return its original pending receipt.
    // No fixture changes the generated wait, clock, verifier, job map or registry.
    const pending = await waiting;
    assert.equal(pending.status, 'in_progress');
    assert.match(pending.receiptToken, /^cir_[A-Za-z0-9_-]{43}$/);
    const receiptArgs = { device_id: deviceId, task_digest: taskDigest,
      run_digest: runDigest, receipt_token: pending.receiptToken };
    const file = path.join(config.stateDir, 'operational-learning-v1.json');
    const bytes = () => readFileSync(file, 'utf8');
    const state = () => JSON.parse(bytes()).state;
    const inspectAttempt = () => {
      const matches = Object.values(state().attempts).filter(item => item.operation === 'life_android_computer_inspect');
      assert.equal(matches.length, 1); return matches[0];
    };
    const original = inspectAttempt();
    assert.equal(original.outcome, 'pending');
    const pendingBytes = bytes();
    const unauthorized = await call('life_android_pending_approval_receipt_status', receiptArgs, false);
    assert.equal(unauthorized.result.isError, true);
    assert.ok(unauthorized.result._meta['mcp/www_authenticate'].length > 0);
    const readPending = await call('life_android_pending_approval_receipt_status', receiptArgs);
    assert.equal(readPending.status, 'in_progress'); assert.equal(readPending.lookupOnly, true);
    for (const change of [{ task_digest: hash('wrong-task') }, { run_digest: hash('wrong-run') },
      { command_id: randomBytes(16).toString('hex') }]) {
      const denied = await call('life_android_pending_approval_receipt_status', { ...receiptArgs, ...change });
      assert.equal(denied.ok, false);
    }
    assert.equal(bytes(), pendingBytes);
    const body = { result: { ok: false, code: 'SYNTHETIC_INSPECT_NO_TARGET',
      details: 'PRIVATE_SYNTHETIC_INSPECTION_CONTENT', resultVerified: true, verifiedOutcome: 'success_verified' } };
    const badHeaders = { ...signedHeaders('complete', job.id, body), 'x-jh-mac': '0'.repeat(64) };
    assert.equal((await request('/job/' + job.id + '/complete', body, badHeaders)).status, 401);
    assert.equal(bytes(), pendingBytes);
    assert.equal((await request('/job/' + job.id + '/complete', body, signedHeaders('complete', job.id, body))).status, 200);
    await learning.status();
    const completed = state(), priorReceipt = inspectAttempt();
    assert.equal(priorReceipt.outcome, 'observed');
    assert.equal(priorReceipt.evidenceRefs.includes('source:jh-computer-inspect-receipt-only'), false);
    const readback = await call('life_android_pending_approval_receipt_status', receiptArgs);
    assert.equal(readback.ok, true); assert.equal(readback.lookupOnly, true); assert.equal(readback.readOnly, true);
    assert.equal(readback.status, 'complete'); assert.equal(readback.idDigest, hash(job.id));
    assert.equal(readback.newJobCreated, false); assert.equal(readback.automaticReplay, false);
    assert.deepEqual(readback.result, body.result);
    const after = state(), reconciled = inspectAttempt();
    for (const field of ['taskId', 'attemptId', 'operation', 'domain', 'engine', 'context'])
      assert.deepEqual(reconciled[field], original[field], field);
    assert.equal(Object.keys(after.attempts).length, Object.keys(completed.attempts).length);
    assert.equal(Object.keys(after.events).length, Object.keys(completed.events).length + 1);
    assert.equal(reconciled.outcome, 'observed');
    assert.deepEqual(reconciled.evidenceRefs.slice(1), ['source:jh-computer-inspect-receipt-only']);
    assert.match(reconciled.evidenceRefs[0], /^sha256:[a-f0-9]{64}$/);
    const recordedBytes = bytes();
    assert.deepEqual(await call('life_android_pending_approval_receipt_status', receiptArgs), readback);
    assert.equal(bytes(), recordedBytes);
    const empty = await request('/device/poll?deviceId=' + deviceId, undefined, signedHeaders('poll'));
    assert.equal(empty.status, 204, 'readbacks must not queue another inspection or action');
    assert.doesNotMatch(recordedBytes, /PRIVATE_SYNTHETIC_INSPECTION_CONTENT|cir_|s56_|screenGrant|approvalGrant/);
    for (const secretValue of [pending.receiptToken, offer.secureSessionSecret, commandId, deviceId])
      assert.equal(recordedBytes.includes(secretValue), false);
    const status = await learning.status();
    assert.equal(status.capabilities.computerInspectReceiptReconciliation, true);
    assert.equal(status.attemptOutcomes.success_verified ?? 0, 0);
    assert.equal(status.degraded, false); assert.equal(externalRequests, 0);
    secret.fill(0);
    console.log('LEARNING_INSPECT_HTTP_RESULT ' + JSON.stringify({ generatedRuntime: true,
      syntheticEnrollmentPort: true, realDevices: 0, externalRequests,
      originalReceiptIssued: true, originalReadbackReconciled: true, observedOnly: true,
      unauthorizedRejected: true, badCompletionMacRejected: true, changedBindingRejected: true,
      pendingUnchanged: true, repeatNoop: true, additionalJobs: 0,
      originalResultPreserved: true, sensitiveEvidenceRedacted: true }));
  } finally {
    runtime.httpServer.closeAllConnections();
    if (runtime.httpServer.listening) await new Promise(resolve => runtime.httpServer.close(resolve));
    await learning?.close(); circuit?.close(); registry.close();
  }
}
