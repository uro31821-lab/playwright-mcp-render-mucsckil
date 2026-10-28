// Legacy pure helpers remain; the old independent native executor is retired.
import {youtubeUrl,createGeminiNativeTask} from './contract.mjs';
export {youtubeUrl};
export const MODES=Object.freeze(['VIDEO','YOUTUBE','ANDROID']);
export function createSession(request){return createGeminiNativeTask(request,request.commandId)}
export class GeminiSession {constructor(){throw Error('LEGACY_SESSION_REQUIRES_EXPLICIT_V4_MIGRATION_NO_REPLAY')}}
const fail=code=>{throw Error(code)};
/** Single-owner durable checkpoint. Never expose this file as a public download. */
export class FileCheckpoint {
  constructor(path) { this.path = path; this.owner = null; }
  async acquire() {
    const fs = await import('node:fs/promises');
    this.owner = await fs.open(`${this.path}.lock`, 'wx', 0o600);
  }
  async load() { const fs = await import('node:fs/promises'); return JSON.parse(await fs.readFile(this.path, 'utf8')); }
  async save(state) {
    if (!this.owner) fail('CHECKPOINT_LOCK_REQUIRED');
    const fs = await import('node:fs/promises');
    const temp = `${this.path}.tmp`;
    const file = await fs.open(temp, 'w', 0o600);
    try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
    await fs.rename(temp, this.path);
    const { dirname } = await import('node:path');
    const directory = await fs.open(dirname(this.path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async close() {
    if (!this.owner) return;
    await this.owner.close(); this.owner = null;
    const fs = await import('node:fs/promises'); await fs.unlink(`${this.path}.lock`);
  }
}
