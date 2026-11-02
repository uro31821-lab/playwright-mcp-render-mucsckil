import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const skill = new URL('plugin-overlay/skills/jh-personal-dialogue/', root);
await mkdir(new URL('scripts/', skill), { recursive: true });
await mkdir(new URL('references/', skill), { recursive: true });
const copies = [
  ['runtime.js', 'scripts/runtime.js'], ['cli.mjs', 'scripts/cli.mjs'],
  ['context-adapter.js', 'scripts/context-adapter.js'],
  ['runtime-contract.md', 'references/runtime-contract.md'],
  ['SOURCES.md', 'references/sources.md'],
];
const files = {};
for (const [source, target] of copies) {
  const bytes = await readFile(new URL(source, root));
  await writeFile(new URL(target, skill), bytes);
  files[source] = createHash('sha256').update(bytes).digest('hex');
}
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.personal-dialogue-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server', directory: 'host-personal-dialogue',
  remoteAvailability: 'Coordinates identify intended source. Bundled hashes do not attest remote publication.',
  files, externalDependencies: [],
  optionalBridge: {
    global: 'JHDecisionLearning', apiVersion: '1.0.0',
    runtimePath: '../../jh-decision-learning/scripts/runtime.js',
    sha256: '8bdd50f5925fe01fdece92c1bf23ed8b9b92bd5a04f0f80126b95f630233f5e0',
    behavior: 'Read exact-scope goal outcomes with dialogue evidence; no state changes.'
  },
  sourceCopyPolicy: 'Byte-identical copies; rerun sync-overlay.mjs after source changes.',
  privateStateIncluded: false
}, null, 2) + '\n');
console.log(JSON.stringify({ synchronized: true, files }));
