import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const ACTIVE_STATES = new Set([
  'RECEIVED',
  'PREPARING',
  'DISPATCHING',
  'INVOCATION_ACCEPTED',
  'VERIFYING'
]);

const POST_DISPATCH_STATES = new Set([
  'DISPATCHING',
  'INVOCATION_ACCEPTED',
  'VERIFYING'
]);

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function initialDocument() {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    records: {}
  };
}

function validateDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new Error('execution store document is not an object');
  }
  if (document.schemaVersion !== 1) {
    throw new Error(`unsupported execution store schemaVersion: ${document.schemaVersion}`);
  }
  if (!document.records || typeof document.records !== 'object' || Array.isArray(document.records)) {
    throw new Error('execution store records must be an object');
  }
  return document;
}

export class FileDurableExecutionStore {
  constructor({
    directory,
    filename = 'jh-result-execution-guard-v1.json',
    lockTimeoutMs = 10_000,
    staleLockMs = 30_000,
    leaseMs = 60_000,
    historyLimit = 80,
    clock = () => Date.now(),
    instanceId = `jh-${process.pid}-${randomUUID()}`
  } = {}) {
    if (!directory) {
      throw new TypeError('directory is required');
    }
    this.directory = resolve(directory);
    this.filePath = join(this.directory, filename);
    this.lockPath = `${this.filePath}.lock`;
    this.lockTimeoutMs = lockTimeoutMs;
    this.staleLockMs = staleLockMs;
    this.leaseMs = leaseMs;
    this.historyLimit = historyLimit;
    this.clock = clock;
    this.instanceId = instanceId;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await mkdir(this.directory, { recursive: true });
    try {
      await stat(this.filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const document = initialDocument();
      document.updatedAt = nowIso(this.clock());
      await this.#atomicWrite(document);
    }
    await this.#readUnsafe();
    this.initialized = true;
  }

  async get(dedupeKey) {
    await this.init();
    const document = await this.#readUnsafe();
    return cloneJson(document.records[dedupeKey] ?? null);
  }

  async list({ states, limit = 1000 } = {}) {
    await this.init();
    const stateSet = states ? new Set(states) : null;
    const document = await this.#readUnsafe();
    return Object.values(document.records)
      .filter((record) => !stateSet || stateSet.has(record.state))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit)
      .map(cloneJson);
  }

  async claim(identity, seedRecord) {
    return this.transaction((document, nowMs) => {
      const existing = document.records[identity.dedupeKey];
      if (existing) {
        return { created: false, record: cloneJson(existing) };
      }

      const timestamp = nowIso(nowMs);
      const record = {
        schemaVersion: 1,
        dedupeKey: identity.dedupeKey,
        scope: identity.scope,
        intentId: identity.intentId,
        commandDigest: identity.commandDigest,
        state: 'RECEIVED',
        replayAllowed: false,
        ownerInstanceId: this.instanceId,
        leaseExpiresAt: nowIso(nowMs + this.leaseMs),
        revision: 1,
        attemptCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        dispatchStartedAt: null,
        invocationAcceptedAt: null,
        verifiedAt: null,
        effectConfirmedAt: null,
        finalResult: null,
        invocationReceipt: null,
        effectReference: null,
        verification: null,
        error: null,
        metadata: {},
        history: [
          {
            at: timestamp,
            from: null,
            to: 'RECEIVED',
            reason: 'command_claimed',
            instanceId: this.instanceId
          }
        ],
        ...cloneJson(seedRecord)
      };
      document.records[identity.dedupeKey] = record;
      return { created: true, record: cloneJson(record) };
    });
  }

  async update(dedupeKey, updater, { expectedRevision } = {}) {
    return this.transaction((document, nowMs) => {
      const current = document.records[dedupeKey];
      if (!current) throw new Error(`execution record not found: ${dedupeKey}`);
      if (expectedRevision != null && current.revision !== expectedRevision) {
        const error = new Error(
          `execution revision conflict: expected ${expectedRevision}, actual ${current.revision}`
        );
        error.code = 'JH_EXECUTION_REVISION_CONFLICT';
        throw error;
      }

      const draft = cloneJson(current);
      const next = updater(draft, nowMs) ?? draft;
      if (!next || typeof next !== 'object') {
        throw new TypeError('execution record updater must return an object');
      }
      next.revision = current.revision + 1;
      next.updatedAt = nowIso(nowMs);
      document.records[dedupeKey] = next;
      return cloneJson(next);
    });
  }

  async transition(dedupeKey, toState, {
    reason,
    patch = {},
    expectedRevision,
    ownerInstanceId = this.instanceId,
    lease = true
  } = {}) {
    return this.update(
      dedupeKey,
      (record, nowMs) => {
        const fromState = record.state;
        record.state = toState;
        record.ownerInstanceId = ownerInstanceId;
        record.leaseExpiresAt = lease ? nowIso(nowMs + this.leaseMs) : null;
        Object.assign(record, cloneJson(patch));
        record.history ??= [];
        record.history.push({
          at: nowIso(nowMs),
          from: fromState,
          to: toState,
          reason: reason ?? null,
          instanceId: ownerInstanceId
        });
        if (record.history.length > this.historyLimit) {
          record.history = record.history.slice(-this.historyLimit);
        }
        return record;
      },
      { expectedRevision }
    );
  }

