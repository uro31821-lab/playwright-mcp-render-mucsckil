import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyNativeQueueTruthPatch,reverseNativeQueueTruthPatch} from '../owner-setup/deployment/native-queue-truth.mjs';

const original=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const patched=applyNativeQueueTruthPatch(original);
const START='    if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k))){';
const END='    for(const [keys,url] of webMap){';
function simulate(status,service='카카오T',deviceCount=1){
  const begin=patched.indexOf(START);
  assert.ok(begin>=0,'must isolate only the already-existing Kakao T service path');
  const end=patched.indexOf(END,begin);
  assert.ok(end>begin);
  const segment=patched.slice(begin,end);
  const handler=new Function('mk','textResult','devices','service',
    'const raw=String(service||"").trim();const s=raw.toLowerCase();\n'+segment+'\nreturn {route:"not_matched"};');
  let count=0;
  const mk=(type,payload)=>{
    count++;
    assert.equal(type,'open_url');
    assert.deepEqual(payload,{target:'카카오T',url:'카카오T'});
    return {id:'synthetic-job-1',status};
  };
  const result=handler(mk,x=>x,{size:deviceCount},service);
  return {result,count};
}
test('Kakao T successful queue admission is reported as queued',()=>{
  const {result,count}=simulate('queued','카카오티');
  assert.equal(count,1);assert.equal(result.queued,true);
  assert.equal(result.route,'android');assert.equal(result.jobId,'synthetic-job-1');
});
test('no active phone or rejected dispatch is not falsely queued',()=>{
  for(const state of ['error','expired','complete','in_progress']){
    const {result,count}=simulate(state,'카카오T',0);
    assert.equal(count,1);assert.equal(result.queued,false,StateMessage(state));
    assert.equal(result.jobId,'synthetic-job-1');
  }
});
function StateMessage(state){return 'status was '+state}
test('English Kakao T route reports actual queue status',()=>{
  assert.equal(simulate('error','kakao t').result.queued,false);
  assert.equal(simulate('queued','KAKAO T').result.queued,true);
});
test('non-Kakao services are not intercepted or dispatched by this patch',()=>{
  const {result,count}=simulate('queued','라프텔');
  assert.equal(count,0);assert.equal(result.route,'not_matched');
});
test('patch is byte-for-byte reversible and contains no other code changes',()=>{
  assert.equal(reverseNativeQueueTruthPatch(patched),original);
  assert.equal(patched.length-original.length,
    'j.status==="queued"'.length-'true'.length);
});
test('a double patch, a missing anchor, or a changed anchor fails closed',()=>{
  assert.throws(()=>applyNativeQueueTruthPatch(patched),/ANCHOR_MISMATCH/);
  assert.throws(()=>applyNativeQueueTruthPatch(''),/ANCHOR_MISMATCH/);
  assert.throws(()=>applyNativeQueueTruthPatch(original.replace('queued:true,jobId:j.id','queued:false,jobId:j.id')),/ANCHOR_MISMATCH/);
});
test('candidate module cannot change live startup until explicitly imported',()=>{
  const startup=readFileSync(new URL('../owner-setup/deployment/published-service-entry.mjs',import.meta.url),'utf8');
  assert.ok(!startup.includes('native-queue-truth.mjs'));
});
