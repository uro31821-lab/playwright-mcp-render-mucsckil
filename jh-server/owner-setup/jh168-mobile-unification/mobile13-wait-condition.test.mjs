import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {evaluateSignedMobile13Condition56 as decide,signedMobileWaitConditionSource56 as source} from './mobile13-wait-condition.mjs';
const now=1800000000000,ctx='ssc_'+'a'.repeat(32);
const proof=()=>({kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
 chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'13',chatBounds:'0,0,500,1200',
 workPackage:'com.android.chrome',workWindowId:'19',workBounds:'500,0,1000,1200',
 observedAtMs:String(now-1000)});
const good=(text='READY')=>{const p=proof();return {ok:true,automaticReplay:false,scopeVerified:true,
 contextId:ctx,splitScreenRequired:true,splitScreen:p,resultScreen:[{...p},
 {kind:'view',package:p.workPackage,windowId:p.workWindowId,text}]}};
const run=(o=good(),expectedText='READY')=>decide({contextId:ctx,expectedText,observation:o,nowMs:now});
test('signed scoped exact work-pane READY yields condition true without replay',()=>{
 const r=run();assert.equal(r.conditionVerified,true);assert.equal(r.ok,true);
 assert.equal(r.code,'MOBILE_WAIT_CONDITION_CONFIRMED');assert.equal(r.automaticReplay,false);
 assert.equal('resultScreen' in r,false);assert.equal(r.workWindowId,'19');
});
test('substring and unequal labels must not satisfy exact condition',()=>{
 for(const label of ['NOT READY','READYING','READY: pending','ready','WAITING'])
  assert.equal(run(good(label)).conditionVerified,false,label);
});
test('missing status, scope, matching context, or false replay flags fail closed',()=>{
 for(const value of [null,{}, {ok:true}, {...good(),scopeVerified:false},
  {...good(),resultVerified:false,scopeVerified:false}, {...good(),contextId:'ssc_'+'b'.repeat(32)},
  {...good(),automaticReplay:true}])
  assert.equal(run(value).conditionVerified,false);
});
test('stale, wrong-window, changed proof, missing rows never report success',()=>{
 for(const change of [
  o=>{o.resultScreen[1].windowId='20'},o=>{o.resultScreen[1].package='com.other.app'},
  o=>{o.splitScreen.observedAtMs=String(now-45001)},
  o=>{o.resultScreen[0].workWindowId='20'},o=>{o.resultScreen=[]},
  o=>{o.resultScreen=null},o=>{o.resultScreen[0].observedAtMs=String(now)},
  o=>{o.splitScreen.verified='false'}]){
  const o=good();change(o);assert.equal(run(o).conditionVerified,false);
 }
});
test('invalid context/text/clock cannot report true',()=>{
 for(const label of ['', ' '.repeat(8),'x'.repeat(161),'READY\nOK'])
  assert.equal(run(good(),label).conditionVerified,false);
 assert.equal(decide({contextId:'bad',expectedText:'READY',observation:good(),nowMs:now}).conditionVerified,false);
 assert.equal(decide({contextId:ctx,expectedText:'READY',observation:good(),nowMs:NaN}).conditionVerified,false);
});
test('serialized same pure code executes inside generated owner scope',()=>{
 const scope={};
 vm.runInNewContext(source()+'\nthis.exposed=jhMobile13EvaluateCondition56;',scope);
 assert.equal(typeof scope.exposed,'function');
 assert.equal(scope.exposed({contextId:ctx,expectedText:'READY',observation:good(),nowMs:now}).code,
  'MOBILE_WAIT_CONDITION_CONFIRMED');
});
