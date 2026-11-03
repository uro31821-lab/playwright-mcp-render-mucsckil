import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('./', import.meta.url);
const source = new URL('worldview.mjs', root);
async function sourceBytes() {
  try { return await readFile(source); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const partsDir = new URL('source-parts/', root);
    const names = (await readdir(partsDir)).filter(name => /^worldview\.mjs\.b64\.\d{3}$/.test(name)).sort();
    if (!names.length) throw new Error('NEWBISEO_SOURCE_PARTS_MISSING');
    const chunks = await Promise.all(names.map(name => readFile(new URL(name, partsDir), 'ascii')));
    const bytes = Buffer.from(chunks.join(''), 'base64');
    await writeFile(source, bytes);
    return bytes;
  }
}

const skill = new URL('plugin-overlay/skills/jh-newbiseo-worldview/', root);
await mkdir(new URL('scripts/', skill), {recursive: true});
await mkdir(new URL('references/', skill), {recursive: true});
const bytes = await sourceBytes();
await writeFile(new URL('scripts/worldview.mjs', skill), bytes);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const files = {'worldview.mjs': sha256};
const bundledFiles = {'scripts/worldview.mjs': sha256};
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.newbiseo-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server',
  directory: 'host-newbiseo-worldview',
  apiVersion: '1.0.0',
  privateStateIncluded: false,
  createsState: false,
  searchesTheWeb: false,
  monitoringEnabled: false,
  autoSaveEnabled: false,
  authorizesExecution: false,
  purpose: 'source-backed story, recurring pattern, structural analogy, and personal inspiration validation',
  files,
  bundledFiles,
}, null, 2) + '\n');
console.log(JSON.stringify({synchronized: true, files}));
