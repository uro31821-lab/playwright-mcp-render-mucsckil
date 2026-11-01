/** Source-only candidate: explain an ORIGINAL pre-dispatch admission refusal.
 * The returned boolean remains the ONLY authority. Diagnostic logs carry only
 * fixed enum strings, no owner/device/job IDs, HMACs, actions or screen data.
 * This patch is NOT selected by the published entrypoint.
 */
export const ORIGINAL_OWNER_ADMISSION155=String.raw\`
  async function jhOwnerAdmission155(device,commandId,record,firstAttempt){
    if(jhRequireCommand56(device)!==commandId)return false;
    const binding=jhPaymentLifecycle.captureBinding({device_id:device});
    const auth=active56(device);
    const read=await waitJob(mk('agent_snapshot',{},device),30000);
    jhPaymentLifecycle.assertBinding({command_binding:binding});
    if(jhRequireCommand56(device)!==commandId)return false;
    let rows;try{rows=JSON.parse(read?.result?.url);}catch{return false;}
    const proof=jhInspectSplitEvidence155(read?.result,rows);
    const signed=read?.status==='complete'&&read.result?.ok===true&&
      read.secureSessionId===auth?.sessionId&&read.targetDeviceId===device;
    return jhGateRecoveredDispatch155({
      commandState:'ACTIVE',commandEpochCurrent:true,pendingDiscard:jhBlockedCommands56.has(device),
      bridgeAuthenticated:signed&&!!auth,trustedScopeValid:proof.ok===true,
      ledgerStatus:record?.state==='PREPARING'&&firstAttempt&&record.attemptCount===1?'RESERVED':'BLOCKED',
      effect:record?.dispatchStartedAt?'UNKNOWN':'NOT_DISPATCHED',actionKind:'UI_ACTION',
      explicitUserCommand:true,isFreshScreen:signed&&proof.ok===true,
      serverRequestIdValid:typeof record?.executionId==='string'&&typeof record?.dedupeKey==='string',
      sourceIsAuthoritative:true
    }).allowDispatch;
  }
\`.replaceAll('\\\`','\`');

export const INSTRUMENTED_OWNER_ADMISSION155=String.raw\`
  // Bounded and non-authoritative original owner-admission audit.
  // No raw exceptions, identifiers, token material, screen text or action
  // payloads enter the record. This observer cannot grant/retry a job.
  const jhOwnerAdmissionCodes155=new Set([
    'COMMAND_CHANGED','OWNER_BINDING_CAPTURE_FAILED','OWNER_BINDING_CHANGED',
    'SIGNED_SNAPSHOT_MISSING','SIGNED_SNAPSHOT_INVALID','SPLIT_EVIDENCE_INVALID',
    'LEDGER_NOT_FIRST_ATTEMPT','RECOVERY_FENCE_REFUSED','PREFLIGHT_UNAVAILABLE'
  ]);
  const jhOwnerAdmissionLastLog155=new Map();
  function jhOwnerAdmissionReject155(code){
    try{
      const safe=jhOwnerAdmissionCodes155.has(code)?code:'PREFLIGHT_UNAVAILABLE';
      const now=Date.now(),last=jhOwnerAdmissionLastLog155.get(safe)||0;
      if(now-last>=30000){
        jhOwnerAdmissionLastLog155.set(safe,now);
        console.info('JH_OWNER_ADMISSION_DIAG',JSON.stringify({reason:safe,
          source:'original_pre_dispatch',automaticReplay:false,dispatched:false}));
      }
    }catch{}
    return false;
  }
  async function jhOwnerAdmission155(device,commandId,record,firstAttempt){
    try{
      if(jhRequireCommand56(device)!==commandId)
        return jhOwnerAdmissionReject155('COMMAND_CHANGED');
      let binding;
      try{binding=jhPaymentLifecycle.captureBinding({device_id:device});}
      catch{return jhOwnerAdmissionReject155('OWNER_BINDING_CAPTURE_FAILED');}
      const auth=active56(device);
      let read;
      try{read=await waitJob(mk('agent_snapshot',{},device),30000);}
      catch{return jhOwnerAdmissionReject155('SIGNED_SNAPSHOT_MISSING');}
      try{jhPaymentLifecycle.assertBinding({command_binding:binding});}
      catch{return jhOwnerAdmissionReject155('OWNER_BINDING_CHANGED');}
      if(jhRequireCommand56(device)!==commandId)
        return jhOwnerAdmissionReject155('COMMAND_CHANGED');
      let rows;
      try{rows=JSON.parse(read?.result?.url);}
      catch{return jhOwnerAdmissionReject155('SIGNED_SNAPSHOT_MISSING');}
      const proof=jhInspectSplitEvidence155(read?.result,rows);
      const signed=read?.status==='complete'&&read.result?.ok===true&&
        read.secureSessionId===auth?.sessionId&&read.targetDeviceId===device;
      if(!signed||!auth)return jhOwnerAdmissionReject155('SIGNED_SNAPSHOT_INVALID');
      if(proof.ok!==true)return jhOwnerAdmissionReject155('SPLIT_EVIDENCE_INVALID');
      if(record?.state!=='PREPARING'||firstAttempt!==true||
         record.attemptCount!==1||record.dispatchStartedAt)
        return jhOwnerAdmissionReject155('LEDGER_NOT_FIRST_ATTEMPT');
      const gate=jhGateRecoveredDispatch155({
        commandState:'ACTIVE',commandEpochCurrent:true,pendingDiscard:jhBlockedCommands56.has(device),
        bridgeAuthenticated:signed&&!!auth,trustedScopeValid:proof.ok===true,
        ledgerStatus:record?.state==='PREPARING'&&firstAttempt&&record.attemptCount===1?'RESERVED':'BLOCKED',
        effect:record?.dispatchStartedAt?'UNKNOWN':'NOT_DISPATCHED',actionKind:'UI_ACTION',
        explicitUserCommand:true,isFreshScreen:signed&&proof.ok===true,
        serverRequestIdValid:typeof record?.executionId==='string'&&typeof record?.dedupeKey==='string',
        sourceIsAuthoritative:true
      });
      return gate?.allowDispatch===true?true:jhOwnerAdmissionReject155('RECOVERY_FENCE_REFUSED');
    }catch{
      return jhOwnerAdmissionReject155('PREFLIGHT_UNAVAILABLE');
    }
  }
\`.replaceAll('\\\`','\`');

const once=(text,token)=>text.split(token).length===2;
/** Replaces ONE exact original helper, with no other source edits. */
export function patchOriginalOwnerAdmissionDiagnostic155(source){
  if(typeof source!=='string'||!once(source,ORIGINAL_OWNER_ADMISSION155)||
     source.includes('jhOwnerAdmissionCodes155'))
    throw Error('ORIGINAL_OWNER_ADMISSION_DIAGNOSTIC_ANCHOR_CHANGED');
  const result=source.replace(ORIGINAL_OWNER_ADMISSION155,INSTRUMENTED_OWNER_ADMISSION155);
  if(reverseOriginalOwnerAdmissionDiagnostic155(result)!==source)
    throw Error('ORIGINAL_OWNER_ADMISSION_DIAGNOSTIC_NOT_REVERSIBLE');
  return result;
}
export function reverseOriginalOwnerAdmissionDiagnostic155(source){
  if(typeof source!=='string'||!once(source,INSTRUMENTED_OWNER_ADMISSION155))
    throw Error('ORIGINAL_OWNER_ADMISSION_DIAGNOSTIC_REVERSE_FAILED');
  return source.replace(INSTRUMENTED_OWNER_ADMISSION155,ORIGINAL_OWNER_ADMISSION155);
}
