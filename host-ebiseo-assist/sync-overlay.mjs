import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DEPENDENCY_PINS} from './installed-runtime.mjs';

const root = new URL('./', import.meta.url);
const skill = new URL('plugin-overlay/skills/jh-ebiseo-assist/', root);
await mkdir(new URL('scripts/', skill), {recursive: true});
await mkdir(new URL('references/', skill), {recursive: true});
const files = {}, bundledFiles = {};
for (const name of ['context.mjs', 'installed-runtime.mjs']) {
  const bytes = await readFile(new URL(name, root));
  const target = `scripts/${name}`;
  await writeFile(new URL(target, skill), bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  files[name] = sha256;
  bundledFiles[target] = sha256;
}
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.ebiseo-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server',
  directory: 'host-ebiseo-assist',
  apiVersion: '1.0.0',
  privateStateIncluded: false,
  createsState: false,
  naturalLanguageInterpreter: 'current conversation host',
  otherConversationRemoteExecution: false,
  remoteAvailability: 'Source coordinates and file hashes do not independently attest publication.',
  files,
  bundledFiles,
  installedDependencies: DEPENDENCY_PINS.map(([skillsRelativePath, sha256]) => ({skillsRelativePath, sha256})),
}, null, 2) + '\n');
console.log(JSON.stringify({synchronized: true, files}));
