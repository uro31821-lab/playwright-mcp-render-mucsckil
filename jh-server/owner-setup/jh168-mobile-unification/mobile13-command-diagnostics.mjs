import {createHash} from 'node:crypto';

/** Advisory projection of existing memory only. No admission, lookup token,
 * cleanup, session refresh, durable journal read, or historical reconciliation.
 */
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const command=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,160}$/.test(value);
const trust=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{24,128}$/.test(value);
const freeze=Object.freeze;
const unknownFocus=()=>freeze({state:'unknown',present:null,active:null,remainingMs:null,currentCommandMatches:null});
const unknownJobs=()=>freeze({state:'unknown',pending:null,inflight:null});
const unknownWorkflows=()=>freeze({state:'unknown',unfinished:null});
const MAX_ROWS=4096;

export function readMobile13CommandDiagnostics56({nowMs=Date.now(),deviceId,deviceMeta,
 activeSession,currentCommand,runtimeGeneration,jobs,workflows,discardPending,
 focus,lastVerifiedPoll}={}){
 const validTime=Number.isSafeInteger(nowMs)&&nowMs>=0&&nowMs<=8640000000000000;
 const out={schema:'JH168_MOBILE13_COMMAND_DIAGNOSTICS_V1',state:'unknown',
  scope:'SELECTED_DEVICE_LAST_BOUND_OWNER_MEMORY',
  observedAt:validTime?new Date(nowMs).toISOString():null,
  runtimeGeneration:hex(runtimeGeneration)?runtimeGeneration:null,deviceDigest:null,
  trustVerification:'NOT_REVALIDATED_READ_ONLY',
  command:freeze({state:'unknown',digest:null}),transientJobs:unknownJobs(),
  workflows:unknownWorkflows(),discard:freeze({state:'unknown',pending:null}),
  focus:unknownFocus(),lastVerifiedPoll:freeze({state:'unknown',bound:null,fresh:null,ageMs:null}),
  unresolvedEffects:freeze({state:'unknown',count:null,reason:'NOT_READ_BY_THIS_DIAGNOSTIC'}),
  readOnly:true,advisoryOnly:true,authorizesBegin:false,automaticReplay:false,
  limitations:freeze(['MEMORY_SNAPSHOT_ONLY','NOT_ATOMIC_WITH_FUTURE_ACTION',
   'NO_IDLE_OR_ADMISSION_DECISION','NO_HISTORICAL_UNKNOWN_RESOLUTION'])};
 if(!validTime)return freeze({...out,reason:'INVALID_OBSERVATION_TIME'});
 if(typeof deviceId!=='string'||!deviceId||deviceId.length>256)
  return freeze({...out,reason:'NO_SELECTED_DEVICE'});
 const a=activeSession,m=deviceMeta;
 if(!m||m.secureBridgeVersion!==56||m.secureActive!==true||!hex(m.deviceDigest)||
    !a||!token(a.sessionId)||!trust(a.trustId)||!hex(a.ownerDigest)||
    a.deviceDigest!==m.deviceDigest||!Number.isSafeInteger(a.expiresAt)||a.expiresAt<=nowMs)
  return freeze({...out,reason:'OWNER_DEVICE_MEMORY_BINDING_UNAVAILABLE'});
 out.state='observed';out.reason='MEMORY_SCOPE_OBSERVED';out.deviceDigest=m.deviceDigest;
 if(currentCommand===null)out.command=freeze({state:'absent',digest:null});
 else if(command(currentCommand))out.command=freeze({state:'present',digest:
  createHash('sha256').update('jh-mobile13-command-diagnostic-v1|'+a.ownerDigest+'|'+
   a.deviceDigest+'|'+currentCommand).digest('hex')});
 if(typeof discardPending==='boolean')out.discard=freeze({state:'observed',pending:discardPending});

 // Count all retained pending/inflight rows for this device, including expired
 // rows not yet cleaned. An unbound old session cannot silently become zero.
 if(jobs instanceof Map&&jobs.size<=MAX_ROWS){
  let pending=0,inflight=0,known=true;
  for(const j of jobs.values()){
   if(!j||j.targetDeviceId!==deviceId)continue;
   if(['complete','error','expired','discarded'].includes(j.status))continue;
   if(!['queued','in_progress'].includes(j.status)||j.secureSessionId!==a.sessionId||
      (j.targetDeviceDigest!==undefined&&j.targetDeviceDigest!==a.deviceDigest)||
      (j.trustBindingId!==undefined&&j.trustBindingId!==a.trustId)||
      (j.ownerDigest!==undefined&&j.ownerDigest!==a.ownerDigest)){known=false;break;}
   if(j.status==='queued')pending++;else inflight++;
  }
  if(known)out.transientJobs=freeze({state:'observed',pending,inflight});
 }
 if(workflows instanceof Map&&workflows.size<=MAX_ROWS){
  let unfinished=0,known=true;
  for(const w of workflows.values()){
   if(!w||w.device!==deviceId)continue;
   if(['VERIFIED','ABORTED_BY_TERMINATION','DISCARDED'].includes(w.phase))continue;
   if(!['BEGIN','READY','RUNNING','OPENED','NEEDS_REVIEW'].includes(w.phase)||
      w.ownerDigest!==a.ownerDigest||w.trustId!==a.trustId||w.secureDeviceDigest!==a.deviceDigest){
    known=false;break;
   }
   unfinished++;
  }
  if(known)out.workflows=freeze({state:'observed',unfinished});
 }
 // Copy only the fixed, token-free fields. Never pass through an object's
 // arbitrary properties, even when it originated from an internal provider.
 if(focus?.state==='observed'&&typeof focus.present==='boolean'&&
    (typeof focus.active==='boolean'||focus.active===null)&&
    Number.isSafeInteger(focus.remainingMs)&&focus.remainingMs>=0&&focus.remainingMs<=120000&&
    (typeof focus.currentCommandMatches==='boolean'||focus.currentCommandMatches===null))
  out.focus=freeze({state:'observed',present:focus.present,active:focus.active,
   remainingMs:focus.remainingMs,currentCommandMatches:focus.currentCommandMatches});
 const p=lastVerifiedPoll;
 if(p&&p.device===deviceId&&p.sessionId===a.sessionId&&p.deviceDigest===a.deviceDigest&&
    Number.isSafeInteger(p.atMs)&&p.atMs>=0&&p.atMs<=nowMs){
  const ageMs=nowMs-p.atMs;
  out.lastVerifiedPoll=freeze({state:'observed',bound:true,fresh:ageMs<=30000,ageMs});
 }
 return freeze(out);
}

