import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectG3HostTrace } from '../g3-host-readback-contract.mjs';
const binding={sourceRef:'s2-20261117',threadId:'t-1',taskId:null,conditionRevision:null};
const baseline=()=>({schema:'jh.g3.host-readback.v1',binding,redaction:'NO_PRIVATE_PAYLOAD',observations:[
  {phase:'route_plan',seq:1,binding,receiptRef:'hostroute:one'},
  {phase:'feature_result',seq:2,binding,receiptRef:'hostresult:one'},
  {phase:'response_check',seq:3,binding,receiptRef:'hostcheck:one'},
  {phase:'visible_delivery',seq:4,binding,receiptRef:'hostdelivery:one'}],
 plannedFeatures:[{id:'experience_reviews',owner:'video',status:'planned'}],
 returnedFeatures:[{id:'experience_reviews',owner:'video',status:'completed',evidenceRefs:['tool:video-1'],reason:null}],
 responseCheck:{operation:'route.check_response',ok:true,errorCodes:[],receiptRef:'hostcheck:one'}});
const check=(name,change,expected)=>test(name,()=>{
 const x=baseline();change(x);const r=inspectG3HostTrace(x);
 assert.equal(r.status,expected,name);assert.equal(r.hostE2EProven,false);assert.equal(r.externalSuccessProven,false);
});
check('T01 well-formed fixture passes structural contract only',()=>{},'TRACE_CONTRACT_PASS');
test('T02 missing real trace stays unobserved',()=>assert.equal(inspectG3HostTrace(null).status,'UNOBSERVED'));
check('T03 absent route check fails',x=>x.observations.splice(2,1),'BLOCKED');
check('T04 check after delivery fails',x=>{x.observations[2].phase='visible_delivery';x.observations[3].phase='response_check'},'BLOCKED');
check('T05 duplicate check fails',x=>{x.observations.splice(3,0,{phase:'response_check',seq:4,binding,receiptRef:'hostcheck:two'});x.observations[4].seq=5},'BLOCKED');
check('T06 stale binding blocked',x=>x.observations[2].binding={...binding,sourceRef:'old'},'BLOCKED');
check('T07 missing collaborator result blocked',x=>x.returnedFeatures=[],'BLOCKED');
check('T08 wrong owner blocked',x=>x.returnedFeatures[0].owner='food','BLOCKED');
check('T09 fabricated completion without evidence blocked',x=>x.returnedFeatures[0].evidenceRefs=[],'BLOCKED');
check('T10 completed and error codes fails',x=>{x.responseCheck.ok=false;x.responseCheck.errorCodes=['FEATURE_RESULT_MISSING']},'BLOCKED');
check('T11 results block with reason passes schema',x=>{x.returnedFeatures[0].status='blocked';x.returnedFeatures[0].reason='VIDEO_NOT_FOUND';x.returnedFeatures[0].evidenceRefs=[]},'TRACE_CONTRACT_PASS');
check('T12 result block with no reason blocked',x=>{x.returnedFeatures[0].status='blocked';x.returnedFeatures[0].reason=null},'BLOCKED');
check('T13 unsupported metadata rejected to prevent private payload',x=>{x.rawUserMessage='secret'},'BLOCKED');
check('T14 missing check receipt unobserved',x=>delete x.responseCheck,'UNOBSERVED');
check('T15 mismatch check receipt rejected',x=>x.responseCheck.receiptRef='mismatch','BLOCKED');
check('T16 missing planned result should not pass even though gate says ok',x=>x.plannedFeatures.push({id:'place_context',owner:'travel',status:'planned'}),'BLOCKED');
check('T17 unavailable helper not an expected completed result',x=>{x.plannedFeatures.push({id:'reservation_prep',owner:'reservation',status:'unavailable'})},'TRACE_CONTRACT_PASS');
check('T18 malformed trace returns blocked',x=>x.redaction='RAW_PROMPT','BLOCKED');
check('T19 trace cannot authenticate receipts alone',()=>{},'TRACE_CONTRACT_PASS');
check('T20 handoff from another thread is rejected',x=>x.observations[1].binding={...binding,threadId:'other'},'BLOCKED');
check('T21 correct structural check is not a provider success',x=>x.returnedFeatures[0].evidenceRefs=['source:untrusted-claim'],'TRACE_CONTRACT_PASS');
check('T22 empty planned/returned with route & check can pass',x=>{x.plannedFeatures=[];x.returnedFeatures=[]},'TRACE_CONTRACT_PASS');
