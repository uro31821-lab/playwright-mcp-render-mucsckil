import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('./', import.meta.url);
const overlay = new URL('plugin-overlay/', root);
const readJson = async path => JSON.parse(await readFile(new URL(path, overlay), 'utf8'));

test('plugin overlay preserves JH identity and publishes Newbiseo discovery', async () => {
  const [v1, v2] = await Promise.all([readJson('plugin.json'), readJson('.codex-plugin/plugin.json')]);
  for (const manifest of [v1, v2]) {
    assert.equal(manifest.name, 'jh-secure-live');
    assert.equal(manifest.version, '1.27.0');
    assert.equal(manifest.skills, './skills');
    assert.ok(manifest.keywords.includes('newbiseo'));
    assert.ok(manifest.keywords.includes('뉴비서'));
    assert.ok(manifest.keywords.includes('뉴스토리'));
    assert.equal(manifest.apps ?? manifest.extensions?.['com.openai']?.apps, './.app.json');
  }
  assert.deepEqual(v1.extensions['com.openai'].interface, v2.interface);
});

test('packaged runtime is byte-identical and source manifest is honest', async () => {
  const [source, bundled, sourceInfo] = await Promise.all([
    readFile(new URL('worldview.mjs', root)),
    readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/scripts/worldview.mjs', root)),
    readJson('skills/jh-newbiseo-worldview/references/runtime-source.json'),
  ]);
  const sha256 = createHash('sha256').update(source).digest('hex');
  assert.deepEqual(source, bundled);
  assert.equal(sourceInfo.schema, 'jh.newbiseo-source.v1');
  assert.equal(sourceInfo.apiVersion, '1.0.0');
  assert.equal(sourceInfo.files['worldview.mjs'], sha256);
  assert.equal(sourceInfo.bundledFiles['scripts/worldview.mjs'], sha256);
  assert.equal(sourceInfo.monitoringEnabled, false);
  assert.equal(sourceInfo.autoSaveEnabled, false);
  assert.equal(sourceInfo.authorizesExecution, false);
});

test('skill keeps worldview distinct from fact-checking and existing Ebiseo memory', async () => {
  const skill = await readFile(new URL('plugin-overlay/skills/jh-newbiseo-worldview/SKILL.md', root), 'utf8');
  assert.match(skill, /“이 일을 어떻게 바라볼 것인가\?”/);
  assert.match(skill, /Evidence Research/);
  assert.match(skill, /에비서는 사용자를 이해하는 기능이고, 뉴비서는 세상을 관찰·해석하는 기능/);
  assert.match(skill, /계속 추적, 알림, 예약된 뉴스 수집, 백그라운드 감시를 만들지 않는다/);
  assert.match(skill, /자동 저장하지 않는다/);
});
