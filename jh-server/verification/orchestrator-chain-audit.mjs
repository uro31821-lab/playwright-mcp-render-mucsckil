/** Exact operational MCP/HTTP handlers + candidate host hooks + private SQLite.
 * Synthetic Secure56 device only. Two actual SIGKILL restarts; no live phone or production mount.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdtempSync,chmodSync,rmSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {DurableManualCircuitFence} from '../owner-setup/deployment/durable-manual-circuit-fence.mjs';
import {buildNativeQueueTruthCandidate} from '../owner-setup/deployment/native-queue-truth-candidate.mjs';
import {inspectNativeReadback} from '../owner-setup/deployment/native-readback.mjs';
const HERE=fileURLToPath(import.meta.url),CWD=fileURLToPath(new URL('../',import.meta.url));
const ROOT=path.join(CWD,'owner-setup');
const sha=x=>createHash('sha256').update(x).digest('hex');
const KEY=Buffer.alloc(32,42),NS=sha('synthetic-durable-native-owner');
const TOKEN='SYNTHETIC_DURABLE_NATIVE_HTTP_TEST_20261010';
const CATALOG='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
const nonce=()=>randomBytes(24).toString('base64url');
const mac=(key,x)=>createHmac('sha256',Buffer.from(key,'base64url')).update(x).digest('hex');
const fakeScreen={ok:true,url:JSON.stringify([{package:'laftel.net.laftel',className:'android.view.View',text:'Synthetic screen'}])};
function environment(port){return {PATH:process.env.PATH,PORT:String(port),JH_OWNER_DEFER_LISTEN:'1',
 PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN}}
if(process.argv[2]==='serve'){
 try{
  const runtime=await import(pathToFileURL(process.argv[3]).href);
  const host=runtime.installDurableNativeCircuit56({file:process.argv[4],key:KEY,namespace:NS,mode:'read'});
  await new Promise((resolve,reject)=>{runtime.httpServer.once('error',reject);runtime.httpServer.listen(Number(process.argv[5]),'127.0.0.1',resolve)});
  process.on('message',m=>{if(m?.op==='closeJournal'){host.close();process.send?.({op:'journalClosed'})}});
  process.stdout.write('SYNTHETIC_DURABLE_SERVER_READY\n');
 }catch(e){console.error(e.code||e.message);process.exitCode=1}
}else{
 const checks=[],children=[],clients=[];
 const mark=(name,value)=>{assert.ok(value,name);checks.push(name)};
 const dir=mkdtempSync(path.join(tmpdir(),'jh-durable-native-'));chmodSync(dir,0o700);
 const file=path.join(dir,'actions.sqlite');
 let build;
 const counts=()=>{const r=new DurableManualCircuitFence({file,key:KEY,namespace:NS,verifyAuthenticatedCompletion:()=>false});try{return r.counts()}finally{r.close()}};
 async function start(port){
  const base='http://127.0.0.1:'+port;
  const p=spawn(process.execPath,[HERE,'serve',build.file,file,String(port)],{cwd:CWD,env:environment(port),stdio:['ignore','pipe','pipe','ipc']});
  children.push(p);let logs='';for(const s of [p.stdout,p.stderr])s.on('data',b=>logs=(logs+b).slice(-6000));
  let ready=false;
  for(let i=0;i<120;i++){
   if(p.exitCode!==null||p.signalCode!==null)throw Error('test server failed: '+logs);
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
   await delay(50);
  }
  assert.ok(ready,'test server did not become ready: '+logs);
  mark('unauthenticated MCP still rejected on this boot',(await fetch(base+'/mcp')).status===401);
  const c=new Client({name:'durable-native-integration',version:'1'},{capabilities:{}});
  await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));clients.push(c);
  const call=async(name,args={})=>{const r=await c.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content.find(x=>x.type==='text').text)};
  async function request(method,url,body=null,headers={}){
   const o={method,headers:{...headers},signal:AbortSignal.timeout(5000)};
   if(body!==null){o.headers['content-type']='application/json';o.body=JSON.stringify(body)}
   const r=await fetch(base+url,o);return{status:r.status,data:r.status===204?null:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
  }
  async function enroll(deviceId){
   const deviceDigest=sha('jh56|'+deviceId);
   const r=await request('POST','/device/register',{deviceId,deviceDigest,secureBridgeVersion:56,clientNonce:nonce(),clientTime:Date.now(),toolCatalogDigest:CATALOG,bridgeVersion:'synthetic56'});
   assert.equal(r.status,200,'synthetic secure registration failed');
   const s={...r.data,deviceId,deviceDigest},n=nonce(),t=Date.now()+30000;
   const h={'x-jh-session':s.secureSessionId,'x-jh-device':deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),
    'x-jh-mac':mac(s.secureSessionSecret,'activate|'+s.secureSessionId+'|'+deviceDigest+'|'+n+'|'+t)};
   assert.equal((await request('POST','/device/activate',{deviceId,sessionDigest:s.sessionDigest},h)).status,200);
   return s;
  }
  async function poll(s){
   const n=nonce(),t=Date.now()+30000;
   return request('GET','/device/poll?deviceId='+s.deviceId,null,{'x-jh-session':s.secureSessionId,'x-jh-device':s.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),
    'x-jh-mac':mac(s.secureSessionSecret,'poll|'+s.secureSessionId+'|'+s.deviceDigest+'|'+n+'|'+t)});
  }
  async function take(s){for(let i=0;i<100;i++){const r=await poll(s);if(r.status!==204){assert.equal(r.status,200,JSON.stringify(r));return r.data}await delay(25)}throw Error('missing synthetic job')}
  async function complete(s,j,result={ok:true,url:'synthetic:completed'},badMac=false){
   const body={result},rd=sha(JSON.stringify(body)),n=nonce(),t=Date.now()+30000;
   return request('POST','/job/'+j.id+'/complete',body,{'x-jh-session':s.secureSessionId,'x-jh-device':s.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),'x-jh-result-digest':rd,
    'x-jh-mac':badMac?'0'.repeat(64):mac(s.secureSessionSecret,'complete|'+s.secureSessionId+'|'+j.id+'|'+s.deviceDigest+'|'+n+'|'+t+'|'+rd)});
  }
  return{p,call,enroll,poll,take,complete};
 }
 async function kill(p){
  if(p.exitCode!==null||p.signalCode!==null)return;
  const exited=new Promise(resolve=>p.once('exit',resolve));p.kill('SIGKILL');
  await Promise.race([exited,delay(3000).then(()=>{throw Error('test crash did not finish')})]);
 }
 async function closeStorage(s){
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('storage fault injection failed')),2500);
   const listener=m=>{if(m?.op==='journalClosed'){clearTimeout(timer);s.p.off('message',listener);resolve()}};
   s.p.on('message',listener);s.p.send({op:'closeJournal'});
  });
 }
 async function screen(s,session){const pending=s.call('life_android_snapshot');const j=await s.take(session);assert.equal(j.type,'agent_snapshot');assert.equal((await s.complete(session,j,fakeScreen)).status,200);return pending}
 try{
  build=buildNativeQueueTruthCandidate(ROOT);
  mark('pinned durable runtime plus queue-truth patch built without serving',build.productionEnabled===false&&!!build.candidateSha256);
  const seed=new DurableManualCircuitFence({file,key:KEY,namespace:NS,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});seed.close();
  const h=await start(19537),phone=await h.enroll('synthetic-orchestra-device');

  const nativeRoute=await h.call('life_route',{request:'카카오T 열어줘'});
  const webRoute=await h.call('life_route',{request:'라프텔 원피스 검색해줘'});
  mark('route selects native Android for Kakao T and browser for Laftel',nativeRoute.owner==='android'&&webRoute.owner==='web');

  const dispatched=await h.call('life_open_service',{service:'카카오T'});
  mark('service dispatcher reports actual native queue admission',dispatched.route==='android'&&dispatched.queued===true&&typeof dispatched.jobId==='string');
  const openedJob=await h.take(phone);
  mark('native route becomes exactly one signed open_url job',openedJob.type==='open_url'&&openedJob.id===dispatched.jobId&&openedJob.target==='카카오T'&&!!openedJob.secureMac);
  const openReply=await h.complete(phone,openedJob,{ok:true,code:'synthetic-app-opened',packageName:'com.kakao.taxi'});
  mark('signed device completion receipt is accepted',openReply.status===200);
  const status=await h.call('life_job_status',{job_id:openedJob.id});
  mark('device OK is NOT promoted to business task success',status.deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED'&&status.status==='complete');
  const firstScreenPending=h.call('life_android_snapshot');
  const firstScreenJob=await h.take(phone);
  const screen1={ok:true,url:JSON.stringify([{package:'com.kakao.taxi',text:'Synthetic Kakao T screen',className:'android.view.View'}])};
  assert.equal((await h.complete(phone,firstScreenJob,screen1)).status,200);
  const firstScreen=await firstScreenPending;
  const checkedFirst=inspectNativeReadback(firstScreen,'com.kakao.taxi');
  mark('fresh readback establishes expected foreground app',checkedFirst.ready===true&&checkedFirst.targetMatched===true);
  mark('readback does not claim full user-task completion',checkedFirst.ready===true);

  const stepPromise=h.call('life_android_step',{action:'tap',value:'synthetic-failed-button'});
  const stepJob=await h.take(phone);
  mark('next Android action is a separate queued job',stepJob.type==='agent_step');
  assert.equal((await h.complete(phone,stepJob,{ok:false,code:'synthetic-action-failed'})).status,200);
  const stepStatus=await stepPromise;
  mark('device reports downstream action failure exactly',stepStatus.deviceReportedOutcome==='DEVICE_REPORTED_FAILURE'&&stepStatus.result.ok===false);
  mark('failure does not enqueue automatic follow-up or return',(await h.poll(phone)).status===204);

  const explicitReturn=await h.call('life_android_open',{target:'last_work_screen'});
  mark('return is a separate explicitly requested action',explicitReturn.route==='android'&&explicitReturn.queued===true);
  const returnJob=await h.take(phone);
  mark('return dispatch preserves exact previous-work target',returnJob.type==='open_url'&&returnJob.id===explicitReturn.jobId&&returnJob.target==='last_work_screen');
  assert.equal((await h.complete(phone,returnJob,{ok:true,code:'synthetic-return-reported'})).status,200);
  const returnStatus=await h.call('life_job_status',{job_id:returnJob.id});
  mark('return device ack remains unverified until target readback',returnStatus.deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED');
  const returnReadPending=h.call('life_android_snapshot');
  const returnReadJob=await h.take(phone);
  const screen2={ok:true,url:JSON.stringify([{package:'laftel.net.laftel',text:'Synthetic One Piece search',className:'android.view.View'}])};
  assert.equal((await h.complete(phone,returnReadJob,screen2)).status,200);
  const returnRead=await returnReadPending;
  mark('returned Laftel target observed after explicit return',inspectNativeReadback(returnRead,'laftel.net.laftel').ready===true);
  mark('return target must differ from Kakao foreground',inspectNativeReadback(returnRead,'com.kakao.taxi').ready===false);

  const snapBad={status:'complete',result:{ok:true,url:JSON.stringify([{package:'com.other.app',text:'not the requested target'}])}};
  mark('wrong app cannot masquerade as completed return',inspectNativeReadback(snapBad,'laftel.net.laftel').ready===false);
  const incomplete={status:'complete',result:{ok:false,code:'work_window_unavailable'}};
  mark('unobservable screen is never accepted as success',inspectNativeReadback(incomplete,'laftel.net.laftel').ready===false);
  mark('no automatic re-dispatch after final readback',(await h.poll(phone)).status===204);
  console.log('JH_ORCHESTRATOR_CHAIN_AUDIT_PASS '+JSON.stringify({
    passed:checks.length,failed:0,checks,livePhoneActions:0,productionDeployments:0,
    observedGap:'No automatic verified-result-to-return orchestration: return remains an explicit independent command',
    pending:'Actual scroll-coordinate restoration and phone-local UI are out of scope',
    candidateSha256:build.candidateSha256
  }));
 }catch(e){console.error('JH_ORCHESTRATOR_CHAIN_AUDIT_FAIL',e);process.exitCode=1}
 finally{
  for(const client of clients)try{await client.close()}catch{}
  for(const p of children)try{await kill(p)}catch{}
  rmSync(dir,{recursive:true,force:true});
 }
}
