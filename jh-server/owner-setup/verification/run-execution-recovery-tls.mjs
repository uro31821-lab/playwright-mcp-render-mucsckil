/** Real TLS/SQLite/production Kotlin core, distinct JVM coordinators and server SIGKILLs.
 * Only provider replies, worker principals and source grants are synthetic test fixtures. */
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {contentCanonical as canonical} from '../server-continuation/life-content-wire.mjs';
const jar=resolve(process.argv[2]),evidence=process.argv[3]?resolve(process.argv[3]):null;
const dir=mkdtempSync(join(tmpdir(),'jh-execution-recovery-tls-')),key=randomBytes(32),owner='a'.repeat(64),serverDigest='c'.repeat(64);
const conf={databasePath:join(dir,'state.db'),key:key.toString('hex'),owner,serverDigest,tlsKey:join(dir,'leaf.key'),tlsCert:join(dir,'leaf.pem'),offset:0};
const policy={maxActiveWorkflows:8,maxParallelTasks:2,maxTaskStarts:6,leaseMillis:10000,runtimeMillis:600000};
let active=null,failure=null;const children=new Set(),checks=[],stats=[];
const exec=(bin,args)=>execFileSync(bin,args,{stdio:['pipe','pipe','pipe'],timeout:20000});
const descriptions={};for(const kind of ['memory','book'])descriptions[kind]=JSON.parse(execFileSync('java',['-cp',jar,'com.koreanlifehub.bridge.LifeExecutionRecoveryTlsProbe'],{input:canonical({mode:'describe',kind})+'\n',encoding:'utf8',timeout:10000}).trim());
async function start(){
 const p=spawn(process.execPath,[new URL('./execution-recovery-server-fixture.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
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
 const p=spawn('java',['-Djavax.net.ssl.trustStore='+join(dir,'trust.p12'),'-Djavax.net.ssl.trustStorePassword=fixture-only-password','-Djdk.net.hosts.file='+join(dir,'hosts'),'-cp',jar,'com.koreanlifehub.bridge.LifeExecutionRecoveryTlsProbe'],{stdio:['pipe','pipe','pipe']});children.add(p);
 let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
 const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();const done=new Promise(ok=>p.once('exit',(code,signal)=>{children.delete(p);ok({code,signal,out,err});}));
 const timer=setTimeout(()=>p.kill('SIGKILL'),45000);timer.unref();
 p.stdin.write(canonical({mode,workflow,kind,owner,server:serverDigest,worker,origin:active.origin,token,expiresAt})+'\n');if(!['stage_block','invoke_block','commit_race','cancel_after_inspect'].includes(mode))p.stdin.end();
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
 async function orphan(wf,kind='memory',mode='stage_block'){
  const child=await begin(mode,wf,kind);assert.equal((await child.lines.next()).value,mode==='stage_block'?'STAGED':'INVOKED');
  child.p.kill('SIGKILL');await finish(child,null);
  conf.offset+=10001;await cmd({cmd:'offset',value:conf.offset});
 }
 await scenario('existing_worker_controller_loop_completes_all_ready_waves',()=>probe('normal','normal'));
 await scenario('sigkill_producer_after_durable_stage_and_sigkill_server_then_recover',async()=>{
  await orphan('crash');await stop(true);await start();const before=await cmd({cmd:'stats'});
  await probe('recover','crash','memory',2);const after=await cmd({cmd:'stats'});assert.equal(after.recoveryCommits-before.recoveryCommits,1);
  const state=await cmd({cmd:'state',workflow:'crash'});assert.ok(state.entries.every(e=>e.status==='SUCCEEDED'&&e.invocations===1));
 });
 await scenario('same_flow_later_reads_existing_commit_without_repeating_provider',()=>probe('inspect_committed','crash','memory',3));
 await scenario('original_book_source_staged_result_is_reused_without_recreation',async()=>{
  await orphan('book','book');await probe('recover','book','book',2);
  const state=await cmd({cmd:'state',workflow:'book'});assert.ok(state.entries.every(e=>e.status==='SUCCEEDED'&&e.invocations===1));
 });
 await scenario('lost_recovery_commit_ack_one_commit_then_readback_then_remaining_step',async()=>{
  await orphan('lost');const before=await cmd({cmd:'stats'});await cmd({cmd:'mode',value:'drop_recovery_commit'});
  await probe('lost_commit','lost','memory',2);const after=await cmd({cmd:'stats'});
  assert.equal(after.recoveryCommits-before.recoveryCommits,1);assert.equal(after.dropped-before.dropped,1);
 });
 await scenario('provider_outcome_without_staged_evidence_stays_uncertain_no_retry',async()=>{
  await orphan('nostage','memory','invoke_block');const before=await cmd({cmd:'stats'});await probe('no_result','nostage','memory',2);
  const after=await cmd({cmd:'stats'});assert.equal(after.recoveryCommits,before.recoveryCommits);assert.equal(after.dispatches,before.dispatches);
 });
 await scenario('fresh_active_coordinator_cannot_be_taken_over_by_reconciliation',async()=>{
  const child=await begin('stage_block','active');assert.equal((await child.lines.next()).value,'STAGED');
  await probe('blocked','active','memory',2);child.p.kill('SIGKILL');await finish(child,null);
  conf.offset+=10001;await cmd({cmd:'offset',value:conf.offset});
 });
 await scenario('external_cancel_between_inspection_and_commit_wins',async()=>{
  await orphan('cancel');const child=await begin('cancel_after_inspect','cancel','memory',2);
  assert.equal((await child.lines.next()).value,'OBSERVED');await cmd({cmd:'cancel',workflow:'cancel'});child.p.stdin.end('GO\n');
  const result=await finish(child);assert.match(result.out,/race_BLOCKED/);const state=await cmd({cmd:'state',workflow:'cancel'});assert.equal(state.cancelled,true);assert.ok(state.entries.every(e=>e.status!=='SUCCEEDED'));
 });
 await scenario('two_independent_recovery_jvms_cannot_commit_same_observation_twice',async()=>{
  await orphan('race');const a=await begin('commit_race','race','memory',2);assert.equal((await a.lines.next()).value,'OBSERVED');
  const b=await begin('commit_race','race','memory',3);assert.equal((await b.lines.next()).value,'OBSERVED');
  a.p.stdin.end('GO\n');b.p.stdin.end('GO\n');const results=await Promise.all([finish(a),finish(b)]);
  assert.equal(results.filter(r=>r.out.includes('race_COMMITTED')).length,1);assert.equal(results.filter(r=>r.out.includes('race_BLOCKED')).length,1);
  const state=await cmd({cmd:'state',workflow:'race'});assert.equal(state.entries[0].status,'SUCCEEDED');assert.equal(state.entries[0].invocations,1);
 });
 await scenario('recovery_database_keeps_result_text_and_worker_identity_encrypted',async()=>{
  const bytes=readFileSync(conf.databasePath);for(const text of ['합성 기록의 입력','합성 최종 답변','1'.repeat(64),'lease_'])assert.equal(bytes.includes(Buffer.from(text)),false);
 });
}catch(e){failure=e;console.error(e.stack??String(e));}
finally{
 for(const child of children)child.kill('SIGKILL');
 try{await stop();}catch(e){failure??=e;active?.p.kill('SIGKILL');}
 key.fill(0);delete conf.key;rmSync(dir,{recursive:true,force:true});
 const result={passed:!failure,scenarios:checks.length,checks,error:failure?String(failure):null,stats,
  scope:'Actual existing Kotlin Host/Session/Verifier/WorkLoop/Reconciliation and HTTPS plus encrypted SQLite. Multiple JVMs, SIGKILL at durable staged result, server restart, recovery CAS race and lost response. Auth, providers and originals are fixtures. Lease expiry uses a controlled server clock, not long real-time waits.',
  phoneOperations:0,productionProviderCalls:0,productionDeployment:false};
 if(evidence)writeFileSync(evidence,JSON.stringify(result,null,2));console.log('SUMMARY '+JSON.stringify({passed:result.passed,scenarios:checks.length}));
}
if(failure)process.exitCode=1;
