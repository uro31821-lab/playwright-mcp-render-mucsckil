/** Test the actual installed sibling-skill layout using only synthetic state. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, appendFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {contextInstalled} from './installed-runtime.mjs';

const input = () => ({ownerScope: 'synthetic-installed-owner', scope: {topic: 'synthetic-installed-topic'},
  threadId: 'synthetic-installed-thread', taskId: 'synthetic-installed-task', at: '2026-11-03T00:00:00.000Z',
  invocation: {intent: 'consult', basis: 'direct', sourceRef: 'user:synthetic-installed-call'}});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'jh-ebiseo-installed-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const files = [
    ...['context.mjs', 'installed-runtime.mjs'].map(name => [new URL(name, import.meta.url), `jh-ebiseo-assist/scripts/${name}`]),
    [new URL('../host-personal-dialogue/runtime.js', import.meta.url), 'jh-personal-dialogue/scripts/runtime.js'],
    [new URL('../host-personal-dialogue/context-adapter.js', import.meta.url), 'jh-personal-dialogue/scripts/context-adapter.js'],
    [new URL('../host-personalization/runtime.js', import.meta.url), 'jh-personalization/scripts/runtime.js'],
    [new URL('../host-decision-learning/runtime.js', import.meta.url), 'jh-decision-learning/scripts/runtime.js'],
    [new URL('../host-decision-learning/personalization-adapter.js', import.meta.url), 'jh-decision-learning/scripts/personalization-adapter.js'],
  ];
  for (const [source, relative] of files) {
    const target = join(root, 'skills', relative);
    await mkdir(dirname(target), {recursive: true});
    await copyFile(source, target);
  }
  const api = await import(pathToFileURL(join(root, 'skills/jh-ebiseo-assist/scripts/installed-runtime.mjs')).href);
  return {root, api};
}
test('installed path loads all five original dependencies and reads real synthetic state', async t => {
  const {api} = await fixture(t);
  const runtimes = await api.installedAPIs();
  assert.deepEqual(Object.keys(runtimes).sort(), ['decision', 'decisionContext', 'dialogue', 'dialogueBridge', 'personal']);
  const dialogue = runtimes.dialogue.createState({ownerScope: 'synthetic-installed-owner', now: input().at});
  const result = await api.contextInstalled({dialogue, personal: null, decision: null}, input());
  assert.equal(result.active, true);
  assert.deepEqual(result.dialogue.knownPreferences, []);
  assert.equal(result.stateRevisions.dialogue, 0);
});
test('modified sibling dependency is refused before using the installed APIs', async t => {
  const {root, api} = await fixture(t);
  await appendFile(join(root, 'skills/jh-personal-dialogue/scripts/context-adapter.js'), '\n// synthetic modification\n');
  await assert.rejects(api.installedAPIs(), {code: 'EBISEO_DEPENDENCY_CHANGED'});
});
test('non-invocation never reads missing installation paths or supplied states', async () => {
  const request = input(); request.invocation.basis = 'negated';
  const unreachable = new Proxy({}, {get() { throw new Error('States must not be inspected'); }});
  const result = await contextInstalled(unreachable, request, new URL('file:///synthetic-missing-ebiseo-skills/'));
  assert.equal(result.active, false);
  assert.equal(result.dialogue, null);
});
