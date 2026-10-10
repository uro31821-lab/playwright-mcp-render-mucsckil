import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateOwnerConfiguration,EXPECTED_ORIGIN,EXPECTED_CATALOG} from '../owner-setup/deployment/owner-config.mjs';
import {initializeOwnerStorage,acquireOwnerRuntimeLock} from '../owner-setup/deployment/owner-storage.mjs';
import {prepareOrVerifyDurableRelease,buildDurableOperationalEntrypoint,validateDurableReleaseMode,INITIAL_MODE,READY_MODE} from '../owner-setup/deployment/durable-live-release.mjs';
const ROOT=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const KEY=Buffer.alloc(32,29),sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(tmpdir(),'jh-live-release-'));fs.chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');fs.mkdirSync(mount,{mode:0o700});
 const input={version:1,serverOrigin:EXPECTED_ORIGIN,catalogDigest:EXPECTED_CATALOG,googleWebClientId:'synthetic-release.apps.googleusercontent.com',allowedPresenterClientIds:['synthetic-release.apps.googleusercontent.com'],ownerSubject:'synthetic-release-owner',ownerLabel:'Test owner',storageMount:mount,storageEpoch:'synthetic_release_20261010'};
 const config=validateOwnerConfiguration(input),storageObservations={mountInfo:'101 1 8:1 / '+mount+' rw - ext4 /dev/synthetic rw',filesystemType:0xef53};
 initializeOwnerStorage(config,KEY,storageObservations);
 const f={dir,mount,input,config,key:KEY,storageObservations,file:path.join(config.stateDir,'manual-circuit.sqlite')};
 try{return fn(f)}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('only explicit first-activation and verify-only modes accepted',()=>{
 for(const v of [undefined,null,'','yes','auto'])assert.throws(()=>validateDurableReleaseMode(v),/DURABLE_RELEASE_MODE_REQUIRED/);
 assert.equal(validateDurableReleaseMode(INITIAL_MODE),INITIAL_MODE);assert.equal(validateDurableReleaseMode(READY_MODE),READY_MODE);
});
test('ordinary release start cannot initialize missing history',()=>fixture(f=>{
 assert.throws(()=>prepareOrVerifyDurableRelease({...f,mode:READY_MODE}),/CUTOVER_RECEIPT_REQUIRED/);assert.equal(fs.existsSync(f.file),false);
}));
test('explicit first activation preserves old identity and original databases',()=>fixture(f=>{
 const names=['trusted-devices.sqlite','owner-intents.sqlite','volume-identity.json'];
 const before=names.map(n=>sha(fs.readFileSync(path.join(f.config.stateDir,n))));
 const result=prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE});
 assert.equal(result.initializedNow,true);assert.equal(result.ready,true);assert.equal(result.existingHistoryReconciled,false);
 assert.deepEqual(names.map(n=>sha(fs.readFileSync(path.join(f.config.stateDir,n)))),before);
 const state=prepareOrVerifyDurableRelease({...f,mode:READY_MODE});assert.equal(state.initializedNow,false);assert.equal(state.activationId,result.activationId);
}));
test('repeating operator mode verifies same generation, never resets it',()=>fixture(f=>{
 const a=prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE}),b=prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE});
 assert.equal(b.initializedNow,false);assert.equal(b.activationId,a.activationId);
}));
test('lost journal with ready receipt fails both modes',()=>fixture(f=>{
 prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE});fs.unlinkSync(f.file);
 for(const mode of [INITIAL_MODE,READY_MODE])assert.throws(()=>prepareOrVerifyDurableRelease({...f,mode}),/JOURNAL_MISSING_REVIEW_REQUIRED/);
 assert.equal(fs.existsSync(f.file),false);
}));
test('orphan journal and interrupted preparation are never overwritten',()=>fixture(f=>{
 fs.writeFileSync(f.file,'preserved',{mode:0o600});
 assert.throws(()=>prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE}),/DURABLE_EXISTING_STATE_REVIEW_REQUIRED/);
 assert.equal(fs.readFileSync(f.file,'utf8'),'preserved');
 fs.writeFileSync(path.join(f.config.stateDir,'.manual-circuit-preparing'),'interrupted',{mode:0o600});
 assert.throws(()=>prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE}),/CUTOVER_INTERRUPTED_REVIEW_REQUIRED/);
}));
test('wrong owner key and a live owner lock block first preparation',()=>fixture(f=>{
 assert.throws(()=>prepareOrVerifyDurableRelease({...f,key:Buffer.alloc(32,28),mode:INITIAL_MODE}),/VOLUME_IDENTITY_MISMATCH/);
 const lock=acquireOwnerRuntimeLock(f.config);
 try{assert.throws(()=>prepareOrVerifyDurableRelease({...f,mode:INITIAL_MODE}),/OWNER_RUNTIME_ALREADY_RUNNING/)}finally{lock.close()}
 assert.equal(fs.existsSync(f.file),false);
}));
test('generated production entry is syntactically valid with exact preserved composition',()=>{
 const b=buildDurableOperationalEntrypoint(ROOT);assert.equal(b.exactEdits,5);
 for(const f of [b.file,b.ownerFile,b.runtimeFile,path.join(ROOT,'deployment/unified-service-durable-live.mjs')])execFileSync(process.execPath,['--check',f]);
 const body=fs.readFileSync(b.file,'utf8');
 assert.ok(body.includes('validateOperationalEnvironment(env);'));
 assert.ok(body.includes('config.accountDigest!==env.JH_OPERATIONAL_ACCOUNT_DIGEST'));
 assert.ok(body.indexOf('prepareOrVerifyDurableRelease({config,key')<body.indexOf('running=await startUnifiedOwnerServer'));
 assert.ok(body.includes('JH_DURABLE_RELEASE_READY'));
});
test('real owner, Life and cutover hosts start in initial then verify-only mode',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'jh-live-composition-'));fs.chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');fs.mkdirSync(mount,{mode:0o700});fs.mkdirSync(path.join(mount,'jh-pc-bootstrap'),{mode:0o700});
 const input={version:1,serverOrigin:EXPECTED_ORIGIN,catalogDigest:EXPECTED_CATALOG,googleWebClientId:'synthetic-live.apps.googleusercontent.com',allowedPresenterClientIds:['synthetic-live.apps.googleusercontent.com'],ownerSubject:'synthetic-live-owner',ownerLabel:'Test',storageMount:mount,storageEpoch:'synthetic_live_epoch_20261010'};
 const observations={mountInfo:'1 0 8:1 / '+mount+' rw - ext4 /dev/synthetic rw',filesystemType:0xef53};
 const data=path.join(dir,'test.json');fs.writeFileSync(data,JSON.stringify({input,observations,keys:path.join(dir,'keys')}),{mode:0o600});
 const b=buildDurableOperationalEntrypoint(ROOT);
 const url=n=>JSON.stringify(pathToFileURL(path.join(ROOT,'deployment',n)).href);
 const script=[
  'import {readFileSync} from "node:fs";',
  'import {validateOwnerConfiguration,loadOwnerKey} from '+url('owner-config.mjs')+';',
  'import {takeStorageSecrets,materializeStorageKeys} from '+url('storage-secret-bridge.mjs')+';',
  'import {prepareOperationalStorage} from '+url('operational-service-entry.mjs')+';',
  'import {prepareOrVerifyDurableRelease} from '+url('durable-live-release.mjs')+';',
  'import {startUnifiedOwnerServer} from '+url('unified-service-durable-live.mjs')+';',
  'const d=JSON.parse(readFileSync(process.argv[1],"utf8")),config=validateOwnerConfiguration(d.input);',
  'const secrets=takeStorageSecrets({JH_OWNER_STORAGE_SECRET:Buffer.alloc(32,17).toString("base64"),JH_LIFE_STORAGE_SECRET:Buffer.alloc(32,18).toString("base64")});',
  'const files=materializeStorageKeys(config,secrets,d.keys);secrets.owner.fill(0);secrets.life.fill(0);',
  'const p=prepareOperationalStorage(config,files,{confirmation:"EXPLICIT_ONE_TIME",storageObservations:d.observations});',
  'const key=loadOwnerKey(files.ownerKeyFile,config);let running;',
  'try{const cutover=prepareOrVerifyDurableRelease({config,key,storageObservations:d.observations,mode:process.argv[2]});',
  'running=await startUnifiedOwnerServer({config,key,lifeStorage:p.lifeStorage,storageObservations:d.observations,port:0,bindAddress:"127.0.0.1"});',
  'const origin="http://127.0.0.1:"+running.port;const health=await fetch(origin+"/health"),auth=await fetch(origin+"/mcp");',
  'console.log("LIVE_RELEASE_TEST "+JSON.stringify({health:health.status,auth:auth.status,initialized:cutover.initializedNow,durable:running.durableCircuitInstalled,life:running.lifeRuntimeInstalled,trust:running.trustCreated,session:running.sessionCreated}));',
  '}finally{key.fill(0);await running?.close();}'
 ].join('\n');
 try{
  for(const mode of [INITIAL_MODE,READY_MODE]){
   const p=spawnSync(process.execPath,['--input-type=module','-e',script,data,mode],{cwd:path.dirname(ROOT),encoding:'utf8',timeout:25000,env:{PATH:process.env.PATH,LIFE_HUB_TOKEN:'SYNTHETIC_LIVE_DURABLE_TEST_TOKEN_20261010'}});
   assert.equal(p.status,0,p.stderr+'\n'+p.stdout);const line=p.stdout.split('\n').find(x=>x.startsWith('LIVE_RELEASE_TEST '));assert.ok(line,p.stdout);
   const r=JSON.parse(line.slice('LIVE_RELEASE_TEST '.length));assert.deepEqual(r,{health:200,auth:401,initialized:mode===INITIAL_MODE,durable:true,life:true,trust:false,session:false});
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