const PREFIX="// JH168_MOBILE13_COMMAND_DIAGNOSTICS_READ_ONLY_V1\n"+
 "import {readMobile13CommandDiagnostics56} from '../jh168-mobile-unification/mobile13-command-diagnostics.mjs';\n";
const START='  registerOAuthTool("life_status",{';
const END='  registerOAuthTool("life_route",{';
const POLL_OLD='    const signedPollVerified=typeof jhV2SignedPollEvidence56==="function"&&\n'+
 '      jhV2SignedPollEvidence56()?.verified===true;';
const POLL_NEW=String.raw`    // This opt-in observation must not call active56 or the poll helper:
    // both may purge/fence an expired or revoked session. No fresh trust claim.
    const signedPollVerified=false;
    const commandSnapshotAt56=Date.now();
    let commandDiagnostics;
    try{
      const deviceId=chooseDevice(),currentCommand=deviceId?jhCommandVersion56(deviceId):null;
      commandDiagnostics=readMobile13CommandDiagnostics56({nowMs:commandSnapshotAt56,
        deviceId,deviceMeta:deviceId?devices.get(deviceId):null,
        activeSession:deviceId?secureStates56.get(deviceId)?.active:null,
        currentCommand,runtimeGeneration:jhWorkflowRuntimeDigest56,jobs,workflows:jhMcpWorkflows56,
        discardPending:deviceId?jhBlockedCommands56.has(deviceId):undefined,
        focus:typeof jhFocus44!=='undefined'&&typeof jhFocus44.peek==='function'?
          jhFocus44.peek({device:deviceId,currentCommand,at:commandSnapshotAt56}):null,
        lastVerifiedPoll:jhV2State56.lastVerifiedPoll});
    }catch{
      commandDiagnostics=readMobile13CommandDiagnostics56({nowMs:commandSnapshotAt56});
    }`;
