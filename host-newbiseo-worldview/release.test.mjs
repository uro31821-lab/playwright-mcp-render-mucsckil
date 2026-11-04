import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('./', import.meta.url);
const overlay = new URL('plugin-overlay/', root);
const readJson = async path => JSON.parse(await readFile(new URL(path, overlay), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const EXPECTED = Object.freeze({
  'worldview.mjs': '1b17598e43f09923b6ea84e8520449a657e77ea4c6adbe690268ef9efd2d0036',
  'deep-worldview.mjs': 'd63ded87aeb74e4190c50ddf8ece7ad93e215584ae82eee73f97548f5ba56475',
});

test('plugin overlay preserves JH identity and publishes Newbiseo deep discovery', async () => {
  const [v1, v2] = await Promise.all([readJson('plugin.json'), readJson('.codex-plugin/plugin.json')]);
  for (const manifest of [v1, v2]) {
    assert.equal(manifest.name, 'jh-secure-live');
    assert.equal(manifest.version, '1.28.0');
    assert.equal(manifest.skills, './skills');
    for (const keyword of ['newbiseo', '뉴비서', '뉴스토리', 'deep-worldview', 'causal-map', 'stakeholder-map', 'three-clocks', 'judgment-signposts']) {
      assert.ok(manifest.keywords.includes(keyword), `missing keyword ${keyword}`);
    }
    assert.equal(manifest.apps ?? manifest.extensions?.['com.openai']?.apps, './.app.json');
  }
  assert.deepEqual(v1.extensions['com.openai'].interface, v2.interface);
  assert.match(v1.extensions['com.openai'].interface.defaultPrompt.at(-1), /뉴비서.*심층 분석/);
});

test('basic and deep runtimes are byte-identical to packaged scripts and source manifest', async () => {
  const sourceInfo = await readJson('skills/jh-newbiseo-worldview/references/runtime-source.json');
  assert.equal(sourceInfo.schema, 'jh.newbiseo-source.v1');
  assert.equal(sourceInfo.apiVersion, '1.1.0');
  for (const [name, expectedHash] of Object.entries(EXPECTED)) {
    const [source, bundled] = await Promise.all([
      readFile(new URL(name, root)),
      readFile(new URL(`plugin-overlay/skills/jh-newbiseo-worldview/scripts/${name}`, root)),
    ]);
    assert.deepEqual(source, bundled, `${name} differs from packaged copy`);
    assert.equal(sha256(source), expectedHash);
    assert.equal(sourceInfo.files[name], expectedHash);
    assert.equal(sourceInfo.bundledFiles[`scripts/${name}`], expectedHash);
  }
  assert.match(sourceInfo.purpose, /mandatory basic analogy section/);
  assert.match(sourceInfo.purpose, /personal ideas/);
  assert.equal(sourceInfo.monitoringEnabled, false);
  assert.equal(sourceInfo.autoSaveEnabled, false);
  assert.equal(sourceInfo.authorizesExecution, false);
});

test('basic skill and contract require past-case and personal-idea sections', async () => {
  const [skill, contract, runtime] = await Promise.all([
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/SKILL.md', root), 'utf8'),
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/references/output-contract.md', root), 'utf8'),
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/scripts/worldview.mjs', root), 'utf8'),
  ]);
  assert.match(skill, /과거 유사사례.*나에게 건질 아이디어.*기본형의 고정 항목/s);
  assert.match(skill, /🏴‍☠️ 해골기/);
  assert.match(runtime, /🏴‍☠️ 뉴비서/);
  assert.match(skill, /최소 1개, 최대 3개/);
  assert.match(contract, /과거 유사사례.*나에게 건질 것.*기본형의 필수 항목/s);
  assert.match(contract, /유사사례가 없더라도 항목을 삭제하지 않는다/);
  assert.match(runtime, /직접 비교할 만한 과거 유사사례는 찾지 못했다/);
});

test('deep skill and contract preserve worldview, evidence, and execution boundaries', async () => {
  const [skill, contract, deepRuntime] = await Promise.all([
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/SKILL.md', root), 'utf8'),
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/references/deep-output-contract.md', root), 'utf8'),
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/scripts/deep-worldview.mjs', root), 'utf8'),
  ]);
  assert.match(skill, /“이 일을 어떻게 바라볼 것인가\?”/);
  assert.match(skill, /기본 뉴스토리/);
  assert.match(skill, /심층 뉴스토리/);
  assert.match(skill, /세 개의 시계/);
  assert.match(skill, /가장 강한 반대 해석/);
  assert.match(skill, /추적 알림이 아니라 판단 기준/);
  assert.match(skill, /에비서는 사용자를 이해하는 기능이고, 뉴비서는 세상을 관찰·해석하는 기능/);
  assert.match(skill, /자동 저장하지 않는다/);
  assert.match(contract, /확인된 사실 → 인과 메커니즘 → 이해관계·충돌 → 대안 해석/);
  assert.match(contract, /direct \/ adjacent는 실제 사용자 맥락 라벨/);
  assert.match(deepRuntime, /export function buildDeepWorldview/);
  assert.match(deepRuntime, /export function renderDeepKorean/);
  assert.match(deepRuntime, /monitoringEnabled: false/);
  assert.match(deepRuntime, /authorizesExecution: false/);
});

test('deep regression source is reconstructed and executable by the test runner', async () => {
  const testSource = await readFile(new URL('deep-worldview.test.mjs', root), 'utf8');
  assert.match(testSource, /buildDeepWorldview/);
  assert.match(testSource, /renderDeepKorean/);
  assert.match(testSource, /rejects/);
});
