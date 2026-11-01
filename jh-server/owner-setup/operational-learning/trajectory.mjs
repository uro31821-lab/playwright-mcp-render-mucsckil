import { isDeepStrictEqual, types } from 'node:util';

const MAX_STEPS = 256;
const MAX_CHECKS = 100;
const MAX_CLAIMS = 64;
const MAX_TEXT = 131072;
const MAX_INPUT_BYTES = 262144;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SECRET_KEYS = new Set([
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'apikey',
  'authorization', 'password', 'passwd', 'secret', 'secretkey', 'clientsecret',
  'privatekey', 'cookie', 'cookies', 'sessioncookie', 'credential', 'credentials',
]);
const STATUSES = new Set([
  'observed', 'pending', 'success_verified', 'failure_verified',
  'completion_unknown', 'blocked', 'cancelled',
]);
const SOURCES = new Set(['host_verified', 'user_explicit', 'user_reported']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const REF = /^(?:sha256|event|fixture|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const own = (value, key) => Object.hasOwn(value, key);
const invalid = () => { throw new TypeError('Invalid bounded, redacted trajectory JSON'); };

function looksSecret(value) {
  return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{8,}/i.test(value) ||
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
    /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

/** Reject non-JSON behavior before reading values. Known credential patterns are a backstop,
 * not a complete secret detector: the trusted caller must redact traces before submission. */
function inspectJson(root) {
  const active = new WeakSet();
  let nodes = 0;
  let textSize = 0;
  function visit(value, depth) {
    if (++nodes > 8192 || depth > 16) invalid();
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(); return; }
    if (typeof value === 'string') {
      textSize += value.length;
      if (value.length > 4096 || textSize > MAX_TEXT ||
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || looksSecret(value)) invalid();
      return;
    }
    if (typeof value !== 'object' || types.isProxy(value) || active.has(value)) invalid();
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    active.add(value);
    if (array) {
      const length = descriptors.length.value;
      if (length > MAX_STEPS || keys.length !== length + 1) invalid();
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) invalid();
        visit(descriptor.value, depth + 1);
      }
    } else {
      if (keys.length > 64) invalid();
      for (const key of keys) {
        textSize += key.length;
        if (!key || key.length > 128 || textSize > MAX_TEXT || FORBIDDEN_KEYS.has(key) ||
            SECRET_KEYS.has(key.replace(/[^A-Za-z0-9]/g, '').toLowerCase())) invalid();
        const descriptor = descriptors[key];
        if (!own(descriptor, 'value') || !descriptor.enumerable) invalid();
        visit(descriptor.value, depth + 1);
      }
    }
    active.delete(value);
  }
  visit(root, 0);
}

function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !own(value, key)) || Object.keys(value).some(key => !allowed.has(key))) invalid();
}
function token(value) { if (typeof value !== 'string' || !TOKEN.test(value)) invalid(); }
function refs(value, required = false) {
  if (!Array.isArray(value) || value.length > 16 || (required && value.length === 0) ||
      value.some(ref => typeof ref !== 'string' || !REF.test(ref)) || new Set(value).size !== value.length) invalid();
}
function bound(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) invalid();
}
function range(rule, maximum, defaultMin = 1) {
  const min = rule.min ?? defaultMin;
  const max = rule.max ?? maximum;
  bound(min, maximum); bound(max, maximum);
  if (min > max || (min === 0 && !own(rule, 'max'))) invalid();
  return { min, max };
}
function safePath(value) {
  if (!Array.isArray(value) || value.length > 16 || value.some(key =>
    typeof key === 'string'
      ? !key || key.length > 128 || FORBIDDEN_KEYS.has(key)
      : !Number.isSafeInteger(key) || key < 0 || key >= MAX_STEPS)) invalid();
}

