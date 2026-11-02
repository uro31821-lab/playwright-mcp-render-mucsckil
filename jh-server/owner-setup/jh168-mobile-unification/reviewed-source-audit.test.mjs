import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertReviewedSource } from './reviewed-source-audit.mjs';

// All commits, refs, and dirty files belong to disposable synthetic repositories.
// These tests neither fetch nor modify this project's real Git history or source.
const BASE_REF = 'refs/remotes/origin/jh-fix3-secure-server';
const ORIGINAL = 'export const protectedValue = 1;\n';

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'jh-reviewed-source-audit-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Synthetic source audit', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic source audit', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgSign=false',
    '-c', 'core.hooksPath=/dev/null', ...args],
  { cwd, env, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, contents) => {
    const full = path.join(cwd, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  };
  const commit = message => {
    git('add', '--all');
    git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '--quiet', '--initial-branch=fixture-main');
  git('config', 'core.fileMode', 'true');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.excludesFile', '/dev/null');
  git('config', 'core.fsmonitor', 'false');
  write('.gitignore', 'node_modules/\n');
  write('protected/runtime.mjs', ORIGINAL);
  write('protected/nested/policy.json', '{"trusted":true}\n');
  write('protected/allowed-overlay/note.txt', 'Synthetic excluded overlay baseline.\n');
  write('notes.md', '# Synthetic source review fixture\n');
  const baseline = commit('Synthetic reviewed baseline');
  git('update-ref', BASE_REF, baseline);
  const audit = options => assertReviewedSource({ cwd, baseline, paths: ['protected'], ...options });
  return { cwd, git, write, commit, baseline, audit };
}

async function rejects(f, code, options) {
  await assert.rejects(async () => f.audit(options), new RegExp(code));
}

test('reviewed bytes survive harmless documentation commits and a merge whose base ref later equals HEAD', async t => {
  const f = fixture(t);
  const unchanged = await f.audit();
  assert.equal(unchanged.baseline, f.baseline);
  assert.equal(unchanged.base, f.baseline);
  assert.equal(unchanged.head, f.baseline);
  assert.ok(Object.hasOwn(unchanged, 'protectedPaths'));

  f.write('notes.md', '# A harmless reviewed documentation update\n');
  const base = f.commit('Synthetic documentation advances main');
  f.git('update-ref', BASE_REF, base);
  f.git('checkout', '--quiet', '-b', 'docs-feature');
  f.write('docs/follow-up.md', 'Synthetic follow-up documentation only.\n');
  f.commit('Synthetic docs feature');
  f.git('checkout', '--quiet', 'fixture-main');
  f.git('merge', '--quiet', '--no-ff', '--no-edit', 'docs-feature');
  const head = f.git('rev-parse', 'HEAD');
  assert.equal(f.git('show', '-s', '--format=%P', 'HEAD').split(' ').length, 2);
  const beforeMergeRefUpdate = await f.audit();
  assert.equal(beforeMergeRefUpdate.base, base);
  assert.equal(beforeMergeRefUpdate.head, head);
  f.git('update-ref', BASE_REF, head);
  const afterMerge = await f.audit();
  assert.equal(afterMerge.base, head);
  assert.equal(afterMerge.head, head);
  assert.equal(readFileSync(path.join(f.cwd, 'protected/runtime.mjs'), 'utf8'), ORIGINAL);
});

test('a protected source change already present in the base is rejected', async t => {
  const f = fixture(t);
  f.write('protected/runtime.mjs', 'export const protectedValue = 2;\n');
  const changedBase = f.commit('Synthetic changed base');
  f.git('update-ref', BASE_REF, changedBase);
  await rejects(f, 'BASE_PROTECTED_SOURCE_CHANGED');
});

test('a changed base is rejected even when HEAD restores the exact reviewed bytes', async t => {
  const f = fixture(t);
  f.write('protected/runtime.mjs', 'export const protectedValue = 2;\n');
  const changedBase = f.commit('Synthetic changed base before restoration');
  f.git('update-ref', BASE_REF, changedBase);
  f.write('protected/runtime.mjs', ORIGINAL);
  f.commit('Synthetic HEAD restores reviewed bytes');
  assert.equal(f.git('diff', '--raw', f.baseline, 'HEAD', '--', 'protected'), '');
  await rejects(f, 'BASE_PROTECTED_SOURCE_CHANGED');
});

test('a protected content change introduced only by HEAD is rejected', async t => {
  const f = fixture(t);
  f.write('protected/nested/policy.json', '{"trusted":false}\n');
  f.commit('Synthetic candidate changes protected policy');
  await rejects(f, 'HEAD_PROTECTED_SOURCE_CHANGED');
});

