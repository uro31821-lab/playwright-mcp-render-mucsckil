import { createHash, timingSafeEqual } from 'node:crypto';

const DEFAULT_VOLATILE_KEYS = new Set([
  'requestId',
  'request_id',
  'traceId',
  'trace_id',
  'spanId',
  'span_id',
  'timestamp',
  'sentAt',
  'receivedAt',
  'nonce',
  'attempt',
  'retryCount'
]);

function normalizeValue(value, seen, options, path = []) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { $number: String(value) };
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === 'bigint') {
    return { $bigint: value.toString(10) };
  }

  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Unsupported value at ${path.join('.') || '<root>'}: ${typeof value}`);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`Invalid Date at ${path.join('.') || '<root>'}`);
    }
    return { $date: value.toISOString() };
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { $bytes: Buffer.from(value).toString('base64') };
  }

  if (seen.has(value)) {
    throw new TypeError(`Circular structure at ${path.join('.') || '<root>'}`);
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const normalized = normalizeValue(item, seen, options, [...path, String(index)]);
        return normalized === undefined ? null : normalized;
      });
    }

    if (value instanceof Set) {
      const normalized = [...value].map((item, index) =>
        normalizeValue(item, seen, options, [...path, `set:${index}`])
      );
      return { $set: normalized.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))) };
    }

    if (value instanceof Map) {
      const normalized = [...value.entries()].map(([key, item], index) => [
        normalizeValue(key, seen, options, [...path, `map-key:${index}`]),
        normalizeValue(item, seen, options, [...path, `map-value:${index}`])
      ]);
      normalized.sort((a, b) => stableStringify(a[0]).localeCompare(stableStringify(b[0])));
      return { $map: normalized };
    }

    const out = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const isVolatile = options.ignoreVolatileKeys && DEFAULT_VOLATILE_KEYS.has(key);
      const isIgnoredPath = options.ignoredPaths.has([...path, key].join('.'));
      if (isVolatile || isIgnoredPath) {
        continue;
      }
      const normalized = normalizeValue(value[key], seen, options, [...path, key]);
      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function stableNormalize(value, options = {}) {
  return normalizeValue(value, new WeakSet(), {
    ignoreVolatileKeys: options.ignoreVolatileKeys !== false,
    ignoredPaths: new Set(options.ignoredPaths ?? [])
  });
}

export function stableStringify(value, options = {}) {
  return JSON.stringify(stableNormalize(value, options));
}

export function sha256Hex(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

export function digestObject(value, options = {}) {
  return sha256Hex(stableStringify(value, options));
}

export function buildCommandIdentity({
  scope = 'global',
  intentId,
  command,
  dedupePayload,
  ignoredPaths = []
}) {
  if (!command || typeof command !== 'object') {
    throw new TypeError('command must be an object');
  }

  const normalized = stableNormalize(dedupePayload ?? command, {
    ignoreVolatileKeys: true,
    ignoredPaths
  });
  const commandDigest = sha256Hex(JSON.stringify(normalized));
  const intentComponent = intentId ? `intent:${String(intentId)}` : `digest:${commandDigest}`;
  const dedupeKey = sha256Hex(`${String(scope)}\n${intentComponent}`);

  return {
    scope: String(scope),
    intentId: intentId == null ? null : String(intentId),
    normalizedCommand: normalized,
    commandDigest,
    dedupeKey
  };
}

export function secureDigestEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getPath(object, path) {
  if (!path) return object;
  const parts = Array.isArray(path) ? path : String(path).split('.').filter(Boolean);
  let current = object;
  for (const part of parts) {
    if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function redactForPersistence(value, {
  maxStringLength = 512,
  secretKeys = /password|secret|token|authorization|cookie|card(number)?|cvv|cvc|pin|resident|ssn|otp|one.?time.?code|credential|private.?key|비밀번호|인증번호|주민번호/i
} = {}) {
  const seen = new WeakSet();

  function visit(item, key = '') {
    if (secretKeys.test(key) || /^(screenshot|screenImage|imageBytes|rawText|rawContent|rawHtml|html|clipboard|enteredText|temporaryInput)$/i.test(key)) return '[REDACTED]';
    if (item == null || typeof item === 'boolean' || typeof item === 'number') return item;
    if (typeof item === 'string') {
      return item.length > maxStringLength ? `${item.slice(0, maxStringLength)}…[TRUNCATED]` : item;
    }
    if (typeof item === 'bigint') return item.toString(10);
    if (Buffer.isBuffer(item) || item instanceof Uint8Array) {
      return `[BYTES:${item.byteLength}]`;
    }
    if (typeof item !== 'object') return String(item);
    if (seen.has(item)) return '[CIRCULAR]';
    seen.add(item);
    try {
      if (Array.isArray(item)) return item.map((entry) => visit(entry));
      const out = {};
      for (const [childKey, childValue] of Object.entries(item)) {
        out[childKey] = visit(childValue, childKey);
      }
      return out;
    } finally {
      seen.delete(item);
    }
  }

  return visit(value);
}
