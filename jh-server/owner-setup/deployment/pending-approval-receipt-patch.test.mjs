import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createPendingApprovalReceiptRegistry56} from "../server-integration/secure56-pending-approval-receipts.mjs";
import {applyPendingApprovalReceiptPatch,reversePendingApprovalReceiptPatch} from "./pending-approval-receipt-patch.mjs";
const task="a".repeat(64),dev="b".repeat(64),run="c".repeat(64);
const token=Buffer.alloc(32,42).toString("base64url"),other=Buffer.alloc(32,43).toString("base64url");
function setup(kind="computer_use_screen_consent_request",now=()=>1000){
  const store=createPendingApprovalReceiptRegistry56({now,newToken:()=>token,ttlMs:600000});
  const scope={deviceId:"phone-a",deviceDigest:dev,sessionId:"secure-session-1",taskDigest:task,runDigest:kind==="computer_use_screen_consent_request"?run:""};
  const job={id:"job_73",type:kind,status:"queued",targetDeviceId:scope.deviceId,targetDeviceDigest:dev,secureSessionId:scope.sessionId,taskDigest:task,...(scope.runDigest?{runDigest:run}:{})};
  return {store,scope,job};
}
test("queued consent returns a random opaque read-only receipt, not approval",()=>{
  const {store,scope,job}=setup();const issued=store.issue({job,...scope});
  assert.equal(issued.receiptToken,token);assert.equal(issued.receiptExpiresAtMs,601000);
  assert.equal(Object.hasOwn(issued,"requestToken"),false);assert.equal(Object.hasOwn(issued,"approved"),false);
  assert.equal(JSON.stringify(issued).includes(job.id),false);
});
test("status-only lookup recovers the SAME request after user approves, without replay",()=>{
  const {store,scope,job}=setup();const {receiptToken}=store.issue({job,...scope});
  const jobs=new Map([[job.id,job]]);let reads=0;
  const read=()=>store.read({...scope,receiptToken},id=>{reads++;return jobs.get(id)});
  assert.equal(read().job.status,"queued");
  job.status="complete";job.result={ok:true,code:"local_screen_consent_required",requestToken:"one-phone-prompt"};
  assert.equal(read().job.result.requestToken,"one-phone-prompt");
  assert.equal(reads,2);assert.equal(jobs.size,1);
});
test("wrong device/task/run/session never discloses even a token",()=>{
  const {store,scope,job}=setup();const {receiptToken}=store.issue({job,...scope});let lookedUp=0;
  for(const mismatch of [{deviceId:"other"},{deviceDigest:"d".repeat(64)},{sessionId:"rotated"},
    {taskDigest:"e".repeat(64)},{runDigest:"f".repeat(64)}]){
    const x=store.read({...scope,receiptToken,...mismatch},()=>{lookedUp++;return job});
    assert.deepEqual(x,{ok:false,code:"PENDING_APPROVAL_RECEIPT_UNAVAILABLE"});
  }
  assert.equal(lookedUp,0);
});
test("forged, expired, missing or changed-session receipt fails closed",()=>{
  let t=1000;const {store,scope,job}=setup(undefined,()=>t);const {receiptToken}=store.issue({job,...scope});
  assert.equal(store.read({...scope,receiptToken:other},()=>job).ok,false);
  assert.equal(store.read({...scope,receiptToken},()=>undefined).ok,false);
  job.secureSessionId="new";assert.equal(store.read({...scope,receiptToken},()=>job).ok,false);
  job.secureSessionId=scope.sessionId;t=601000;
  assert.equal(store.read({...scope,receiptToken},()=>job).ok,false);
});
test("action approval requires same local scope; non-approval jobs cannot use receipts",()=>{
  let {store,scope,job}=setup("computer_use_action_approval_request");
  const x=store.issue({job,...scope});assert.ok(x.receiptToken);
  assert.equal(store.read({...scope,receiptToken:x.receiptToken},()=>job).ok,true);
  job.type="computer_use_action_execute";assert.equal(store.issue({job,...scope}),null);
  ({store,scope,job}=setup());assert.equal(store.issue({job,...scope,runDigest:""}),null);
});
test("bounded memory and no reusable secret collisions",()=>{
  assert.throws(()=>createPendingApprovalReceiptRegistry56({ttlMs:700000}),TypeError);
  const {store,scope,job}=setup();store.issue({job,...scope});assert.throws(()=>store.issue({job,...scope}),/COLLISION/);
});
test("exact published owner baseline remains unchanged; patch round-trip is reversible",()=>{
  const path=new URL("../server-integration/server.mjs",import.meta.url);
  const baseline=readFileSync(path,"utf8");
  const patched=applyPendingApprovalReceiptPatch(baseline);
  assert.notEqual(patched,baseline);
  assert.equal(reversePendingApprovalReceiptPatch(patched),baseline);
  assert.match(patched,/life_android_pending_approval_receipt_status/);
  assert.match(patched,/lookupOnly:true/);
  assert.match(patched,/jobId=>jobs\.get\(jobId\)/);
  assert.throws(()=>applyPendingApprovalReceiptPatch(patched));
});
test("functional runtime builder adds the patch after existing bounded readback",()=>{
  const source=readFileSync(new URL("./functional-release-runtime.mjs",import.meta.url),"utf8");
  assert.match(source,/applyPendingApprovalReceiptPatch\(readbackFixed\)/);
  assert.match(source,/publish\(dest,pendingReceiptFixed\)/);
});
