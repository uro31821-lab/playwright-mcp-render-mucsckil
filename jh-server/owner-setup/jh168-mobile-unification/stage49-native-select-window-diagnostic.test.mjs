import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStage49SignedWindowDiagnostic as validate} from './stage49-native-select-window-diagnostic.mjs';
const origin=()=>({schema:'JH168_NATIVE_SELECT_WINDOW_PROOF_V1',
 code:'STAGE45_FOREIGN_OVERLAY_UNVERIFIED',popupReadOnly:true,
 originalActionResultVerified:false,authorizedToPick:false,
 phoneActionDispatched:false,automaticReplay:false});
const proof=()=>({schema:'JH168_NATIVE_SELECT_WINDOW_DIAGNOSTIC_V1',
 code:'STAGE49_OVERLAPPING_NON_APP_WINDOW_OBSERVED',readOnly:true,
 originalActionResultVerified:false,authorizedToPick:false,
 phoneActionDispatched:false,automaticReplay:false,
 observedWindowCount:4,applicationWindowCount:3,nonApplicationWindowCount:1,
 overlapCount:1,sampledWindowCount:3,sampleTruncated:false,
 windows:[
 {windowId:3324,displayId:0,type:'TYPE_APPLICATION',layer:4,active:false,focused:false,
  overlapsOriginalWork:true,parentIsOriginalWork:false,anchorIsOriginalWork:false,bounds:[1215,0,2448,1713]},
 {windowId:3330,displayId:0,type:'TYPE_APPLICATION',layer:8,active:false,focused:false,
  overlapsOriginalWork:true,parentIsOriginalWork:true,anchorIsOriginalWork:true,bounds:[1300,350,2370,1290]},
 {windowId:3345,displayId:0,type:'TYPE_INPUT_METHOD',layer:9,active:true,focused:true,
  overlapsOriginalWork:true,parentIsOriginalWork:false,anchorIsOriginalWork:false,bounds:[1300,800,2400,1713]}
 ]});
const run=(o=origin(),d=proof(),signed=true)=>validate({originalFailure:o,diagnostic:d,serverSignedFrameVerified:signed});
test('actual original failure plus redacted window metadata is diagnostic only',()=>{
 const z=run();assert.equal(z.ok,true);assert.equal(z.code,'WINDOW_METADATA_PARSED_READ_ONLY');
 assert.equal(z.nonAppOverlapCount,1);assert.equal(z.authorizedToPick,false);
 assert.equal(z.originalActionResultVerified,false);assert.equal(z.verifiedNativeWindowAssociation,false);
 assert.equal(z.phoneActionDispatched,false);assert.equal(z.automaticReplay,false);
 assert.deepEqual(z.typesSeen,['TYPE_APPLICATION','TYPE_INPUT_METHOD']);
 assert.doesNotMatch(JSON.stringify(z),/3324|3345|1713|item_|account|password|Chrome.*text/);
});
test('original signed Secure56 admission must be proved outside this pure classifier',()=>{
 assert.equal(run(origin(),proof(),false).code,'ORIGINAL_SIGNED_RECEIPT_REQUIRED');
});
test('cannot use previous successful or unverified write as input',()=>{
 for(const value of [{code:'STAGE45_POPUP_READ_ONLY_VERIFIED'},
  {authorizedToPick:true},{originalActionResultVerified:true},
  {phoneActionDispatched:true},{automaticReplay:true},{popupReadOnly:false}]){
  assert.equal(run({...origin(),...value}).ok,false,JSON.stringify(value));
 }
});
test('no arbitrary new fields or user text may be forwarded',()=>{
 for(const key of ['label','url','rawNodeTree','password','account','optionRefs']){
  assert.equal(run(origin(),{...proof(),[key]:'private'}).ok,false,key);
  const p=proof();p.windows[1][key]='private';assert.equal(run(origin(),p).ok,false,key);
 }
});
test('no forged success or action permission in diagnostic metadata',()=>{
 for(const value of [
 {authorizedToPick:true},{originalActionResultVerified:true},
 {phoneActionDispatched:true},{automaticReplay:true},{readOnly:false},
 {schema:'ACTION_RECEIPT'}])assert.equal(run(origin(),{...proof(),...value}).ok,false);
});
test('window types cannot be treated as native popup selection proof',()=>{
 for(const type of ['SYNTHETIC_POPUP','TYPE_APPLICATION_PANEL','WEB_MENU','TOKEN']){
  let p=proof();p.windows[2].type=type;assert.equal(run(origin(),p).ok,false,type);
 }
});
test('bounded count and 12-window cap are preserved',()=>{
 for(const changed of [{observedWindowCount:2},{applicationWindowCount:4},
 {nonApplicationWindowCount:2},{overlapCount:2},{sampledWindowCount:13},
 {sampledWindowCount:2},{sampleTruncated:'yes'},{windows:Array(13).fill(proof().windows[0])}]){
  assert.equal(run(origin(),{...proof(),...changed}).ok,false,JSON.stringify(changed));
 }
});
test('cross-scope invalid ids, geometry and focus types fail',()=>{
 for(const bad of [{windowId:-1},{displayId:-2},{layer:-1},
 {bounds:[-1,0,1,10]},{bounds:[0,0,0,10]},
 {focused:'true'},{overlapsOriginalWork:false},
 {parentIsOriginalWork:'true'}]){
  let p=proof();Object.assign(p.windows[2],bad);
  assert.equal(run(origin(),p).ok,false,JSON.stringify(bad));
 }
});
test('no samples allowed when original bounding proof is missing',()=>{
 const p=proof();p.code='STAGE49_ORIGINAL_WORK_BOUNDS_UNAVAILABLE';
 assert.equal(run(origin(),p).code,'NO_WINDOW_CONTENT_WITHOUT_ORIGINAL_BOUNDS');
});
test('count classification must match overlap',()=>{
 for(const p of [{code:'STAGE49_NO_OVERLAPPING_NON_APP_WINDOW'},
 {code:'STAGE49_OVERLAPPING_NON_APP_WINDOW_OBSERVED',overlapCount:0}]){
  assert.equal(run(origin(),{...proof(),...p}).code,'DIAGNOSTIC_COUNT_INCONSISTENT');
 }
});
test('still no PICK even when observed overlay is parent/anchor linked',()=>{
 const p=proof();p.windows[2].anchorIsOriginalWork=true;
 p.windows[2].parentIsOriginalWork=true;
 const z=run(origin(),p);assert.equal(z.ok,true);
 assert.equal(z.authorizedToPick,false);assert.equal(z.verifiedNativeWindowAssociation,false);
});
