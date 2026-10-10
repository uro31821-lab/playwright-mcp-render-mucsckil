/** Real loopback MCP servers; synthetic phone responses; real timers. No live phone. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
import {reverseNativeReadbackPatch} from '../owner-setup/deployment/native-readback.mjs';
const PIN='e41349feb63ab05a76586b2b9e90746cfbed93a4';
const root=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const cwd=fileURLToPath(new URL('../',import.meta.url));
const TOKEN='SYNTHETIC_NATIVE_READBACK_TEST_ONLY_20261010_XYZ';
const oldBuilder=path.join(root,'deployment/native-readback-parent.mjs');
const oldRuntime=path.join(root,'server-integration/server-native-parent.mjs');
const processes=[],clients=[],checks=[];
const sha=x=>createHash('sha256').update(x).digest('hex');
const check=(name,yes)=>{assert.ok(yes,name);checks.push(name);};
const APP='laftel.net.laftel';
const empty={ok:true,url:JSON.stringify([{package:'com.koreanlifehub.bridge.protocol',text:'Protocol header only, not application UI. '.repeat(8),guidedForm:JSON.stringify({ok:false,code:'work_window_unavailable'})}])};
const ready=p=>({ok:true,url:JSON.stringify([{package:p,text:'Home',className:'android.view.View'},{kind:'snapshot_status',code:'bounded_native_snapshot',nodeCount:'1',restricted:'false'}])});
async function start(file,port){
 const base='http://127.0.0.1:'+port,device='synthetic-native-'+port;
 const proc=spawn(process.execPath,[file],{cwd,env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 processes.push(proc);let log='';for(const stream of [proc.stdout,proc.stderr])stream.on('data',x=>{log=(log+x).slice(-5000)});
 let alive=false;for(let n=0;n<100;n++){
  if(proc.exitCode!==null)throw Error('runtime stopped '+log);
  try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(r.ok){alive=true;break}}catch{}await delay(50);
 }assert.ok(alive,'listener did not start '+log);
 check('unauthorized request blocked '+port,(await fetch(base+'/mcp')).status===401);
 const c=new Client({name:'native-readback-test',version:'1'},{capabilities:{}});
 await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));clients.push(c);
 const r=await fetch(base+'/device/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:device,bridgeVersion:'synthetic-only'})});assert.equal(r.status,200);
 const call=async(name,args={})=>{const r=await c.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content.find(v=>v.type==='text').text);};
 const poll=async()=>{const r=await fetch(base+'/device/poll?deviceId='+device,{signal:AbortSignal.timeout(3000)});if(r.status===204)return null;assert.equal(r.status,200);return r.json();};
 const complete=async(j,result)=>{const r=await fetch(base+'/job/'+j.id+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({result}),signal:AbortSignal.timeout(3000)});assert.equal(r.status,200);};
 return {call,poll,complete};
}
async function drive(server,{name='life_android_open_and_snapshot',args,responses=[empty,ready(APP)],actionResult={ok:true,packageName:APP},pendingRead=false,concurrent=false}){
 let done=false,output,error,readIndex=0;const jobs=[];
 const execute=()=>server.call(name,args);
 const task=(concurrent?Promise.all([execute(),execute()]):execute()).then(x=>{output=x;done=true},e=>{error=e;done=true});
 if(concurrent)await delay(150);
 const end=Date.now()+20000;
 while(!done&&Date.now()<end){
  const j=await server.poll();
  if(j){jobs.push({id:j.id,type:j.type});
   if(j.type==='agent_snapshot'){
    if(!pendingRead){await server.complete(j,responses[Math.min(readIndex,responses.length-1)]);readIndex++;}
   }else{assert.ok(['open_url','agent_step'].includes(j.type),'unexpected job '+j.type);await server.complete(j,actionResult);}
  }
  await delay(20);
 }
 assert.ok(done,'bounded runtime request did not finish');await task;if(error)throw error;
 assert.equal(await server.poll(),null,'no extra job may be queued after response');
 return {output,jobs,actions:jobs.filter(j=>j.type!=='agent_snapshot').length,reads:jobs.filter(j=>j.type==='agent_snapshot').length};
}
try{
 const oldSource=execFileSync('git',['show',PIN+':jh-server/owner-setup/deployment/functional-release-runtime.mjs'],{encoding:'utf8',cwd});
 writeFileSync(oldBuilder,oldSource);
 const oldModule=await import(pathToFileURL(oldBuilder).href);
 copyFileSync(oldModule.assertFunctionalReleaseRuntime(root),oldRuntime);
 const fresh=assertFunctionalReleaseRuntime(root);
 check('new source reverses exactly to deployed parent',reverseNativeReadbackPatch(readFileSync(fresh,'utf8'))===readFileSync(oldRuntime,'utf8'));
 const original=await start(oldRuntime,19871),fixed=await start(fresh,19872);
 const before=await drive(original,{args:{target:'synthetic-baseline'}});
 check('baseline reproduces protocol-only early stop',before.reads===1&&JSON.parse(before.output.snapshot.result.url).every(n=>n.package==='com.koreanlifehub.bridge.protocol'));
 const delayed=await drive(fixed,{args:{target:'synthetic-delayed'}});
 check('one app action and two observations for delayed screen',delayed.actions===1&&delayed.reads===2);
 check('second observation has fresh id, not eight-second cache',delayed.jobs[1].id!==delayed.jobs[2].id);
 check('desired package readiness explicitly confirmed',delayed.output.readback.ready===true&&delayed.output.readback.targetMatched===true);
 check('business success and scroll restoration never inferred',delayed.output.readback.taskSuccessVerified===false&&delayed.output.readback.pageOrScrollRestored===false);
 const absent=await drive(fixed,{args:{target:'synthetic-never-ready'},responses:[empty]});
 check('never-ready screen stops after three observations',absent.actions===1&&absent.reads===3&&absent.output.readback.ready===false&&absent.output.readback.limitReached===true);
 const wrong=await drive(fixed,{args:{target:'synthetic-wrong-app'},responses:[ready('com.kakao.taxi'),ready(APP)]});
 check('wrong package rejected until correct package appears',wrong.reads===2&&wrong.output.readback.targetMatched===true);
 const denied=await drive(fixed,{args:{target:'synthetic-denied'},responses:[{ok:false,code:'approval_required'}]});
 check('snapshot authorization denial not retried',denied.actions===1&&denied.reads===1&&denied.output.readback.ready===false);
 const failed=await drive(fixed,{args:{target:'ChatGPT'},actionResult:{ok:false,url:'error:unknown_target:ChatGPT'}});
 check('failed launch receives no observation',failed.actions===1&&failed.reads===0&&failed.output.code==='ANDROID_OPEN_FAILED');
 const moved=await drive(fixed,{name:'life_android_step_and_snapshot',args:{action:'back',text:'synthetic-case-one'}});
 check('step path also performs one action and bounded fresh reads',moved.actions===1&&moved.reads===2&&moved.output.readback.ready===true);
 const failedStep=await drive(fixed,{name:'life_android_step_and_snapshot',args:{action:'back',text:'synthetic-case-failed'},actionResult:{ok:false}});
 check('failed step receives no observations',failedStep.actions===1&&failedStep.reads===0&&failedStep.output.readback.ready===false);
 const malformed=await drive(fixed,{args:{target:'synthetic-invalid'},responses:[{ok:true,url:'not json'}]});
 check('malformed payload stops rather than loops',malformed.reads===1&&malformed.output.readback.reason==='SNAPSHOT_PAYLOAD_INVALID');
 const restricted=await drive(fixed,{args:{target:'synthetic-restricted'},responses:[{ok:true,restricted:true,url:'[]'}]});
 check('restricted work window stops rather than loops',restricted.reads===1&&restricted.output.readback.reason==='SNAPSHOT_ACCESS_BLOCKED');
 const direct1=await drive(fixed,{name:'life_android_snapshot',args:{},responses:[ready(APP)]});
 const direct2=await drive(fixed,{name:'life_android_snapshot',args:{},responses:[ready(APP)]});
 check('completed standalone reads are never served from stale cache',direct1.reads===1&&direct2.reads===1&&direct1.jobs[0].id!==direct2.jobs[0].id);
 const together=await drive(fixed,{name:'life_android_snapshot',args:{},responses:[ready(APP)],concurrent:true});
 check('concurrent in-progress native reads remain coalesced',together.reads===1&&together.output.length===2);
 const pending=await drive(fixed,{args:{target:'synthetic-pending'},pendingRead:true});
 check('unanswered read is not multiplied into more pending jobs',pending.actions===1&&pending.reads===1&&pending.output.readback.reason==='SNAPSHOT_NOT_COMPLETED');
 const report={scope:'Real Node/MCP servers, loopback HTTP, synthetic phone, real timers; no phone/production test',parentCommit:PIN,
  parentRuntimeSha256:sha(readFileSync(oldRuntime)),candidateRuntimeSha256:sha(readFileSync(fresh)),checks,passed:checks.length,failed:0,phoneOperations:0,productionDeployments:0};
 console.log('JH_NATIVE_READBACK_E2E_PASS '+JSON.stringify(report));
}catch(e){console.error('JH_NATIVE_READBACK_E2E_FAIL',e);process.exitCode=1;}
finally{
 for(const c of clients){try{await c.close()}catch{}}
 await Promise.all(processes.map(p=>new Promise(resolve=>{if(p.exitCode!==null){resolve();return}p.once('exit',()=>{clearTimeout(timer);resolve()});const timer=setTimeout(()=>{p.kill('SIGKILL');resolve()},2000);p.kill('SIGTERM')})));
 rmSync(oldBuilder,{force:true});rmSync(oldRuntime,{force:true});
}
