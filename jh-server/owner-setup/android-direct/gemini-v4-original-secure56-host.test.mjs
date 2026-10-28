import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalSecure56V4RightGeminiHost} from './gemini-v4-original-secure56-host.mjs';

const command='a'.repeat(32),operation='b'.repeat(32),NOW=1800000000000;
const proof=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
 workSide:'RIGHT',chatSide:'LEFT',commandId:command,
 deviceId:'real-phone',sessionId:'original56',workWindowId:25,chatWindowId:24,
 workBounds:'1100,0,2200,1800',chatBounds:'0,0,1100,1800',
 workPackage:'com.google.android.googlequicksearchbox',
 chatPackage:'com.openai.chatgpt',nativeGeminiWindowVerified:true,
 observedAt:NOW-200});
const phoneResult=()=>({ok:true,code:'GEMINI_EXISTING_RIGHT_WINDOW_BOUND',
 workPackage:'com.google.android.googlequicksearchbox',
 workWindowId:25,chatWindowId:24,
 workBounds:'1100,0,2200,1800',chatBounds:'0,0,1100,1800',
 workSide:'RIGHT',chatSide:'LEFT',requestSent:false,
 resultVerified:false,automaticReplayAllowed:false});
function fixture(change={}){
 let current=proof(),metadata={secureActive:true,secureBridgeVersion:56,deviceDigest:'device-digest'};
 let session={sessionId:'original56',deviceDigest:'device-digest'};
 let commandNow=command;
 const claimed=new Map(),jobs=new Map(),calls=[];
 let sequence=0;
 const pane={
   read:()=>({...current}),
   verify:(p,c)=>p.commandId===c&&
     ['deviceId','sessionId','workWindowId','chatWindowId','workBounds','chatBounds','workPackage','chatPackage']
      .every(k=>current[k]===p[k]),
   capabilities:()=>({ready:true})
 };
 const original={
  selectDevice:()=>current.deviceId,
  activeSession:()=>session,
  deviceMeta:()=>metadata,
  requireCommand:()=>commandNow,
  makeOriginalJob:async(type,p,deviceId)=>{
   calls.push({type:'queued',jobType:type,p,deviceId});
   const j={id:'job-'+(++sequence),type,status:'queued',targetDeviceId:deviceId,
    secureSessionId:session.sessionId,secureMac:'original-signed-mac',
    ...structuredClone(p)};
   jobs.set(j.id,j);
   return j;
  },
  getOriginalJob:async id=>jobs.get(id),
  verifyOriginalQueuedJob:async j=>j.secureMac==='original-signed-mac',
  verifyOriginalCompletedJob:async j=>j.secureMac==='original-signed-mac'&&j.status==='complete'
 };
 const durable={source:'ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER',
  claim:async(id,record)=>{calls.push({type:'claim',id,record});
    if(claimed.has(id))return false;claimed.set(id,{...record,operationId:id});return true},
  attachJob:async(id,jobId)=>{const rec=claimed.get(id);
    if(!rec||rec.jobId)return false;rec.jobId=jobId;return true},
  lookup:async id=>claimed.get(id),
  verify:async(record,id)=>record.operationId===id&&claimed.get(id)===record
 };
 const input={pane,original,durable,enabled:true,clock:()=>NOW,...change};
 const gate=createOriginalSecure56V4RightGeminiHost(input);
 return {gate,calls,jobs,claimed,pane,original,durable,
   changeScreen:ch=>{current={...current,...ch}},
   changeMeta:ch=>{metadata={...metadata,...ch}},
   changeSession:ch=>{session={...session,...ch}},
   changeCommand:id=>{commandNow=id},
   current:()=>current};
}
const q={operationId:operation,commandId:command};
test('original persistent ledger, original device auth and phone verifier are mandatory',()=>{
 const h=fixture();
 assert.throws(()=>createOriginalSecure56V4RightGeminiHost({}),/ORIGINAL_SECURE56_HOST_AND_DURABLE_PORTS_REQUIRED/);
 assert.throws(()=>createOriginalSecure56V4RightGeminiHost({pane:h.pane,original:h.original,durable:{...h.durable,source:'LOCAL_MAP'}}),/ORIGINAL_PERSISTENT_LEDGER_REQUIRED/);
});
test('correct Secure56 job is original signed open_url RIGHT Gemini read-only target',async()=>{
 const h=fixture(),r=await h.gate.bind(q);
 assert.equal(r.code,'RIGHT_GEMINI_BINDING_JOB_STARTED_READ_STATUS');
 assert.equal(h.calls.length,2);
 const queued=h.calls[1];
 assert.equal(queued.type,'queued');assert.equal(queued.jobType,'open_url');
 assert.equal(queued.p.target,'right_gemini_existing');
 assert.equal(queued.p.commandId,command);assert.equal(queued.p.operationId,operation);
 assert.equal(queued.p.expectedWorkBounds,'1100,0,2200,1800');
 assert.equal(queued.p.expectedChatBounds,'0,0,1100,1800');
 assert.equal(queued.deviceId,'real-phone');
 assert.equal(h.claimed.get(operation).jobId,'job-1');
 assert.equal(h.jobs.get('job-1').secureMac,'original-signed-mac');
});
test('phone returned result does not claim sending, video, or ChatGPT delivery',async()=>{
 const h=fixture();await h.gate.bind(q);const j=h.jobs.get('job-1');
 j.status='complete';j.result=phoneResult();
 const done=await h.gate.status(q);
 assert.equal(done.ok,true);assert.equal(done.windowBound,true);
 assert.equal(done.requestSent,false);assert.equal(done.videoVerified,false);
 assert.equal(done.geminiReplyVerified,false);
});
test('original signed JSON text result is parsed only after completion authentication',async()=>{
 const h=fixture();await h.gate.bind(q);
 const j=h.jobs.get('job-1');j.status='complete';j.result=JSON.stringify(phoneResult());
 assert.equal((await h.gate.status(q)).code,'SIGNED_GEMINI_RIGHT_WINDOW_BOUND');
});
test('wrong window position or package prevents original signed phone job',async()=>{
 for(const ch of [{workSide:'LEFT',chatSide:'RIGHT'},
  {workPackage:'com.android.chrome'},{chatPackage:'com.android.chrome'}]){
  const h=fixture();h.changeScreen(ch);
  assert.equal((await h.gate.bind(q)).code,'CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED',JSON.stringify(ch));
  assert.equal(h.calls.length,0);
 }
});
test('changed session or original command prevents phone job without replay',async()=>{
 for(const kind of ['session','command','meta']){
  const h=fixture();
  if(kind==='session')h.changeSession({sessionId:'another'});
  if(kind==='command')h.changeCommand('d'.repeat(32));
  if(kind==='meta')h.changeMeta({secureActive:false});
  assert.equal((await h.gate.bind(q)).code,'CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED');
  assert.equal(h.jobs.size,0);
 }
});
test('same durable operation cannot enqueue another original job',async()=>{
 const h=fixture();await h.gate.bind(q);
 assert.equal((await h.gate.bind(q)).code,'ORIGINAL_OPERATION_ALREADY_RESERVED_READ_ONLY');
 assert.equal(h.calls.filter(c=>c.type==='queued').length,1);
});
test('different user operation ID cannot claim same registered identity without exact scope',async()=>{
 const h=fixture();await h.gate.bind(q);
 h.changeCommand('e'.repeat(32));
 assert.equal((await h.gate.bind({...q,operationId:'c'.repeat(32)})).code,
  'CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED');
 assert.equal(h.calls.filter(c=>c.type==='queued').length,1);
});
test('durable attach failure occurs after sending: classify UNKNOWN, never auto-retry',async()=>{
 const h=fixture({durable:{...fixture().durable,source:'ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER',
  claim:async()=>true,attachJob:async()=>false,lookup:async()=>null,verify:async()=>false}});
 const result=await h.gate.bind(q);
 assert.equal(result.code,'GEMINI_PHONE_JOB_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal(result.automaticReplay,false);
 assert.equal(h.calls.filter(c=>c.type==='queued').length,1);
});
test('unsigned original phone queued job is refused after durable claim, not retried',async()=>{
 const h=fixture();h.original.verifyOriginalQueuedJob=async()=>false;
 const r=await h.gate.bind(q);
 assert.equal(r.code,'GEMINI_PHONE_JOB_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal(h.claimed.size,1);
 assert.equal(h.calls.filter(x=>x.type==='queued').length,1);
});
test('an original phone job still pending returns PENDING/UNKNOWN without new command',async()=>{
 const h=fixture();await h.gate.bind(q);
 assert.equal((await h.gate.status(q)).code,'ORIGINAL_GEMINI_PHONE_BINDING_PENDING_OR_UNKNOWN');
 assert.equal(h.calls.filter(x=>x.type==='queued').length,1);
});
test('a forged phone success is rejected by original completion authenticator',async()=>{
 const h=fixture();await h.gate.bind(q);
 const j=h.jobs.get('job-1');j.status='complete';j.result=phoneResult();
 h.original.verifyOriginalCompletedJob=async()=>false;
 assert.equal((await h.gate.status(q)).code,'ORIGINAL_GEMINI_RECEIPT_NOT_AUTHENTICATED');
});
test('a forged right Gemini window ID, submit success or move is rejected',async()=>{
 for(const bad of [{workWindowId:99},{requestSent:true},{automaticReplayAllowed:true},{chatBounds:'990,0,1200,1800'}]){
  const h=fixture();await h.gate.bind(q);const j=h.jobs.get('job-1');
  j.status='complete';j.result={...phoneResult(),...bad};
  assert.equal((await h.gate.status(q)).code,'GEMINI_RIGHT_PAIR_READBACK_MISMATCH',JSON.stringify(bad));
 }
});
test('signed owner changes between original job and readback blocks old response',async()=>{
 const h=fixture();await h.gate.bind(q);
 h.jobs.get('job-1').status='complete';h.jobs.get('job-1').result=phoneResult();
 h.changeScreen({workWindowId:36});
 assert.equal((await h.gate.status(q)).code,'GEMINI_RIGHT_PAIR_READBACK_MISMATCH');
});
test('lost original durable record after restart is NOT permission to regenerate',async()=>{
 const h=fixture();await h.gate.bind(q);
 h.claimed.delete(operation);
 assert.equal((await h.gate.status(q)).code,'ORIGINAL_GEMINI_PHONE_BINDING_PENDING_OR_UNKNOWN');
});
test('read-only port capabilities state all release boundaries clearly',()=>{
 const h=fixture();const c=h.gate.capabilities();
 assert.equal(c.originalJHQueueUsed,true);assert.equal(c.originalPersistentLedgerRequired,true);
 assert.equal(c.phoneSignaturesReused,true);assert.equal(c.liveHostRegistered,false);
 assert.equal(c.mediaDelivered,false);assert.equal(c.actualPhoneTested,false);
});
