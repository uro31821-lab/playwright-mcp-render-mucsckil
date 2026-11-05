import test from 'node:test';import assert from 'node:assert/strict';
import {
 runNativeSelectRound3,runNestedVerticalRound3,runHorizontalRound3,
 runPressKeyRound3,runReturnChromeRound3
} from './android-round3.mjs';

test('native select accepts only value-verified exact selection',async()=>{
 const r=await runNativeSelectRound3({label:'연습 색상',optionLabel:'파랑 연습 옵션'},{
  form15SelectExact:async()=>({valueVerified:true})
 });
 assert.equal(r.outcome,'VERIFIED_PASS');
});

test('nested scroll uses exact computer target only after no native target',async()=>{
 const r=await runNestedVerticalRound3({},{
  snapshot:async()=>({}),internalScrollTargets:async()=>[],
  computerScrollExact:async()=>({targetVerified:true,resultVerified:true,targetId:'inner'})
 });
 assert.equal(r.outcome,'VERIFIED_PASS');
 assert.equal(r.evidence.route,'COMPUTER_EXACT');
});

test('horizontal scroll may fall through only after no-dispatch native readback gap',async()=>{
 const r=await runHorizontalRound3({},{
  snapshot:async()=>({}),
  horizontalScrollTargets:async()=>[{viewId:'horizontal-scroll',targetId:'h'}],
  scrollHorizontal:async()=>({code:'horizontal_readback_before_insufficient',dispatched:false,resultVerified:false}),
  computerHorizontalScrollExact:async()=>({targetVerified:true,resultVerified:true,targetId:'h'})
 });
 assert.equal(r.outcome,'VERIFIED_PASS');
});

test('horizontal dispatched-unverified never falls through',async()=>{
 let fallbackCalled=false;
 const r=await runHorizontalRound3({},{
  snapshot:async()=>({}),
  horizontalScrollTargets:async()=>[{viewId:'horizontal-scroll',targetId:'h'}],
  scrollHorizontal:async()=>({code:'horizontal_dispatched_unverified_no_replay',dispatched:true,resultVerified:false}),
  computerHorizontalScrollExact:async()=>{fallbackCalled=true;return {targetVerified:true,resultVerified:true}}
 });
 assert.equal(r.outcome,'FAILED_NO_EFFECT');
 assert.equal(fallbackCalled,false);
});

test('keypress requires computer execution and effect readback',async()=>{
 const r=await runPressKeyRound3({key:'Enter',expectedText:'Enter · 페이지 이벤트'},{
  computerKeypress:async()=>({resultVerified:true,dispatched:true}),
  snapshot:async()=>({}),
  hasExactText:async()=>true
 });
 assert.equal(r.outcome,'VERIFIED_PASS');
});

test('return to Chrome requires verified other-app open and verified return',async()=>{
 const r=await runReturnChromeRound3({},{
  beginForegroundReturnWorkflow:async()=>({ok:true,initialPackage:'com.android.chrome'}),
  openOtherApp:async()=>({verified:true,dispatched:true}),
  returnPrevious:async()=>({verified:true,dispatched:true}),
  currentState:async()=>({packageName:'com.android.chrome',windowId:7})
 });
 assert.equal(r.outcome,'VERIFIED_PASS');
});
