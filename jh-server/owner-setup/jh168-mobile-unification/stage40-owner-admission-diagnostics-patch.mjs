/** JH168 Stage40: ORIGINAL owner admission truth classification, NOT an
 * admission bypass. Extracted lessons: Appium multi-window freshness, Temporal
 * one-execution identity and OTel low-cardinality diagnostics. Zero phone calls.
 */
const OLD=String.raw`  async function jhOwnerAdmission155(device,commandId,record,firstAttempt){
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
  }`;
const NEW=String.raw`  // Exact original job evidence only. No raw screen, URL, account, cookie,
  // device ID, grant or HMAC is persisted or returned by the diagnostic path.
  const jhOwnerAdmissionCodes40=new Map();
  function jhOwnerAdmissionNote40(record,code){
    if(typeof record?.executionId==='string'&&/^exec_[a-f0-9-]{36}$/.test(record.executionId)){
      while(jhOwnerAdmissionCodes40.size>=64)
        jhOwnerAdmissionCodes40.delete(jhOwnerAdmissionCodes40.keys().next().value);
      jhOwnerAdmissionCodes40.set(record.executionId,code);
    }
    return false; // NEVER grant a denied action
  }
  function jhOwnerAdmissionTake40(executionId){
    if(typeof executionId!=='string'||!/^exec_[a-f0-9-]{36}$/.test(executionId))
      return 'OWNER_ADMISSION_CAUSE_UNAVAILABLE';
    const code=jhOwnerAdmissionCodes40.get(executionId)||'OWNER_ADMISSION_CAUSE_UNAVAILABLE';
    jhOwnerAdmissionCodes40.delete(executionId);
    return code;
  }
  async function jhOwnerAdmission155(device,commandId,record,firstAttempt){
    const fail=code=>jhOwnerAdmissionNote40(record,code);
    // Keep ALL original exact command and owner-payment binding authorities.
    try{if(jhRequireCommand56(device)!==commandId)return fail('COMMAND_BINDING_CHANGED');}
    catch{return fail('COMMAND_BINDING_UNVERIFIED');}
    let binding;
    try{binding=jhPaymentLifecycle.captureBinding({device_id:device});}
    catch(e){
      const code=e?.code==='PAYMENT_TRUSTED_PHONE_UNAVAILABLE'?'OWNER_TRUST_UNVERIFIED':
        e?.code==='PAYMENT_PROCESS_EPOCH_REQUIRED'?'OWNER_PROCESS_EPOCH_UNVERIFIED':
        e?.code==='PAYMENT_EXACT_DEVICE_REQUIRED'?'OWNER_EXACT_DEVICE_REQUIRED':
        'OWNER_BINDING_CAPTURE_REJECTED';
      return fail(code);
    }
    const auth=active56(device);
    let read;
    try{read=await waitJob(mk('agent_snapshot',{},device),30000);}
    catch{return fail('OWNER_SIGNED_SCREEN_READ_FAILED');}
    try{jhPaymentLifecycle.assertBinding({command_binding:binding});}
    catch(e){return fail(e?.code==='PAYMENT_COMMAND_DISCARDED'?
        'OWNER_COMMAND_DISCARDED':e?.code==='PAYMENT_DEVICE_OR_PROCESS_CHANGED'?
        'OWNER_DEVICE_OR_PROCESS_CHANGED':'OWNER_BINDING_ASSERT_REJECTED');}
    try{if(jhRequireCommand56(device)!==commandId)return fail('COMMAND_CHANGED_DURING_READ');}
    catch{return fail('COMMAND_DISCARDED_DURING_READ');}
    let rows;try{rows=JSON.parse(read?.result?.url);}
    catch{return fail('OWNER_SNAPSHOT_ROWS_UNREADABLE');}
    let proof;try{proof=jhInspectSplitEvidence155(read?.result,rows);}
    catch{return fail('OWNER_SCREEN_PROOF_CHECK_FAILED');}
    const signed=read?.status==='complete'&&read.result?.ok===true&&
      read.secureSessionId===auth?.sessionId&&read.targetDeviceId===device;
    const gate=jhGateRecoveredDispatch155({
      commandState:'ACTIVE',commandEpochCurrent:true,pendingDiscard:jhBlockedCommands56.has(device),
      bridgeAuthenticated:signed&&!!auth,trustedScopeValid:proof.ok===true,
      ledgerStatus:record?.state==='PREPARING'&&firstAttempt&&record.attemptCount===1?'RESERVED':'BLOCKED',
      effect:record?.dispatchStartedAt?'UNKNOWN':'NOT_DISPATCHED',actionKind:'UI_ACTION',
      explicitUserCommand:true,isFreshScreen:signed&&proof.ok===true,
      serverRequestIdValid:typeof record?.executionId==='string'&&typeof record?.dedupeKey==='string',
      sourceIsAuthoritative:true
    });
    if(gate.allowDispatch===true)return true; // SAME original authority
    if(!signed)return fail('OWNER_SIGNED_SNAPSHOT_UNVERIFIED');
    if(proof.ok!==true){
      const known=new Set(['SPLIT_PROOF_REQUIRED','SPLIT_PROOF_INVALID','CHAT_PANE_UNVERIFIED',
        'SPLIT_TARGET_INVALID','SPLIT_LAYOUT_INVALID','SPLIT_PROOF_STALE',
        'SPLIT_TARGET_MISMATCH','SPLIT_ROWS_INVALID','SPLIT_ROW_PROOF_REQUIRED',
        'SPLIT_ROW_PAIR_CHANGED','SPLIT_ROW_STALE','SPLIT_ROW_WRONG_TARGET']);
      return fail(known.has(proof.reason)?proof.reason:'OWNER_SCREEN_PROOF_REJECTED');
    }
    const allowed=new Set(['authenticated_owner_and_id_required',
      'old_work_discarded_no_auto_resume','secure_bridge_not_ready',
      'idempotency_existing_operation_no_retry','uncertain_effect_read_only_reconcile',
      'command_not_active','bridge_reconnected_old_work_not_replayed',
      'user_command_required','fresh_target_screen_required',
      'durable_reservation_not_available_no_write_retry']);
    return fail(allowed.has(gate.code)?'FENCE_'+gate.code:'OWNER_ADMISSION_POLICY_DENIED');
  }`;
