/** TEST ONLY. One coordinator + independently authenticated JVM task workers over actual TLS.
 * Runtime/provider accounts are fixtures; no Android, production provider call, deploy or daemon. */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';import {randomBytes} from 'node:crypto';
import {createServer} from 'node:https';import {once} from 'node:events';
import {fixture} from './provider-fixture.mjs';import {createMemoriaReadPort} from '../server-adapter/memoria-mcp-read-port.mjs';import {stable} from '../server-adapter/provider-json.mjs';import assert from 'node:assert/strict';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';import {contentCanonical as canonical} from '../server-continuation/life-content-wire.mjs';
import {sha,EXPECTED_ORIGIN} from '../deployment/owner-config.mjs';
const jar=resolve(process.argv[2]),evidence=process.argv[3]?resolve(process.argv[3]):null,dir=mkdtempSync(join(tmpdir(),'jh-runtime-start-tls-'));
const key=randomBytes(32),owner=sha('JH_GOOGLE_OWNER_V1|https://accounts.google.com|synthetic-owner-subject|test-owner.apps.googleusercontent.com'),serverDigest=sha(EXPECTED_ORIGIN),conf={databasePath:join(dir,'jh-owner-state','state.db'),key:key.toString('hex'),owner,serverDigest,tlsKey:join(dir,'leaf.key'),tlsCert:join(dir,'leaf.pem'),offset:0};
mkdirSync(join(dir,'jh-owner-state'),{mode:0o700});
const keyDir=mkdtempSync(join(tmpdir(),'jh-registered-key-'));conf.registeredKeyFile=join(keyDir,'life.key');writeFileSync(conf.registeredKeyFile,key,{mode:0o600});
const checks=[],children=new Set(),grantRegistry=new Map();let active=null,failure=null;const transcript=[];
const exec=(bin,args)=>execFileSync(bin,args,{stdio:['pipe','pipe','pipe'],timeout:20000});
const pf=fixture();const readPort=createMemoriaReadPort({endpoint:'https://memoria.invalid/mcp',authorization:()=> 'Bearer SYNTHETIC_MEMORY_CREDENTIAL_000000',current:()=>true,fetchImpl:pf.fetchImpl});
const providerMeta={tools:await readPort.prepare(),gptDigests:Object.fromEntries(['memory_answer','book_preview'].map(action=>[action,sha(stable({version:1,provider:'openai',model:'gpt-fixture',responseModels:['gpt-fixture'],maxOutputTokens:2048,actions:[action]}))]))};readPort.close();
let upstream=null,providerOrigin=null,behavior='normal',pendingReply=null;const wire=[];
async function providerServer(){
 upstream=createServer({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)},async(req,res)=>{
  try{
   const chunks=[];let size=0;for await(const b of req){size+=b.length;assert.ok(size<=24*1024*1024);chunks.push(b);}
   const body=chunks.length?Buffer.concat(chunks).toString():undefined,parsed=body?JSON.parse(body):null;
   const memory=req.url==='/mcp';const url=memory?'https://memoria.invalid/mcp':'https://api.openai.com'+req.url.slice('/openai'.length);
   assert.equal(req.headers.authorization,memory?'Bearer SYNTHETIC_MEMORY_CREDENTIAL_000000':'Bearer SYNTHETIC_OPENAI_CREDENTIAL_000000');
   wire.push({path:req.url,operation:parsed?.method,tool:parsed?.params?.name,body:parsed});
   if(behavior==='drop_generate'&&url.endsWith('/responses')){req.socket.destroy();return;}
   const f=fixture({sse:behavior==='sse'});let answer=await f.fetchImpl(url,{method:req.method,headers:{authorization:'REDACTED'},body});
   if(behavior==='hold_fetch'&&parsed?.params?.name==='fetch_memory')await new Promise(resolve=>pendingReply=resolve);
   res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(Buffer.from(await answer.arrayBuffer()));
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}
 });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');providerOrigin='https://localhost:'+upstream.address().port;
}
async function waitWire(predicate){const end=Date.now()+15000;while(Date.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('upstream_timeout');}
function requestsSince(n){const list=wire.slice(n);return {search:list.filter(x=>x.tool==='search_memory'),fetch:list.filter(x=>x.tool==='fetch_memory'),generation:list.filter(x=>x.path.endsWith('/responses')),list};}
const descriptions={};for(const kind of ['memory','book','multi'])descriptions[kind]=JSON.parse(execFileSync('java',['-cp',jar,'com.koreanlifehub.bridge.ServerWorkerProviderTlsProbe'],{input:canonical({mode:'describe',kind,providerMeta})+'\n',encoding:'utf8',timeout:15000}).trim());
async function start(){const p=spawn(process.execPath,[new URL('./registered-runtime-server-fixture.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});let err='';p.stderr.on('data',b=>err+=b);const ended=new Promise(ok=>p.once('exit',(code,signal)=>ok({code,signal,err})));const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();p.stdin.write(JSON.stringify(conf)+'\n');const ready=await lines.next();if(ready.done)throw Error(err);const x=JSON.parse(ready.value);assert.equal(x.event,'ready');conf.port=x.port;active={p,lines,ended,origin:'https://localhost:'+x.port};for(const [token,value]of grantRegistry)await cmd({cmd:'grant',token,value});}
async function cmd(x){active.p.stdin.write(JSON.stringify(x)+'\n');const l=await active.lines.next();if(l.done)throw Error('fixture_exited');return JSON.parse(l.value);}
async function stop(kill=false){if(!active)return;const a=active;transcript.push(await cmd({cmd:'stats'}));if(kill)a.p.kill('SIGKILL');else{await cmd({cmd:'close'});a.p.stdin.end();}const e=await a.ended;active=null;if(!kill)assert.equal(e.code,0,e.err);}
async function register(token,value){grantRegistry.set(token,value);await cmd({cmd:'grant',token,value});}
function launch(className,input,interactive=false){const p=spawn('java',['-Djavax.net.ssl.trustStore='+join(dir,'trust.p12'),'-Djavax.net.ssl.trustStorePassword=fixture-only-password','-Djdk.net.hosts.file='+join(dir,'hosts'),'-cp',jar,'com.koreanlifehub.bridge.'+className],{stdio:['pipe','pipe','pipe']});children.add(p);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();const done=new Promise(ok=>p.once('exit',(code,signal)=>{children.delete(p);ok({code,signal,out,err});}));const timer=setTimeout(()=>p.kill('SIGKILL'),60000);timer.unref();p.stdin.write(canonical({...input,providerMeta,providerOrigin,ca:join(dir,'ca.pem'),sourceRoot:resolve(new URL('..',import.meta.url).pathname),node:process.execPath})+'\n');if(!interactive)p.stdin.end();return {p,lines,done,timer};}
async function finish(c,expected=0){const r=await c.done;clearTimeout(c.timer);assert.equal(r.code,expected,r.out+'\n'+r.err);if(expected===0)assert.match(r.out,/PASS /);return r;}
function value(r){const line=r.out.split('\n').find(l=>/^PASS (coordinate|worker) /.test(l));assert.ok(line,r.out);return JSON.parse(line.replace(/^PASS \w+ /,''));}
async function job(workflow,kind='memory'){
 const d=descriptions[kind],expiresAt=Date.now()+conf.offset+600000,tokens={};
 for(const who of [1,2,3]){const worker=String(who).repeat(64),token=randomBytes(24).toString('hex');tokens[who]=token;
 const allowed=who===1?d.remoteSpecs:Object.fromEntries(Object.entries(d.remoteSpecs).filter(([id])=>kind!=='multi'||id.startsWith(who===2?'life_0_':'life_1_')));
 await register(token,{...d,remoteSpecs:allowed,role:who===1?'coordinator':'child',worker,workflow,targets:['2'.repeat(64),'3'.repeat(64)],expiresAt,
  queueGrants:{[workflow]:{planDigest:d.plan,descriptorDigest:d.descriptorDigest,readOnlyTasks:d.tasks,expiresAt}}});}
 const common={owner,server:serverDigest,origin:active.origin,expiresAt,offset:conf.offset};
 await finish(launch('LifeQueueTlsProbe',{...common,mode:'seed',worker:'1'.repeat(64),jobs:[{workflow,kind,token:tokens[1]}],queueToken:tokens[1]}));
 return {workflow,kind,tokens,expiresAt};
}
async function run(j,mode='coordinate',who=1,targets={},extra={}){if(mode==='coordinate')await cmd({cmd:'selection',workflow:j.workflow,targets});return launch('ServerWorkerProviderTlsProbe',{mode,kind:j.kind,workflow:j.workflow,worker:String(who).repeat(64),owner,server:serverDigest,origin:active.origin,token:j.tokens[who],expiresAt:j.expiresAt,offset:conf.offset,targets,...extra},mode.includes('block')||mode==='worker_race');}
async function waitOffers(count){const until=Date.now()+15000;while(Date.now()<until){const s=await cmd({cmd:'stats'});if(s.remoteOffers>=count)return;await new Promise(ok=>setTimeout(ok,40));}throw Error('remote_offer_timeout '+JSON.stringify(await cmd({cmd:'stats'})));}
const scenario=async(name,fn)=>{if(process.env.JH_TEST_CASE&&!new RegExp(process.env.JH_TEST_CASE).test(name))return;console.log('START '+name);await fn();checks.push({name,passed:true});console.log('PASS '+name);};
function complete(v,n=1){assert.equal(v.outcomes.length,1);assert.equal(v.outcomes[0].code,'completed_readback',JSON.stringify(v));assert.equal(v.outcomes[0].outputs,n);}
try{
 exec('openssl',['req','-x509','-newkey','rsa:2048','-keyout',join(dir,'ca.key'),'-out',join(dir,'ca.pem'),'-nodes','-subj','/CN=JH REMOTE TEST CA','-days','1']);
 exec('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',conf.tlsKey,'-out',join(dir,'leaf.csr'),'-subj','/CN=localhost']);writeFileSync(join(dir,'leaf.ext'),'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
 exec('openssl',['x509','-req','-in',join(dir,'leaf.csr'),'-CA',join(dir,'ca.pem'),'-CAkey',join(dir,'ca.key'),'-CAcreateserial','-out',conf.tlsCert,'-days','1','-extfile',join(dir,'leaf.ext')]);
 exec('keytool',['-importcert','-noprompt','-alias','jh-remote-test','-file',join(dir,'ca.pem'),'-keystore',join(dir,'trust.p12'),'-storetype','PKCS12','-storepass','fixture-only-password']);writeFileSync(join(dir,'hosts'),'127.0.0.1 localhost\n');
 const store=new LifeCheckpointStore({...conf,key,initialize:true});store.initializeContentStorage();store.initializeWorkerStorage({maxActiveWorkflows:8,maxParallelTasks:2,maxTaskStarts:8,leaseMillis:60000,runtimeMillis:600000});store.initializeQueueStorage();store.close();await providerServer();await start();

 await scenario('remote_memory_uses_real_provider_ports_private_config_and_releases_process',async()=>{
  const j=await job('provider_memory'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_search:'2'.repeat(64)});await waitOffers(k+1);
  const child=value(await finish(await run(j,'worker',2))),parent=value(await finish(p));
  console.log('RESULT '+JSON.stringify({child,parent}));complete(parent);assert.equal(child.providerProcesses,1);assert.equal(child.allProvidersClosed,true);
  assert.equal(child.results[0].code,'staged_for_coordinator_verification');const seen=requestsSince(n);assert.equal(seen.search.length,1);assert.equal(seen.fetch.length,1);assert.equal(seen.generation.length,0);
 });
 await scenario('remote_gpt_receives_verified_dependency_once_and_closes_process',async()=>{
  const j=await job('provider_gpt'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_answer:'2'.repeat(64)});await waitOffers(k+1);
  const child=value(await finish(await run(j,'worker',2))),parent=value(await finish(p));console.log('RESULT '+JSON.stringify({child,parent}));complete(parent);
  assert.equal(child.providerProcesses,1);assert.equal(child.allProvidersClosed,true);assert.equal(parent.gptCalls,0);
  const seen=requestsSince(n);assert.equal(seen.generation.length,1);assert.equal(seen.search.length,0);
  const request=JSON.stringify(seen.generation[0].body);assert.ok(request.includes('실제로 재조회한'));assert.ok(!request.includes('STALE_SNIPPET'));
 });
 await scenario('book_preview_remote_provider_preserves_selected_page_range',async()=>{
  const j=await job('provider_book','book'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_book_preview:'2'.repeat(64)});await waitOffers(k+1);
  const child=value(await finish(await run(j,'worker',2))),parent=value(await finish(p));console.log('RESULT '+JSON.stringify({child,parent}));complete(parent);
  const seen=requestsSince(n);assert.equal(child.allProvidersClosed,true);assert.equal(seen.generation.length,1);assert.ok(seen.generation[0].body.instructions.includes('3~5'));assert.equal(seen.search.length,0);
 });
 await scenario('two_workers_use_separate_processes_and_join_two_results',async()=>{
  const j=await job('provider_multi','multi'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_search:'2'.repeat(64),life_1_memory_search:'3'.repeat(64)});await waitOffers(k+2);
  const a=await run(j,'worker',2),b=await run(j,'worker',3);const [ar,br,pr]=await Promise.all([finish(a),finish(b),finish(p)]);
  const av=value(ar),bv=value(br);complete(value(pr),2);assert.equal(av.providerProcesses+bv.providerProcesses,2);assert.equal(av.allProvidersClosed&&bv.allProvidersClosed,true);
  const seen=requestsSince(n);assert.equal(seen.search.length,2);assert.equal(seen.fetch.length,2);
 });
 await scenario('search_fetch_generation_all_use_composed_remote_ports_in_one_workflow',async()=>{
  const j=await job('provider_chain'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_search:'2'.repeat(64),life_0_memory_answer:'3'.repeat(64)});
  await waitOffers(k+1);const memory=value(await finish(await run(j,'worker',2)));
  await waitOffers(k+2);const gpt=value(await finish(await run(j,'worker',3))),parent=value(await finish(p));complete(parent);
  assert.equal(parent.memoryCalls+parent.gptCalls,0);assert.equal(memory.providerProcesses+gpt.providerProcesses,2);assert.equal(memory.allProvidersClosed&&gpt.allProvidersClosed,true);
  const seen=requestsSince(n);assert.equal(seen.search.length,1);assert.equal(seen.fetch.length,1);assert.equal(seen.generation.length,1);
  const body=JSON.stringify(seen.generation[0].body);assert.ok(body.includes('재조회 원문'));assert.ok(!body.includes('과거 검색 요약'));
 });
 await scenario('one_worker_releases_previous_provider_before_opening_next_ticket',async()=>{
  const j=await job('provider_serial','multi');const grant=grantRegistry.get(j.tokens[2]);await register(j.tokens[2],{...grant,remoteSpecs:descriptions.multi.remoteSpecs});
  const n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_search:'2'.repeat(64),life_1_memory_search:'2'.repeat(64)});await waitOffers(k+2);
  const child=value(await finish(await run(j,'worker',2))),parent=value(await finish(p));complete(parent,2);
  assert.equal(child.providerProcesses,2);assert.equal(child.allProvidersClosed,true);assert.equal(child.results.length,2);assert.ok(child.results.every(x=>x.code==='staged_for_coordinator_verification'));
  const seen=requestsSince(n);assert.equal(seen.search.length,2);assert.equal(seen.fetch.length,2);
 });
 await scenario('lost_begin_reply_spawns_no_provider_and_never_retries',async()=>{
  const j=await job('provider_lost_begin'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;await cmd({cmd:'mode',value:'drop_remote_begin'});
  const p=await run(j,'coordinate',1,{life_0_memory_search:'2'.repeat(64)},{maxPolls:30});await waitOffers(k+1);
  const child=value(await finish(await run(j,'worker',2)));assert.equal(child.providerProcesses,0);assert.equal(wire.length,n);
  const child2=value(await finish(await run(j,'worker',2)));assert.equal(child2.providerProcesses,0);const parent=value(await finish(p));assert.notEqual(parent.outcomes[0].code,'completed_readback');await cmd({cmd:'mode',value:'normal'});
 });
 await scenario('lost_generation_reply_closes_process_without_second_generation',async()=>{
  behavior='drop_generate';const j=await job('provider_lost_generation'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_answer:'2'.repeat(64)},{maxPolls:30});await waitOffers(k+1);
  const child=value(await finish(await run(j,'worker',2)));assert.equal(child.allProvidersClosed,true);assert.equal(child.providerProcesses,1);
  const again=value(await finish(await run(j,'worker',2)));assert.equal(again.providerProcesses,0);
  const parent=value(await finish(p));assert.notEqual(parent.outcomes[0].code,'completed_readback');assert.equal(requestsSince(n).generation.length,1);behavior='normal';
 });
 await scenario('registry_revocation_during_provider_read_blocks_late_stage_and_closes_process',async()=>{
  behavior='hold_fetch';const j=await job('provider_revoked'),n=wire.length,k=(await cmd({cmd:'stats'})).remoteOffers;
  const p=await run(j,'coordinate',1,{life_0_memory_search:'2'.repeat(64)},{maxPolls:90});await waitOffers(k+1);
  const c=await run(j,'worker',2);await waitWire(()=>pendingReply!==null);await cmd({cmd:'revoke',token:j.tokens[2]});grantRegistry.delete(j.tokens[2]);pendingReply();pendingReply=null;
  const child=value(await finish(c)),parent=value(await finish(p));assert.equal(child.allProvidersClosed,true);assert.notEqual(parent.outcomes[0].code,'completed_readback');assert.equal(parent.gptCalls,0);
  const cp=await cmd({cmd:'state',workflow:j.workflow});assert.ok(cp.entries.every(e=>e.status!=='SUCCEEDED'));assert.equal(requestsSince(n).fetch.length,1);behavior='normal';
 });
 await scenario('explicit_stop_does_not_open_provider_resources',async()=>{
  const j=await job('provider_stop'),n=wire.length;const c=value(await finish(await run(j,'worker_stop',2)));assert.equal(c.providerProcesses,0);assert.equal(wire.length,n);
 });
}catch(e){failure=e;console.error(e.stack??String(e));try{console.error('LAST_STATS '+JSON.stringify(await cmd({cmd:'stats'})));}catch{}}
finally{
 pendingReply?.();for(const p of children)p.kill('SIGKILL');try{await stop();}catch(e){failure??=e;active?.p.kill('SIGKILL');}
 if(upstream){upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
 key.fill(0);delete conf.key;rmSync(dir,{recursive:true,force:true});rmSync(keyDir,{recursive:true,force:true});
 const result={passed:!failure,scenarios:checks.length,checks,error:failure?String(failure):null,transcript,
  wire:wire.map(x=>({path:x.path,operation:x.operation,tool:x.tool})),
  scope:'Existing registered runtime/queue/worker/Host + composed provider factory + REAL scoped private config loader, Node pipes, localhost TLS/encrypted SQLite. Independent coordinator and worker JVMs. Provider records/model output/keys/book originals are synthetic. No live provider or phone.'};
 if(evidence)writeFileSync(evidence,JSON.stringify(result,null,2));console.log('SUMMARY '+JSON.stringify({passed:result.passed,scenarios:result.scenarios}));
}
if(failure)process.exitCode=1;
