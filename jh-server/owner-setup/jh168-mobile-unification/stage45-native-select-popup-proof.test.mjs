import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMobile13SelectOpenIncident56,verifyMobile13SignedSelectPopup56}
 from './stage45-native-select-popup-proof.mjs';

const now=1800000010000;
const context='ssc_'+'a'.repeat(32),command='b'.repeat(32),device='c'.repeat(64),ref='item_'+'d'.repeat(16);
const origin=()=>({contextId:context,commandId:command,secureSessionId:'test-signed-device-session',
 deviceDigest:device,targetItemRef:ref,workPackage:'com.android.chrome',
 chatPackage:'com.openai.chatgpt',layout:'LEFT_RIGHT',displayId:0,workWindowId:'3324',
 chatWindowId:'3527',workBounds:[1215,0,2448,1713],chatBounds:[0,0,1215,1713],
 observedAtMs:now-3000});
const view=()=>({schema:'JH168_NATIVE_SELECT_WINDOW_PROOF_V1',signedPhoneReadVerified:true,
 contextId:context,commandId:command,secureSessionId:'test-signed-device-session',deviceDigest:device,
 displayId:0,popupWindowId:'3330',observedAtMs:now-800,windows:[
 {windowId:'3527',displayId:0,packageName:'com.openai.chatgpt',type:'TYPE_APPLICATION',
  layer:3,active:false,focused:false,bounds:[0,0,1215,1713]},
 {windowId:'3324',displayId:0,packageName:'com.android.chrome',type:'TYPE_APPLICATION',
  layer:4,active:false,focused:false,bounds:[1215,0,2448,1713]},
 {windowId:'3330',displayId:0,packageName:'com.android.chrome',type:'TYPE_APPLICATION',
  layer:8,active:true,focused:true,bounds:[1300,350,2370,1290],
  parentWindowId:'3324',anchorItemRef:ref}
 ],options:[
 {windowId:'3330',itemRef:'item_'+'1'.repeat(16),role:'option',clickable:true,sensitive:false},
 {windowId:'3330',itemRef:'item_'+'2'.repeat(16),role:'option',clickable:true,sensitive:false}
 ]});
