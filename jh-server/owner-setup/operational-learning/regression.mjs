import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { addLesson, evaluateLesson } from './engine.mjs';

function stable(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('JSON fixture required');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}
const digest = value => createHash('sha256').update(stable(value)).digest('hex');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);

function validateSuite(suite) {
  if (!suite || !id(suite.id) || !id(suite.version) || !Array.isArray(suite.cases) ||
      !suite.cases.length || suite.cases.length > 1000) throw new TypeError('Nonempty versioned regression suite required');
  const ids = new Set();
  for (const item of suite.cases) {
    if (!id(item.id) || ids.has(item.id) || !Object.hasOwn(item, 'input') || !Object.hasOwn(item, 'expected')) throw new TypeError('Unique cases need input and expected output');
    ids.add(item.id);
  }
  stable(suite);
}

/** Bind a lesson to its definition AND actual replay inputs/expected outputs. */
export function bindRegression(definition, suite) {
  validateSuite(suite);
  const { inputFingerprint, state, advisoryOnly, evaluation, evaluationHistory, supersessionHistory, ...candidate } = definition;
  return { ...candidate, inputFingerprint: digest({ candidate, suite }) };
}

/**
 * evaluator is a trusted, effect-free host callback; never import or execute code named by an event.
 * Fixtures are redacted recordings or synthetic inputs. This tests policy/output behavior;
 * it does not claim a live phone action, service login, or a real model fine-tuning run.
 */
export async function runRegression(lesson, suite, evaluator, { now = new Date().toISOString() } = {}) {
  if (typeof evaluator !== 'function') throw new TypeError('Trusted evaluator callback required');
  const bound = bindRegression(lesson, suite);
  if (lesson.inputFingerprint !== bound.inputFingerprint) throw new TypeError('Regression inputs differ from lesson fingerprint');
  const definitionFingerprint = digest(bound);
  const cases = [];
  for (const item of suite.cases) {
    try {
      const actual = await evaluator(structuredClone(item.input));
      const actualHash = digest(actual);
      cases.push({ id: item.id, passed: isDeepStrictEqual(actual, item.expected),
        actualHash, expectedHash: digest(item.expected) });
    } catch {
      // Exception messages can contain secrets; keep only a typed failure marker.
      cases.push({ id: item.id, passed: false, errorCode: 'EVALUATOR_FAILED', expectedHash: digest(item.expected) });
    }
  }
  const report = { schema: 'jh.operational-regression.v1', lessonId: lesson.id,
    ruleVersion: lesson.ruleVersion, inputFingerprint: lesson.inputFingerprint, definitionFingerprint,
    suiteId: suite.id, suiteVersion: suite.version, timestamp: now, cases,
    passed: cases.filter(item => item.passed).length,
    failed: cases.filter(item => !item.passed).length, skipped: 0 };
  return { report, evaluation: { lessonId: lesson.id, definitionFingerprint, ruleVersion: lesson.ruleVersion,
    inputFingerprint: lesson.inputFingerprint, passed: report.passed, failed: report.failed,
    skipped: 0, timestamp: now, evidenceRefs: ['regression:' + digest(report)], caseResults: structuredClone(cases) } };
}

/** Execute the relevant suite and update only this lesson, under the store's revision lock. */
export async function checkLesson(store, definition, suite, evaluator, options) {
  const lesson = bindRegression(definition, suite);
  const result = await runRegression(lesson, suite, evaluator, options);
  const saved = await store.transact(state => ({ state: evaluateLesson(addLesson(state, lesson), lesson.id, result.evaluation) }));
  return { ...result, revision: saved.state.revision, lessonState: saved.state.lessons[lesson.id].state };
}
