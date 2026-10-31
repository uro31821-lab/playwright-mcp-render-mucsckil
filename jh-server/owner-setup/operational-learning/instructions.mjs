import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { addLesson } from './engine.mjs';
import { bindRegression } from './regression.mjs';

const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const TOOL = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const MODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const USER_REF = /^user:[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const RECORD_REF = /^(?:library|source|artifact):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const META = ['validFrom', 'validUntil', 'supersedes', 'conflictKey'];
const DEFINITION = ['id', 'domain', 'operation', 'engine', 'context', 'guidance', 'evidenceRefs', 'ruleVersion',
  'memoryKind', 'provenance', ...META, 'reflection'];
const own = (value, key) => Object.hasOwn(value, key);
const fail = message => { throw new TypeError(message); };

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !own(item, 'value') || !item.enumerable)) fail(`Invalid ${label}`);
}
function fields(value, required, optional = [], label = 'instruction') {
  object(value, label);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail(`Invalid ${label} fields`);
}
function token(value, label) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(`Invalid ${label}`); }

// This backstop recognizes known credential forms. It is not a complete secret or
// personal-data detector; the authenticated owner/host must provide redacted text.
function looksCredential(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
}
function validText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || !value.isWellFormed() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || looksCredential(value)) fail('Invalid instruction text');
}
function validScope(scope) {
  fields(scope, ['domain', 'operation', 'engine', 'context'], [], 'trusted host scope');
  if (!DOMAINS.has(scope.domain)) fail('Invalid trusted host scope domain');
  token(scope.operation, 'trusted host scope operation'); token(scope.engine, 'trusted host scope engine');
  fields(scope.context, ['platform', 'version', 'environment'], [], 'trusted host context');
  for (const value of Object.values(scope.context)) token(value, 'trusted host context value');
}
function validAppliesTo(value) {
  object(value, 'instruction appliesTo');
  if (value.kind === 'all_jh_tasks') fields(value, ['kind'], [], 'instruction appliesTo');
  else if (value.kind === 'tool') {
    fields(value, ['kind', 'target_tool'], ['target_mode'], 'instruction appliesTo');
    if (typeof value.target_tool !== 'string' || !TOOL.test(value.target_tool)) fail('Invalid instruction target tool');
    if (own(value, 'target_mode') && (typeof value.target_mode !== 'string' || !MODE.test(value.target_mode))) fail('Invalid instruction target mode');
  } else fail('Invalid instruction appliesTo kind');
}
function canonical(value, depth = 0, rejectCredentials = false) {
  if (depth > 64) fail('Instruction data is too deeply nested');
  if (typeof value === 'string') {
    if (rejectCredentials && looksCredential(value)) fail('Invalid instruction data');
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (types.isProxy(value)) fail('Invalid instruction JSON data');
  if (Array.isArray(value)) {
    if (value.length > 1000 || Reflect.ownKeys(value).length !== value.length + 1) fail('Invalid instruction JSON array');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const parts = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) fail('Invalid instruction JSON array');
      parts.push(canonical(descriptor.value, depth + 1, rejectCredentials));
    }
    return '[' + parts.join(',') + ']';
  }
  object(value, 'instruction JSON data');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1, rejectCredentials)).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function definitionOf(lesson, omitId = false) {
  return Object.fromEntries(DEFINITION.filter(key => own(lesson, key) && !(omitId && key === 'id')).map(key => [key, structuredClone(lesson[key])]));
}

/**
 * Build a candidate from an explicit instruction, independently of experience proposals.
 * The host must authenticate the owner and map appliesTo to the trusted scope option
 * before calling. The supplied confirmation attests to that boundary; it is not an
 * independent retrieval or authentication of a chat message or Library record.
 * This function preserves the exact text, binds a suite, and validates without saving,
 * executing a tool, changing events/proposals, or activating the resulting lesson.
 */
