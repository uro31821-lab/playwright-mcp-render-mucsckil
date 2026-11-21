import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chooseJH228CameraV2Startup} from './jh228-camera-v2-candidate-entry.mjs';
import {patchJH228CameraV2Runtime,patchJH228ReviewedRelease,buildJH228ReviewedRelease} from './jh228-camera-v2-durable-overlay.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
const fixture=[
'const SECURE56_TOOL_CATALOG_DIGEST="a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1";',
'const secureStates56=new Map();','function active56(deviceId){return secureStates56.get(deviceId);}',
'function seen56(set,nonce){return !set.has(nonce)}','function sessionDigest56(x){return x}',
'const httpServer=createServer(async(req,res)=>{','  const url=new URL(req.url||"/","http://localhost");','});',
'if(process.env.JH_OWNER_DEFER_LISTEN!=="1")throw Error("DURABLE_HOST_BOOTSTRAP_REQUIRED");',
'x'.repeat(11000)
].join('\n');
test('generated Secure56 overlay only adds an authenticated one-use GET branch',()=>{
 const result=patchJH228CameraV2Runtime(fixture);
 assert.equal(result.split('await serveStagedJpeg').length,2);
 assert.match(result,/seen56\(a.seenFrame,nonce\)/);
 assert.match(result,/DURABLE_HOST_BOOTSTRAP_REQUIRED/);
 assert.throws(()=>patchJH228CameraV2Runtime(result),/JH228_/);
});
test('modified Secure56 source identity fails closed',()=>{
 for(const marker of ['const secureStates56=new Map();','function seen56(set,nonce){',
 'if(process.env.JH_OWNER_DEFER_LISTEN!=="1")throw Error("DURABLE_HOST_BOOTSTRAP_REQUIRED");',
 'const httpServer=createServer(async(req,res)=>{','function sessionDigest56(x){'])
  assert.throws(()=>patchJH228CameraV2Runtime(fixture.replace(marker,'CORRUPTED')),/JH228_/);
});
test('exact reviewed release generates a new candidate without starting HTTP',()=>{
 const built=buildJH228ReviewedRelease();
 const contents=readFileSync(built.file,'utf8');
 assert.equal(sha(contents),built.sha256);
 assert.match(contents,/patchJH228CameraV2Runtime\(patchJH167OperationalArticleReview56/);
 assert.match(contents,/\.\/durable-live-news-review-jh228-generated\.mjs/);
 assert.doesNotMatch(contents,/\.\/durable-live-news-review-generated\.mjs/);
 assert.equal(built.listenStarted,false);
 assert.throws(()=>patchJH228ReviewedRelease(contents),/JH228_/);
});
test('real generated durable runtime preserves original listener fence',async()=>{
 const built=buildJH228ReviewedRelease();
 const release=await import(pathToFileURL(built.file).href+'?stage='+built.sha256);
 const candidate=release.buildDurableRoutedRuntime(path.resolve(here,'..'));
 const src=readFileSync(candidate.file,'utf8');
 assert.equal(sha(src),candidate.candidateSha256);
 assert.match(src,/jh228CameraStageVerify56/);
 assert.match(src,/serveStagedJpeg/);
 assert.match(src,/DURABLE_HOST_BOOTSTRAP_REQUIRED/);
 assert.equal(candidate.productionEnabled,false);
 const syntax=spawnSync(process.execPath,['--check',candidate.file],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});

test('JH228 startup remains disabled until deliberate verified host E2E opt-in',()=>{
 assert.equal(chooseJH228CameraV2Startup({}),'original');
 const env={JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE:'EXPLICIT_JH228_CAMERA_V2_STAGE_OPERATOR_V1',
  JH_DURABLE_RELEASE:'SERVE_READY_V1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',
  JH228_CAMERA_V2_UPSTREAM_E2E_GATE:'TRUSTED_HOST_PORTS_AND_DEVICE_VERIFIED_V1'};
 assert.equal(chooseJH228CameraV2Startup(env),'jh228-candidate');
 for(const key of ['JH_DURABLE_RELEASE','RENDER_SERVICE_ID','JH228_CAMERA_V2_UPSTREAM_E2E_GATE']){
  const bad={...env};delete bad[key];assert.throws(()=>chooseJH228CameraV2Startup(bad),/JH228_/);
 }
 for(const key of ['JH_PENDING_APPROVAL_OPERATOR_ENABLE','JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE','JH_OWNER_DEFER_LISTEN'])
  assert.throws(()=>chooseJH228CameraV2Startup({...env,[key]:'1'}),/JH228_/);
 assert.throws(()=>chooseJH228CameraV2Startup({...env,JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE:'invalid'}),/JH228_/);
});