const evalProof=(o=origin(),v=view())=>verifyMobile13SignedSelectPopup56({origin:o,observation:v,now});
test('actual observed select OPEN failure is correctly NOT successful and NEVER re-run',()=>{
 const d=classifyMobile13SelectOpenIncident56({open:{executed:true,resultVerified:false,
  code:'split_screen_changed_or_missing'},snapshot:{code:'split_screen_changed_or_missing'},
  inspect:{code:'ambiguous_work_window'},splitComfort:{code:'AMBIGUOUS_WORK'}});
 assert.equal(d.ok,false);assert.equal(d.code,'NATIVE_SELECT_POSSIBLE_MULTI_WINDOW_UNPROVEN');
 assert.equal(d.originalOpenOutcome,'NEEDS_REVIEW_NO_REPLAY');
 assert.equal(d.automaticReplay,false);assert.equal(d.authorizedToPick,false);
});
test('missing any supporting code never fabricates popup proof',()=>{
 for(const changed of [{open:{executed:false,resultVerified:false,code:'split_screen_changed_or_missing'}},
 {inspect:{code:'scroll_target_ready'}},{snapshot:{code:'ready'}},
 {splitComfort:{code:'SPLIT_PAIR_VERIFIED'}}]){
  const z=classifyMobile13SelectOpenIncident56({open:{executed:true,resultVerified:false,
   code:'split_screen_changed_or_missing'},snapshot:{code:'split_screen_changed_or_missing'},
   inspect:{code:'ambiguous_work_window'},splitComfort:{code:'AMBIGUOUS_WORK'},...changed});
  assert.equal(z.ok,false);assert.equal(z.code,'NATIVE_SELECT_INCIDENT_UNCLASSIFIED');
 }
});
test('read-only signed three-window popup evidence validates exact Chrome parent + GPT split without issuing PICK',()=>{
 const r=evalProof();assert.equal(r.ok,true);assert.equal(r.code,'POPUP_READ_ONLY_EVIDENCE_GROUNDED');
 assert.equal(r.popupWindowId,'3330');assert.equal(r.workWindowId,'3324');
 assert.equal(r.optionCount,2);assert.equal(r.authorizedToPick,false);
 assert.equal(r.phoneActionDispatched,false);assert.equal(r.originalActionResultVerified,false);
 assert.equal(r.automaticReplay,false);
 assert.doesNotMatch(JSON.stringify(r),/test-signed-device-session|item_|b{32}/);
});
test('signature provenance and command/device/session/context/display mismatch fails closed',()=>{
 for(const change of [
  {signedPhoneReadVerified:false},{schema:'WEBPAGE_ONLY'},
  {contextId:'ssc_'+'b'.repeat(32)},{commandId:'f'.repeat(32)},
  {secureSessionId:'other-device-session'},{deviceDigest:'e'.repeat(64)},
  {displayId:1}
 ]){
  assert.equal(evalProof(origin(),{...view(),...change}).ok,false,JSON.stringify(change));
 }
});
test('stale, reordered and future phone observation cannot be adopted',()=>{
 for(const observedAtMs of [now-45000,now-31000,now+9000,now-4000]){
  assert.equal(evalProof(origin(),{...view(),observedAtMs}).ok,false,String(observedAtMs));
 }
});
test('no original pane signature, work bounds or owner binding means deny',()=>{
 const mods=[{workPackage:'com.android.systemui'},{chatPackage:'random.package'},
  {workWindowId:'3330'},{chatWindowId:'3324'},{layout:'TOP_BOTTOM'},
  {targetItemRef:'invalid'},{deviceDigest:'wrong'}, {workBounds:[-1,0,2448,1713]},
  {workBounds:[700,0,2448,1713]}];
 for(const m of mods)assert.equal(evalProof({...origin(),...m}).ok,false,JSON.stringify(m));
});
test('ambiguous window count, duplicate window id and wrong owner app always deny',()=>{
 let a=view();a.windows.push({...a.windows[2],windowId:'3340'});
 assert.equal(evalProof(origin(),a).code,'POPUP_WINDOW_LIST_INCOMPLETE_OR_AMBIGUOUS');
 a=view();a.windows[2].windowId='3324';
 assert.equal(evalProof(origin(),a).ok,false);
 a=view();a.windows[2].packageName='com.android.systemui';
 assert.equal(evalProof(origin(),a).code,'POPUP_OWNER_PACKAGE_MISMATCH');
 a=view();a.windows[1].packageName='com.fake.chrome';
 assert.equal(evalProof(origin(),a).code,'POPUP_OWNER_PACKAGE_MISMATCH');
});
test('cross-display, unrelated foreground, layer and outside RIGHT region fail closed',()=>{
 for(const change of [
  {displayId:1},{active:false},{focused:false},{layer:2},
  {bounds:[800,350,2370,1290]},{bounds:[1200,0,2400,1290]},
  {type:'TYPE_INPUT_METHOD'}
 ]){
  let a=view();Object.assign(a.windows[2],change);
  assert.equal(evalProof(origin(),a).ok,false,JSON.stringify(change));
 }
 let a=view();a.windows[0].focused=true;
 assert.equal(evalProof(origin(),a).code,'POPUP_FOREGROUND_FOCUS_UNPROVEN');
});
test('anchor mismatches cannot authorize native Chrome option readback',()=>{
 for(const changed of [{parentWindowId:'1'},{anchorItemRef:'item_'+'9'.repeat(16)},
  {anchorItemRef:''},{parentWindowId:null}]){
  let a=view();Object.assign(a.windows[2],changed);
  assert.equal(evalProof(origin(),a).code,'POPUP_ANCHOR_NOT_ORIGINAL_SELECT');
 }
});
test('option must be fresh, unique, EXACT popup-scoped and benign',()=>{
 for(const mutation of [
  {itemRef:'item_'+'1'.repeat(16)},{itemRef:'bad'},{windowId:'3324'},
  {role:'button'},{clickable:false},{sensitive:true}
 ]){
  let a=view();Object.assign(a.options[1],mutation);
  assert.equal(evalProof(origin(),a).code,'POPUP_OPTION_REF_UNVERIFIED');
 }
 for(const length of [0,1,13]){
  let a=view();a.options=Array.from({length},(_,i)=>({
   windowId:'3330',itemRef:'item_'+String(i).padStart(16,'0'),
   role:'option',clickable:true,sensitive:false}));
  assert.equal(evalProof(origin(),a).code,'POPUP_OPTIONS_NOT_VERIFIED');
 }
});
test('missing/invalid/untrusted evidence remains read-only and does not create signed actions',()=>{
 for(const a of [{},{origin:origin()},{observation:view()},{origin:origin(),observation:{...view(),signedPhoneReadVerified:false}}]){
  const x=verifyMobile13SignedSelectPopup56({...a,now});
  assert.equal(x.ok,false);assert.equal(x.authorizedToPick,false);
  assert.equal(x.phoneActionDispatched,false);
 }
});
