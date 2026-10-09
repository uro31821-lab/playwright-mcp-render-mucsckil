/** TEST ONLY: real TLS, SQLite, Kotlin core and multiple JVMs; synthetic host principals/providers. */
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';import {contentCanonical as canonical} from '../server-continuation/life-content-wire.mjs';
const jar=resolve(process.argv[2]),evidence=process.argv[3]?resolve(process.argv[3]):null,dir=mkdtempSync(join(tmpdir(),'jh-admission-tls-'));
const key=randomBytes(32),owner='a'.repeat(64),serverDigest='c'.repeat(64),conf={databasePath:join(dir,'state.db'),key:key.toString('hex'),owner,serverDigest,tlsKey:join(dir,'leaf.key'),tlsCert:join(dir,'leaf.pem'),offset:0};
const policy={maxActiveWorkflows:8,maxParallelTasks:2,maxTaskStarts:8,leaseMillis:10000,runtimeMillis:600000};
const checks=[],stats=[],children=new Set();let active=null,failure=null;
const exec=(bin,args)=>execFileSync(bin,args,{stdio:['pipe','pipe','pipe'],timeout:20000});
const descriptions={};for(const kind of ['memory','book','multi'])descriptions[kind]=JSON.parse(execFileSync('java',['-cp',jar,'com.koreanlifehub.bridge.LifeQueueTlsProbe'],{input:canonical({mode:'describe',kind})+'\n',encoding:'utf8',timeout:15000}).trim());
async function start(){const p=spawn(process.execPath,[new URL('./queue-server-fixture.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});let err='';p.stderr.on('data',b=>err+=b);const ended=new Promise(ok=>p.once('exit',(code,signal)=>ok({code,signal,err})));const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();p.stdin.write(JSON.stringify(conf)+'\n');const ready=await lines.next();if(ready.done)throw Error(err);const x=JSON.parse(ready.value);assert.equal(x.event,'ready');conf.port=x.port;active={p,lines,ended,origin:'https://localhost:'+x.port};}
async function cmd(x){active.p.stdin.write(JSON.stringify(x)+'\n');const l=await active.lines.next();if(l.done)throw Error('fixture_exited');return JSON.parse(l.value);}
async function stop(kill=false){if(!active)return;const a=active;stats.push(await cmd({cmd:'stats'}));if(kill)a.p.kill('SIGKILL');else{await cmd({cmd:'close'});a.p.stdin.end();}const e=await a.ended;active=null;if(!kill)assert.equal(e.code,0,e.err);}
function jobs(...names){return names.map(n=>({workflow:n,kind:n.startsWith('book')?'book':'memory'}));}
async function begin(mode,input,who=1){
 const worker=String(who).repeat(64),expiresAt=Date.now()+conf.offset+600000,queueToken=randomBytes(24).toString('hex'),jobInputs=[],queueGrants={};
 for(const job of input){const d=descriptions[job.kind],token=randomBytes(24).toString('hex');jobInputs.push({...job,token});queueGrants[job.workflow]={planDigest:d.plan,descriptorDigest:d.descriptorDigest,readOnlyTasks:d.tasks,expiresAt};
  await cmd({cmd:'grant',token,value:{...d,worker,workflow:job.workflow,expiresAt}});
 }
 await cmd({cmd:'grant',token:queueToken,value:{worker,queueGrants,expiresAt}});
 const p=spawn('java',['-Djavax.net.ssl.trustStore='+join(dir,'trust.p12'),'-Djavax.net.ssl.trustStorePassword=fixture-only-password','-Djdk.net.hosts.file='+join(dir,'hosts'),'-cp',jar,'com.koreanlifehub.bridge.LifeQueueTlsProbe'],{stdio:['pipe','pipe','pipe']});children.add(p);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
 const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();const done=new Promise(ok=>p.once('exit',(code,signal)=>{children.delete(p);ok({code,signal,out,err});}));const timer=setTimeout(()=>p.kill('SIGKILL'),60000);timer.unref();
 p.stdin.write(canonical({mode,jobs:jobInputs,owner,server:serverDigest,worker,origin:active.origin,queueToken,expiresAt,offset:conf.offset})+'\n');if(!['block_stage','block_invoke','claim_race'].includes(mode))p.stdin.end();return {p,lines,done,timer};
}
async function finish(c,expected=0){const r=await c.done;clearTimeout(c.timer);assert.equal(r.code,expected,r.out+'\n'+r.err);if(expected===0)assert.match(r.out,/PASS /);return r;}
const probe=async(mode,input,who=1)=>finish(await begin(mode,input,who));
function value(r){const line=r.out.split('\n').find(l=>/^PASS (drain|inventory|admitted_readback) /.test(l));assert.ok(line,r.out);return JSON.parse(line.replace(/^PASS \w+ /,''));}
const scenario=async(name,fn)=>{console.log('START '+name);await fn();checks.push({name,passed:true});console.log('PASS '+name);};
try{
 exec('openssl',['req','-x509','-newkey','rsa:2048','-keyout',join(dir,'ca.key'),'-out',join(dir,'ca.pem'),'-nodes','-subj','/CN=JH QUEUE TEST CA','-days','1']);
 exec('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',conf.tlsKey,'-out',join(dir,'leaf.csr'),'-subj','/CN=localhost']);writeFileSync(join(dir,'leaf.ext'),'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
 exec('openssl',['x509','-req','-in',join(dir,'leaf.csr'),'-CA',join(dir,'ca.pem'),'-CAkey',join(dir,'ca.key'),'-CAcreateserial','-out',conf.tlsCert,'-days','1','-extfile',join(dir,'leaf.ext')]);
 exec('keytool',['-importcert','-noprompt','-alias','jh-queue-test','-file',join(dir,'ca.pem'),'-keystore',join(dir,'trust.p12'),'-storetype','PKCS12','-storepass','fixture-only-password']);writeFileSync(join(dir,'hosts'),'127.0.0.1 localhost\n');
 const store=new LifeCheckpointStore({...conf,key,initialize:true});store.initializeContentStorage();store.initializeWorkerStorage(policy);store.initializeQueueStorage();store.close();await start();
 await scenario('durable_admission_fifo_survives_server_and_jvm_restart',async()=>{
  await probe('seed',jobs('z_memory','book_a'));await stop(true);await start();const v=value(await probe('list',jobs('z_memory','book_a'),2));assert.deepEqual(v.map(t=>t.workflow),['z_memory','book_a']);assert.ok(v.every(t=>t.status==='READY'));
 });
 await scenario('one_existing_wave_per_queued_workflow_preserves_pending_join',async()=>{
  const v=value(await probe('one',jobs('z_memory','book_a'),2));assert.deepEqual(v.memoryCalls,['z_memory']);assert.deepEqual(v.gptCalls,[]);for(const workflow of ['z_memory','book_a']){const s=await cmd({cmd:'state',workflow});assert.equal(s.entries[0].status,'SUCCEEDED');assert.equal(s.entries[1].status,'PENDING');}
 });
 await scenario('new_worker_rehydrates_and_only_calls_remaining_gpt_tasks',async()=>{
  await stop(true);await start();const v=value(await probe('drain',jobs('z_memory','book_a'),3));assert.deepEqual(v.memoryCalls,[]);assert.deepEqual(v.gptCalls,['z_memory','book_a']);assert.ok(v.outcomes.every(o=>o.code==='completed_readback'&&o.hasText));
 });
 await scenario('completed_queue_entries_read_final_text_without_producer_replay',async()=>{const v=value(await probe('drain',jobs('z_memory','book_a'),4));assert.deepEqual(v.memoryCalls,[]);assert.deepEqual(v.gptCalls,[]);assert.ok(v.outcomes.every(o=>o.hasText));});
 await scenario('cancelled_admission_never_enters_execution_factory',async()=>{await probe('seed',jobs('cancelled'));await cmd({cmd:'cancel',workflow:'cancelled'});const v=value(await probe('drain',jobs('cancelled'),2));assert.equal(v.outcomes[0].code,'cancelled');assert.deepEqual(v.memoryCalls,[]);assert.deepEqual(v.gptCalls,[]);});
 await scenario('lost_admission_response_one_submission_then_scoped_readback',async()=>{await probe('seed',jobs('lost'));const a=value(await probe('list',jobs('lost')));const before=await cmd({cmd:'stats'});await cmd({cmd:'mode',value:'drop_queue_submit'});await probe('submit_lost',jobs('lost'));const after=await cmd({cmd:'stats'});assert.equal(after.queueSubmits-before.queueSubmits,1);assert.equal(after.dropped-before.dropped,1);assert.deepEqual(value(await probe('list',jobs('lost'))),a);});
 async function orphan(wf,mode){await probe('seed',jobs(wf));const c=await begin(mode,jobs(wf));assert.equal((await c.lines.next()).value,mode==='block_stage'?'STAGED':'INVOKED');c.p.kill('SIGKILL');await finish(c,null);conf.offset+=10001;await cmd({cmd:'offset',value:conf.offset});}
 await scenario('queue_runner_reconciles_durable_result_after_two_sigkills',async()=>{await orphan('recover','block_stage');await stop(true);await start();const v=value(await probe('drain',jobs('recover'),2));assert.deepEqual(v.memoryCalls,[]);assert.deepEqual(v.gptCalls,['recover']);assert.equal(v.outcomes[0].recovered,1);assert.equal(v.outcomes[0].code,'completed_readback');const s=await cmd({cmd:'state',workflow:'recover'});assert.ok(s.entries.every(e=>e.status==='SUCCEEDED'&&e.invocations===1));});
 await scenario('unknown_without_result_never_leads_to_automatic_rerun',async()=>{await orphan('unknown','block_invoke');const before=await cmd({cmd:'stats'});const v=value(await probe('drain',jobs('unknown'),2));assert.deepEqual(v.memoryCalls,[]);assert.deepEqual(v.gptCalls,[]);assert.equal(v.outcomes[0].code,'review_required_no_retry');assert.equal((await cmd({cmd:'stats'})).dispatches,before.dispatches);});
 await scenario('two_jvms_select_same_ticket_but_existing_lease_allows_one_dispatch',async()=>{
  await probe('seed',jobs('race'));const a=await begin('claim_race',jobs('race'),2),b=await begin('claim_race',jobs('race'),3);
  assert.equal((await a.lines.next()).value,'CLAIM_READY');assert.equal((await b.lines.next()).value,'CLAIM_READY');a.p.stdin.write('GO\n');b.p.stdin.write('GO\n');
  const [la,lb]=await Promise.all([a.lines.next(),b.lines.next()]);assert.equal([la.value,lb.value].filter(x=>x==='RACE_INVOKED').length,1);
  if(la.value==='RACE_INVOKED')a.p.stdin.end('GO\n');else a.p.stdin.end();if(lb.value==='RACE_INVOKED')b.p.stdin.end('GO\n');else b.p.stdin.end();
  const results=await Promise.all([finish(a),finish(b)]);assert.equal(results.map(value).reduce((n,v)=>n+v.memoryCalls.length,0),1);const s=await cmd({cmd:'state',workflow:'race'});assert.equal(s.entries[0].invocations,1);assert.equal(s.entries[1].invocations,0);
 });
 await scenario('multiple_terminal_branches_return_all_verified_outputs',async()=>{const j=[{workflow:'multi',kind:'multi'}];await probe('seed',j);const v=value(await probe('drain',j,2));console.log('MULTI_DIAGNOSTIC '+JSON.stringify({value:v,state:await cmd({cmd:'state',workflow:'multi'})}));assert.equal(v.outcomes[0].code,'completed_readback');assert.equal(v.outcomes[0].outputCount,2);assert.equal(v.memoryCalls.length,2);assert.equal(v.gptCalls.length,2);});
 await scenario('stop_before_queue_discovery_has_no_provider_or_worker_calls',async()=>{const before=await cmd({cmd:'stats'});const v=value(await probe('stop',jobs('race')));assert.deepEqual(v.outcomes,[]);const after=await cmd({cmd:'stats'});assert.equal(after.acquires,before.acquires);assert.equal(after.dispatches,before.dispatches);});
 await scenario('fresh_credentials_do_not_extend_old_admission_ttl',async()=>{conf.offset+=600001;await cmd({cmd:'offset',value:conf.offset});const v=value(await probe('drain',jobs('lost'),4));assert.equal(v.outcomes[0].code,'expired');assert.deepEqual(v.memoryCalls,[]);assert.deepEqual(v.gptCalls,[]);});
 await scenario('queue_and_original_input_state_remain_encrypted',async()=>{const bytes=readFileSync(conf.databasePath);for(const text of ['gpt-fixture','input_query','original_pages','z_memory','합성 기록의 입력','합성 최종 답변'])assert.equal(bytes.includes(Buffer.from(text)),false);});
}catch(e){failure=e;console.error(e.stack??String(e));}
finally{for(const p of children)p.kill('SIGKILL');try{await stop();}catch(e){failure??=e;active?.p.kill('SIGKILL');}key.fill(0);delete conf.key;rmSync(dir,{recursive:true,force:true});const result={passed:!failure,scenarios:checks.length,checks,error:failure?String(failure):null,stats,scope:'Real TLS, SQLite encryption/transactions, existing production Kotlin queue/worker/Host/Session/Verifier/Reconciliation. Auth/providers/originals are fixture dependencies; lease/expiry include a controlled clock. No operating deployment, live provider call, device operation or daemon.',productionDeployment:false,phoneOperations:0,productionProviderCalls:0};if(evidence)writeFileSync(evidence,JSON.stringify(result,null,2));console.log('SUMMARY '+JSON.stringify({passed:result.passed,scenarios:checks.length}));}
if(failure)process.exitCode=1;
