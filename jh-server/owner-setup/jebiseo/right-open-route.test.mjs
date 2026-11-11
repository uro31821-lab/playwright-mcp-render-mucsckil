/** Actual generated handlers with inert Android jobs. The original completion
 * reader runs unchanged; these tests do not authenticate or operate a phone. */
import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {awaitOpenCompletion, OPEN_COMPLETION_WAIT_MS, OPEN_STATUS_WAIT_MS}
  from '../deployment/jh167-open-completion.mjs';
import {patchJebiseoRightOpenRoute, JEBISEO_RIGHT_OPEN_URL} from './right-open-route.mjs';
import {JEBISEO_GEMINI_WEB_URL} from './mobile-port.mjs';

let original, candidate;
before(async () => {
  const entry = buildCleanRestartRelease56();
  const builder = await import(pathToFileURL(entry.file).href);
  const built = builder.buildDurableRoutedRuntime(path.resolve('jh-server/owner-setup'));
  original = readFileSync(built.file, 'utf8');
  assert.ok(original.includes('MOBILE_SUBMIT_SEPARATE_ACTION_REQUIRED'),
    'Run this fixture with the existing synthetic PHONE_RIGHT selector');
  candidate = patchJebiseoRightOpenRoute(original);
});

const reg = name => `  registerOAuthTool("${name}",{`;
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Generated registration boundaries must remain exact');
  return source.slice(a, b);
}
function fixture(source = candidate, {outcome = 'complete', queueError = null} = {}) {
  const tools = new Map(), jobs = new Map(), created = [], waits = [];
  const commandId = '1'.repeat(32), sessionId = 'synthetic-open-session';
  const textResult = value => ({content: [{type: 'text', text: JSON.stringify(value)}]});
  const z = new Proxy(() => z, {get: () => z, apply: () => z});
  const chunks = [
    section(source, '  async function jhOpenCompletion56(', reg('life_naver_mail')),
    section(source, reg('life_web_navigate'), reg('life_web_snapshot')),
    section(source, reg('life_android_open'), '  const cuSchema56={'),
    section(source, reg('life_job_status'), '  return server;')
  ];
  for (const chunk of chunks) assert.ok(!chunk.includes('browserTool('));
  vm.runInNewContext(chunks.join('\n'), {
    z, URL, textResult, jobs, cleanupJobs: () => {},
    jhOpenWait56: OPEN_COMPLETION_WAIT_MS, jhOpenStatusWait56: OPEN_STATUS_WAIT_MS,
    jhAwaitOpenCompletion56: awaitOpenCompletion,
    jhRequireCommand56: () => commandId,
    active56: () => ({sessionId}),
    chooseDevice: () => 'synthetic-phone',
    devices: new Map([['synthetic-phone', {secureBridgeVersion: 56, secureActive: true, lastSeen: Date.now()}]]),
    jhNativeReturnTarget56: () => null,
    jhMobileWebReject56: code => textResult({ok: false, code}),
    registerOAuthTool: (name, schema, handler) => tools.set(name, handler),
    jobResult: job => textResult({ok: true, jobId: job?.id, status: job?.status}),
    mk: (type, payload) => {
      assert.equal(type, 'open_url', 'No new command or other job type may be created');
      const job = {id: `job_${104 + created.length}`, type, ...payload,
        status: queueError ? 'rejected' : 'queued', targetDeviceId: 'synthetic-phone',
        commandId, secureSessionId: sessionId, startedAtMs: Date.now(),
        ...(queueError ? {error: queueError} : {})};
      created.push(job); jobs.set(job.id, job); return job;
    },
    waitJob: async (job, budgetMs) => {
      waits.push({jobId: job.id, commandId: job.commandId, budgetMs});
      if (outcome === 'pending') return job;
      const now = Date.now();
      const received = {...job, status: outcome === 'complete' ? 'complete' : 'error',
        completedAt: new Date(now).toISOString(), result: {
          ok: true, url: job.url, rightAddressConfirmed: true, pageContentVerified: false,
          splitScreenRequired: true, splitScreen: {
            kind: 'split_screen_evidence', version: '1', verified: 'true', layout: 'LEFT_RIGHT',
            chatPackage: 'com.openai.chatgpt', chatKind: 'NATIVE', chatWindowId: '10', chatBounds: '0,0,500,1000',
            workPackage: 'com.android.chrome', workWindowId: '11', workBounds: '500,0,1000,1000',
            observedAtMs: String(now)
          }
        }};
      jobs.set(job.id, received); return received;
    }
  }, {timeout: 3000, filename: 'Jebiseo-existing-generated-open-handlers.mjs'});
  return {created, waits, commandId, setOutcome: value => {outcome = value;},
    call: async (name, args) => JSON.parse((await tools.get(name)(args)).content[0].text)};
}