  async recoverInterrupted({ force = false } = {}) {
    return this.transaction((document, nowMs) => {
      const recovered = [];
      for (const record of Object.values(document.records)) {
        if (!ACTIVE_STATES.has(record.state)) continue;
        if (record.ownerInstanceId === this.instanceId) continue;

        const leaseExpiry = record.leaseExpiresAt ? Date.parse(record.leaseExpiresAt) : 0;
        if (!force && Number.isFinite(leaseExpiry) && leaseExpiry > nowMs) continue;

        const fromState = record.state;
        const afterDispatch = POST_DISPATCH_STATES.has(fromState) || Boolean(record.dispatchStartedAt);
        const safeToReclaim = !afterDispatch && ['NONE','UI_STATE'].includes(record.effectKind);
        record.state = afterDispatch ? 'NEEDS_REVIEW' : safeToReclaim ? 'RETRYABLE_PRE_DISPATCH' : 'FAILED_PRE_DISPATCH';
        record.replayAllowed = safeToReclaim;
        record.recoveryReason = afterDispatch
          ? 'server_restart_after_dispatch_no_automatic_replay'
          : safeToReclaim ? 'server_restart_before_dispatch_safe_to_reclaim'
          : 'server_restart_external_effect_replay_forbidden';
        record.ownerInstanceId = this.instanceId;
        record.leaseExpiresAt = null;
        record.revision += 1;
        record.updatedAt = nowIso(nowMs);
        record.history ??= [];
        record.history.push({
          at: nowIso(nowMs),
          from: fromState,
          to: record.state,
          reason: record.recoveryReason,
          instanceId: this.instanceId
        });
        if (record.history.length > this.historyLimit) {
          record.history = record.history.slice(-this.historyLimit);
        }
        recovered.push({
          dedupeKey: record.dedupeKey,
          fromState,
          toState: record.state,
          replayAllowed: record.replayAllowed
        });
      }
      return recovered;
    });
  }

  async delete(dedupeKey) {
    return this.transaction((document) => {
      const existed = Boolean(document.records[dedupeKey]);
      delete document.records[dedupeKey];
      return existed;
    });
  }

  async transaction(mutator) {
    await this.init();
    const lockHandle = await this.#acquireLock();
    try {
      const document = await this.#readUnsafe();
      const nowMs = this.clock();
      const result = await mutator(document, nowMs);
      document.updatedAt = nowIso(nowMs);
      await this.#atomicWrite(document);
      return result;
    } finally {
      await lockHandle.close().catch(() => {});
      await unlink(this.lockPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  }

  async #readUnsafe() {
    let text;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const document = initialDocument();
      document.updatedAt = nowIso(this.clock());
      await this.#atomicWrite(document);
      return document;
    }

    try {
      return validateDocument(JSON.parse(text));
    } catch (error) {
      const wrapped = new Error(`execution store is corrupt: ${this.filePath}: ${error.message}`);
      wrapped.code = 'JH_EXECUTION_STORE_CORRUPT';
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async #atomicWrite(document) {
    validateDocument(document);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    const payload = `${JSON.stringify(document, null, 2)}\n`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.filePath);

    // Best-effort directory sync makes rename durable on common Linux filesystems.
    try {
      const directoryHandle = await open(dirname(this.filePath), 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch {
      // Some platforms do not allow directory fsync. Atomic rename still protects structure.
    }
  }

  async #acquireLock() {
    const startedAt = this.clock();
    let delayMs = 10;

    for (;;) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        await handle.writeFile(
          JSON.stringify({ instanceId: this.instanceId, pid: process.pid, at: nowIso(this.clock()) }),
          'utf8'
        );
        return handle;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;

        let stale = false;
        try {
          const lockStat = await stat(this.lockPath);
          stale = this.clock() - lockStat.mtimeMs > this.staleLockMs;
        } catch (statError) {
          if (statError?.code === 'ENOENT') continue;
          throw statError;
        }

        if (stale) {
          await unlink(this.lockPath).catch((unlinkError) => {
            if (unlinkError?.code !== 'ENOENT') throw unlinkError;
          });
          continue;
        }

        if (this.clock() - startedAt >= this.lockTimeoutMs) {
          const timeoutError = new Error(`execution store lock timeout: ${this.lockPath}`);
          timeoutError.code = 'JH_EXECUTION_STORE_LOCK_TIMEOUT';
          throw timeoutError;
        }

        await sleep(delayMs);
        delayMs = Math.min(250, Math.ceil(delayMs * 1.6));
      }
    }
  }
}
