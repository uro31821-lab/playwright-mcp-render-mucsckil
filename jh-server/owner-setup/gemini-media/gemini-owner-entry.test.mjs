import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {buildGeminiMediaOwnerEntrypoint, selectGeminiMediaRuntime56, main} from './gemini-owner-entry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV = {CI: 'true', NODE_ENV: 'test', JH_OWNER_DEFER_LISTEN: '1',
  JH_GEMINI_OPERATOR_ENABLE: 'EXPLICIT_GEMINI_MEDIA_OWNER_V1', JH_GEMINI_ANALYSIS_ENABLED: '1'};
const code = expected => error => error?.code === expected;

test('media startup cannot manufacture production identity, bypass explicit enablement or downgrade an existing parent', async () => {
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, {...ENV, JH_GEMINI_OPERATOR_ENABLE: ''}), code('GEMINI_OPERATOR_EXPLICIT_ENABLE_REQUIRED'));
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, {...ENV, JH_GEMINI_ANALYSIS_ENABLED: '0'}), code('GEMINI_FEATURE_ENABLE_REQUIRED'));
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, {...ENV, JH_GEMINI_ANALYSIS_ENABLED: 'yes'}), code('GEMINI_ENABLE_FLAG_INVALID'));
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, {...ENV, RENDER_SERVICE_ID: 'some-other-service'}), code('GEMINI_EXISTING_PRODUCTION_OWNER_REQUIRED'));
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, ENV, {baseMode: 'arbitrary-module'}), code('GEMINI_PARENT_MODE_INVALID'));
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, {...ENV, JH_EBISEO_AUDIO_ENABLE: 'EXPLICIT_EBISEO_AUDIO_V05'}, {baseMode: 'durable'}), code('GEMINI_AUDIO_PARENT_DOWNGRADE_FORBIDDEN'));
  await assert.rejects(buildGeminiMediaOwnerEntrypoint(ROOT, {...ENV, JH_KABISEO_CAMERA_ENABLE: 'EXPLICIT_KABISEO_CAMERA_V0256'}), code('GEMINI_EXISTING_AUDIO_PARENT_REQUIRED'));
  await assert.rejects(main({...ENV}), code('GEMINI_STARTUP_PROCESS_ENVIRONMENT_REQUIRED'));
  assert.throws(() => selectGeminiMediaRuntime56(ROOT, ENV), code('GEMINI_OWNER_BUILD_REQUIRED'));
});

test('all six generated files and the attestation remain bound to the complete verified parent', async t => {
  const built = await buildGeminiMediaOwnerEntrypoint(ROOT, ENV, {baseMode: 'durable'});
  assert.equal(built.productionEnabled, false); assert.equal(built.listenerStarted, false);
  const select = () => selectGeminiMediaRuntime56(ROOT, ENV, {baseMode: 'durable'});
  assert.equal(select().sha256, built.candidateSha256);
  for (const key of ['runtimeFile', 'ownerFile', 'unifiedFile', 'file', 'registeredBootstrapFile', 'provisionFile', 'stampFile']) {
    await t.test('reject altered ' + key, () => {
      const file = built[key], original = readFileSync(file);
      try {
        writeFileSync(file, Buffer.concat([original, Buffer.from('\n// changed synthetic generated artifact\n')]));
        assert.throws(select, /GEMINI_/);
      } finally {writeFileSync(file, original);}
      assert.equal(select().sha256, built.candidateSha256);
    });
  }
  const parent = readFileSync(built.parentFile);
  try {
    writeFileSync(built.parentFile, Buffer.concat([parent, Buffer.from('\n// changed synthetic parent\n')]));
    assert.throws(select, code('GEMINI_PARENT_ARTIFACT_CHANGED'));
  } finally {writeFileSync(built.parentFile, parent);}
  assert.equal(select().sha256, built.candidateSha256);
  assert.throws(() => selectGeminiMediaRuntime56(ROOT, {...ENV, JH_GEMINI_GENERATION_ENABLED: '1'}), code('GEMINI_OWNER_BUILD_REQUIRED'));
});
