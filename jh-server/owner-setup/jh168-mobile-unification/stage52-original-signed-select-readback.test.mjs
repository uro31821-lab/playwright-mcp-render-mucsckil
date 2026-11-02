import test from 'node:test';
import assert from 'node:assert/strict';
import {createStage52OriginalSignedSelectReadback} from './stage52-original-signed-select-readback.mjs';
const E={commandId:'a'.repeat(32),requestId:'b'.repeat(32),
  contextId:'ssc_'+'c'.repeat(32),targetItemRef:'item_'+'d'.repeat(16),
  deviceDigest:'e'.repeat(64),secureSessionId:'secure-session-001'};
const diagnostic=()=>({schema:'JH168_NATIVE_SELECT_WINDOW_DIAGNOSTIC_V1',
  code:'STAGE49_APPLICATION_WINDOW_COUNT_DIAGNOSTIC',readOnly:true,
  originalActionResultVerified:false,authorizedToPick:false,
  phoneActionDispatched:false,automaticReplay:false,
  observedWindowCount:3,applicationWindowCount:3,nonApplicationWindowCount:0,
  overlapCount:0,sampledWindowCount:3,sampleTruncated:false,
  windows:[
    {windowId:6336,displayId:0,type:'TYPE_APPLICATION',layer:3,active:false,
      focused:false,overlapsOriginalWork:true,parentIsOriginalWork:false,
      anchorIsOriginalWork:false,bounds:[1200,0,2400,1700]},
    {windowId:6218,displayId:0,type:'TYPE_APPLICATION',layer:5,active:false,
      focused:false,overlapsOriginalWork:true,parentIsOriginalWork:true,
      anchorIsOriginalWork:false,bounds:[1200,0,2400,1700]},
    {windowId:6412,displayId:0,type:'TYPE_APPLICATION',layer:7,active:true,
      focused:true,overlapsOriginalWork:true,parentIsOriginalWork:true,
      anchorIsOriginalWork:true,bounds:[1200,200,2400,1100]}
  ]});
const signed=()=>({originalSecure56Verified:true,originalOwnerVerified:true,
  originalResultReceiptVerified:true,
  originalJob:{...E,type:'split_screen_session_followup',action:'CLICK',
    command:'오른쪽 화면에서 지정 선택 메뉴 열기',targetDeviceDigest:E.deviceDigest},
  originalResult:{ok:false,code:'split_screen_changed_or_missing',resultVerified:false,
    nativeSelectPopupReadOnly:true,
    originalSelectOpenOutcome:'NEEDS_REVIEW_NO_REPLAY',
    nativeSelectWindowDiagnostic:diagnostic()}});
const call=async(r=signed(),ex=E)=>createStage52OriginalSignedSelectReadback({
  readOriginalVerifiedReceipt:async()=>r})({originalReceiptRef:'host-original-receipt-001',expected:ex});

test('installed Stage51 schema yields only READ_ONLY, never a successful SELECT or PICK',async()=>{
  const x=await call();assert.equal(x.ok,true);
  assert.equal(x.code,'ORIGINAL_SIGNED_WINDOW_METADATA_READ_ONLY');
  for(const k of ['nativeSelectPhoneE2eVerified','originalActionResultVerified',
    'verifiedNativeWindowAssociation','authorizedToPick','phoneActionDispatched',
    'automaticReplay'])assert.equal(x[k],false,k);
  assert.equal(x.oldSelectOpenOutcome,'NEEDS_REVIEW_NO_REPLAY');
  assert.doesNotMatch(JSON.stringify(x),/6336|6218|6412|secure-session|item_|displayId|password/i);
});
test('no injected trusted reader, malformed ref or expected owner binding',async()=>{
  assert.throws(()=>createStage52OriginalSignedSelectReadback(),/ORIGINAL_SIGNED_READER_REQUIRED/);
  assert.equal((await call(signed(),{...E,contextId:'bad'})).code,'CURRENT_OWNER_BINDING_REQUIRED');
  const fn=createStage52OriginalSignedSelectReadback({readOriginalVerifiedReceipt:async()=>signed()});
  assert.equal((await fn({originalReceiptRef:'bad',expected:E})).code,'ORIGINAL_RECEIPT_REFERENCE_REQUIRED');
});
test('unverified, forged, expired or missing original readback rejected',async()=>{
  for(const field of ['originalSecure56Verified','originalOwnerVerified','originalResultReceiptVerified']){
    assert.equal((await call({...signed(),[field]:false})).code,'ORIGINAL_SECURE56_VERIFICATION_REQUIRED');
  }
  const fn=createStage52OriginalSignedSelectReadback({readOriginalVerifiedReceipt:async()=>{throw Error('no')} });
  assert.equal((await fn({originalReceiptRef:'host-original-receipt-001',expected:E})).code,
    'ORIGINAL_SECURE56_READ_UNAVAILABLE');
});
test('original device/session/command/context/item binding is exact and cannot be swapped',async()=>{
  for(const [key,value] of Object.entries({commandId:'f'.repeat(32),requestId:'f'.repeat(32),
    contextId:'ssc_'+'f'.repeat(32),targetItemRef:'item_'+'f'.repeat(16),
    targetDeviceDigest:'f'.repeat(64),secureSessionId:'other-session-999',
    action:'BACK',type:'agent_snapshot',command:'다른 작업'})){
    const s=signed();s.originalJob[key]=value;
    assert.equal((await call(s)).code,'ORIGINAL_SELECT_JOB_BINDING_MISMATCH',key);
  }
});
test('only original unknown failure accepted; no confirmed or forged effect',async()=>{
  for(const [key,value] of Object.entries({ok:true,code:'action_verified',
    resultVerified:true,nativeSelectPopupReadOnly:false,
    originalSelectOpenOutcome:'SUCCESS'})){
    const s=signed();s.originalResult[key]=value;
    assert.equal((await call(s)).code,'ORIGINAL_SELECT_UNKNOWN_RECEIPT_REQUIRED',key);
  }
});
test('diagnostic flags, schema, content and count cannot be forged',async()=>{
  for(const [key,value] of Object.entries({authorizedToPick:true,phoneActionDispatched:true,
    automaticReplay:true,originalActionResultVerified:true,code:'COMPLETE'})){
    const s=signed();s.originalResult.nativeSelectWindowDiagnostic[key]=value;
    assert.equal((await call(s)).ok,false,key);
  }
  const s=signed();s.originalResult.nativeSelectWindowDiagnostic.password='secret';
  assert.equal((await call(s)).ok,false);
});
test('no observation is success if original work bounds were unavailable',async()=>{
  const s=signed();s.originalResult.nativeSelectWindowDiagnostic={...diagnostic(),
    code:'STAGE49_ORIGINAL_WORK_BOUNDS_UNAVAILABLE',windows:[],sampledWindowCount:0,
    observedWindowCount:0,applicationWindowCount:0,nonApplicationWindowCount:0,
    overlapCount:0};
  const out=await call(s);
  assert.equal(out.ok,false);
});