import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const skill = new URL('plugin-overlay/skills/jh-decision-learning/', root);
await mkdir(new URL('scripts/', skill), { recursive: true });
await mkdir(new URL('references/', skill), { recursive: true });
const files = [
  ['runtime.js', 'scripts/runtime.js'],
  ['cli.mjs', 'scripts/cli.mjs'],
  ['personalization-adapter.js', 'scripts/personalization-adapter.js'],
  ['runtime-contract.md', 'references/runtime-contract.md'],
  ['SOURCES.md', 'references/sources.md'],
];
const hashes = {};
for (const [source, destination] of files) {
  const bytes = await readFile(new URL(source, root));
  await writeFile(new URL(destination, skill), bytes);
  hashes[source] = createHash('sha256').update(bytes).digest('hex');
}
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.decision-learning-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server',
  directory: 'host-decision-learning',
  remoteAvailability: 'Coordinates identify intended source. Bundled hashes do not attest remote publication.',
  files: hashes,
  externalDependencies: [],
  optionalBridge: {
    global: 'JHPersonalization',
    apiVersion: '1.0.0',
    runtimePath: '../../jh-personalization/scripts/runtime.js',
    sha256: 'ad7835ccfeca98486d8a1478e5a60996cb1d61aaebad094229e2d1538821d0b9',
    behavior: 'Read-only comparison. No preference mutation or private-state copying.'
  },
  sourceCopyPolicy: 'Byte-identical copies; rerun sync-overlay.mjs after source changes.',
  privateStateIncluded: false
}, null, 2) + '\n');
console.log(JSON.stringify({ status: 'synchronized', files: hashes }));
