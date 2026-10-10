/** Actual process death and restart, on isolated HTTP+MCP servers.
 * Do not use a real Android device or production. Reconnect is never automatic.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
const ROOT=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const CWD=fileURLToPath(new URL('../',import.meta.url));
const PIN='52fd15dcb599e63e3e4861c53c6ad765a517b1dd';
const TOKEN='JH_LOOPBACK_RESTART_TEST_ONLY_20261010_SECURE';
const CATALOG='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
const checks=[],children=[],clients=[];
const check=(label,condition)=>{assert.ok(condition,label);checks.push(label);};
const hex=x=>createHash('sha256').update(x).digest('hex');
const nonce=()=>randomBytes(24).toString('base64url');
const mac=(key,m)=>createHmac('sha256',Buffer.from(key,'base64url')).update(m).digest('hex');
async function start(serverFile,port){
 const origin='http://127.0.0.1:'+port;
 const proc=spawn(process.execPath,[serverFile],{cwd:CWD,env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 children.push(proc);
 let messages='';for(const out of [proc.stdout,proc.stderr])out.on('data',x=>messages=(messages+x.toString()).slice(-4000));
 let live=false;for(let i=0;i<100;i++){
  if(proc.exitCode!==null)throw Error('server exited: '+messages);
  try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(800)});if(r.ok){live=true;break;}}catch{}
  await delay(50);
 }
 assert.ok(live,'could not start '+messages);
 check('unauthenticated MCP remains blocked', (await fetch(origin+'/mcp')).status===401);
 const client=new Client({name:'circuit-restart-test',version:'1'},{capabilities:{}});
 await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));
 clients.push(client);
 const call=async(name,args={})=>{
  const r=await client.callTool({name,arguments:args});
  assert.notEqual(r.isError,true,JSON.stringify(r));
  return JSON.parse(r.content.find(x=>x.type==='text').text);
 };
 const request=async(method,path,payload=null,headers={})=>{
  const opts={method,headers:{...headers}};
  if(payload!==null){opts.headers['content-type']='application/json';opts.body=JSON.stringify(payload);}
  const r=await fetch(origin+path,opts);return{status:r.status,data:r.status===204?null:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
 };
 async function enroll(deviceId){
  const devDigest=hex('jh56|'+deviceId),cn=nonce(),timestamp=Date.now();
  const reg=await request('POST','/device/register',{deviceId,secureBridgeVersion:56,deviceDigest:devDigest,clientNonce:cn,clientTime:timestamp,toolCatalogDigest:CATALOG,bridgeVersion:'mock-secure56'});
  assert.equal(reg.status,200,JSON.stringify(reg));
  const session={...reg.data,deviceId,deviceDigest:devDigest};
  const n=nonce(),deadline=Date.now()+30000;
  const hdr={'x-jh-session':session.secureSessionId,'x-jh-device':devDigest,'x-jh-nonce':n,'x-jh-expires':String(deadline),'x-jh-mac':mac(session.secureSessionSecret,'activate|'+session.secureSessionId+'|'+devDigest+'|'+n+'|'+deadline)};
  const active=await request('POST','/device/activate',{deviceId,sessionDigest:session.sessionDigest},hdr);
  assert.equal(active.status,200,JSON.stringify(active));
  return session;
 }
 async function poll(session){
  const n=nonce(),t=Date.now()+30000;
  const hdr={'x-jh-session':session.secureSessionId,'x-jh-device':session.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),'x-jh-mac':mac(session.secureSessionSecret,'poll|'+session.secureSessionId+'|'+session.deviceDigest+'|'+n+'|'+t)};
  return request('GET','/device/poll?deviceId='+encodeURIComponent(session.deviceId),null,hdr);
 }
 async function complete(session,job){
  const body={result:{ok:true,url:'synthetic:no_effect'}},raw=JSON.stringify(body),rd=hex(raw),n=nonce(),t=Date.now()+30000;
  const hdr={'x-jh-session':session.secureSessionId,'x-jh-device':session.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),'x-jh-result-digest':rd,'x-jh-mac':mac(session.secureSessionSecret,'complete|'+session.secureSessionId+'|'+job.id+'|'+session.deviceDigest+'|'+n+'|'+t+'|'+rd)};
  return request('POST','/job/'+job.id+'/complete',body,hdr);
 }
 return {proc,call,enroll,poll,complete};
}
async function die(proc){
 const end=new Promise(resolve=>proc.once('exit',resolve));
 proc.kill('SIGKILL');
 await Promise.race([end,delay(2000).then(()=>{throw Error('mock process did not exit')})]);
}
try{
 const file=assertFunctionalReleaseRuntime(ROOT);
 const first=await start(file,19091);
 const A=await first.enroll('simulated-restart-device');
 check('initial secure connection is activated',(await first.call('life_android_devices')).devices.length===1);
 // Queued but never delivered: server shutdown must not replay it.
 const queued=await first.call('life_android_open',{target:'last_work_screen'});
 check('queued action accepted with device present',queued.queued&&queued.jobId);
 await die(first.proc);
 const second=await start(file,19092);
 check('no persisted manual device binding on fresh process',(await second.call('life_android_devices')).devices.length===0);
 const obsoletePoll=await second.poll(A);
 check('former session poll denied after server restart',obsoletePoll.status===401);
 const beforeReconnect=await second.call('life_android_open',{target:'last_work_screen'});
 check('old pending command does not auto-replay in new process',beforeReconnect.queued===false);
 const B=await second.enroll(A.deviceId);
 const empty=await second.poll(B);
 check('newly authenticated device finds no old queued work',empty.status===204);
 // Dispatch under B but never send an accepted result.
 const action=await second.call('life_android_open',{target:'last_work_screen'});
 const inProgress=await second.poll(B);
 check('separate explicit command can be delivered after synthetic reconnect',action.queued&&inProgress.status===200&&inProgress.data.id===action.jobId);
 await die(second.proc);
 const third=await start(file,19093);
 check('in-progress action is NOT implicitly restored to process queue',(await third.call('life_android_devices')).devices.length===0);
 check('old session cannot report completion into new process',(await third.complete(B,inProgress.data)).status===404);
 const C=await third.enroll(A.deviceId);
 check('new secure session still has no automatic replay',(await third.poll(C)).status===204);
 // Not evidence of durable no-replay; a NEW explicit request would produce a new job.
 const explicit=await third.call('life_android_open',{target:'last_work_screen'});
 check('fresh explicit user command can create a new job; ambiguity not durably tracked',explicit.queued===true);
 const newDispatch=await third.poll(C);
 check('fresh explicit command has no cross-restart identity binding',newDispatch.status===200&&newDispatch.data.type==='open_url');
 const result=await third.complete(C,newDispatch.data);
 check('new command still completes under its own authenticated session',result.status===200);
 console.log('JH_RESTART_CIRCUIT_PROOF '+JSON.stringify({passed:checks.length,failed:0,checks,productionImpact:0,actualPhoneOperations:0,assessment:'NO_AUTOMATIC_REPLAY_OBSERVED; NO_PERSISTED_MANUAL_OUTCOME_RECONCILIATION; EXPLICIT_POST_RESTART_REPEAT_NOT_FENCED'}));
}catch(e){console.error('JH_RESTART_CIRCUIT_FAIL',e);process.exitCode=1;}
finally{
 for(const c of clients)try{await c.close()}catch{}
 await Promise.all(children.map(p=>new Promise(resolve=>{if(p.exitCode!==null){resolve();return}p.once('exit',()=>{clearTimeout(timeout);resolve()});const timeout=setTimeout(resolve,1500);p.kill('SIGKILL')})));
}
