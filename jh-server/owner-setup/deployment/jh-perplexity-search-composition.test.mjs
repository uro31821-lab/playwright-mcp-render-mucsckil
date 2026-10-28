import test from 'node:test';
import assert from 'node:assert/strict';
import {patchJHEvidenceSearchRuntime56} from './jh-perplexity-search-composition.mjs';

const fixture=[
  'import {awaitOpenCompletion as jhAwaitOpenCompletion56, OPEN_COMPLETION_WAIT_MS as jhOpenWait56, OPEN_STATUS_WAIT_MS as jhOpenStatusWait56} from "../deployment/jh167-open-completion.mjs";',
  "import {createServer} from 'node:http';",
  "const SECURE56_TOOL_CATALOG_DIGEST='unchanged-android-digest';",
  "function createMcp(){",
  "  const registerOAuthTool=(name,config,handler)=>{ /* secured tool */ };",
  '  registerOAuthTool("life_status",{title:"status"},async()=>{});',
  '  return {};',
  '}',
  ''
].join('\n');

test('patch reversible; requires flag + secret; Android security digest untouched',()=>{
 const output=patchJHEvidenceSearchRuntime56(fixture);
 assert.ok(output.startsWith("import {awaitOpenCompletion as"));
 assert.ok(output.split("\\n")[0].includes("jh167-open-completion.mjs"));
 assert.ok(output.includes("import {registerJHEvidenceSearchTool}"));
 assert.ok(output.includes("process.env.JH_EVIDENCE_SEARCH_ENABLED==='1'"));
 assert.ok(output.includes('process.env.PERPLEXITY_API_KEY'));
 assert.ok(output.includes("const SECURE56_TOOL_CATALOG_DIGEST='unchanged-android-digest';"));
 assert.ok(output.includes('registerOAuthTool("life_status"'));
 assert.equal(output.split('registerJHEvidenceSearchTool({').length-1,1);
 assert.throws(()=>patchJHEvidenceSearchRuntime56(output),/ANCHOR_CHANGED/);
});

test('unknown or modified secure host is refused instead of silently patched',()=>{
 for(const source of [
   fixture.replace('life_status','status'),
   fixture.replace('const SECURE56_TOOL_CATALOG_DIGEST','const ALTERED_DIGEST'),
   fixture+fixture,''
 ])assert.throws(()=>patchJHEvidenceSearchRuntime56(source),/ANCHOR_CHANGED/);
});
