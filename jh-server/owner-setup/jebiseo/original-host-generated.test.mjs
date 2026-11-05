/** Exercise the opt-in overlay against the ACTUAL final generated host.
 * This builds source and checks syntax only; no server is started and no phone
 * or external browser is used. The original handler execution cases live in
 * original-host-composition.test.mjs and original-host-binding.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildStage25PendingOperatorEntrypoint56} from '../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs';
import {patchJebiseoOriginalHostComposition, reverseJebiseoOriginalHostComposition}
  from './original-host-composition.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const env = {CI: 'true', NODE_ENV: 'test', JH_OWNER_DEFER_LISTEN: '1',
  JH_MOBILE_WEB_13_MODE: 'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK: 'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
  JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS: 'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
  JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS: 'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
  JH_STAGE44_DEVICE_FOCUS: 'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
  JH_MOBILE13_COMMAND_DIAGNOSTICS: 'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'};

test('original final generated host accepts a reversible opt-in observation seam with the same catalog and completion path', async () => {
  const saved = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  for (const key of ['RENDER_SERVICE_ID', 'JH_DURABLE_RELEASE',
    'JH_PENDING_APPROVAL_OPERATOR_ENABLE', 'JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE']) {
    saved.set(key, process.env[key]); delete process.env[key];
  }
  Object.assign(process.env, env);
  const syntaxFile = path.join(root, 'server-integration', `jebiseo-syntax-${randomUUID()}.mjs`);
  try {
    const built = await buildStage25PendingOperatorEntrypoint56(root, env);
    assert.equal(built.originalOperatorPreserved, true);
    assert.equal(built.listenerStarted, false);
    assert.equal(built.productionEnabled, false);
    assert.equal(built.stamp.signedCompletionAckStage26, true);
    assert.equal(built.stamp.stage44DeviceFocus, true);
    assert.equal(built.stamp.stage61ApprovalRouting, true);
    const original = readFileSync(built.runtimeFile, 'utf8');
    assert.equal(sha(original), built.stamp.runtimeSha256);
    const candidate = patchJebiseoOriginalHostComposition(original);
    assert.equal(reverseJebiseoOriginalHostComposition(candidate), original);
    const catalog = source => [...source.matchAll(/registerOAuthTool\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
    assert.deepEqual(catalog(candidate), catalog(original));
    for (const marker of ['durableNativeHooks56?.beforeDispatch(',
      'durableNativeHooks56?.acceptedCompletion(j,body.result)',
      'j.stage26CompletionDigest56=stage26RawDigest56;',
      'const authorized=mcpCallerAuthorized56(req);']) {
      assert.equal(candidate.split(marker).length, original.split(marker).length, marker);
    }
    assert.ok(candidate.includes('jhJebiseoRegistry56.capture(name,z.object(scoped.config.inputSchema)'));
    assert.ok(candidate.includes('jhJebiseoOriginalHost56.withAuthenticatedRequest(server,authorized,parsedBody,req,res,'));
    assert.throws(() => patchJebiseoOriginalHostComposition(candidate), /ALREADY_PRESENT/);
    writeFileSync(syntaxFile, candidate, {encoding: 'utf8', flag: 'wx', mode: 0o600});
    const checked = spawnSync(process.execPath, ['--check', syntaxFile], {encoding: 'utf8', timeout: 20000});
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(readFileSync(built.runtimeFile, 'utf8'), original,
      'the candidate must never replace the selected original runtime');
    assert.equal(sha(readFileSync(built.runtimeFile)), built.stamp.runtimeSha256);
  } finally {
    try {unlinkSync(syntaxFile);} catch (error) {if (error.code !== 'ENOENT') throw error;}
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