const OLD_OUT="      resultVerification:jhResultVerificationSummary56(verified)};";
const NEW_OUT="      ownerAdmissionDiagnostic:verified.status==='OWNER_ADMISSION_BLOCKED'?"+
    "jhOwnerAdmissionTake40(verified.record?.executionId):null,\n"+OLD_OUT;
const PREFIX='// JH_STAGE40_ORIGINAL_OWNER_ADMISSION_DIAGNOSTICS_V1\n';
function one(s,x,name){if(s.split(x).length!==2)throw Error(name+' expected one: '+(s.split(x).length-1));}
export function applyStage40OwnerAdmissionDiagnostics(source){
  if(typeof source!=='string'||source.startsWith(PREFIX)||
    !source.includes('durableNativeHooks56?.acceptedCompletion(')||
    !source.includes('jhRequireCommand56(device)')||
    !source.includes('jhSplitScreenOnce155('))
    throw Error('STAGE40_ORIGINAL_SECURE56_RUNTIME_REQUIRED');
  one(source,OLD,'original owner admission');
  one(source,OLD_OUT,'original result projection');
  const out=PREFIX+source.replace(OLD,NEW).replace(OLD_OUT,NEW_OUT);
  if(reverseStage40OwnerAdmissionDiagnostics(out)!==source)
    throw Error('STAGE40_ADMISSION_PATCH_NOT_REVERSIBLE');
  return out;
}
export function reverseStage40OwnerAdmissionDiagnostics(source){
  if(typeof source!=='string'||!source.startsWith(PREFIX))
    throw Error('STAGE40_ADMISSION_PREFIX_MISSING');
  let out=source.slice(PREFIX.length);
  one(out,NEW,'diagnostic owner admission');
  one(out,NEW_OUT,'diagnostic result projection');
  out=out.replace(NEW_OUT,OLD_OUT).replace(NEW,OLD);
  return out;
}
