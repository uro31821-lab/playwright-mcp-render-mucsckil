import { constants } from 'node:fs';
import { mkdir, open, lstat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createState } from './engine.mjs';

const SCHEMA = 'jh.operational-learning.store.v1';
const MAX_BYTES = 25 * 1024 * 1024;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function checkState(state) {
  if (state?.schema !== 'jh.operational-learning.v1' ||
      !Number.isSafeInteger(state.revision) || state.revision < 0) fail('LEARNING_STATE_INVALID');
  for (const key of ['events', 'attempts', 'lessons', 'proposals']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) fail('LEARNING_STATE_INVALID');
  }
}

/** A separate owner-bound store. It never opens JH's action/security journal. */
export class FileLearningStore {
  #pending = Promise.resolve();
  constructor({ file, ownerScope }) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) fail('LEARNING_ABSOLUTE_PATH_REQUIRED');
    if (typeof ownerScope !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(ownerScope)) fail('LEARNING_OWNER_REQUIRED');
    this.file = path.resolve(file);
    this.ownerScope = ownerScope;
  }

  async read() {
    let handle;
    try {
      handle = await open(this.file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES) fail('LEARNING_STORE_INVALID');
      const record = JSON.parse(await handle.readFile('utf8'));
      if (record.schema !== SCHEMA || record.ownerScope !== this.ownerScope) fail('LEARNING_STORE_SCOPE_MISMATCH');
      checkState(record.state);
      return record.state;
    } catch (error) {
      if (error.code === 'ENOENT') return createState();
      if (error instanceof SyntaxError) fail('LEARNING_STORE_CORRUPT');
      throw error;
    } finally { await handle?.close(); }
  }

  /** Serialize writers; a busy or corrupt store is an error, never a reset. */
  transact(change, options = {}) {
    const work = this.#pending.then(() => this.#transact(change, options));
    this.#pending = work.catch(() => {});
    return work;
  }

  async #transact(change, { expectedRevision } = {}) {
    const directory = path.dirname(this.file);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lockPath = this.file + '.lock';
    let lock;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { lock = await open(lockPath, 'wx', 0o600); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (attempt === 19) fail('LEARNING_STORE_BUSY');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    let temporary;
    try {
      const current = await this.read();
      if (expectedRevision !== undefined && expectedRevision !== current.revision) fail('LEARNING_REVISION_CONFLICT');
      const result = await change(structuredClone(current));
      const next = result?.state ?? result;
      checkState(next);
      if (JSON.stringify(next) === JSON.stringify(current)) return result;
      if (next.revision <= current.revision) fail('LEARNING_REVISION_INVALID');
      const payload = JSON.stringify({ schema: SCHEMA, ownerScope: this.ownerScope, state: next }, null, 2) + '\n';
      if (Buffer.byteLength(payload) > MAX_BYTES) fail('LEARNING_STORE_CAPACITY');
      try { if ((await lstat(this.file)).isSymbolicLink()) fail('LEARNING_STORE_SYMLINK'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      temporary = path.join(directory, '.' + path.basename(this.file) + '.' + randomUUID() + '.tmp');
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(payload, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, this.file);
      temporary = undefined;
      let dir;
      try { dir = await open(directory, 'r'); await dir.sync(); }
      catch (error) { if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES'].includes(error.code)) throw error; }
      finally { await dir?.close(); }
      return result;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  }
}
