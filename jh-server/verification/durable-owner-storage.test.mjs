import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,existsSync,chmodSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateOwnerConfiguration,EXPECTED_ORIGIN,EXPECTED_CATALOG} from '../owner-setup/deployment/owner-config.mjs';
import {initializeOwnerStorage,acquireOwnerRuntimeLock} from '../owner-setup/deployment/owner-storage.mjs';
import {initializeOwnerDurableStorage,installOwnerBoundDurableCircuit} from '../owner-setup/deployment/durable-owner-storage.mjs';
import {createDurableNativeHooks} from '../owner-setup/deployment/durable-native-host.mjs';
import {buildOwnerBoundDurableCandidate} from '../owner-setup/deployment/durable-owner-startup-candidate.mjs';
const ROOT=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const KEY=Buffer.alloc(32,31),confirmation='EXPLICIT_ONE_TIME_NO_RETROSPECTIVE_CLAIM';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'jh-owner-circuit-'));chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');mkdirSync(mount,{mode:0o700});
 const input={version:1,serverOrigin:EXPECTED_ORIGIN,catalogDigest:EXPECTED_CATALOG,googleWebClientId:'synthetic-owner.apps.googleusercontent.com',allowedPresenterClientIds:['synthetic-owner.apps.googleusercontent.com'],ownerSubject:'synthetic-owner-subject',ownerLabel:'Synthetic owner',storageMount:mount,storageEpoch:'synthetic_epoch_20261010'};
 const config=validateOwnerConfiguration(input),storageObservations={mountInfo:'101 1 8:1 / '+mount+' rw,relatime - ext4 /dev/synthetic rw',filesystemType:0xef53};
 initializeOwnerStorage(config,KEY,storageObservations);
 const file=path.join(config.stateDir,'manual-circuit.sqlite');
 const runtime={httpServer:{listening:false},installDurableNativeCircuit56:opts=>{
  const hooks=createDurableNativeHooks(opts);return{installed:true,close:()=>hooks.close()};
 }};
 try{return fn({dir,mount,input,config,storageObservations,file,runtime});}finally{rmSync(dir,{recursive:true,force:true});}
}
test('normal install refuses missing journal and never initializes one',()=>fixture(f=>{
 assert.throws(()=>installOwnerBoundDurableCircuit(f.runtime,{...f,key:KEY}),/JOURNAL_MISSING_REVIEW_REQUIRED/);assert.equal(existsSync(f.file),false);
}));
test('explicit offline initialization and existing owner installation succeed without altering original DBs',()=>fixture(f=>{
 const files=['owner-intents.sqlite','trusted-devices.sqlite','volume-identity.json'];
 const before=files.map(n=>sha(readFileSync(path.join(f.config.stateDir,n))));
 const keyCopy=Buffer.from(KEY);
 const r=initializeOwnerDurableStorage({...f,key:KEY,confirmation});
 assert.equal(r.initialized,true);assert.equal(r.existingHistoryReconciled,false);assert.equal(r.actionApprovalGranted,false);
 const installed=installOwnerBoundDurableCircuit(f.runtime,{...f,key:KEY});assert.equal(installed.initialized,false);installed.close();
 assert.deepEqual(KEY,keyCopy);assert.deepEqual(files.map(n=>sha(readFileSync(path.join(f.config.stateDir,n)))),before);
}));
test('initialization requires explicit confirmation and never resets an existing journal',()=>fixture(f=>{
 assert.throws(()=>initializeOwnerDurableStorage({...f,key:KEY}),/DURABLE_INITIALIZATION_CONFIRMATION_REQUIRED/);
 initializeOwnerDurableStorage({...f,key:KEY,confirmation});const before=sha(readFileSync(f.file));
 assert.throws(()=>initializeOwnerDurableStorage({...f,key:KEY,confirmation}),/JOURNAL_EXISTS_NO_RESET/);assert.equal(sha(readFileSync(f.file)),before);
}));
test('invalid key and modified owner binding fail before installation',()=>fixture(f=>{
 assert.throws(()=>initializeOwnerDurableStorage({...f,key:Buffer.alloc(32,30),confirmation}),/VOLUME_IDENTITY_MISMATCH/);
 const other=validateOwnerConfiguration({...f.input,ownerSubject:'another-owner'});
 assert.throws(()=>initializeOwnerDurableStorage({...f,config:other,key:KEY,confirmation}),/VOLUME_IDENTITY_MISMATCH/);
 assert.throws(()=>initializeOwnerDurableStorage({...f,config:{...f.config},key:KEY,confirmation}),/VALIDATED_CONFIGURATION_REQUIRED/);
}));
test('in-use owner lock blocks first initialization',()=>fixture(f=>{
 const lock=acquireOwnerRuntimeLock(f.config);try{assert.throws(()=>initializeOwnerDurableStorage({...f,key:KEY,confirmation}),/OWNER_RUNTIME_ALREADY_RUNNING/);}finally{lock.close();}
 assert.equal(existsSync(f.file),false);
}));
test('world-readable state and wrong mount observations are refused',()=>fixture(f=>{
 chmodSync(f.config.stateDir,0o755);
 assert.throws(()=>initializeOwnerDurableStorage({...f,key:KEY,confirmation}),/STATE_DIRECTORY_INVALID/);chmodSync(f.config.stateDir,0o700);
 assert.throws(()=>initializeOwnerDurableStorage({...f,key:KEY,confirmation,storageObservations:{...f.storageObservations,filesystemType:0}}),/PERSISTENT_FILESYSTEM_OBSERVATION_MISMATCH/);
}));
test('ordinary startup refuses linked journal and preserves target bytes',()=>fixture(f=>{
 const outside=path.join(f.dir,'other');writeFileSync(outside,'untouched',{mode:0o600});symlinkSync(outside,f.file);
 assert.throws(()=>installOwnerBoundDurableCircuit(f.runtime,{...f,key:KEY}),/JOURNAL_FILE_UNSAFE/);assert.equal(readFileSync(outside,'utf8'),'untouched');
}));
test('a listening runtime cannot add or replace its journal host',()=>fixture(f=>{
 assert.throws(()=>installOwnerBoundDurableCircuit({...f.runtime,httpServer:{listening:true}},{...f,key:KEY}),/DURABLE_OWNER_PRELISTEN_REQUIRED/);
}));
function runOwnerChild(f,expectReady){
 const build=buildOwnerBoundDurableCandidate(ROOT);assert.equal(build.productionEnabled,false);
 const inputFile=path.join(f.dir,'input.json');writeFileSync(inputFile,JSON.stringify({input:f.input,storageObservations:f.storageObservations}),{mode:0o600});
 const script=[
  'import {readFileSync} from "node:fs";',
  'import {validateOwnerConfiguration} from '+JSON.stringify(pathToFileURL(path.join(ROOT,'deployment/owner-config.mjs')).href)+';',
  'import {startConfiguredOwnerServer} from '+JSON.stringify(pathToFileURL(build.file).href)+';',
  'const saved=JSON.parse(readFileSync(process.argv[1],"utf8"));let running;',
  'try{running=await startConfiguredOwnerServer({config:validateOwnerConfiguration(saved.input),key:Buffer.alloc(32,31),storageObservations:saved.storageObservations,runtimeMode:"unified",port:0,bindAddress:"127.0.0.1"});',
  'const base="http://127.0.0.1:"+running.port;const health=await fetch(base+"/health"),auth=await fetch(base+"/mcp");',
  'console.log("OWNER_CANDIDATE_RESULT "+JSON.stringify({ready:true,health:health.status,auth:auth.status,durable:running.durableCircuitInstalled,trust:running.trustCreated,session:running.sessionCreated}));',
  '}catch(e){console.log("OWNER_CANDIDATE_RESULT "+JSON.stringify({ready:false,code:e.code||e.message}));}finally{await running?.close();}'
 ].join('\n');
 const p=spawnSync(process.execPath,['--input-type=module','-e',script,inputFile],{cwd:path.join(ROOT,'..'),encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,LIFE_HUB_TOKEN:'SYNTHETIC_DURABLE_OWNER_STARTUP_TOKEN_20261010'}});
 assert.equal(p.status,0,p.stderr+'\n'+p.stdout);
 const line=p.stdout.split('\n').find(x=>x.startsWith('OWNER_CANDIDATE_RESULT '));assert.ok(line,p.stdout+p.stderr);
 const result=JSON.parse(line.slice('OWNER_CANDIDATE_RESULT '.length));assert.equal(result.ready,expectReady,JSON.stringify(result));return result;
}
test('real owner/trust startup installs durable host before accepting HTTP',()=>fixture(f=>{
 initializeOwnerDurableStorage({...f,key:KEY,confirmation});const r=runOwnerChild(f,true);
 assert.equal(r.health,200);assert.equal(r.auth,401);assert.equal(r.durable,true);assert.equal(r.trust,false);assert.equal(r.session,false);
}));
test('real owner startup fails closed without creating a missing journal',()=>fixture(f=>{
 const r=runOwnerChild(f,false);assert.equal(r.code,'JOURNAL_MISSING_REVIEW_REQUIRED');assert.equal(existsSync(f.file),false);
}));
