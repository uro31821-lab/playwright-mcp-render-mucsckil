/** Real TLS/SQLite/production Kotlin core, distinct JVM coordinators and server SIGKILLs.
 * Only provider replies, worker principals and source grants are synthetic test fixtures. */
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {contentCanonical as canonical} from '../server-continuation/life-content-wire.mjs';
const jar=resolve(process.argv[2]),evidence=process.argv[3]?resolve(process.argv[3]):null;
const dir=mkdtempSync(join(tmpdir(),'jh-workers-tls-')),key=randomBytes(32),owner='a'.repeat(64),serverDigest='c'.repeat(64);
const conf={databasePath:join(dir,'state.db'),key:key.toString('hex'),owner,serverDigest,tlsKey:join(dir,'leaf.key'),tlsCert:join(dir,'leaf.pem'),offset:0};
const policy={maxActiveWorkflows:8,maxParallelTasks:2,maxTaskStarts:3,leaseMillis:120000,runtimeMillis:600000};
let active=null,failure=null;const children=new Set(),checks=[],stats=[];
const exec=(bin,args)=>execFileSync(bin,args,{stdio:['pipe','pipe','pipe'],timeout:20000});
const descriptions={};for(const kind of ['memory','join','double'])descriptions[kind]=JSON.parse(execFileSync('java',['-cp',jar,'com.koreanlifehub.bridge.LifeWorkerTlsProbe'],{input:canonical({mode:'describe',kind})+'\n',encoding:'utf8',timeout:10000}).trim());
async function start(){
 const p=spawn(process.execPath,[new URL('./worker-server-fixture.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
 let err='';p.stderr.on('data',b=>err+=b);const ended=new Promise(ok=>p.once('exit',(code,signal)=>ok({code,signal,err})));
 const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();p.stdin.write(JSON.stringify(conf)+'\n');
 const ready=await lines.next();if(ready.done)throw Error('fixture_failed '+err);const x=JSON.parse(ready.value);assert.equal(x.event,'ready');
 conf.port=x.port;active={p,lines,ended,origin:'https://localhost:'+x.port};
}
async function cmd(x){active.p.stdin.write(JSON.stringify(x)+'\n');const line=await active.lines.next();if(line.done)throw Error('server_exited');return JSON.parse(line.value);}
async function stop(kill=false){if(!active)return;const a=active;stats.push(await cmd({cmd:'stats'}));if(kill)a.p.kill('SIGKILL');else{await cmd({cmd:'close'});a.p.stdin.end();}const e=await a.ended;active=null;if(!kill)assert.equal(e.code,0,e.err);}
async function begin(mode,workflow,kind='memory',who=1){
 const token=randomBytes(24).toString('hex'),worker=String(who).repeat(64),expiresAt=Date.now()+600000;
 await cmd({cmd:'grant',token,value:{...descriptions[kind],worker,workflow,expiresAt}});
 const p=spawn('java',['-Djavax.net.ssl.trustStore='+join(dir,'trust.p12'),'-Djavax.net.ssl.trustStorePassword=fixture-only-password','-Djdk.net.hosts.file='+join(dir,'hosts'),'-cp',jar,'com.koreanlifehub.bridge.LifeWorkerTlsProbe'],{stdio:['pipe','pipe','pipe']});children.add(p);
 let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
 const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();const done=new Promise(ok=>p.once('exit',(code,signal)=>{children.delete(p);ok({code,signal,out,err});}));
 const timer=setTimeout(()=>p.kill('SIGKILL'),45000);timer.unref();
 p.stdin.write(canonical({mode,workflow,kind,owner,server:serverDigest,worker,origin:active.origin,token,expiresAt})+'\n');if(mode!=='blocking')p.stdin.end();
 return {p,lines,done,timer};
}
async function finish(child,expected=0){const r=await child.done;clearTimeout(child.timer);assert.equal(r.code,expected,r.out+'\n'+r.err);if(expected===0)assert.match(r.out,/PASS /);return r;}
async function probe(mode,wf,kind='memory',who=1){return finish(await begin(mode,wf,kind,who));}
async function scenario(name,fn){console.log('START '+name+' '+new Date().toISOString());await fn();checks.push({name,passed:true});console.log('PASS '+name+' '+new Date().toISOString());}
try{
 exec('openssl',['req','-x509','-newkey','rsa:2048','-keyout',join(dir,'ca.key'),'-out',join(dir,'ca.pem'),'-nodes','-subj','/CN=JH WORKER TEST CA','-days','1']);
 exec('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',conf.tlsKey,'-out',join(dir,'leaf.csr'),'-subj','/CN=localhost']);
 writeFileSync(join(dir,'leaf.ext'),'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
 exec('openssl',['x509','-req','-in',join(dir,'leaf.csr'),'-CA',join(dir,'ca.pem'),'-CAkey',join(dir,'ca.key'),'-CAcreateserial','-out',conf.tlsCert,'-days','1','-extfile',join(dir,'leaf.ext')]);
 exec('keytool',['-importcert','-noprompt','-alias','jh-worker-test','-file',join(dir,'ca.pem'),'-keystore',join(dir,'trust.p12'),'-storetype','PKCS12','-storepass','fixture-only-password']);
 writeFileSync(join(dir,'hosts'),'127.0.0.1 localhost\n');
 const s=new LifeCheckpointStore({...conf,key,initialize:true});s.initializeContentStorage();s.initializeWorkerStorage(policy);s.close();await start();
 await scenario('owned_real_host_first_wave_persists_input_result_and_releases',()=>probe('first','handoff'));
 await scenario('sigkill_server_then_different_jvm_and_worker_continues_without_replay',async()=>{await stop(true);await start();await probe('continue','handoff','memory',2);});
 await scenario('existing_two_read_tasks_and_join_restore_across_coordinators',async()=>{await probe('first','fanin','join');await stop(true);await start();await probe('continue','fanin','join',2);});
 await scenario('expired_idle_owner_is_fenced_and_completed_work_is_not_repeated',async()=>{
  await probe('first_hold','idle');await probe('blocked_acquire','idle','memory',2);
  conf.offset+=120001;await cmd({cmd:'offset',value:conf.offset});await probe('continue','idle','memory',2);
 });
 await scenario('three_task_budget_persists_across_handover_and_server_restart',async()=>{
  await probe('first','budget','double');await probe('budget','budget','double',2);await stop(true);await start();await probe('budget_resume','budget','double',3);
  const state=await cmd({cmd:'state',workflow:'budget'});assert.equal(state.entries.reduce((s,e)=>s+e.invocations,0),3);
 });
 await scenario('second_coordinator_denied_and_external_cancel_blocks_late_success',async()=>{
  const child=await begin('blocking','cancel');assert.equal((await child.lines.next()).value,'INVOKED');
  await probe('blocked_acquire','cancel','memory',2);await cmd({cmd:'cancel',workflow:'cancel'});child.p.stdin.end('GO\n');await finish(child);
  const state=await cmd({cmd:'state',workflow:'cancel'});assert.equal(state.cancelled,true);assert.ok(state.entries.every(e=>e.status!=='SUCCEEDED'));
 });
 await scenario('lost_dispatch_ack_does_not_invoke_provider_or_retry',async()=>{
  await cmd({cmd:'mode',value:'drop_dispatch'});const before=await cmd({cmd:'stats'});await probe('lost_dispatch','lostdispatch');
  const after=await cmd({cmd:'stats'});assert.equal(after.dispatches-before.dispatches,1);assert.equal(after.dropped-before.dropped,1);
 });
 await scenario('killed_running_worker_stays_uncertain_after_lease_expiry_and_server_restart',async()=>{
  const child=await begin('blocking','crash');assert.equal((await child.lines.next()).value,'INVOKED');child.p.kill('SIGKILL');await finish(child,null);
  conf.offset+=120001;await stop(true);await start();await probe('blocked_acquire','crash','memory',2);
  const state=await cmd({cmd:'state',workflow:'crash'});assert.equal(state.entries[0].invocations,1);assert.equal(state.entries[0].status,'RUNNING');
 });
 await scenario('lost_acquire_ack_is_not_reissued_by_client',async()=>{
  await cmd({cmd:'mode',value:'drop_acquire'});const before=await cmd({cmd:'stats'});await probe('lost_acquire','lostacquire');const after=await cmd({cmd:'stats'});assert.equal(after.acquires-before.acquires,1);
 });
 await scenario('encrypted_store_contains_neither_content_nor_worker_identity',async()=>{
  const bytes=readFileSync(conf.databasePath);for(const text of ['합성 기록의 입력','합성 최종 답변','1'.repeat(64),'lease_'])assert.equal(bytes.includes(Buffer.from(text)),false);
 });
}catch(e){failure=e;console.error(e.stack??String(e));}
finally{
 for(const child of children)child.kill('SIGKILL');
 try{await stop();}catch(e){failure??=e;active?.p.kill('SIGKILL');}
 key.fill(0);delete conf.key;rmSync(dir,{recursive:true,force:true});
 const result={passed:!failure,scenarios:checks.length,checks,error:failure?String(failure):null,stats,
  scope:'Actual existing Kotlin Host/Session/Verifier plus worker/checkpoint/content TLS transports; actual SQLite AES-GCM, multiple JVMs, process SIGKILL. Auth and GPT/Memoria replies are fixtures. Coordinator ownership is workflow-level, not cross-worker per-task scheduling.',
  phoneOperations:0,productionProviderCalls:0,productionDeployment:false};
 if(evidence)writeFileSync(evidence,JSON.stringify(result,null,2));console.log('SUMMARY '+JSON.stringify({passed:result.passed,scenarios:checks.length}));
}
if(failure)process.exitCode=1;
