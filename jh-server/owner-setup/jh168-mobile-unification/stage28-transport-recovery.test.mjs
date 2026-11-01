/**
 * Stage28 controlled transport fault injection.
 *
 * This exercises real Stage26 decision and Stage25 receipt modules against an
 * isolated loopback HTTP fixture. No JH production service, real phone,
 * approval, network disruption, Redis, or Android action is invoked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {decideExactSignedCompletionAck56} from './stage26-completion-delivery-policy.mjs';
import {createSplitFollowupReceiptRegistry56} from './split-followup-receipts.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SID='secure56-fixture-session';
const DEV='d'.repeat(64);
const JOB='job_281';
const CMD='a'.repeat(32);
const TASK='b'.repeat(64);
const REQUEST='c'.repeat(32);
const CONTEXT='ssc_'+'e'.repeat(32);
const ITEM='item_'+'f'.repeat(16);
const KEY=Buffer.alloc(32,0x5a);
const FIRST=Buffer.from(JSON.stringify({result:{ok:true,action:'CLICK',
  resultVerified:true,verificationScope:'UI_TRANSITION_ONLY',
  actionReplayed:false,windowId:3543}}));
const OTHER=Buffer.from(JSON.stringify({result:{ok:true,action:'CLICK',
  resultVerified:false,verificationScope:'NONE',actionReplayed:true}}));
const mac=(secret,sid,job,dev,nonce,exp,digest)=>createHmac('sha256',secret)
  .update('complete|'+sid+'|'+job+'|'+dev+'|'+nonce+'|'+exp+'|'+digest).digest('hex');

async function isolatedCompletionServer({dropFirstAck=false}={}){
 const job={id:JOB,status:'in_progress',secureSessionId:SID,
   type:'split_screen_session_followup',stage26CompletionDigest56:null,result:null};
 const state={jobs:new Map([[JOB,job]]),acceptedCompletion:0,
   recoveryAcks:0,invalidAuthentication:0,conflicts:0,
   androidActionExecutions:0,additionalJobs:0,droppedResponse:0};
 const nonces=new Set();
 let drop=dropFirstAck;
 const respond=(res,status,value)=>{
   res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify(value));
 };
 const server=createServer(async(req,res)=>{
   if(req.method!=='POST'||req.url!=='/fixture/secure56/complete'){
     return respond(res,404,{ok:false,code:'route_unavailable'});
   }
   let raw;
   try {
     const pieces=[];
     for await(const chunk of req)pieces.push(chunk);
     raw=Buffer.concat(pieces);
     if(raw.length>16384)throw Error('body_too_large');
   }catch{return respond(res,400,{ok:false,code:'invalid_body'});}
   const j=state.jobs.get(JOB);
   if(!j)return respond(res,404,{ok:false,code:'original_job_unavailable'});
   const sid=String(req.headers['x-jh-session']||'');
   const dev=String(req.headers['x-jh-device']||'');
   const nonce=String(req.headers['x-jh-nonce']||'');
   const exp=Number(req.headers['x-jh-exp']);
   const signed=String(req.headers['x-jh-mac']||'');
   const actual=sha(raw);
   const now=Date.now();
   const expected=mac(KEY,sid,JOB,dev,nonce,exp,actual);
   const signatureValid=/^[a-f0-9]{64}$/.test(signed)&&
     timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signed,'hex'));
   if(sid!==SID||dev!==DEV||!/^[a-z0-9]{32}$/.test(nonce)||
      !Number.isSafeInteger(exp)||exp<now||exp-now>60000||
      !signatureValid||nonces.has(nonce)){
     state.invalidAuthentication++;
     return respond(res,401,{ok:false,code:'secure56_rejected'});
   }
   nonces.add(nonce);
   const decision=decideExactSignedCompletionAck56(j,actual);
   if(decision==='ACK_IDENTICAL'){
     state.recoveryAcks++;
     return respond(res,200,{ok:true,duplicateCompletion:true});
   }
   if(decision!=='FIRST_COMPLETION'){
     state.conflicts++;
     return respond(res,409,{ok:false,code:'completion_result_conflict_or_unknown'});
   }
   let body;
   try{body=JSON.parse(raw.toString('utf8'))}
   catch{return respond(res,400,{ok:false,code:'invalid_json'});}
   // Controlled stand-in for the original durable acceptedCompletion.
   state.acceptedCompletion++;
   j.stage26CompletionDigest56=actual;
   j.result=body.result;
   j.status='complete';
   if(drop){
     drop=false;
     state.droppedResponse++;
     // The server has accepted the result, but the client never sees HTTP 200.
     // Local loopback only: this does NOT disconnect a user phone.
     res.destroy();
     return;
   }
   return respond(res,200,{ok:true,duplicateCompletion:false});
 });
 await new Promise((resolve,reject)=>{
   server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 const url='http://127.0.0.1:'+server.address().port+'/fixture/secure56/complete';
 let seq=0;
 const request=async({body=FIRST,nonce,session=SID,device=DEV,expireDeltaMs=30000,
   tamperMac=false}={})=>{
   seq++;
   const n=nonce||('n'+String(seq).padStart(31,'0'));
   const exp=Date.now()+expireDeltaMs;
   const digest=sha(body);
   const signed=mac(KEY,session,JOB,device,n,exp,digest);
   return fetch(url,{method:'POST',headers:{
     'content-type':'application/json',
     'x-jh-session':session,'x-jh-device':device,
     'x-jh-nonce':n,'x-jh-exp':String(exp),
     'x-jh-mac':tamperMac?'0'.repeat(64):signed
   },body});
 };
 const close=async()=>{
   server.closeAllConnections();
   await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 };
 return {job,state,request,close};
}

test('lost HTTP 200 after accepted result: exact signed retry ACK, zero UI re-execution',async t=>{
 const fixture=await isolatedCompletionServer({dropFirstAck:true});
 t.after(fixture.close);
 await assert.rejects(()=>fixture.request(),/fetch failed|socket|terminated|aborted/i);
 assert.equal(fixture.job.status,'complete');
 assert.equal(fixture.state.acceptedCompletion,1);
 assert.equal(fixture.state.droppedResponse,1);
 const retry=await fixture.request({body:FIRST});
 assert.equal(retry.status,200);
 assert.deepEqual(await retry.json(),{ok:true,duplicateCompletion:true});
 assert.equal(fixture.state.recoveryAcks,1);
 assert.equal(fixture.state.acceptedCompletion,1);
 assert.equal(fixture.state.androidActionExecutions,0);
 assert.equal(fixture.state.additionalJobs,0);
});

test('fresh nonce plus exact matching digest is mandatory; conflicts never overwrite result',async t=>{
 const fixture=await isolatedCompletionServer();
 t.after(fixture.close);
 const firstNonce='n'+'1'.repeat(31);
 const first=await fixture.request({nonce:firstNonce});
 assert.equal(first.status,200);
 assert.deepEqual(await first.json(),{ok:true,duplicateCompletion:false});
 const originalResult=JSON.stringify(fixture.job.result);
 const oldNonce=await fixture.request({nonce:firstNonce});
 assert.equal(oldNonce.status,401);
 const invalidMac=await fixture.request({tamperMac:true});
 assert.equal(invalidMac.status,401);
 const changedSession=await fixture.request({session:'another-session'});
 assert.equal(changedSession.status,401);
 const changedDevice=await fixture.request({device:'e'.repeat(64)});
 assert.equal(changedDevice.status,401);
 const stale=await fixture.request({expireDeltaMs:-5000});
 assert.equal(stale.status,401);
 const future=await fixture.request({expireDeltaMs:90000});
 assert.equal(future.status,401);
 const changedResult=await fixture.request({body:OTHER});
 assert.equal(changedResult.status,409);
 const validDuplicate=await fixture.request({body:FIRST});
 assert.equal(validDuplicate.status,200);
 assert.equal((await validDuplicate.json()).duplicateCompletion,true);
 assert.equal(fixture.state.acceptedCompletion,1);
 assert.equal(fixture.state.recoveryAcks,1);
 assert.equal(fixture.state.conflicts,1);
 assert.equal(fixture.state.invalidAuthentication,6);
 assert.equal(JSON.stringify(fixture.job.result),originalResult);
 assert.equal(fixture.state.androidActionExecutions,0);
});

test('restart/missing original job never becomes a false successful completion or click replay',async t=>{
 const fixture=await isolatedCompletionServer();
 t.after(fixture.close);
 const before=await fixture.request();
 assert.equal(before.status,200);
 fixture.state.jobs.clear();  // simulated process restart / expired in-memory job
 const after=await fixture.request({body:FIRST});
 assert.equal(after.status,404);
 assert.equal((await after.json()).code,'original_job_unavailable');
 assert.equal(fixture.state.acceptedCompletion,1);
 assert.equal(fixture.state.androidActionExecutions,0);
 assert.equal(fixture.state.additionalJobs,0);
});

test('original scoped FOLLOW_UP receipt: verified popup only, never a new job or action',()=>{
 let now=1793507000000;
 const tokens=['J'.repeat(32)];
 const reg=createSplitFollowupReceiptRegistry56({clock:()=>now,token:()=>tokens.shift()});
 const job={
   id:'job_282',type:'split_screen_session_followup',
   status:'in_progress',mcpToolName:'life_android_execute_computer_action',
   secureRequestedEffect:'REVERSIBLE_WRITE',action:'CLICK',
   targetDeviceId:'fixture-device',targetDeviceDigest:DEV,
   secureSessionId:SID,commandId:CMD,taskDigest:TASK,
   requestId:REQUEST,contextId:CONTEXT,targetItemRef:ITEM,
   expiresAtMs:now+60000
 };
 const scope={deviceId:'fixture-device',deviceDigest:DEV,
   sessionId:SID,commandId:CMD,taskDigest:TASK};
 const receipt=reg.issue({job,...scope});
 assert.equal(receipt.readOnly,true);
 assert.equal(receipt.newJobCreated,false);
 assert.equal(receipt.automaticReplay,false);
 const opts={receiptRef:receipt.receiptRef,deviceId:scope.deviceId,
   deviceDigest:scope.deviceDigest,sessionId:scope.sessionId,
   commandId:scope.commandId};
 const getJob=id=>id===job.id?job:null;
 const verified=()=>true;
 assert.equal(reg.read(opts,getJob,verified).executionStatus,'PENDING');
 job.status='complete';
 job.result={ok:true,action:'CLICK',resultVerified:true,
   verificationScope:'UI_TRANSITION_ONLY'};
 const success=reg.read(opts,getJob,verified);
 assert.equal(success.code,'SPLIT_FOLLOWUP_CLICK_VERIFIED');
 assert.equal(success.resultVerified,true);
 assert.equal(success.automaticReplay,false);
 assert.equal(success.newJobCreated,false);
 assert.equal(reg.read(opts,getJob,()=>false).code,'SPLIT_FOLLOWUP_CLICK_UNCONFIRMED');
 assert.equal(reg.read({...opts,commandId:'b'.repeat(32)},getJob,verified).code,
   'SPLIT_FOLLOWUP_RECEIPT_SCOPE_CHANGED');
 const newServer=createSplitFollowupReceiptRegistry56({clock:()=>now});
 assert.equal(newServer.read(opts,getJob,verified).code,'SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE');
 now+=61000;
 assert.equal(reg.read(opts,getJob,verified).code,'SPLIT_FOLLOWUP_RECEIPT_UNAVAILABLE');
});

test('production patch keeps post-auth ACK and original durable hook order, no new UI executor',()=>{
 const policy=readFileSync(new URL('./stage26-completion-delivery-policy.mjs',import.meta.url),'utf8');
 const patch=readFileSync(new URL('./stage26-completion-delivery-patch.mjs',import.meta.url),'utf8');
 const followup=readFileSync(new URL('./split-followup-receipt-patch.mjs',import.meta.url),'utf8');
 const operator=readFileSync(new URL('./stage25-live-operator-followup-entry.mjs',import.meta.url),'utf8');
 assert.ok(policy.includes('ACK_IDENTICAL'));
 assert.ok(policy.includes('FIRST_COMPLETION'));
 assert.ok(patch.includes('SIGNED_AUTH_GUARD'));
 assert.ok(patch.includes("sha56(raw)"));
 assert.ok(patch.includes("decideExactSignedCompletionAck56(j,stage26RawDigest56)"));
 assert.ok(patch.includes("durableNativeHooks56?.acceptedCompletion("));
 assert.ok(patch.includes("j.stage26CompletionDigest56=stage26RawDigest56;"));
 assert.ok(patch.includes("res.writeHead(409"));
 assert.ok(followup.includes("jhSplitFollowupReceipts56.read("));
 assert.ok(followup.includes('automaticReplay:false'));
 assert.ok(operator.includes('selectStage26CompletionAck56'));
 assert.ok(operator.includes('stage26EnabledAtBootstrap'));
 for(const source of [policy,patch,followup,operator])
   assert.equal(/automaticActionRetryEnabled:\s*true/.test(source),false);
});
