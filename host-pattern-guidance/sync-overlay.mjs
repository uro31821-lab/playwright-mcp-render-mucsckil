import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('./', import.meta.url);
const skill = new URL('plugin-overlay/skills/jh-pattern-guidance/', root);
await mkdir(new URL('scripts/', skill), { recursive: true });
await mkdir(new URL('references/', skill), { recursive: true });
const copies = [
  ['engine.mjs', 'scripts/engine.mjs'],
  ['store.mjs', 'scripts/store.mjs'],
  ['cli.mjs', 'scripts/cli.mjs'],
  ['host-adapter.mjs', 'scripts/host-adapter.mjs'],
  ['installed-runtime.mjs', 'scripts/installed-runtime.mjs'],
  ['SOURCES.md', 'references/sources.md'],
];
const files = {};
const bundledFiles = {};
for (const [source, target] of copies) {
  const bytes = await readFile(new URL(source, root));
  await writeFile(new URL(target, skill), bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  files[source] = sha256;
  bundledFiles[target] = sha256;
}
const dependencies = [
  ['jh-personalization/scripts/runtime.js', 'JHPersonalization', 'ad7835ccfeca98486d8a1478e5a60996cb1d61aaebad094229e2d1538821d0b9'],
  ['jh-decision-learning/scripts/runtime.js', 'JHDecisionLearning', '8bdd50f5925fe01fdece92c1bf23ed8b9b92bd5a04f0f80126b95f630233f5e0'],
  ['jh-decision-learning/scripts/personalization-adapter.js', 'JHDecisionContext', '505ee5790d89003eec671a215d30fec06313531d1fd2a51bdce529ec08c6f28a'],
  ['jh-proactive-research/scripts/runtime.js', 'JHProactiveResearch', '0d1d98c50e2ef0f7d04ab7252369b39dd6f6bf339576f5a70f74018fdb80797e'],
].map(([skillsRelativePath, global, sha256]) => ({ skillsRelativePath, global, apiVersion: '1.0.0', sha256 }));
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.pattern-guidance-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server',
  directory: 'host-pattern-guidance',
  apiVersion: '1.0.0',
  stateSchema: 'jh.pattern-memory.v2',
  remoteAvailability: 'Coordinates identify intended source. Bundled hashes do not attest remote publication.',
  files,
  bundledFiles,
  externalDependencies: [],
  installedDependencies: dependencies,
  sourceCopyPolicy: 'Byte-identical copies; rerun sync-overlay.mjs after source changes.',
  privateStateIncluded: false,
}, null, 2) + '\n');
console.log(JSON.stringify({ synchronized: true, files }));
