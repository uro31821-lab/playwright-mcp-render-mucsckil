#!/usr/bin/env node
/** Local JSON state adapter. Research IO belongs to the host's injected adapters. */
import { constants } from 'node:fs';
import { open, lstat, realpath, link, rename, unlink, readFile } from 'node:fs/promises';
import { dirname, basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import './runtime.js';

const R = globalThis.JHProactiveResearch;
const MUTATORS = Object.freeze({
  observe: 'observe', decide: 'decideTopic', begin: 'beginRun',
  checkpoint: 'checkpointRun', complete: 'completeRun', ack: 'acknowledge',
});
const READERS = Object.freeze({ plan: 'plan', notices: 'notices' });
const COMMANDS = new Set(['init', 'validate', ...Object.keys(MUTATORS), ...Object.keys(READERS)]);

export const HELP = `JH Proactive Research — Node.js 24

node cli.mjs COMMAND --store /absolute/private/JH_Proactive_Research_v1.json --owner OWNER [--input request.json|-]

Commands: init, validate, observe, decide, plan, begin, checkpoint, complete, notices, ack
Input: one JSON object from --input or stdin; empty input means {}.
init requires {"now":"ISO timestamp"}; other fields follow the runtime API.
Mutations require expectedRevision. Exact event retries are idempotent.
State has no default path. The parent directory must already exist.
collect is a host SDK operation with real read-only search/fetch adapters.
`;

class CliError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new CliError(code, message); };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function objectInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('PROACTIVE_CLI_INPUT', 'Input must be one JSON object.');
  }
  return input;
}

async function canonicalStore(store) {
  if (typeof store !== 'string' || !isAbsolute(store)) {
    fail('PROACTIVE_STORE_PATH', '--store must be an explicit absolute file path.');
  }
  const normalized = resolve(store);
  try { return join(await realpath(dirname(normalized)), basename(normalized)); }
  catch (error) {
    if (error.code === 'ENOENT') fail('PROACTIVE_STORE_PARENT_MISSING', 'Create the private parent directory before running this command.');
    throw error;
  }
}

function regularPrivateFile(stat) {
  if (!stat.isFile() || stat.nlink !== 1) {
    fail('PROACTIVE_STORE_UNSAFE', 'The state must be a regular file with a single link.');
  }
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    fail('PROACTIVE_STORE_PERMISSIONS', 'The private state file must use owner-only permissions (0600).');
  }
}

async function readRaw(store) {
  let before;
  try { before = await lstat(store); }
  catch (error) {
    if (error.code === 'ENOENT') fail('PROACTIVE_STORE_MISSING', 'State is missing; only an explicit init command creates it.');
    throw error;
  }
  regularPrivateFile(before); // lstat also rejects a final symlink.
  const file = await open(store, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await file.stat();
    regularPrivateFile(opened);
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      fail('PROACTIVE_STORE_CHANGED', 'State changed while it was being opened; reload and retry.');
    }
    return await file.readFile('utf8');
  } finally { await file.close(); }
}

async function readState(store, owner) {
  const raw = await readRaw(store);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { fail('PROACTIVE_STORE_INVALID_JSON', 'Existing state is not valid JSON; it has been preserved.'); }
  const state = R.validateState(parsed);
  if (state.ownerScope !== owner) fail('PROACTIVE_OWNER_MISMATCH', 'State belongs to a different owner scope.');
  return { raw, state };
}

