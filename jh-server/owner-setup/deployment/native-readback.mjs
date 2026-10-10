/** Bounded accessibility readback. Never dispatches/replays an Android action. */
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const bool=x=>x===true||x==='true';
const packageName=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(x)&&x.length<=200;
const ignored=new Set(['com.koreanlifehub.bridge.protocol','com.koreanlifehub.bridge','com.openai.chatgpt','com.android.systemui']);
const temporary=new Set(['work_window_unavailable','work_window_required']);
const decision=(ready,reason,retryable=false,extra={})=>({ready,reason,retryable,...extra});
export function expectedNativePackage(action){
 const reported=action?.result?.packageName;
 if(packageName(reported))return reported;
 const target=String(action?.target||'').trim().toLowerCase();
 if(['카카오t','카카오티','kakao t','카카오 택시'].includes(target))return 'com.kakao.taxi';
 if(['라프텔','laftel'].includes(target))return 'laftel.net.laftel';
 return null;
}
export function inspectNativeReadback(job,expected=null){
 if(!job||job.status!=='complete')return decision(false,'SNAPSHOT_NOT_COMPLETED');
 const r=job.result;
 if(!isObject(r))return decision(false,'SNAPSHOT_RESULT_INVALID');
 if(bool(r.restricted)||bool(r.locked)||bool(r.secureContext))return decision(false,'SNAPSHOT_ACCESS_BLOCKED');
 if(r.ok!==true)return decision(false,temporary.has(r.code)?'WORK_WINDOW_NOT_READY':'SNAPSHOT_REPORTED_FAILURE',temporary.has(r.code));
 if(typeof r.url!=='string'||Buffer.byteLength(r.url)>2*1024*1024)return decision(false,'SNAPSHOT_PAYLOAD_INVALID');
 let nodes;try{nodes=JSON.parse(r.url);}catch{return decision(false,'SNAPSHOT_PAYLOAD_INVALID');}
 if(!Array.isArray(nodes)||nodes.length>3000||nodes.some(n=>!isObject(n)))return decision(false,'SNAPSHOT_PAYLOAD_INVALID');
 if(nodes.some(n=>bool(n.restricted)||bool(n.locked)||bool(n.secureContext)))return decision(false,'SNAPSHOT_ACCESS_BLOCKED');
 for(const n of nodes){
  if(n.package!=='com.koreanlifehub.bridge.protocol'||n.guidedForm===undefined)continue;
  let g;try{g=JSON.parse(n.guidedForm);}catch{return decision(false,'SNAPSHOT_METADATA_INVALID');}
  if(!isObject(g))return decision(false,'SNAPSHOT_METADATA_INVALID');
  if(g.ok===false&&temporary.has(g.code))return decision(false,'WORK_WINDOW_NOT_READY',true);
  if(g.ok===false&&g.code!=='native_accessibility_only'&&!temporary.has(g.code))return decision(false,'SNAPSHOT_ACCESS_OR_METADATA_BLOCKED');
 }
 const packages=[...new Set(nodes.filter(n=>packageName(n.package)&&!ignored.has(n.package)&&n.kind!=='snapshot_status'&&
  [n.text,n.className,n.viewId].some(v=>typeof v==='string'&&v.trim().length>0)).map(n=>n.package))];
 if(!packages.length)return decision(false,'WORK_WINDOW_NOT_READY',true);
 if(expected&&!packages.includes(expected))return decision(false,'EXPECTED_APP_NOT_READY',true);
 return decision(true,'NATIVE_SCREEN_READABLE',false,{observedPackages:packages.slice(0,8),targetMatched:expected?true:null,
  partial:nodes.some(n=>bool(n.partial))});
}
export async function runNativeReadback({action,requestSnapshot,waitSnapshot,bindingValid,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 let snapshot=null,attempts=0;const expectedPackage=expectedNativePackage(action);
 let state=decision(false,'ACTION_NOT_CONFIRMED');
 const result=()=>({snapshot,readback:{version:'bounded-native-v2-full-budget',...state,attempts,maxAttempts:3,expectedPackage,
  actionReplayCount:0,taskSuccessVerified:false,pageOrScrollRestored:false}});
 const ended=Date.parse(action?.completedAt);
 if(action?.status!=='complete'||action?.result?.ok!==true||!Number.isFinite(ended))return result();
 const started=now(),deadline=started+12000;const seen=new Set();
 for(let index=0;index<3;index++){
  if(!bindingValid()){state=decision(false,'DEVICE_OR_SESSION_CHANGED');break;}
  if(index>0)await sleep(Math.min(index*250,Math.max(0,deadline-now())));
  if(now()>=deadline){state=decision(false,'READBACK_DEADLINE');break;}
  if(!bindingValid()){state=decision(false,'DEVICE_OR_SESSION_CHANGED');break;}
  let job;
  try{job=requestSnapshot();attempts++;
   if(!job||typeof job.id!=='string'){state=decision(false,'SNAPSHOT_JOB_INVALID');break;}
   if(seen.has(job.id)){state=decision(false,'STALE_SNAPSHOT_REUSED');break;}
   seen.add(job.id);snapshot=await waitSnapshot(job,Math.max(1,deadline-now()));
  }catch{state=decision(false,'SNAPSHOT_TRANSPORT_FAILED');break;}
  if(!bindingValid()||snapshot?.targetDeviceId!==action.targetDeviceId||
     (action.secureSessionId&&snapshot?.secureSessionId!==action.secureSessionId)){
   snapshot=null;state=decision(false,'DEVICE_OR_SESSION_CHANGED');break;
  }
  if(now()>deadline){state=decision(false,'READBACK_DEADLINE');break;}
  if(snapshot?.status!=='complete'){state=decision(false,'SNAPSHOT_NOT_COMPLETED');break;}
  if(!Number.isFinite(snapshot.createdAtMs)||snapshot.createdAtMs<ended||
     !Number.isFinite(Date.parse(snapshot.completedAt))||Date.parse(snapshot.completedAt)<snapshot.createdAtMs){
   state=decision(false,'STALE_OR_UNTIMED_SNAPSHOT',true);
  }else state=inspectNativeReadback(snapshot,expectedPackage);
  if(state.ready||!state.retryable)break;
 }
 if(!state.ready&&state.retryable){state={...state,retryable:false,limitReached:true};}
 return result();
}
const PREFIX='import {runNativeReadback} from "../deployment/native-readback.mjs";\n';
const CACHE_OLD='const old=cacheGet(recentJobs,key); if(old) return old;';
const POLL_OLD='cleanupJobs();const q=queues.get(d)||[];while(q.length&&jobs.get(q[0])?.status!=="queued")q.shift();if(!q.length){res.writeHead(204).end();return;}';
const POLL_NEW=`cleanupJobs();const q=queues.get(d)||[];
    // FENCE: a queued job may belong to a former or now-expired secure session.
    // Do not give that old command to a new session's authenticated poll.
    while(q.length){
      const queued=jobs.get(q[0]);
      if(queued?.status!=="queued"){q.shift();continue;}
      const active=dm?.secureBridgeVersion===56?active56(d):null;
      const stale=dm?.secureBridgeVersion===56
        ?(!active||queued.secureSessionId!==active.sessionId)
        :!!queued.secureSessionId;
      const deadline=Number.isFinite(queued.secureExpiresAt)&&queued.secureExpiresAt<=Date.now();
      if(!stale&&!deadline)break;
      q.shift();queued.status="expired";
      queued.error=stale?"SECURE_SESSION_CHANGED_BEFORE_DISPATCH":"SECURE_JOB_EXPIRED_BEFORE_DISPATCH";
      queued.completedAt=new Date().toISOString();
    }
    if(!q.length){res.writeHead(204).end();return;}`;
const CLEANUP_OLD='if((j.status==="queued"||j.status==="in_progress") && now-born>JOB_TTL_MS){j.status="expired";j.error="job_timeout";j.completedAt=new Date().toISOString();}';
const CLEANUP_NEW='if((j.status==="queued"||j.status==="in_progress") && now-born>JOB_TTL_MS){const dispatched=j.status==="in_progress";const uncertain=dispatched&&j.type!=="agent_snapshot";j.status=uncertain?"error":"expired";j.error=uncertain?"DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY":"job_timeout";j.completedAt=new Date().toISOString();}';
const CACHEGET_TIMEOUT_OLD='function cacheGet(m,k){const x=m.get(k);if(!x)return null;const pending=x.v?.status==="queued"||x.v?.status==="in_progress";if(Date.now()-x.t>DEDUPE_MS&&!pending){m.delete(k);return null;}return x.v;}';
const CACHEGET_TIMEOUT_NEW='function cacheGet(m,k){const x=m.get(k);if(!x)return null;const pending=x.v?.status==="queued"||x.v?.status==="in_progress";const uncertain=x.v?.status==="error"&&x.v?.error==="DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY"&&jobs.get(x.v.id)===x.v;if(Date.now()-x.t>DEDUPE_MS&&!pending&&!uncertain){m.delete(k);return null;}return x.v;}';
const CACHEGET_OLD='function cacheGet(m,k){const x=m.get(k);if(!x)return null;if(Date.now()-x.t>DEDUPE_MS){m.delete(k);return null;}return x.v;}';
const CACHEGET_NEW='function cacheGet(m,k){const x=m.get(k);if(!x)return null;const pending=x.v?.status==="queued"||x.v?.status==="in_progress";if(Date.now()-x.t>DEDUPE_MS&&!pending){m.delete(k);return null;}return x.v;}';
const CACHE_NEW='cleanupJobs();\n  const old=cacheGet(recentJobs,key);\n  const currentSessionId=active56(targetDeviceId)?.sessionId??null;\n  // A delivered operation whose result is unknown is NEVER an automatic retry.\n  if(old?.status==="error"&&old.error==="DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY")return old;\n  // A dispatched job from an earlier session has an uncertain outcome: never replace it by retry.\n  if(old?.status==="in_progress"&&(old.secureSessionId??null)!==currentSessionId)return old;\n  if(old && (old.secureSessionId??null)===currentSessionId && !(type==="agent_snapshot" && ["complete","error","expired"].includes(old.status))) return old;';
const WRAPPER=`async function boundedNativeReadback(action){
 const d=action?.targetDeviceId;
 const bindingValid=()=>{
  if(!d||!devices.has(d)||Date.now()-(devices.get(d)?.lastSeen||0)>90000)return false;
  if(activeDeviceId&&activeDeviceId!==d)return false;
  const session=active56(d);
  return action.secureSessionId?session?.sessionId===action.secureSessionId:(!session&&devices.get(d)?.secureBridgeVersion!==56);
 };
 return runNativeReadback({action,bindingValid,requestSnapshot:()=>mk("agent_snapshot",{},d),waitSnapshot:waitJob});
}
`;
const HOOK='const browserEventTransport=withBrowserEvents(browserTransport);';
const OPEN_OLD=`    let snap=null;
    for(let i=0;i<4;i++){
      const sj=mk("agent_snapshot",{},openJob.targetDeviceId);
      snap=await waitJob(sj,8000);
      const content=snap?.result;
      if(content && JSON.stringify(content).length>80) break;
      await new Promise(r=>setTimeout(r,350));
    }
    return textResult({opened,targetDeviceId:openJob.targetDeviceId,snapshot:snap});`;
const OPEN_NEW=`    const observation=await boundedNativeReadback(opened);
    return textResult({opened:safeJobView56(opened),targetDeviceId:openJob.targetDeviceId,
      snapshot:observation.snapshot?safeJobView56(observation.snapshot):null,readback:observation.readback});`;
const STEP_OLD=`    let snap=null;
    for(let i=0;i<3;i++){
      const sj=mk("agent_snapshot",{},stepJob.targetDeviceId);
      snap=await waitJob(sj,7000);
      if(snap?.result && JSON.stringify(snap.result).length>80) break;
      await new Promise(r=>setTimeout(r,300));
    }
    return textResult({acted,targetDeviceId:stepJob.targetDeviceId,snapshot:snap});`;
const STEP_NEW=`    const observation=await boundedNativeReadback(acted);
    return textResult({acted:safeJobView56(acted),targetDeviceId:stepJob.targetDeviceId,
      snapshot:observation.snapshot?safeJobView56(observation.snapshot):null,readback:observation.readback});`;
const edits=[[CLEANUP_OLD,CLEANUP_NEW],[CACHEGET_OLD,CACHEGET_NEW],[CACHEGET_TIMEOUT_OLD,CACHEGET_TIMEOUT_NEW],[CACHE_OLD,CACHE_NEW],[POLL_OLD,POLL_NEW],[HOOK,WRAPPER+HOOK],[OPEN_OLD,OPEN_NEW],[STEP_OLD,STEP_NEW]];
export function applyNativeReadbackPatch(source){
 let patched=source;
 for(const [before,after]of edits){if(patched.split(before).length!==2||patched.includes(after))throw Error('NATIVE_READBACK_PATCH_ANCHOR');patched=patched.replace(before,after);}
 patched=PREFIX+patched;
 if(reverseNativeReadbackPatch(patched)!==source)throw Error('NATIVE_READBACK_PATCH_SCOPE');
 return patched;
}
export function reverseNativeReadbackPatch(source){
 if(!source.startsWith(PREFIX))throw Error('NATIVE_READBACK_PREFIX_MISSING');
 let s=source.slice(PREFIX.length);for(const [before,after]of edits.slice().reverse())s=s.replace(after,before);return s;
}