test('unstaged and staged protected worktree changes are rejected without a new commit', async t => {
  const f = fixture(t);
  f.write('protected/runtime.mjs', 'export const protectedValue = 3;\n');
  await rejects(f, 'WORKTREE_PROTECTED_SOURCE_CHANGED');
  f.git('add', '--', 'protected/runtime.mjs');
  await rejects(f, 'WORKTREE_PROTECTED_SOURCE_CHANGED');
});

test('a committed addition under a protected directory is rejected', async t => {
  const f = fixture(t);
  f.write('protected/new-policy.mjs', 'export const syntheticAddition = true;\n');
  f.commit('Synthetic protected file addition');
  await rejects(f, 'HEAD_PROTECTED_SOURCE_CHANGED');
});

test('a committed deletion under a protected directory is rejected', async t => {
  const f = fixture(t);
  f.git('rm', '--quiet', '--', 'protected/runtime.mjs');
  f.commit('Synthetic protected file deletion');
  await rejects(f, 'HEAD_PROTECTED_SOURCE_CHANGED');
});

test('a protected rename with identical content is still rejected', async t => {
  const f = fixture(t);
  f.git('mv', '--', 'protected/runtime.mjs', 'protected/renamed-runtime.mjs');
  f.commit('Synthetic protected rename');
  assert.equal(readFileSync(path.join(f.cwd, 'protected/renamed-runtime.mjs'), 'utf8'), ORIGINAL);
  await rejects(f, 'HEAD_PROTECTED_SOURCE_CHANGED');
});

test('an executable mode change is rejected even when the source bytes are identical', async t => {
  const f = fixture(t);
  chmodSync(path.join(f.cwd, 'protected/runtime.mjs'), 0o755);
  await rejects(f, 'WORKTREE_PROTECTED_SOURCE_CHANGED');
  f.commit('Synthetic protected executable mode change');
  assert.equal(readFileSync(path.join(f.cwd, 'protected/runtime.mjs'), 'utf8'), ORIGINAL);
  await rejects(f, 'HEAD_PROTECTED_SOURCE_CHANGED');
});

test('ignored dependency files and unrelated untracked files are allowed, but protected untracked source is rejected', async t => {
  const f = fixture(t);
  f.write('protected/node_modules/synthetic-package/index.js', '// Synthetic ignored dependency.\n');
  f.write('outside/untracked-note.txt', 'Synthetic nonprotected note.\n');
  await f.audit();
  f.write('protected/untracked-source.mjs', 'export const syntheticUntracked = true;\n');
  await rejects(f, 'UNTRACKED_PROTECTED_SOURCE');
});

test('unrelated histories, a diverged base, and missing refs are rejected', async t => {
  const baseUnrelated = fixture(t);
  baseUnrelated.git('checkout', '--quiet', '--orphan', 'unrelated-base');
  const orphanBase = baseUnrelated.commit('Synthetic independent base history');
  baseUnrelated.git('checkout', '--quiet', 'fixture-main');
  baseUnrelated.git('update-ref', BASE_REF, orphanBase);
  await rejects(baseUnrelated, 'BASELINE_NOT_ANCESTOR_OF_BASE');

  const headUnrelated = fixture(t);
  headUnrelated.git('checkout', '--quiet', '--orphan', 'unrelated-head');
  headUnrelated.commit('Synthetic independent HEAD history');
  await rejects(headUnrelated, 'BASELINE_NOT_ANCESTOR_OF_HEAD');

  const diverged = fixture(t);
  diverged.write('docs/base.md', 'Synthetic main-side documentation.\n');
  const base = diverged.commit('Synthetic main branch');
  diverged.git('update-ref', BASE_REF, base);
  diverged.git('checkout', '--quiet', '-b', 'diverged-head', diverged.baseline);
  diverged.write('docs/head.md', 'Synthetic separate head documentation.\n');
  diverged.commit('Synthetic diverged candidate');
  await rejects(diverged, 'BASE_NOT_ANCESTOR_OF_HEAD');

  const missing = fixture(t);
  for (const options of [{ baseRef: 'refs/heads/synthetic-missing-base' },
    { headRef: 'refs/heads/synthetic-missing-head' }, { baseline: '0'.repeat(40) }]) {
    await assert.rejects(async () => missing.audit(options));
  }
});

test('explicit Git pathspec exclusions remain narrow and do not exclude neighboring protected source', async t => {
  const f = fixture(t);
  const options = { paths: ['protected', ':(exclude)protected/allowed-overlay'] };
  f.write('protected/allowed-overlay/note.txt', 'Synthetic permitted overlay change.\n');
  f.write('outside/tracked.txt', 'Synthetic unrelated tracked file.\n');
  f.commit('Synthetic explicitly excluded overlay and unrelated file');
  f.write('protected/allowed-overlay/untracked.txt', 'Synthetic permitted excluded file.\n');
  await f.audit(options);
  f.write('protected/nested/policy.json', '{"trusted":false}\n');
  await rejects(f, 'WORKTREE_PROTECTED_SOURCE_CHANGED', options);
});