const MOBILE_OLD='phoneActionVerified:false,automaticReplay:false,cloudBrowserProbed:false};';
const MOBILE_NEW='phoneActionVerified:false,automaticReplay:false,cloudBrowserProbed:false,\n'+
 '      signedPollVerification:"NOT_REVALIDATED_READ_ONLY"};';
const RETURN_OLD='secureBridgeVersion:56,mobileRightStatus56';
const RETURN_NEW=RETURN_OLD+',commandDiagnostics';
const pairs=[[POLL_OLD,POLL_NEW],[MOBILE_OLD,MOBILE_NEW],[RETURN_OLD,RETURN_NEW]];
function one(source,anchor){
 if(source.split(anchor).length!==2)throw Error('MOBILE13_COMMAND_DIAGNOSTICS_ANCHOR_DRIFT');
}
function statusBlock(source){
 one(source,START);one(source,END);
 const start=source.indexOf(START),end=source.indexOf(END,start);
 if(end<=start)throw Error('MOBILE13_COMMAND_DIAGNOSTICS_SCOPE_DRIFT');
 return {start,end,block:source.slice(start,end)};
}
export function applyMobile13CommandDiagnosticsPatch56(source){
 if(typeof source!=='string'||source.includes(PREFIX))
  throw Error('MOBILE13_COMMAND_DIAGNOSTICS_ORIGINAL_REQUIRED');
 for(const anchor of ['const secureStates56=new Map();','const jhBlockedCommands56=new Set();',
  'const jhMcpWorkflows56=jhLoadWorkflows56();',
  "function jhCommandVersion56(device){return jhCommandVersions56.get(sha56('discard-device|'+device))||null;}",
  'const scoped=jhCommandTool56(name,config,jhLearningHandler56(name,handler));',
  'securitySchemes:oauthSchemes56',
  'const authorized=mcpCallerAuthorized56(req);',
  'durableNativeHooks56?.acceptedCompletion(']){
  if(!source.includes(anchor))throw Error('MOBILE13_COMMAND_DIAGNOSTICS_SECURE_RUNTIME_REQUIRED');
 }
 const {start,end,block}=statusBlock(source);
 one(block,'    inputSchema:{}');
 let changed=block;
 for(const [before,after] of pairs){one(changed,before);if(changed.includes(after))
   throw Error('MOBILE13_COMMAND_DIAGNOSTICS_ALREADY_PATCHED');changed=changed.replace(before,after);}
 const output=PREFIX+source.slice(0,start)+changed+source.slice(end);
 if(reverseMobile13CommandDiagnosticsPatch56(output)!==source)
  throw Error('MOBILE13_COMMAND_DIAGNOSTICS_REVERSE_FAILED');
 return output;
}
export function reverseMobile13CommandDiagnosticsPatch56(source){
 if(typeof source!=='string'||!source.startsWith(PREFIX))
  throw Error('MOBILE13_COMMAND_DIAGNOSTICS_PREFIX_MISSING');
 const original=source.slice(PREFIX.length),{start,end,block}=statusBlock(original);
 let restored=block;
 for(const [before,after] of [...pairs].reverse()){one(restored,after);restored=restored.replace(after,before);}
 return original.slice(0,start)+restored+original.slice(end);
}
