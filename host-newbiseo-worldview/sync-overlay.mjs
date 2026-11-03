import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('./', import.meta.url);
const partsDir = new URL('source-parts/', root);
const skill = new URL('plugin-overlay/skills/jh-newbiseo-worldview/', root);

const EXPECTED_RUNTIME_SHA256 = Object.freeze({
  'worldview.mjs': '0dc9dad58c5e50aec33dd6e8cbc0bb846b5f66cc530f224789304d2445aefffb',
  'deep-worldview.mjs': 'd63ded87aeb74e4190c50ddf8ece7ad93e215584ae82eee73f97548f5ba56475',
});

async function assemble(name, {required = true} = {}) {
  const target = new URL(name, root);
  let bytes;
  try {
    bytes = await readFile(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const names = (await readdir(partsDir))
      .filter(file => new RegExp(`^${escaped}\\.b64\\.\\d{3}$`).test(file))
      .sort();
    if (!names.length) {
      if (!required) return null;
      throw new Error(`NEWBISEO_SOURCE_PARTS_MISSING:${name}`);
    }
    const chunks = await Promise.all(names.map(file => readFile(new URL(file, partsDir), 'ascii')));
    bytes = Buffer.from(chunks.join(''), 'base64');
    await writeFile(target, bytes);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (EXPECTED_RUNTIME_SHA256[name] && sha256 !== EXPECTED_RUNTIME_SHA256[name]) {
    throw new Error(`NEWBISEO_SOURCE_HASH_MISMATCH:${name}:${sha256}`);
  }
  return {name, bytes, sha256};
}

await mkdir(new URL('scripts/', skill), {recursive: true});
await mkdir(new URL('references/', skill), {recursive: true});

const runtimes = [];
for (const name of ['worldview.mjs', 'deep-worldview.mjs']) {
  const runtime = await assemble(name);
  runtimes.push(runtime);
  await writeFile(new URL(`scripts/${name}`, skill), runtime.bytes);
}
const deepTest = await assemble('deep-worldview.test.mjs');

const files = Object.fromEntries(runtimes.map(item => [item.name, item.sha256]));
const bundledFiles = Object.fromEntries(runtimes.map(item => [`scripts/${item.name}`, item.sha256]));
await writeFile(new URL('references/runtime-source.json', skill), JSON.stringify({
  schema: 'jh.newbiseo-source.v1',
  repository: 'uro31821-lab/playwright-mcp-render-mucsckil',
  branch: 'jh-fix3-secure-server',
  directory: 'host-newbiseo-worldview',
  apiVersion: '1.1.0',
  privateStateIncluded: false,
  createsState: false,
  searchesTheWeb: false,
  monitoringEnabled: false,
  autoSaveEnabled: false,
  authorizesExecution: false,
  purpose: 'source-backed story, recurring pattern, structural analogy, event anatomy, alternative interpretation, judgment signposts, and personal inspiration validation',
  files,
  bundledFiles,
}, null, 2) + '\n');

console.log(JSON.stringify({
  synchronized: true,
  files,
  generatedTests: {[deepTest.name]: deepTest.sha256},
}));
