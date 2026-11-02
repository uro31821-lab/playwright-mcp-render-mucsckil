import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const skill = new URL('plugin-overlay/skills/jh-personalization/', root);
await mkdir(new URL('scripts/', skill), { recursive: true });
await mkdir(new URL('references/', skill), { recursive: true });
const files = [
  ['runtime.js', 'scripts/runtime.js'],
  ['cli.mjs', 'scripts/cli.mjs'],
  ['SOURCES.md', 'references/sources.md'],
];
const hashes = {};
for (const [source, destination] of files) {
  const bytes = await readFile(new URL(source, root));
  await writeFile(new URL(destination, skill), bytes);
  hashes[source] = createHash('sha256').update(bytes).digest('hex');
}
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.personalization-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server',
  directory: 'host-personalization',
  remoteAvailability: 'Repository coordinates identify the intended source; this manifest attests bundled hashes, not remote publication.',
  files: hashes,
  dependencies: [],
  sourceCopyPolicy: 'Byte-identical copies; run sync-overlay.mjs after source changes.',
  privateStateIncluded: false
}, null, 2) + '\n');
console.log(JSON.stringify({ status: 'synchronized', files: hashes }));
