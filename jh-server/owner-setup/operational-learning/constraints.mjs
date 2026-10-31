import { isDeepStrictEqual } from 'node:util';

/** A small pure evaluator for recorded outputs. No eval, regex, filesystem, or network. */
export function evaluateConstraints(input) {
  if (!input || typeof input !== 'object' || !Object.hasOwn(input, 'value') ||
      !Array.isArray(input.constraints) || !input.constraints.length || input.constraints.length > 100) {
    throw new TypeError('A value and nonempty constraints are required');
  }
  const failed = [];
  for (let index = 0; index < input.constraints.length; index++) {
    const rule = input.constraints[index];
    if (!rule || !Array.isArray(rule.path) || rule.path.length > 32 || rule.path.some(key =>
      (typeof key !== 'string' && !Number.isSafeInteger(key)) || ['__proto__', 'constructor', 'prototype'].includes(key))) {
      throw new TypeError('Constraint paths must be explicit safe property arrays');
    }
    let found = true;
    let value = input.value;
    for (const key of rule.path) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) { found = false; break; }
      value = value[key];
    }
    let passed;
    if (rule.op === 'exists') passed = found;
    else {
      if (!Object.hasOwn(rule, 'expected')) throw new TypeError('Constraint expected value required');
      switch (rule.op) {
        case 'equals': passed = found && isDeepStrictEqual(value, rule.expected); break;
        case 'includes': case 'excludes': {
          if (typeof rule.expected !== 'string') throw new TypeError('Text expected value required');
          const contains = found && typeof value === 'string' && value.includes(rule.expected);
          passed = found && typeof value === 'string' && (rule.op === 'includes' ? contains : !contains);
          break;
        }
        case 'between': {
          if (!rule.expected || !Number.isFinite(rule.expected.min) || !Number.isFinite(rule.expected.max) || rule.expected.min > rule.expected.max) throw new TypeError('Finite inclusive bounds required');
          passed = found && typeof value === 'number' && Number.isFinite(value) && value >= rule.expected.min && value <= rule.expected.max;
          break;
        }
        default: throw new TypeError('Unsupported constraint operation');
      }
    }
    if (!passed) failed.push(index);
  }
  return { passed: failed.length === 0, failed };
}
