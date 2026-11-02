import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base = new URL('./', import.meta.url);
const overlay = new URL('plugin-overlay/', base);
const oldOverlay = new URL('../host-client-plugin-overlay/', base);
const read = (relative, from = overlay) => readFileSync(new URL(relative, from), 'utf8');
const hash = x => createHash('sha256').update(x).digest('hex');
test('published scripts and source references are exact tested-source copies', () => {
  const meta = JSON.parse(read('skills/jh-proactive-research/references/runtime-source.json'));
  for (const [source, target] of [['runtime.js','scripts/runtime.js'], ['cli.mjs','scripts/cli.mjs'], ['github-adapter.js','scripts/github-adapter.js'], ['SOURCES.md','references/sources.md']]) {
    const original = read(source, base);
    assert.equal(read('skills/jh-proactive-research/' + target), original);
    assert.equal(meta.files[source], hash(original));
  }
  assert.deepEqual(meta.dependencies, []);
  assert.equal(meta.privateStateIncluded, false);
});
test('release overlay retains App presentation and all preexisting main instructions', () => {
  for (const name of ['plugin.json','.codex-plugin/plugin.json']) {
    const before = JSON.parse(read(name, oldOverlay));
    const after = JSON.parse(read(name));
    assert.equal(after.version, '1.20.0');
    const added = after.keywords.filter(k => !before.keywords.includes(k));
    assert.deepEqual(added, ['proactive-research','topic-memory','source-evidence']);
    after.version = before.version;
    after.keywords = before.keywords;
    assert.deepEqual(after, before);
  }
  const old = read('skills/jh-secure-live/SKILL.md', oldOverlay);
  const current = read('skills/jh-secure-live/SKILL.md');
  const a = current.indexOf('\n\n## 반복 질문의 조사와 개선 제안');
  const b = current.indexOf('\n\n## 메모리아와 JHAI 기억 함께 활용', a);
  assert.ok(a > 0 && b > a);
  assert.equal(current.slice(0, a) + current.slice(b), old);
});
test('host-only skill and private state binding are packaged without live owner records', () => {
  const binding = JSON.parse(read('skills/jh-proactive-research/references/state-binding.json'));
  assert.equal(binding.stateFileName, 'JH_Proactive_Research_v1.json');
  assert.equal(binding.mode, 'conversation_triggered');
  assert.equal(binding.backgroundEnabled, false);
  assert.equal(binding.existingMemoryMigration, false);
  const skill = read('skills/jh-proactive-research/SKILL.md');
  assert.match(skill, /^---\nname: jh-proactive-research\ndescription:/);
  assert.match(skill, /references\/host-flow\.md/);
  const paths = readdirSync(fileURLToPath(overlay), { recursive: true });
  assert.ok(!paths.includes('JH_Proactive_Research_v1.json'));
  for (const path of paths.filter(p => /\.(?:md|json|js|mjs)$/.test(p))) {
    assert.doesNotMatch(read(path), /libfile_[a-f0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{16,}/);
  }
});
