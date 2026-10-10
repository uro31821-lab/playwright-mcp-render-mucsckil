import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,hkdfSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,chmodSync,readFileSync,writeFileSync,rmSync,existsSync,unlinkSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateOwnerConfiguration,EXPECTED_ORIGIN,EXPECTED_CATALOG} from '../owner-setup/deployment/owner-config.mjs';
import {initializeOwnerStorage,acquireOwnerRuntimeLock} from '../owner-setup/deployment/owner-storage.mjs';
import {initializeOwnerDurableStorage} from '../owner-setup/deployment/durable-owner-storage.mjs';
import {prepareDurableCutover,verifyDurableCutover,installCutoverReadyCircuit} from '../owner-setup/deployment/durable-cutover.mjs';
import {buildCutoverStartupCandidate} from '../owner-setup/deployment/durable-cutover-startup-candidate.mjs';
const ROOT=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const KEY=Buffer.alloc(32,31),confirmation='EXPLICIT_OFFLINE_CUTOVER_PRESERVE_UNKNOWN_HISTORY';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'jh-cutover-'));chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');mkdirSync(mount,{mode:0o700});
 const input={version:1,serverOrigin:EXPECTED_ORIGIN,catalogDigest:EXPECTED_CATALOG,googleWebClientId:'synthetic-owner.apps.googleusercontent.com',allowedPresenterClientIds:['synthetic-owner.apps.googleusercontent.com'],ownerSubject:'synthetic-cutover-owner',ownerLabel:'Synthetic cutover owner',storageMount:mount,storageEpoch:'synthetic_cutover_20261010'};
 const config=validateOwnerConfiguration(input),storageObservations={mountInfo:'101 1 8:1 / '+mount+' rw,relatime - ext4 /dev/synthetic rw',filesystemType:0xef53};
 initializeOwnerStorage(config,KEY,storageObservations);
 const file=path.join(config.stateDir,'manual-circuit.sqlite'),ready=path.join(config.stateDir,'manual-circuit-ready.json'),marker=path.join(config.stateDir,'.manual-circuit-preparing');
 const params={config,key:KEY,storageObservations,confirmation};
 try{return fn({dir,mount,input,config,storageObservations,file,ready,marker,params})}finally{rmSync(dir,{recursive:true,force:true})}
}
function seedLegacy(f){
 const db=new DatabaseSync(path.join(f.config.stateDir,'trusted-devices.sqlite'));
 try{
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
  db.prepare('INSERT INTO trusts (id,owner,device,server,catalog,spki,key_digest,created,expires,revoked,enrollment) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('fixture-trust-not-actual',sha('owner'),sha('device'),sha('server'),sha('catalog'),'synthetic-spki-not-used',sha('key'),1700000000000,1900000000000,null,'fixture-enrollment-not-actual');
  for(let i=0;i<56;i++)db.prepare('INSERT INTO trusted_dispatches VALUES(?,?,?)').run(sha('legacy-job-'+i),'fixture-trust-not-actual',1700000000000+i);
  db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
 }finally{db.close()}
}
function history(f){
 const db=new DatabaseSync(path.join(f.config.stateDir,'trusted-devices.sqlite'),{readOnly:true});
 try{return {rows:db.prepare('SELECT * FROM trusted_dispatches ORDER BY job_digest').all(),receipts:db.prepare('SELECT * FROM trusted_dispatch_receipts ORDER BY job_digest').all()}}finally{db.close()}
}
test('verification before first cutover cannot initialize or claim history reconciled',()=>fixture(f=>{
 assert.throws(()=>verifyDurableCutover(f.params),/CUTOVER_RECEIPT_REQUIRED/);assert.equal(existsSync(f.file),false);
}));
test('first preparation requires explicit offline confirmation',()=>fixture(f=>{
 assert.throws(()=>prepareDurableCutover({...f.params,confirmation:undefined}),/CUTOVER_CONFIRMATION_REQUIRED/);
 assert.equal(existsSync(f.file),false);assert.equal(existsSync(f.marker),false);
}));
test('56 legacy unknown dispatches are preserved and never copied as completed new work',()=>fixture(f=>{
 seedLegacy(f);const before=history(f);
 const protectedFiles=['owner-intents.sqlite','trusted-devices.sqlite','volume-identity.json'];
 const hashes=protectedFiles.map(n=>sha(readFileSync(path.join(f.config.stateDir,n))));
 const r=prepareDurableCutover(f.params);
 assert.equal(r.prepared,true);assert.equal(r.legacyTrackedAtCutover,56);assert.equal(r.legacyUnresolvedAtCutover,56);
 assert.equal(r.existingHistoryReconciled,false);assert.equal(r.manualHistory,'UNKNOWN_NOT_IMPORTED');
 assert.equal(r.actionApprovalGranted,false);assert.equal(r.sessionCreated,false);
 assert.deepEqual(history(f),before);assert.deepEqual(protectedFiles.map(n=>sha(readFileSync(path.join(f.config.stateDir,n)))),hashes);
 const db=new DatabaseSync(f.file,{readOnly:true});try{assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,0)}finally{db.close()}
 assert.equal(readFileSync(f.ready).includes('fixture-trust-not-actual'),false);
 assert.equal(verifyDurableCutover(f.params).ready,true);assert.equal(existsSync(f.marker),false);
}));
test('an active owner runtime prevents initial cutover',()=>fixture(f=>{
 const lock=acquireOwnerRuntimeLock(f.config);
 try{assert.throws(()=>prepareDurableCutover(f.params),/OWNER_RUNTIME_ALREADY_RUNNING/)}finally{lock.close()}
 assert.equal(existsSync(f.file),false);assert.equal(existsSync(f.marker),false);
}));
test('repeating first preparation never erases an existing journal',()=>fixture(f=>{
 prepareDurableCutover(f.params);const before=sha(readFileSync(f.file)),proof=readFileSync(f.ready,'utf8');
 assert.throws(()=>prepareDurableCutover(f.params),/CUTOVER_EXISTING_STATE_NO_RESET/);
 assert.equal(sha(readFileSync(f.file)),before);assert.equal(readFileSync(f.ready,'utf8'),proof);
}));
test('interrupted marker fails closed and is not automatically deleted',()=>fixture(f=>{
 writeFileSync(f.marker,'interrupted synthetic preparation',{mode:0o600});
 assert.throws(()=>prepareDurableCutover(f.params),/CUTOVER_INTERRUPTED_REVIEW_REQUIRED/);
 assert.throws(()=>verifyDurableCutover(f.params),/CUTOVER_INTERRUPTED_REVIEW_REQUIRED/);
 assert.equal(readFileSync(f.marker,'utf8'),'interrupted synthetic preparation');assert.equal(existsSync(f.file),false);
}));
test('a legacy initialized journal without a cutover receipt cannot be silently adopted',()=>fixture(f=>{
 initializeOwnerDurableStorage({...f.params,confirmation:'EXPLICIT_ONE_TIME_NO_RETROSPECTIVE_CLAIM'});
 assert.throws(()=>verifyDurableCutover(f.params),/CUTOVER_RECEIPT_REQUIRED/);
 assert.throws(()=>prepareDurableCutover(f.params),/CUTOVER_EXISTING_STATE_NO_RESET/);
}));
test('changed historical count fails receipt authentication before installation',()=>fixture(f=>{
 prepareDurableCutover(f.params);const r=JSON.parse(readFileSync(f.ready,'utf8'));r.payload.legacy.tracked++;
 writeFileSync(f.ready,JSON.stringify(r),{mode:0o600});let called=false;
 const runtime={httpServer:{listening:false},installDurableNativeCircuit56(){called=true}};
 assert.throws(()=>installCutoverReadyCircuit(runtime,f.params),/CUTOVER_RECEIPT_AUTH_FAILED/);assert.equal(called,false);
}));
test('replacement journal generation cannot reuse an old ready receipt',()=>fixture(f=>{
 prepareDurableCutover(f.params);
 const db=new DatabaseSync(f.file);try{db.prepare('UPDATE circuit_meta SET v=? WHERE k=?').run('0'.repeat(32),'cutover_generation')}finally{db.close()}
 assert.throws(()=>verifyDurableCutover(f.params),/CUTOVER_JOURNAL_GENERATION_MISMATCH/);
}));
test('missing journal is never recreated from ready metadata',()=>fixture(f=>{
 prepareDurableCutover(f.params);unlinkSync(f.file);
 assert.throws(()=>verifyDurableCutover(f.params),/JOURNAL_MISSING_REVIEW_REQUIRED/);assert.equal(existsSync(f.file),false);
}));
test('wrong key or owner fails before a cutover record is written',()=>fixture(f=>{
 assert.throws(()=>prepareDurableCutover({...f.params,key:Buffer.alloc(32,30)}),/VOLUME_IDENTITY_MISMATCH/);
 const other=validateOwnerConfiguration({...f.input,ownerSubject:'different-fixture-owner'});
 assert.throws(()=>prepareDurableCutover({...f.params,config:other}),/VOLUME_IDENTITY_MISMATCH/);
 assert.equal(existsSync(f.ready),false);
}));
test('linked ready receipt is rejected without altering its target',()=>fixture(f=>{
 prepareDurableCutover(f.params);const target=path.join(f.dir,'external');writeFileSync(target,readFileSync(f.ready),{mode:0o600});
 unlinkSync(f.ready);symlinkSync(target,f.ready);const before=sha(readFileSync(target));
 assert.throws(()=>verifyDurableCutover(f.params),/CUTOVER_RECEIPT_INVALID/);assert.equal(sha(readFileSync(target)),before);
}));
test('later legitimate legacy records do not rewrite the historical cutover boundary',()=>fixture(f=>{
 seedLegacy(f);prepareDurableCutover(f.params);
 const db=new DatabaseSync(path.join(f.config.stateDir,'trusted-devices.sqlite'));
 try{db.prepare('INSERT INTO trusted_dispatches VALUES(?,?,?)').run(sha('post-cutover-legacy-job'),'fixture-trust-not-actual',1800000000000)}finally{db.close()}
 const r=verifyDurableCutover(f.params);assert.equal(r.legacyTrackedAtCutover,56);assert.equal(history(f).rows.length,57);
 assert.equal(r.existingHistoryReconciled,false);
}));
function startChild(f){
 const build=buildCutoverStartupCandidate(ROOT);assert.equal(build.productionEnabled,false);
 const input=path.join(f.dir,'fixture.json');writeFileSync(input,JSON.stringify({input:f.input,storageObservations:f.storageObservations}),{mode:0o600});
 const script=[
  'import {readFileSync} from "node:fs";',
  'import {validateOwnerConfiguration} from '+JSON.stringify(pathToFileURL(path.join(ROOT,'deployment/owner-config.mjs')).href)+';',
  'import {startConfiguredOwnerServer} from '+JSON.stringify(pathToFileURL(build.file).href)+';',
  'const f=JSON.parse(readFileSync(process.argv[1],"utf8"));let r;',
  'try{r=await startConfiguredOwnerServer({config:validateOwnerConfiguration(f.input),key:Buffer.alloc(32,31),storageObservations:f.storageObservations,runtimeMode:"unified",port:0,bindAddress:"127.0.0.1"});',
  'const base="http://127.0.0.1:"+r.port;console.log("CUTOVER_CHILD "+JSON.stringify({ready:true,health:(await fetch(base+"/health")).status,auth:(await fetch(base+"/mcp")).status,durable:r.durableCircuitInstalled,session:r.sessionCreated}));',
  '}catch(e){console.log("CUTOVER_CHILD "+JSON.stringify({ready:false,code:e.code||e.message}));}finally{await r?.close();}'
 ].join('\n');
 const p=spawnSync(process.execPath,['--input-type=module','-e',script,input],{cwd:path.join(ROOT,'..'),encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,LIFE_HUB_TOKEN:'SYNTHETIC_CUTOVER_OWNER_HTTP_TEST_20261010'}});
 assert.equal(p.status,0,p.stderr+'\n'+p.stdout);
 const line=p.stdout.split('\n').find(x=>x.startsWith('CUTOVER_CHILD '));assert.ok(line,p.stderr+'\n'+p.stdout);
 return JSON.parse(line.slice('CUTOVER_CHILD '.length));
}
test('real owner startup serves only after signed cutover verification',()=>fixture(f=>{
 seedLegacy(f);prepareDurableCutover(f.params);const r=startChild(f);
 assert.deepEqual(r,{ready:true,health:200,auth:401,durable:true,session:false});assert.equal(history(f).rows.length,56);
}));
test('real owner startup rejects old empty journal without generation receipt',()=>fixture(f=>{
 initializeOwnerDurableStorage({...f.params,confirmation:'EXPLICIT_ONE_TIME_NO_RETROSPECTIVE_CLAIM'});
 const r=startChild(f);assert.equal(r.ready,false);assert.equal(r.code,'CUTOVER_RECEIPT_REQUIRED');assert.equal(existsSync(f.ready),false);
}));
