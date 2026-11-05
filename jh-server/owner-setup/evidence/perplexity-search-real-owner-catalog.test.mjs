/**
 * Actual JH Secure56 owner HTTP service, authenticated MCP tools/list, and
 * OFF/ON conditional Search registration. Local synthetic keys only.
 * No browser, phone, or external Perplexity request is made.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const ROOT=path.resolve(import.meta.dirname,'..');
const MOCK_KEY='synthetic-only-fake-perplexity-api-key';
const bootScript="\nimport assert from 'node:assert/strict';\nimport {readFileSync} from 'node:fs';\nimport {pathToFileURL} from 'node:url';\nimport {Client} from '@modelcontextprotocol/sdk/client/index.js';\nimport {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';\nconst ROOT=process.argv[1],data=JSON.parse(readFileSync(process.argv[2],'utf8'));\nconst imp=async file=>import(pathToFileURL(file).href);\nconst mod=await imp(ROOT+'/deployment/durable-live-news-review-generated.mjs');\nconst built=mod.buildDurableRoutedOperationalEntrypoint(ROOT);\nconst {validateOwnerConfiguration,loadOwnerKey}=await imp(ROOT+'/deployment/owner-config.mjs');\nconst {takeStorageSecrets,materializeStorageKeys}=await imp(ROOT+'/deployment/storage-secret-bridge.mjs');\nconst {prepareOperationalStorage}=await imp(ROOT+'/deployment/operational-service-entry.mjs');\nconst {startUnifiedOwnerServer}=await imp(built.unifiedFile);\nconst config=validateOwnerConfiguration(data.input);\nconst secrets=takeStorageSecrets({\n JH_OWNER_STORAGE_SECRET:Buffer.alloc(32,17).toString('base64'),\n JH_LIFE_STORAGE_SECRET:Buffer.alloc(32,18).toString('base64')\n});\nconst files=materializeStorageKeys(config,secrets,data.keys);\nsecrets.owner.fill(0);secrets.life.fill(0);\nconst p=prepareOperationalStorage(config,files,{confirmation:'EXPLICIT_ONE_TIME',\n storageObservations:data.observations});\nconst key=loadOwnerKey(files.ownerKeyFile,config);\nlet running=null,client=null;\ntry{\n const cutover=mod.prepareOrVerifyDurableRelease({config,key,storageObservations:data.observations,\n  mode:mod.INITIAL_MODE});\n running=await startUnifiedOwnerServer({config,key,lifeStorage:p.lifeStorage,\n  storageObservations:data.observations,port:0,bindAddress:'127.0.0.1'});\n const base='http://127.0.0.1:'+running.port;\n const health=await fetch(base+'/health'),unauth=await fetch(base+'/mcp');\n assert.equal(health.status,200);assert.equal(unauth.status,401);\n client=new Client({name:'jh167-g6-durable-http-client',version:'0.6.0'},{capabilities:{}});\n await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),\n  {requestInit:{headers:{Authorization:'Bearer '+process.env.LIFE_HUB_TOKEN}}}));\n const list=await client.listTools();\n const expected=(process.env.JH_NEWS_FULLTEXT_REVIEW_ENABLED==='1' &&\n  process.env.JH_NEWS_FULLTEXT_CATALOG_SCOPE==='CI_SYNTHETIC_LOCAL_ONLY' &&\n  process.env.RENDER_SERVICE_ID===undefined && process.env.JH_OWNER_DEFER_LISTEN==='1') ||\n  (process.env.JH_DURABLE_RELEASE==='SERVE_READY_V1' &&\n   process.env.RENDER_SERVICE_ID==='srv-db0fjl2d0e5s73be114g' && process.env.JH_OWNER_DEFER_LISTEN==='1');\n const tools=['life_article_fulltext_read','life_guide13_catalog','life_guide13_plan',\n  'life_reservation_link_assistant','life_reservation_screen_guide',\n  'life_reservation_regional_handoff','life_reservation_provider_status',\n  'life_reservation_live_search'];\n const actual=list.tools.filter(x=>tools.includes(x.name));\n assert.equal(actual.length,expected?8:7);\n assert(actual.every(x=>x.annotations?.readOnlyHint===true));\n const news=actual.find(x=>x.name==='life_article_fulltext_read');\n assert.equal(!!news,expected);\n if(news)assert.equal(news.annotations?.readOnlyHint,true);\n // A real registered MCP handler must refuse any full-text claim without a signed device.\n if(news){\n const blocked=await client.callTool({name:'life_article_fulltext_read',\n  arguments:{article_url:'https://www.hani.co.kr/arti/society/society_general/1283889.html'}});\n const blockedText=blocked.content?.find(x=>x.type==='text')?.text||'';\n assert(!blockedText.includes('FULL_BODY_READY_FOR_SUMMARY'));\n assert(!blockedText.includes('FULL_ORIGINAL_BODY_VERIFIED'));\n }\n const reply=await client.callTool({name:'life_guide13_catalog',arguments:{}});\n assert.notEqual(reply.isError,true);\n const body=reply.content?.find(x=>x.type==='text')?.text;\n assert.equal(typeof body,'string');\n const result=JSON.parse(body);\n assert.equal(result.external_effect_status,'NOT_EXECUTED');\n assert.equal(result.ok,false);\n assert.equal(cutover.initializedNow,true);\n assert.equal(running.durableCircuitInstalled,true);\n assert.equal(running.lifeRuntimeInstalled,true);\n assert.equal(running.trustCreated,false);assert.equal(running.sessionCreated,false);\n console.log('JH167_G6_DURABLE_HTTP '+JSON.stringify({health:health.status,\n  noAuth:unauth.status,tools:actual.length,newsEnabled:!!news,readOnly:true,\n  noDeviceReason:result.code||null,durable:running.durableCircuitInstalled,\n  synthetic:true,phone:false,render:false}));\n}finally{\n try{await client?.close()}catch{}\n key.fill(0);\n try{await running?.close()}catch{}\n}\n";

const marker=' const list=await client.listTools();\n';
const insertion=[
 " const evid=list.tools.find(x=>x.name==='jh_evidence_search');",
 " const expectedEvidence=process.env.JH_EVIDENCE_SEARCH_ENABLED==='1'&&!!process.env.PERPLEXITY_API_KEY;",
 " assert.equal(!!evid,expectedEvidence,'EVIDENCE_TOOL_CATALOG_UNEXPECTED');",
 " if(evid){",
 "  assert.match(evid.title,/퍼비서/);",
 "  const reply=await client.callTool({name:'jh_evidence_search',arguments:{user_request:'이 논문을 요약해줘',query:'synthetic query no paid call'}});",
 "  assert.notEqual(reply.isError,true);",
 "  const answer=JSON.parse(reply.content.find(x=>x.type==='text').text);",
 "  assert.equal(answer.code,'EXPLICIT_EVIDENCE_REQUEST_REQUIRED');",
 " }",
 ""
].join('\n');
if(bootScript.split(marker).length!==2)throw Error('CURRENT_OWNER_HTTP_CATALOG_ANCHOR');
const probe=bootScript.replace(marker,marker+insertion);
const cases=[
 {name:'default OFF',env:{}},
 {name:'key only OFF',env:{PERPLEXITY_API_KEY:MOCK_KEY}},
 {name:'flag only OFF',env:{JH_EVIDENCE_SEARCH_ENABLED:'1'}},
 {name:'flag+key ON',env:{JH_EVIDENCE_SEARCH_ENABLED:'1',PERPLEXITY_API_KEY:MOCK_KEY}}
];
for(const c of cases)test('actual signed JH owner OAuth catalog '+c.name,{timeout:60000},()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'jh-evidence-http-'));
 fs.chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');
 fs.mkdirSync(mount,{mode:0o700});
 fs.mkdirSync(path.join(mount,'jh-pc-bootstrap'),{mode:0o700});
 const data=path.join(dir,'fixture.json');
 const input={
  version:1,serverOrigin:'https://jh-secure-bridge-fix4.onrender.com',
  catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
  googleWebClientId:'jh-evidence-synthetic.apps.googleusercontent.com',
  allowedPresenterClientIds:['jh-evidence-synthetic.apps.googleusercontent.com'],
  ownerSubject:'jh-evidence-synthetic-owner',ownerLabel:'Synthetic JH Evidence Owner',
  storageMount:mount,storageEpoch:'evidence_synthetic_20261105'
 };
 const observations={mountInfo:'1 0 8:1 / '+mount+' rw - ext4 /dev/synthetic rw',filesystemType:0xef53};
 fs.writeFileSync(data,JSON.stringify({input,observations,keys:path.join(dir,'keys')}),{mode:0o600});
 try{
  const r=spawnSync(process.execPath,['--input-type=module','-e',probe,ROOT,data],
   {cwd:path.resolve(ROOT,'..'),encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024,
     env:{PATH:process.env.PATH,
      LIFE_HUB_TOKEN:'G6_SYNTHETIC_TOKEN_LOCAL_ONLY_20261018',
      JH_OWNER_DEFER_LISTEN:'1',...c.env}});
  assert.equal(r.status,0,'synthetic owner boot '+c.name+'\n'+r.stderr+'\n'+r.stdout);
  const label='JH167_G6_DURABLE_HTTP ';
  const line=r.stdout.split('\n').find(x=>x.startsWith(label));
  assert(line,'no owner HTTP receipt');
  const proof=JSON.parse(line.slice(label.length));
  assert.equal(proof.health,200);
  assert.equal(proof.noAuth,401);
  assert.equal(proof.tools,7);
  assert.equal(proof.durable,true);
  assert.equal(proof.synthetic,true);
  assert.equal(proof.phone,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