test('explicit candidate adds only the bounded name entry and rejects drift or reapplication', () => {
  const entry = '      [["제미나이","제미니","gemini","제비서"],"https://gemini.google.com/app"],\n';
  assert.equal(candidate.replace(entry, ''), original);
  assert.throws(() => patchJebiseoRightOpenRoute(candidate), /ALREADY_PRESENT/);
  assert.throws(() => patchJebiseoRightOpenRoute(original.replace(
    'target:"right_web_link",url}', 'target:"chrome",url}')), /ORIGINAL_ROUTE_REQUIRED/);
  assert.throws(() => patchJebiseoRightOpenRoute(original.replace(
    reg('life_naver_mail'), reg('different_mail'))), /SCOPE_CHANGED/);
});

test('existing fixed-URL Mobile13 OPEN works without the optional name overlay', async () => {
  assert.equal(JEBISEO_RIGHT_OPEN_URL, JEBISEO_GEMINI_WEB_URL);
  const f = fixture(original);
  assert.equal((await f.call('life_open_service', {service: 'Gemini'})).code, 'RIGHT_WEB_URL_NOT_MAPPED');
  assert.equal(f.created.length, 0);
  const result = await f.call('life_web_navigate', {url: JEBISEO_GEMINI_WEB_URL});
  assert.equal(result.code, 'RIGHT_ADDRESS_CONFIRMED');
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].target, 'right_web_link');
  assert.equal(f.created[0].url, JEBISEO_GEMINI_WEB_URL);
});

test('candidate aliases share one original RIGHT job through service and Android-compatible handlers', async () => {
  for (const alias of ['제미나이', '제미니', ' GeMiNi ', '제비서']) {
    for (const name of ['life_open_service', 'life_android_open']) {
      const f = fixture();
      const result = await f.call(name, name === 'life_open_service' ? {service: alias} : {target: alias});
      assert.equal(f.created.length, 1); assert.equal(f.waits.length, 1);
      assert.equal(f.created[0].target, 'right_web_link');
      assert.equal(f.created[0].url, JEBISEO_RIGHT_OPEN_URL);
      assert.equal(f.created[0].commandId, f.commandId);
      assert.equal(result.code, 'RIGHT_ADDRESS_CONFIRMED');
      assert.equal(result.pageContentVerified, false);
    }
  }
});

test('pending OPEN continues only by reading the same original job and command', async () => {
  const f = fixture(candidate, {outcome: 'pending'});
  const pending = await f.call('life_open_service', {service: '제미나이'});
  assert.equal(pending.code, 'OPEN_COMPLETION_PENDING');
  assert.equal(pending.actionSucceeded, null); assert.equal(pending.rightAddressConfirmed, false);
  assert.equal(pending.automaticReplayAllowed, false);
  assert.deepEqual(pending.followUp.arguments, {job_id: 'job_104', command_id: f.commandId});
  assert.equal(pending.followUp.tool, 'life_job_status'); assert.equal(pending.followUp.readOnly, true);
  f.setOutcome('complete');
  const completed = await f.call(pending.followUp.tool, pending.followUp.arguments);
  assert.equal(completed.code, 'RIGHT_ADDRESS_CONFIRMED');
  assert.equal(f.created.length, 1);
  assert.deepEqual(f.waits, [
    {jobId: 'job_104', commandId: f.commandId, budgetMs: OPEN_COMPLETION_WAIT_MS},
    {jobId: 'job_104', commandId: f.commandId, budgetMs: OPEN_STATUS_WAIT_MS}
  ]);
});

test('unmapped names, rejected queue and unknown receipt never turn into fallback or success', async () => {
  const manual = fixture();
  for (const service of ['Google', '구글', '알 수 없는 서비스']) {
    const result = await manual.call('life_open_service', {service});
    assert.equal(result.code, 'RIGHT_WEB_URL_NOT_MAPPED'); assert.equal(result.opened, false);
    assert.equal(result.automaticAppFallback, false); assert.equal(result.automaticPlaywrightFallback, false);
  }
  assert.equal(manual.created.length, 0);
  const blocked = fixture(candidate, {queueError: 'SYNTHETIC_ORIGINAL_COMMAND_BLOCKED'});
  const denied = await blocked.call('life_android_open', {target: 'Gemini'});
  assert.equal(denied.code, 'SYNTHETIC_ORIGINAL_COMMAND_BLOCKED'); assert.equal(denied.queued, false);
  assert.equal(blocked.created.length, 1); assert.equal(blocked.waits.length, 0);
  const unknown = fixture(candidate, {outcome: 'unknown'});
  const result = await unknown.call('life_open_service', {service: 'Gemini'});
  assert.equal(result.executionStatus, 'EFFECT_UNKNOWN'); assert.equal(result.actionSucceeded, null);
  assert.equal(result.automaticReplayAllowed, false); assert.equal(unknown.created.length, 1);
});
