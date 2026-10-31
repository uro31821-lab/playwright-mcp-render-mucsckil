import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildOwnerBoundDurableCandidate } from '../deployment/durable-owner-startup-candidate.mjs';
import { applyOwnerLearningPatch, reverseOwnerLearningPatch } from './owner-patch.mjs';

test('generated owner learning patch restores exact pinned parent and preserves cleanup', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'jh-learning-owner-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'deployment'));
  const sourceFile = path.resolve(import.meta.dirname, '../deployment/owner-service-entry.mjs');
  const baseline = readFileSync(sourceFile);
  copyFileSync(sourceFile, path.join(root, 'deployment/owner-service-entry.mjs'));
  const built = buildOwnerBoundDurableCandidate(root);
  const source = readFileSync(built.file, 'utf8');
  const patched = applyOwnerLearningPatch(source);
  assert.equal(reverseOwnerLearningPatch(patched), source);
  assert.deepEqual(readFileSync(sourceFile), baseline);
  assert.ok(patched.indexOf("fail('OWNER_HOST_START_CONTRACT_INVALID')") <
    patched.indexOf('learningHost=await installOwnerLearning(runtime,{config})'));
  assert.ok(patched.indexOf('learningHost=await installOwnerLearning(runtime,{config})') <
    patched.indexOf('runtime.httpServer.listen(port,bindAddress)'));
  assert.equal(patched.split('await learningHost?.close()').length, 3);
  assert.throws(() => applyOwnerLearningPatch(patched), /LEARNING_OWNER_PATCH_SOURCE/);
  assert.throws(() => applyOwnerLearningPatch(source.replace('durableHost,closed', 'changed,closed')), /LEARNING_OWNER_PATCH_ANCHOR/);
});