function validate(input) {
  inspectJson(input);
  fields(input, ['trace', 'checks']);
  fields(input.trace, ['steps'], ['claims']);
  const { steps, claims = [] } = input.trace;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS ||
      !Array.isArray(claims) || claims.length > MAX_CLAIMS ||
      !Array.isArray(input.checks) || input.checks.length === 0 || input.checks.length > MAX_CHECKS) invalid();
  const ids = new Set();
  for (const step of steps) {
    fields(step, ['id', 'tool'], ['args', 'status', 'source', 'evidenceRefs']);
    token(step.id); token(step.tool);
    if (ids.has(step.id)) invalid();
    ids.add(step.id);
    if (own(step, 'args') && (!step.args || typeof step.args !== 'object' || Array.isArray(step.args))) invalid();
    if (own(step, 'status') && !STATUSES.has(step.status)) invalid();
    if (own(step, 'source') && !SOURCES.has(step.source)) invalid();
    if (own(step, 'evidenceRefs')) refs(step.evidenceRefs);
  }
  const claimIds = new Set();
  for (const claim of claims) {
    fields(claim, ['id', 'kind', 'stepId', 'evidenceRefs']);
    token(claim.id); token(claim.stepId);
    if (claim.kind !== 'success' || claimIds.has(claim.id)) invalid();
    claimIds.add(claim.id);
    refs(claim.evidenceRefs, true);
  }
  for (const rule of input.checks) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) invalid();
    switch (rule.op) {
      case 'tool_used':
        fields(rule, ['op', 'tool'], ['min', 'max']); token(rule.tool); range(rule, MAX_STEPS); break;
      case 'ordered_tools':
        fields(rule, ['op', 'tools', 'mode']);
        if (!['subsequence', 'contiguous'].includes(rule.mode) || !Array.isArray(rule.tools) ||
            rule.tools.length === 0 || rule.tools.length > 64) invalid();
        rule.tools.forEach(token); break;
      case 'tool_args':
        fields(rule, ['op', 'tool', 'mode', 'expected'], ['stepId', 'path']);
        token(rule.tool);
        if (own(rule, 'stepId')) token(rule.stepId);
        if (rule.mode === 'path') { if (!own(rule, 'path')) invalid(); safePath(rule.path); }
        else if (rule.mode === 'exact') {
          if (own(rule, 'path') || !rule.expected || typeof rule.expected !== 'object' || Array.isArray(rule.expected)) invalid();
        } else invalid();
        break;
      case 'step_count': fields(rule, ['op'], ['min', 'max']); range(rule, MAX_STEPS); break;
      case 'claims_verified':
        fields(rule, ['op'], ['min']);
        bound(rule.min ?? 1, MAX_CLAIMS);
        if ((rule.min ?? 1) === 0) invalid();
        break;
      default: invalid();
    }
  }
  // A claimed success cannot silently bypass its evidence check because a caller omitted it.
  if (claims.length && !input.checks.some(rule => rule.op === 'claims_verified')) invalid();
}

function inRange(count, rule) {
  const { min, max } = range(rule, MAX_STEPS);
  return count >= min && count <= max;
}
function ordered(steps, tools, mode) {
  if (mode === 'contiguous') {
    return steps.some((_, start) => tools.every((tool, index) => steps[start + index]?.tool === tool));
  }
  let next = 0;
  for (const step of steps) if (step.tool === tools[next]) next++;
  return next === tools.length;
}
function argsMatch(step, rule) {
  if (!own(step, 'args')) return false;
  let actual = step.args;
  for (const key of rule.mode === 'path' ? rule.path : []) {
    if (actual === null || typeof actual !== 'object' || !own(actual, key)) return false;
    actual = actual[key];
  }
  return isDeepStrictEqual(actual, rule.expected);
}

/**
 * Deterministic consistency checks over a bounded, already-redacted recorded trace.
 * No tool execution, model call, network, filesystem, dynamic import, eval, or input regex.
 *
 * ordered_tools explicitly chooses a subsequence (intermediate steps allowed) or a contiguous
 * matching window (other steps may occur before/after it). Use tool_used/step_count for
 * forbidden or extra calls. tool_args checks ALL selected calls, never just the last success.
 * Claims bind to one verified result step and its evidence refs. The trusted caller is
 * responsible for authenticating host_verified evidence; this module does not establish
 * live device effects, truth of documents, or integrity of externally supplied records.
 * Invalid/missing traces and empty checks throw without including private input in errors.
 */
export function evaluateTrajectory(input) {
  validate(input);
  const { steps, claims = [] } = input.trace;
  const byId = new Map(steps.map(step => [step.id, step]));
  const failed = [];
  input.checks.forEach((rule, index) => {
    let passed;
    switch (rule.op) {
      case 'tool_used': passed = inRange(steps.filter(step => step.tool === rule.tool).length, rule); break;
      case 'ordered_tools': passed = ordered(steps, rule.tools, rule.mode); break;
      case 'tool_args': {
        const selected = steps.filter(step => step.tool === rule.tool && (!own(rule, 'stepId') || step.id === rule.stepId));
        passed = selected.length > 0 && selected.every(step => argsMatch(step, rule));
        break;
      }
      case 'step_count': passed = inRange(steps.length, rule); break;
      case 'claims_verified':
        passed = claims.length >= (rule.min ?? 1) && claims.every(claim => {
          const result = byId.get(claim.stepId);
          return result?.status === 'success_verified' && result.source === 'host_verified' &&
            result.evidenceRefs?.length > 0 && claim.evidenceRefs.every(ref => result.evidenceRefs.includes(ref));
        });
        break;
    }
    if (!passed) failed.push(index);
  });
  return { passed: failed.length === 0, failed };
}

/** Optional custom-assertion adapter, with no dependency on or installation of promptfoo.
 * output must contain the same trace/checks JSON contract; malformed or absent data fails.
 * The return value grades recorded trace consistency only, never a real-world outcome. */
export function evaluatePromptfooTrajectory(output) {
  try {
    if (typeof output === 'string') {
      if (Buffer.byteLength(output, 'utf8') > MAX_INPUT_BYTES) invalid();
      output = JSON.parse(output);
    }
    const result = evaluateTrajectory(output);
    return {
      pass: result.passed,
      score: result.passed ? 1 : 0,
      reason: result.passed
        ? 'JH recorded trajectory checks passed; live effects are not verified by this assertion.'
        : `JH recorded trajectory checks failed at indexes: ${result.failed.join(', ')}.`,
    };
  } catch {
    return { pass: false, score: 0, reason: 'Invalid or incomplete JH recorded trajectory input.' };
  }
}