async function withLock(store, action) {
  const path = `${store}.lock`;
  let lock;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { lock = await open(path, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt === 49) fail('PROACTIVE_STORE_BUSY', 'State is locked. Retry after the writer finishes; abandoned locks require operator inspection.');
      await delay(20);
    }
  }
  const identity = await lock.stat();
  try { return await action(); }
  finally {
    await lock.close();
    // Never remove a lock that another process has replaced.
    try {
      const current = await lstat(path);
      if (current.dev === identity.dev && current.ino === identity.ino) await unlink(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function persist(store, state, previousRaw) {
  const temp = join(dirname(store), `.${basename(store)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (previousRaw === undefined) {
      // Atomic create without replacing any file that appeared concurrently.
      try { await link(temp, store); }
      catch (error) {
        if (error.code === 'EEXIST') fail('PROACTIVE_STORE_EXISTS', 'init never replaces an existing state file.');
        throw error;
      }
    } else {
      if (await readRaw(store) !== previousRaw) {
        fail('PROACTIVE_STORE_CHANGED', 'State changed outside this writer; reload and retry.');
      }
      await rename(temp, store);
    }
  } finally {
    if (handle) await handle.close();
    try { await unlink(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

/** All private state stays in the explicit store; output contains only the command result. */
export async function executeCommand(command, { store, owner, input = {} } = {}) {
  if (!COMMANDS.has(command)) fail('PROACTIVE_CLI_COMMAND', 'Unknown command. Use --help for supported commands.');
  if (typeof owner !== 'string' || !owner.trim()) fail('PROACTIVE_CLI_OWNER', '--owner is required.');
  objectInput(input);
  const path = await canonicalStore(store);
  if (command === 'init') {
    if (Object.keys(input).some(key => key !== 'now')) fail('PROACTIVE_CLI_INPUT', 'init accepts only now; owner comes from --owner.');
    return withLock(path, async () => {
      try {
        await lstat(path);
        fail('PROACTIVE_STORE_EXISTS', 'init never replaces an existing state file.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const state = R.createState({ ownerScope: owner, now: input.now });
      await persist(path, state);
      return { ok: true, command, revision: state.revision, result: { schema: state.schema, initialized: true } };
    });
  }
  if (command === 'validate' || own(READERS, command)) {
    const { state } = await readState(path, owner);
    if (command === 'validate' && Object.keys(input).length) fail('PROACTIVE_CLI_INPUT', 'validate accepts an empty input object.');
    const result = command === 'validate'
      ? { valid: true, schema: state.schema }
      : R[READERS[command]](state, input);
    return { ok: true, command, revision: state.revision, result };
  }
  return withLock(path, async () => {
    const { raw, state } = await readState(path, owner);
    // Runtime checks replay identities before CAS. A stale exact retry is safe.
    const transition = R[MUTATORS[command]](state, input);
    const next = R.validateState(transition.state);
    if (next.ownerScope !== owner) fail('PROACTIVE_OWNER_MISMATCH', 'A transition cannot change the owner scope.');
    const changed = R.fingerprint(next) !== R.fingerprint(state);
    if (changed) {
      if (next.revision !== state.revision + 1) fail('PROACTIVE_TRANSITION_INVALID', 'A changed state must advance exactly one revision.');
      await persist(path, next, raw);
    }
    return { ok: true, command, revision: next.revision, result: transition.result };
  });
}

export function parseArguments(argv) {
  if (argv.length === 0 || argv.includes('--help')) return { help: true };
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!['--store', '--owner', '--input'].includes(flag) || rest[index + 1] === undefined || own(values, flag)) {
      fail('PROACTIVE_CLI_ARGUMENT', 'Use each of --store, --owner, and --input at most once, with a value.');
    }
    values[flag] = rest[index + 1];
  }
  return { command, store: values['--store'], owner: values['--owner'], inputFile: values['--input'] };
}

async function readInput(inputFile, stdin) {
  let text;
  if (inputFile && inputFile !== '-') text = await readFile(inputFile, 'utf8');
  else if (stdin.isTTY && inputFile !== '-') text = '';
  else {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (!text.trim()) return {};
  try { return objectInput(JSON.parse(text)); }
  catch { fail('PROACTIVE_CLI_INPUT', 'Input must be one valid JSON object.'); }
}

export async function runCli(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = parseArguments(argv);
    if (options.help) { stdout.write(HELP); return 0; }
    const input = await readInput(options.inputFile, stdin);
    const response = await executeCommand(options.command, { ...options, input });
    stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = /^PROACTIVE_[A-Z0-9_]+$/.test(error?.code) ? error.code : 'PROACTIVE_CLI_IO';
    const message = error instanceof CliError ? error.message : 'The operation was rejected. Inspect the error code and validated input before retrying.';
    stderr.write(`${JSON.stringify({ ok: false, code, message })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
