import test from 'node:test';
import assert from 'node:assert/strict';
import {openAndObserveRightChrome56} from './open-and-observe.mjs';
import {applyJH168OpenReadPatch,reverseJH168OpenReadPatch} from './open-and-observe-patch.mjs';
const bind={deviceId:'d',sessionId:'s',commandId:'a'.repeat(32)};
const open={route:'android_right',actionSucceeded:true,rightAddressConfirmed:true};
const screen={ok:true,state:'ACTIVE',contextId:'ssc_'+'b'.repeat(32),
 screenDigest:'c'.repeat(64),packageName:'com.android.chrome',windowId:8,
 layout:{arrangement:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',
   workPackage:'com.android.chrome',workWindowId:8},
 capturedAt:90000,expiresAt:150000,items:[{itemRef:'item_'+'d'.repeat(16),label:'뉴스'}]};
const fixture=(o=open,s=screen)=>{
 const calls={open:0,start:0};
 return {calls,p:{service:'네이버',readBinding:()=>bind,now:()=>100000,
 open:async()=>{calls.open++;return o},start:async()=>{calls.start++;return s}}};
};
test('same-command signed RIGHT OPEN followed by one read-only session',async()=>{
 const f=fixture(),r=await openAndObserveRightChrome56(f.p);
 assert.equal(r.postOpenRead.ok,true);assert.equal(r.postOpenRead.clickExecuted,false);
 assert.equal(r.postOpenRead.contextId,screen.contextId);
 assert.deepEqual(f.calls,{open:1,start:1});assert.equal(r.automaticReplay,false);
});
test('unconfirmed or Playwright OPEN cannot produce false phone result',async()=>{
 for(const changed of [{route:'playwright'},{rightAddressConfirmed:false},{actionSucceeded:false}]){
  const f=fixture({...open,...changed}),r=await openAndObserveRightChrome56(f.p);
  assert.equal(r.postOpenRead.attempted,false);assert.equal(f.calls.start,0);
 }
});
test('stale, foreign window and invalid itemRef are rejected',async()=>{
 for(const changed of [{capturedAt:1},{windowId:42},{packageName:'wrong'},
   {items:[{itemRef:'bad'}]},{contextId:'bad'}]){
  const f=fixture(open,{...screen,...changed});
  const r=await openAndObserveRightChrome56(f.p);
  assert.equal(r.code,'RIGHT_SCREEN_UNVERIFIED');assert.equal(f.calls.start,1);
 }
});
test('command change aborts before read, never reopens',async()=>{
 let counter=0;const f=fixture();
 f.p.readBinding=()=>++counter===1?bind:{...bind,commandId:'e'.repeat(32)};
 const r=await openAndObserveRightChrome56(f.p);
 assert.equal(r.code,'COMMAND_CHANGED_AFTER_OPEN');assert.deepEqual(f.calls,{open:1,start:0});
});
test('uncertain screen read does not retry or click',async()=>{
 const f=fixture(open,{status:'queued'});
 const r=await openAndObserveRightChrome56(f.p);
 assert.equal(r.code,'RIGHT_SCREEN_UNVERIFIED');assert.deepEqual(f.calls,{open:1,start:1});
});
test('reversible patch preserves original code and Secure56 guards',()=>{
 const input='const jhRequireCommand56=device=>device;\n'+
 'const jhSplitScreenJob56=()=>null;\n'+
 '  },async({target,url})=>jhRightWebOpen56({service:String(url||target||"")}));';
 const out=applyJH168OpenReadPatch(input);
 assert.match(out,/jh168ReadAfterOpen56/);
 assert.match(out,/life_android_capture_work_window/);
 assert.equal(reverseJH168OpenReadPatch(out),input);
 assert.throws(()=>applyJH168OpenReadPatch(out));
});
