/**
 * Offline reviewed JH Secure56/JH168 MCP admission with one exact Search addition.
 * No production boot, Android writes, real credentials or paid API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {z} from 'zod';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {patchJHEvidenceSearchRuntime56} from './perplexity-search-composition.mjs';
import {registerJHEvidenceSearchTool} from './perplexity-search.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const MOCK_KEY='synthetic-test-only-perplexity-xxxxxxxx';

test('actual pinned Secure56 server includes gated Search after exact guards, no source mutation', {timeout:30000}, async()=>{
 const pin=buildCleanRestartRelease56();
 const release=await import(pathToFileURL(pin.file).href+'?jh-evidence-source-offline=1');
 const runtime=release.buildDurableRoutedOperationalEntrypoint(ROOT);
 const before=readFileSync(runtime.runtimeFile,'utf8');
 assert(before.includes('jhRequireCommand56'), 'original signed phone guard missing');
 assert(before.includes('jhRegisterArticleReadCandidate'), 'original news guard missing');
 assert(before.includes('const SECURE56_TOOL_CATALOG_DIGEST='), 'original signed Android catalog missing');
 assert(before.includes('JH_EVIDENCE_SEARCH_ENABLED'));
 const after=before;
 assert(after.includes("process.env.JH_EVIDENCE_SEARCH_ENABLED==='1'"));
 assert(after.includes("typeof process.env.PERPLEXITY_API_KEY==='string'"));
 assert.equal(after.split('registerJHEvidenceSearchTool({').length-1,1);
 assert.equal(after.split('const SECURE56_TOOL_CATALOG_DIGEST=').length,2);
 assert.equal(after.split('jhRequireCommand56').length,before.split('jhRequireCommand56').length);
 assert.equal(readFileSync(runtime.runtimeFile,'utf8'), before, 'must not edit the generated file itself');
 assert(existsSync(path.join(ROOT,'evidence/perplexity-search.mjs')));
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:after,encoding:'utf8',timeout:10000});
 assert.equal(syntax.status,0, syntax.stderr);
 assert.throws(()=>patchJHEvidenceSearchRuntime56(after),/ANCHOR_CHANGED/);
 // Evaluate only the generated registrar block, without starting the host.
 const start=after.indexOf('  // Evidence search: server-side OAuth tool only.');
 const stop=after.indexOf('  registerOAuthTool("life_status",{',start);
 assert(start>=0&&stop>start,'missing exact reviewed insertion point');
 const snippet=after.slice(start,stop);
 const registrations=(env)=>{
  const calls=[];
  const run=new Function('process','registerJHEvidenceSearchTool','registerOAuthTool','z','textResult',snippet);
  run({env},registerJHEvidenceSearchTool,(name)=>calls.push(name),z,x=>x);
  return calls;
 };
 assert.deepEqual(registrations({}),[]);
 assert.deepEqual(registrations({PERPLEXITY_API_KEY:MOCK_KEY}),[]);
 assert.deepEqual(registrations({JH_EVIDENCE_SEARCH_ENABLED:'1'}),[]);
 assert.deepEqual(registrations({JH_EVIDENCE_SEARCH_ENABLED:'1',PERPLEXITY_API_KEY:MOCK_KEY}),['jh_evidence_search']);
 const anchor='const SECURE56_TOOL_CATALOG_DIGEST=';
 assert.equal(after.slice(after.indexOf(anchor),after.indexOf(anchor)+120),before.slice(before.indexOf(anchor),before.indexOf(anchor)+120));
});

test('real MCP client sees tool and receives only mock returned links; ordinary requests have ZERO calls', {timeout:15000}, async()=>{
 const server=new McpServer({name:'jh-evidence-synthetic-only',version:'0.0.1'},{capabilities:{tools:{}}});
 let count=0;
 const reg=(name,config,handler)=>server.registerTool(name,config,handler);
 const textResult=x=>({content:[{type:'text',text:JSON.stringify(x)}]});
 const mockFetch=async (_url,req)=>{
   count++;
   assert.equal(JSON.parse(req.body).query,'2026 clinical evidence test');
   return {ok:true,status:200,text:async()=>JSON.stringify({id:'MOCK-only',results:[
    {title:'Evidence reference (synthetic)',url:'https://example.org/original',snippet:'Synthetic text not verified',date:null}
   ]})};
 };
 assert.equal(registerJHEvidenceSearchTool({registerOAuthTool:reg,z,textResult}),false);
 assert.equal(registerJHEvidenceSearchTool({registerOAuthTool:reg,z,textResult,apiKey:MOCK_KEY,fetchImpl:mockFetch}),true);
 const [a,b]=InMemoryTransport.createLinkedPair();
 const client=new Client({name:'jh-evidence-test-client',version:'0.0.1'},{capabilities:{}});
 try{
  await server.connect(a);await client.connect(b);
  const catalog=await client.listTools();
  assert.deepEqual(catalog.tools.map(x=>x.name),['jh_evidence_search']);
  const blocked=await client.callTool({name:'jh_evidence_search',arguments:{
    user_request:'이 논문을 요약해줘',query:'2026 clinical evidence test'}});
  assert.equal(JSON.parse(blocked.content[0].text).code,'EXPLICIT_EVIDENCE_REQUEST_REQUIRED');
  assert.equal(count,0);
  const allowed=await client.callTool({name:'jh_evidence_search',arguments:{
    user_request:'이 내용의 관련 논문 근거 찾아줘',query:'2026 clinical evidence test'}});
  const value=JSON.parse(allowed.content[0].text);
  assert.equal(value.ok,true);
  assert.equal(count,1);
  assert.equal(value.sources[0].url,'https://example.org/original');
  assert.equal(value.sources[0].evidence_status,'UNVERIFIED_SEARCH_EXCERPT');
  assert.equal(JSON.stringify(value).includes(MOCK_KEY),false);
 }finally{await client.close().catch(()=>{});await server.close().catch(()=>{});}
});
