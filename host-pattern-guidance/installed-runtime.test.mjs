/** Exercise the real plugin directory layout; all data is synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, appendFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

async function installedFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'jh-pattern-installed-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const files = [
    ...['engine.mjs','host-adapter.mjs','installed-runtime.mjs'].map(name =>
      [new URL(name, import.meta.url), 'jh-pattern-guidance/scripts/' + name]),
    [new URL('../host-personalization/runtime.js', import.meta.url), 'jh-personalization/scripts/runtime.js'],
    [new URL('../host-decision-learning/runtime.js', import.meta.url), 'jh-decision-learning/scripts/runtime.js'],
    [new URL('../host-decision-learning/personalization-adapter.js', import.meta.url), 'jh-decision-learning/scripts/personalization-adapter.js'],
    [new URL('../host-proactive-research/runtime.js', import.meta.url), 'jh-proactive-research/scripts/runtime.js'],
  ];
  for (const [source, relative] of files) {
    const target = join(root, 'skills', relative);
    await mkdir(dirname(target), {recursive:true});
    await copyFile(source, target);
  }
  const api = await import(pathToFileURL(join(root, 'skills/jh-pattern-guidance/scripts/installed-runtime.mjs')));
  return {root, api};
}

test('installed loader resolves sibling skills without an explicit root', async t => {
  const {api} = await installedFixture(t);
  const runtimes = await api.installedAPIs();
  for (const name of ['personal','decision','research','decisionContext']) {
    assert.equal(runtimes[name].VERSION, '1.0.0');
  }
  const state = runtimes.personal.createState({ownerScope:'synthetic-install', now:'2026-11-02T00:00:00.000Z'});
  assert.equal(runtimes.personal.validateState(state).ownerScope, 'synthetic-install');
  assert.equal(typeof api.reviewInstalled, 'function');
  assert.equal(typeof api.deliveryInstalled, 'function');
});

test('installed loader refuses a changed dependency before using its API', async t => {
  const {root, api} = await installedFixture(t);
  await appendFile(join(root, 'skills/jh-decision-learning/scripts/runtime.js'), '\n// synthetic changed dependency\n');
  await assert.rejects(api.installedAPIs(), {code:'PATTERN_DEPENDENCY_CHANGED'});
});
