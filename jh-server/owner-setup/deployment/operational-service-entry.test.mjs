import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {validateOwnerConfiguration,loadOwnerKey,privateBytes,EXPECTED_ORIGIN,EXPECTED_CATALOG} from './owner-config.mjs';
import {takeStorageSecrets,materializeStorageKeys} from './storage-secret-bridge.mjs';
import {prepareOperationalStorage,validateOperationalEnvironment,INITIAL_STORAGE_POLICY} from './operational-service-entry.mjs';
import {startUnifiedOwnerServer} from './unified-service-entry.mjs';
import {contentParse} from '../server-continuation/life-content-wire.mjs';
import {preparePublishedStartup} from './published-service-entry.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(process.argv.includes('--fixture')){
 process.once('message',async x=>{
  try{
   const config=validateOwnerConfiguration(x.config),secrets=takeStorageSecrets({JH_OWNER_STORAGE_SECRET:x.owner,JH_LIFE_STORAGE_SECRET:x.life});
   let files;try{files=materializeStorageKeys(config,secrets,x.keyDirectory);}finally{secrets.owner.fill(0);secrets.life.fill(0);}
   await preparePublishedStartup();
   const p=prepareOperationalStorage(config,files,{confirmation:'EXPLICIT_ONE_TIME',storageObservations:x.observations});
   const key=loadOwnerKey(files.ownerKeyFile,config);let running;
   try{running=await startUnifiedOwnerServer({config,key,lifeStorage:p.lifeStorage,storageObservations:x.observations,port:0,bindAddress:'127.0.0.1'});}finally{key.fill(0);}
   process.send({ready:true,port:running.port,created:p.created,trustCreated:running.trustCreated,life:running.lifeRuntimeInstalled});
   process.once('message',async()=>{await running.close();process.send({closed:true});process.disconnect();});
  }catch(e){process.send({failed:true,code:e.code??e.message});process.exitCode=1;process.disconnect();}
 });
}else{
 function rig(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jh-operation-')),mount=path.join(dir,'mount');fs.mkdirSync(mount,{mode:0o700});
  const input={version:1,serverOrigin:EXPECTED_ORIGIN,catalogDigest:EXPECTED_CATALOG,googleWebClientId:'synthetic-web.apps.googleusercontent.com',allowedPresenterClientIds:['synthetic-web.apps.googleusercontent.com','synthetic-android.apps.googleusercontent.com'],ownerSubject:'synthetic-owner',ownerLabel:'Synthetic',storageMount:mount,storageEpoch:'synthetic-storage-epoch-v1'};
  const config=validateOwnerConfiguration(input),owner=randomBytes(32).toString('base64'),life=randomBytes(32).toString('base64');
  fs.mkdirSync(path.join(mount,'jh-pc-bootstrap'),{mode:0o700});
  const keyDirectory=path.join(dir,'keys'),observations={mountInfo:`1 0 0:1 / / rw - overlay overlay rw\n2 1 8:1 / ${mount} rw - ext4 /dev/test rw\n`,filesystemType:0xef53};
  const keys=(d=keyDirectory,o=owner,l=life)=>{const secrets=takeStorageSecrets({JH_OWNER_STORAGE_SECRET:o,JH_LIFE_STORAGE_SECRET:l});try{return materializeStorageKeys(config,secrets,d);}finally{secrets.owner.fill(0);secrets.life.fill(0);}};
  return {dir,mount,input,config,owner,life,keyDirectory,observations,keys,prepare:files=>prepareOperationalStorage(config,files,{confirmation:'EXPLICIT_ONE_TIME',storageObservations:observations}),close:()=>fs.rmSync(dir,{recursive:true,force:true})};
 }
 function scenario(name,fn){test(name,async()=>{const r=rig();try{await fn(r);}finally{r.close();}});}
 for(const v of [undefined,'','a'.repeat(31),'x '.repeat(30),'x'.repeat(513)])test('missing/invalid secret is rejected and removed: '+String(v).length,()=>{const env={JH_OWNER_STORAGE_SECRET:v,JH_LIFE_STORAGE_SECRET:'z'.repeat(43)};assert.throws(()=>takeStorageSecrets(env),/STORAGE_SECRET_PAIR_REQUIRED/);assert.deepEqual(env,{});});
 test('same operator values never become two differently labelled keys',()=>{assert.throws(()=>takeStorageSecrets({JH_OWNER_STORAGE_SECRET:'a'.repeat(43),JH_LIFE_STORAGE_SECRET:'a'.repeat(43)}),/MUST_DIFFER/);});
 scenario('two private 32-byte key files, not stored inside persistent state',r=>{const f=r.keys();for(const p of [f.ownerKeyFile,f.lifeKeyFile]){assert.equal(fs.statSync(p).size,32);assert.equal(fs.statSync(p).mode&0o777,0o600);assert(!p.startsWith(r.mount+'/'));}assert.equal(fs.statSync(r.keyDirectory).mode&0o777,0o700);assert.notDeepEqual(fs.readFileSync(f.ownerKeyFile),fs.readFileSync(f.lifeKeyFile));});
 scenario('unchanged restart reuses identical key bytes without rewriting',r=>{const f=r.keys(),a=fs.statSync(f.ownerKeyFile);assert.equal(r.keys().created,false);assert.equal(fs.statSync(f.ownerKeyFile).mtimeMs,a.mtimeMs);const next=r.keys(path.join(r.dir,'other-ephemeral-keys'));assert.deepEqual(fs.readFileSync(f.ownerKeyFile),fs.readFileSync(next.ownerKeyFile));assert.deepEqual(fs.readFileSync(f.lifeKeyFile),fs.readFileSync(next.lifeKeyFile));});
 scenario('changed secret cannot overwrite an existing key',r=>{const f=r.keys(),b=fs.readFileSync(f.ownerKeyFile);assert.throws(()=>r.keys(r.keyDirectory,randomBytes(32).toString('base64')),/CHANGED_REVIEW/);assert.deepEqual(fs.readFileSync(f.ownerKeyFile),b);});
 scenario('key directory on data volume is rejected',r=>assert.throws(()=>r.keys(path.join(r.mount,'keys')),/OUTSIDE_STATE_VOLUME/));
 scenario('symbolic key directory is rejected',r=>{fs.mkdirSync(path.join(r.dir,'target'),{mode:0o700});fs.symlinkSync('target',r.keyDirectory);assert.throws(()=>r.keys(),/PRIVATE_DIRECTORY/);assert.deepEqual(fs.readdirSync(path.join(r.dir,'target')),[]);});
 scenario('key creation interruption is preserved, not automatically repaired',r=>{r.keys();fs.writeFileSync(path.join(r.keyDirectory,'.creating'),'review',{mode:0o600});assert.throws(()=>r.keys(),/INTERRUPTED/);assert.equal(fs.readFileSync(path.join(r.keyDirectory,'.creating'),'utf8'),'review');});
 scenario('world-readable key is rejected',r=>{const f=r.keys();fs.chmodSync(f.ownerKeyFile,0o644);assert.throws(()=>r.keys(),/PERMISSIONS/);});
 scenario('missing explicit initialization has no database effects',r=>{const f=r.keys();assert.throws(()=>prepareOperationalStorage(r.config,f,{storageObservations:r.observations}),/EXPLICIT/);assert(!fs.existsSync(r.config.stateDir));});
 scenario('real temporary mount cannot pass production mount checks',r=>{const f=r.keys();assert.throws(()=>prepareOperationalStorage(r.config,f,{confirmation:'EXPLICIT_ONE_TIME'}),/DISTINCT_PERSISTENT_MOUNT/);assert(!fs.existsSync(r.config.stateDir));});
 scenario('existing arbitrary state is not treated as empty',r=>{const f=r.keys();fs.mkdirSync(r.config.stateDir,{mode:0o700});fs.writeFileSync(path.join(r.config.stateDir,'user-data'),'preserve');assert.throws(()=>r.prepare(f),/EXISTING_STORAGE/);assert.equal(fs.readFileSync(path.join(r.config.stateDir,'user-data'),'utf8'),'preserve');});
 scenario('both existing encrypted stores are provisioned with deny-all registry',r=>{const p=r.prepare(r.keys());assert.equal(p.created,true);assert.equal(p.trustCreated,false);assert.equal(p.workersStarted,0);for(const file of ['owner-intents.sqlite','trusted-devices.sqlite','runtime-lock.sqlite','life.sqlite'])assert(fs.statSync(path.join(r.config.stateDir,file)).size>0);const registry=contentParse(privateBytes(p.lifeStorage.registryFile,262144));assert.deepEqual(registry.registrations,[]);assert.deepEqual(p.lifeStorage.policy,INITIAL_STORAGE_POLICY);});
 scenario('second provisioning verifies, without resetting or rewriting registry',r=>{const f=r.keys(),p=r.prepare(f),a=fs.readFileSync(p.lifeStorage.registryFile),t=fs.statSync(p.lifeStorage.registryFile).mtimeMs;assert.equal(r.prepare(f).created,false);assert.deepEqual(fs.readFileSync(p.lifeStorage.registryFile),a);assert.equal(fs.statSync(p.lifeStorage.registryFile).mtimeMs,t);});
 scenario('keys recreated on next instance reject wrong secret against durable receipt',r=>{r.prepare(r.keys());const wrong=r.keys(path.join(r.dir,'new-keys'),randomBytes(32).toString('base64'));assert.throws(()=>r.prepare(wrong),/RECEIPT_OR_KEYS_MISMATCH/);});
 scenario('interrupted multi-store provisioning is not retried',r=>{const f=r.keys(),m=path.join(r.mount,'jh-pc-bootstrap/.operational-preparing');fs.writeFileSync(m,'review',{mode:0o600});assert.throws(()=>r.prepare(f),/PREPARATION_INTERRUPTED/);assert(!fs.existsSync(r.config.stateDir));assert.equal(fs.readFileSync(m,'utf8'),'review');});
 scenario('modified provisioning receipt is rejected',r=>{const f=r.keys();r.prepare(f);fs.writeFileSync(path.join(r.mount,'jh-pc-bootstrap/operational-ready.json'),'{}',{mode:0o600});assert.throws(()=>r.prepare(f),/RECEIPT_OR_KEYS_MISMATCH/);});
 scenario('missing registry after success does not recreate permissive state',r=>{const f=r.keys(),p=r.prepare(f);fs.unlinkSync(p.lifeStorage.registryFile);assert.throws(()=>r.prepare(f));assert(!fs.existsSync(p.lifeStorage.registryFile));});
 scenario('orphan owner stage is preserved',r=>{fs.mkdirSync(path.join(r.mount,'.jh-owner-stage-stopped'));assert.throws(()=>r.prepare(r.keys()),/EXISTING_STORAGE/);});
 const env={RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',JH_OPERATIONAL_START:'PREPARE_AND_SERVE_V1',JH_OPERATIONAL_ACCOUNT_DIGEST:'a'.repeat(64),JH_PC_OWNER_SETUP_ENABLED:'1',JH_PC_OWNER_SETUP_PLAN_FILE:'/var/data/jh-pc-bootstrap/plan.json'};
 test('explicit production mode accepted independently of secret values',()=>assert.equal(validateOperationalEnvironment(env),undefined));
 for(const key of Object.keys(env))test('absent '+key+' cannot select operational mode',()=>{const e={...env};delete e[key];assert.throws(()=>validateOperationalEnvironment(e));});
 for(const key of ['JH_OWNER_ENABLED','JH_LIFE_ENABLED','JH_OWNER_KEY_FILE','JH_LIFE_INITIALIZE'])test('legacy '+key+' is not silently overwritten',()=>assert.throws(()=>validateOperationalEnvironment({...env,[key]:'1'}),/EXISTING_SETTINGS/));
 test('invalid port rejected before provisioning',()=>assert.throws(()=>validateOperationalEnvironment({...env,PORT:'0'}),/LISTENER_CONFIGURATION/));
 scenario('real HTTP owner and Life host, killed restart, no automatic authority',async r=>{
  async function start(keyDirectory){
   const child=fork(fileURLToPath(import.meta.url),['--fixture'],{cwd:root,silent:true,env:{PATH:process.env.PATH,LIFE_HUB_TOKEN:'SYNTHETIC_ONLY_'.repeat(5)}});
   let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
   const response=once(child,'message');child.send({config:r.input,owner:r.owner,life:r.life,keyDirectory,observations:r.observations});
   const timer=setTimeout(()=>child.kill('SIGKILL'),8000);timer.unref();
   const [state]=await response;clearTimeout(timer);assert.equal(state.failed,undefined,JSON.stringify(state));
   return {child,state,logs:()=>log};
  }
  let a,b;
  try{
   a=await start(r.keyDirectory);assert(a.state.ready);assert(a.state.created);assert(a.state.life);assert.equal(a.state.trustCreated,false);
   const url='http://127.0.0.1:'+a.state.port;
   assert.equal((await fetch(url+'/health')).status,200);
   assert.equal((await fetch(url+'/mcp')).status,401);
   assert.equal((await fetch(url+'/jh/life/checkpoint/v1',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
   assert.equal((await fetch(url+'/device/owner-enrollment/begin',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
   const ended=once(a.child,'exit');a.child.kill('SIGKILL');await ended;
   b=await start(path.join(r.dir,'new-instance-keyfiles'));assert(b.state.ready);assert.equal(b.state.created,false);
   const endedB=once(b.child,'exit');b.child.send({close:true});await endedB;
   for(const logs of [a.logs(),b.logs()]){assert(!logs.includes(r.owner));assert(!logs.includes(r.life));assert(!logs.includes('synthetic-owner'));}
  }finally{for(const p of [a,b])if(p?.child.exitCode===null&&p.child.signalCode===null){const ended=once(p.child,'exit');p.child.kill('SIGKILL');await ended;}}
 });
}
