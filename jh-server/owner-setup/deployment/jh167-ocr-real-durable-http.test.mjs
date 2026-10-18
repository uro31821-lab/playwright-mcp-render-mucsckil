/** JH Fold8 OCR G6-compatible: ACTUAL Durable MCP loopback, synthetic identity only.
 * Covers MCP initialize/tools/list/tools/call and OAuth auth boundary.
 * Never calls Android, approves capture, starts OCR or uses operating secrets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildOcrCleanRestartRelease56} from './jh167-ocr-reviewed-published-entry.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const seven=['life_guide13_catalog','life_guide13_plan',
 'life_reservation_link_assistant','life_reservation_screen_guide',
 'life_reservation_regional_handoff','life_reservation_provider_status','life_reservation_live_search'];
const ocr='life_android_visual_ocr_review';
const bootScript=[
 "import assert from 'node:assert/strict';",
 "import {readFileSync} from 'node:fs';",
 "import {pathToFileURL} from 'node:url';",
 "import {Client} from '@modelcontextprotocol/sdk/client/index.js';",
 "import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';",
 "const ROOT=process.argv[1],data=JSON.parse(readFileSync(process.argv[2],'utf8'));",
 "const imp=async file=>import(pathToFileURL(file).href);",
 "const generated=await imp(ROOT+'/deployment/durable-live-clean-restart-ocr-generated.mjs');",
 "const built=generated.buildDurableRoutedOperationalEntrypoint(ROOT);",
 "const {validateOwnerConfiguration,loadOwnerKey}=await imp(ROOT+'/deployment/owner-config.mjs');",
 "const {takeStorageSecrets,materializeStorageKeys}=await imp(ROOT+'/deployment/storage-secret-bridge.mjs');",
 "const {prepareOperationalStorage}=await imp(ROOT+'/deployment/operational-service-entry.mjs');",
 "const {startUnifiedOwnerServer}=await imp(built.unifiedFile);",
 "const config=validateOwnerConfiguration(data.input);",
 "const secrets=takeStorageSecrets({JH_OWNER_STORAGE_SECRET:Buffer.alloc(32,17).toString('base64'),JH_LIFE_STORAGE_SECRET:Buffer.alloc(32,18).toString('base64')});",
 "const files=materializeStorageKeys(config,secrets,data.keys);",
 "secrets.owner.fill(0);secrets.life.fill(0);",
 "const p=prepareOperationalStorage(config,files,{confirmation:'EXPLICIT_ONE_TIME',storageObservations:data.observations});",
 "const key=loadOwnerKey(files.ownerKeyFile,config);",
 "let running=null,client=null;",
 "try{",
 " const cutover=generated.prepareOrVerifyDurableRelease({config,key,storageObservations:data.observations,mode:generated.INITIAL_MODE});",
 " running=await startUnifiedOwnerServer({config,key,lifeStorage:p.lifeStorage,storageObservations:data.observations,port:0,bindAddress:'127.0.0.1'});",
 " const base='http://127.0.0.1:'+running.port;",
 " const health=await fetch(base+'/health'),unauth=await fetch(base+'/mcp');",
 " assert.equal(health.status,200);assert.equal(unauth.status,401);",
 " client=new Client({name:'jh167-ocr-loopback',version:'0.6.0'},{capabilities:{}});",
 " await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+process.env.LIFE_HUB_TOKEN}}}));",
 " const all=await client.listTools();",
 " const names=data.seven.concat(data.ocr);",
 " const matching=all.tools.filter(t=>names.includes(t.name));",
 " assert.equal(matching.length,8,'seven guide tools plus one OCR reviewer');",
 " assert.equal(matching.filter(t=>t.name===data.ocr).length,1,'exactly one new reviewer');",
 " assert(matching.every(t=>t.annotations?.readOnlyHint===true),'all scoped tools read-only');",
 " assert(matching.every(t=>t.annotations?.destructiveHint===false),'none destructive');",
 " const reply=await client.callTool({name:data.ocr,arguments:{}});",
 " assert.notEqual(reply.isError,true,'expected structured fail-closed response, not MCP crash');",
 " const msg=reply.content?.find(x=>x.type==='text')?.text||'';",
 " const result=JSON.parse(msg);",
 " assert.equal(result.ok,false,'no phone -> OCR review cannot succeed');",
 " assert(!JSON.stringify(result).includes('screen_grant_token'));",
 " assert(!JSON.stringify(result).includes('reviewToken'));",
 " assert.equal(cutover.initializedNow,true);",
 " assert.equal(running.durableCircuitInstalled,true);",
 " assert.equal(running.trustCreated,false);",
 " console.log('JH167_OCR_DURABLE_MCP_HTTP '+JSON.stringify({health:200,noAuth:401,scopedTools:matching.length,ocrReviewOnly:true,withoutPhone:result.code||null,synthetic:true,operatingServer:false,android:false,capture:false}));",
 "}finally{",
 " try{await client?.close()}catch{}",
 " key.fill(0);",
 " try{await running?.close()}catch{}",
 "}"
].join('\n');
test('actual Durable Clean Restart opt-in: MCP authenticated tool list contains OCR reviewer, no device denied',{timeout:60000},()=>{
 const generated=buildOcrCleanRestartRelease56();
 assert.equal(generated.selfReferencesRewritten,3);
 const dir=fs.mkdtempSync(path.join(tmpdir(),'jh167-ocr-mcp-'));fs.chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');fs.mkdirSync(mount,{mode:0o700});
 fs.mkdirSync(path.join(mount,'jh-pc-bootstrap'),{mode:0o700});
 const data=path.join(dir,'fixture.json');
 const input={version:1,serverOrigin:'https://jh-secure-bridge-fix4.onrender.com',
  catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
  googleWebClientId:'jh167-ocr-synthetic.apps.googleusercontent.com',
  allowedPresenterClientIds:['jh167-ocr-synthetic.apps.googleusercontent.com'],
  ownerSubject:'synthetic-jh167-ocr',ownerLabel:'Synthetic JH167 OCR',
  storageMount:mount,storageEpoch:'synthetic_20261018_ocr'};
 const observations={mountInfo:'1 0 8:1 / '+mount+' rw - ext4 /dev/synthetic rw',filesystemType:0xef53};
 fs.writeFileSync(data,JSON.stringify({input,observations,keys:path.join(dir,'keys'),seven,ocr}),{mode:0o600});
 try{
  const x=spawnSync(process.execPath,['--input-type=module','-e',bootScript,ROOT,data],
   {cwd:path.resolve(ROOT,'..'),encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024,
    env:{PATH:process.env.PATH,LIFE_HUB_TOKEN:'JH167_OCR_SYNTHETIC_TOKEN_ONLY_20261018',JH_OWNER_DEFER_LISTEN:'1',JH_FOLD8_OCR_REVIEW_ENABLED:'1'}});
  assert.equal(x.status,0,'OCR Durable synthetic boot failed: '+x.status+'\n'+x.stderr+'\n'+x.stdout);
  const prefix='JH167_OCR_DURABLE_MCP_HTTP ';
  const line=x.stdout.split('\n').find(t=>t.startsWith(prefix));
  assert.ok(line,'missing synthetic attestation');
  const proof=JSON.parse(line.slice(prefix.length));
  assert.deepEqual([proof.health,proof.noAuth,proof.scopedTools,proof.synthetic,proof.operatingServer,proof.android,proof.capture],
   [200,401,8,true,false,false,false]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