export function createInstructionCandidate(state, instruction, suite, options) {
  fields(instruction, ['lessonId', 'ruleVersion', 'text', 'sourceRef', 'sourceSha256', 'appliesTo', 'confirmation'],
    ['sourceRecordRef', ...META]);
  fields(options, ['scope'], [], 'trusted host options');
  validScope(options.scope); validAppliesTo(instruction.appliesTo);
  token(instruction.lessonId, 'instruction lesson ID'); token(instruction.ruleVersion, 'instruction rule version');
  if (instruction.confirmation !== 'explicit_user_instruction') fail('Explicit user instruction confirmation required');
  validText(instruction.text);
  if (typeof instruction.sourceRef !== 'string' || !USER_REF.test(instruction.sourceRef)) fail('Invalid instruction source reference');
  if (own(instruction, 'sourceRecordRef') && (typeof instruction.sourceRecordRef !== 'string' || !RECORD_REF.test(instruction.sourceRecordRef))) fail('Invalid instruction record reference');
  const sourceSha256 = createHash('sha256').update(instruction.text, 'utf8').digest('hex');
  if (typeof instruction.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(instruction.sourceSha256) ||
      instruction.sourceSha256 !== sourceSha256) fail('Instruction source hash does not match its exact UTF-8 text');
  // Scan every instruction string, including references, IDs and nested applicability/
  // supersession fields. A reference-shaped credential is still a credential.
  if (canonical(instruction, 0, true).length > 65536 || canonical(suite).length > 1024 * 1024) fail('Instruction or suite exceeds its bounds');
  const evidenceRefs = [instruction.sourceRef, `sha256:${sourceSha256}`,
    ...(own(instruction, 'sourceRecordRef') ? [instruction.sourceRecordRef] : [])];
  const metadata = Object.fromEntries(META.filter(key => own(instruction, key)).map(key => [key, structuredClone(instruction[key])]));
  const definition = { id: instruction.lessonId, ...structuredClone(options.scope), guidance: instruction.text,
    evidenceRefs, ruleVersion: instruction.ruleVersion, memoryKind: 'procedure', provenance: 'user_explicit', ...metadata };
  let lesson = { ...bindRegression(definition, suite), state: 'candidate' };
  object(state, 'learning state'); object(state.lessons, 'learning lessons');
  // Reject a conflicting requested ID before considering an equivalent different ID.
  if (own(state.lessons, lesson.id)) addLesson(state, lesson);
  let duplicateLessonId;
  let existingLessonState;
  for (const existing of Object.values(state.lessons)) {
    object(existing, 'stored lesson');
    if (!isDeepStrictEqual(definitionOf(existing, true), definitionOf(definition, true))) continue;
    if (!['candidate', 'active'].includes(existing.state)) fail('An inactive instruction definition cannot be revived under another ID');
    // Similar text does not prove equality: compare the actual persisted regression binding.
    if (bindRegression(definitionOf(existing), suite).inputFingerprint !== existing.inputFingerprint) continue;
    duplicateLessonId = existing.id; existingLessonState = existing.state;
    lesson = { ...bindRegression(definitionOf(existing), suite), state: 'candidate' };
    break;
  }
  // Reuse the engine validator after deduplication, so an existing definition remains
  // idempotent even at capacity. Discard its returned state; only the host may save.
  addLesson(state, lesson);
  return { lesson, suite: structuredClone(suite), instructionSummary: {
    sourceKind: 'explicit_user_instruction', sourceRef: instruction.sourceRef, sourceSha256,
    ...(own(instruction, 'sourceRecordRef') ? { sourceRecordRef: instruction.sourceRecordRef } : {}),
    sourceAuthentication: 'authenticated_owner_attestation', appliesTo: structuredClone(instruction.appliesTo),
    automaticInference: false, candidateOnly: true, externalEffects: false, activationPerformed: false,
    definitionFingerprint: digest({ definition: definitionOf(definition, true), suite }),
    ...(duplicateLessonId ? { duplicateLessonId, existingLessonState } : {}),
  } };
}
