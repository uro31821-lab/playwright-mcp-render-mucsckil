import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {patchDurableMcpWorkflow56} from '../owner-setup/deployment/durable-mcp-workflow-patch.mjs';

// Evaluate the REAL generated handlers, persistence and HMAC checks; only the device/OS is synthetic.
const baseline=`
import {createHash,createHmac,randomBytes} from 'node:crypto';
const sha56=v=>createHash('sha256').update(v).digest('hex');
const hmac56=(k,v)=>createHmac('sha256',k).update(v).digest('hex');
const eqHex56=(a,b)=>a===b;
const validToken56=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,160}$/.test(v);
const seen56=(s,n)=>{if(s.has(n))return false;s.add(n);return true;};
export const jobs=new Map(),queues=new Map(),devices=new Map(),sessions=new Map(),frameWaiters56=new Map();
const durableNativeHooks56={discardTransient:j=>{delete j.privatePolicy;}};
const active56=d=>sessions.get(d);
const chooseDevice=()=>[...sessions.keys()][0];
const textResult=x=>x;
const z={enum:()=>({}),string:()=>({optional:()=>({})})};
export const tools=new Map();
const registerOAuthTool=(n,o,f)=>tools.set(n,f);
let count=0,waiter=async j=>{
 j.status='complete';j.result={ok:true,url:JSON.stringify([{package:'com.android.chrome'}]),
 jhMcpWorkflow:{workflowId:j.workflowId,workflowStepId:j.workflowStepId,workflowPlanDigest:j.workflowPlanDigest,workflowActionDigest:j.workflowActionDigest,jobId:j.id}};
 return j;
};
export const setWaiter=f=>waiter=f;
const waitJob=j=>waiter(j);
const mk=(type,payload,device)=>{const j={id:'job_'+(++count),type,...payload,targetDeviceId:device,secureSessionId:active56(device).sessionId,status:'queued'};jobs.set(j.id,j);queues.set(device,[...(queues.get(device)||[]),j.id]);return j;};
function createMcp(){
  registerOAuthTool("life_status",{});
}
export async function handle(req,res){
 const url=new URL(req.url,'http://localhost');
  if(req.method==="GET" && url.pathname==="/device/poll"){
   res.writeHead(204).end();return;
  }
 res.writeHead(404).end();
}
createMcp();
`;
const secret=Buffer.alloc(32,7);
const sha=x=>createHash('sha256').update(x).digest('hex');
const mac=x=>createHmac('sha256',secret).update(x).digest('hex');
async function runtime(dir,suffix='first'){
 process.env.JH_WORKFLOW_STATE_DIR=dir;
 const file=path.join(dir,'runtime-'+suffix+'.mjs');writeFileSync(file,patchDurableMcpWorkflow56(baseline)+"\nexport const workflowMap=jhMcpWorkflows56;\n");
 const m=await import(pathToFileURL(file).href);
 m.sessions.set('phone',{sessionId:'session_valid_001',deviceDigest:'d'.repeat(64),ownerDigest:'a'.repeat(64),trustId:'t'.repeat(32),secret});
 m.devices.set('phone',{secureBridgeVersion:56,deviceDigest:'d'.repeat(64)});
 return m;
}
async function discard(m,{device='phone',event=randomBytes(16).toString('hex'),bad=false,nonce=randomBytes(18).toString('hex')}={}){
 const raw=Buffer.from(JSON.stringify({deviceId:device,eventId:event})),exp=Date.now()+30000,digest=sha(raw);
 const headers={'x-jh-session':'session_valid_001','x-jh-device':'d'.repeat(64),'x-jh-nonce':nonce,'x-jh-expires':String(exp),'x-jh-body-digest':digest,
 'x-jh-mac':bad?'0'.repeat(64):mac('discard|session_valid_001|'+'d'.repeat(64)+'|'+nonce+'|'+exp+'|'+digest)};
 const req={method:'POST',url:'/device/discard-work',headers,async *[Symbol.asyncIterator](){yield raw;}};
 const result={};const res={writeHead(status){result.status=status;return this;},end(body){result.body=body?JSON.parse(body):null;return this;}};
 await m.handle(req,res);return {...result,event,nonce};
}
test('authenticated deletion, restart, stale completion, scoped identity and idempotent retry',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jh-site-discard-'));
 try{
  const m=await runtime(dir);const call=m.tools.get('life_android_workflow_link');
  const ready=await call({mode:'BEGIN'});assert.equal(ready.phase,'READY');
  const id=ready.workflowId;
  m.jobs.set('other',{id:'other',targetDeviceId:'other-phone',status:'queued',privateText:'KEEP'});
  m.jobs.set('form',{id:'form',targetDeviceId:'phone',status:'in_progress',textValue:'ERASE',privatePolicy:'ERASE'});
  const form=m.jobs.get('form');
  assert.equal((await discard(m,{bad:true})).status,401);assert.equal(m.workflowMap.has(id),true);
  assert.equal((await discard(m,{device:'other-phone'})).status,401);assert.equal(m.jobs.has('other'),true);
  let lateResolve;let startedResolve;
  const started=new Promise(r=>startedResolve=r);
  m.setWaiter(j=>{startedResolve(j);return new Promise(r=>lateResolve=r);});
  const opening=call({mode:'OPEN_KAKAO_T',workflow_id:id});const lateJob=await started;
  let frameResolved=false;m.frameWaiters56.set('frame',{deviceId:'phone',resolve:v=>{assert.equal(v,null);frameResolved=true;}});
  const deleted=await discard(m);assert.equal(deleted.status,200);assert.equal(frameResolved,true);
  assert.equal(m.workflowMap.has(id),false);assert.equal(m.jobs.has(lateJob.id),false);assert.equal(form.textValue,undefined);assert.equal(form.privatePolicy,undefined);
  assert.equal(m.jobs.get('other').privateText,'KEEP');
  lateResolve(lateJob);assert.equal((await opening).code,'site_switch_discarded');
  assert.equal((await call({mode:'STATUS',workflow_id:id})).code,'workflow_not_found_no_automatic_recreation');
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir,'jh-mcp-workflows-v1.json'),'utf8')),[]);
  // A retried old deletion after ACK must not erase a new task.
  m.jobs.set('new',{id:'new',targetDeviceId:'phone',status:'queued',textValue:'NEW'});
  assert.equal((await discard(m,{event:deleted.event})).status,200);assert.equal(m.jobs.has('new'),true);
  assert.equal((await discard(m,{event:deleted.event,nonce:deleted.nonce})).status,401);
  const restarted=await runtime(dir,'restart');assert.equal(restarted.workflowMap.size,0);
  restarted.jobs.set('new',{targetDeviceId:'phone',status:'queued'});
  assert.equal((await discard(restarted,{event:deleted.event})).status,200);assert.equal(restarted.jobs.has('new'),true);
  assert.equal((await restarted.tools.get('life_android_workflow_link')({mode:'BEGIN'})).phase,'READY');
 }finally{rmSync(dir,{recursive:true,force:true});delete process.env.JH_WORKFLOW_STATE_DIR;}
});
