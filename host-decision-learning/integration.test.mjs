import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url), overlay = new URL('plugin-overlay/', root);
const oldOverlay = new URL('../host-personalization/plugin-overlay/', root);
const read = (name, base = overlay) => readFileSync(new URL(name, base), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
test('packaged core, bridge and contract are byte-identical to the tested sources with a pinned existing engine', () => {
  const manifest = JSON.parse(read('skills/jh-decision-learning/references/runtime-source.json'));
  for (const [source, target] of [
    ['runtime.js', 'scripts/runtime.js'], ['cli.mjs', 'scripts/cli.mjs'],
    ['personalization-adapter.js', 'scripts/personalization-adapter.js'],
    ['runtime-contract.md', 'references/runtime-contract.md'], ['SOURCES.md', 'references/sources.md'],
  ]) {
    const original = read(source, root);
    assert.equal(read('skills/jh-decision-learning/' + target), original);
    assert.equal(manifest.files[source], hash(original));
  }
  assert.equal(hash(read('../host-personalization/runtime.js', root)), manifest.optionalBridge.sha256);
  assert.deepEqual(manifest.externalDependencies, []);
  assert.equal(manifest.privateStateIncluded, false);
});
test('the update preserves previous main instructions and plugin identity while adding only the new routing section', () => {
  for (const file of ['plugin.json', '.codex-plugin/plugin.json']) {
    const before = JSON.parse(read(file, oldOverlay)), after = JSON.parse(read(file));
    assert.equal(after.version, '1.22.0');
    assert.deepEqual(after.keywords.filter(x => !before.keywords.includes(x)), ['goal-context', 'prediction-outcome-review', 'proposal-value']);
    after.version = before.version; after.keywords = before.keywords;
    assert.deepEqual(after, before);
  }
  const before = read('skills/jh-secure-live/SKILL.md', oldOverlay), after = read('skills/jh-secure-live/SKILL.md');
  const begin = after.indexOf('\n\n## 목표·예상·실제 결과로 다음 판단 보완');
  const end = after.indexOf('\n\n## 상황과 선택 이유를 반영하는 개인화', begin);
  assert.ok(begin >= 0 && end > begin);
  assert.equal(after.slice(0, begin) + after.slice(end), before);
});
test('the host-only package contains no private record, inferred-preference writer or background activation', () => {
  const binding = JSON.parse(read('skills/jh-decision-learning/references/state-binding.json'));
  assert.equal(binding.stateFileName, 'JH_Decision_Learning_v1.json');
  assert.equal(binding.backgroundEnabled, false);
  assert.equal(binding.existingMemoryMigration, false);
  assert.equal(binding.inferredReviewsMutatePreferences, false);
  const paths = readdirSync(fileURLToPath(overlay), { recursive: true });
  assert.ok(!paths.includes(binding.stateFileName));
  for (const file of paths.filter(x => /\.(?:md|json|js|mjs)$/.test(x))) {
    assert.doesNotMatch(read(file), /libfile_[a-f0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{16,}/);
  }
  const bridge = read('personalization-adapter.js', root);
  assert.doesNotMatch(bridge, /\.(?:recordPreference|revisePreference|recordChoice|recordFeedback)\s*\(/);
});
