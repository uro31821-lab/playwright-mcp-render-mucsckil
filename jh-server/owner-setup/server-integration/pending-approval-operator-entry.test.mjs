import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync,writeFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {buildPendingApprovalOperatorEntrypoint56,selectPendingApprovalOperatorRuntime56,main} from "./pending-approval-operator-entry.mjs";
const root=path.resolve(import.meta.dirname,"..");
const ciEnv={...process.env,CI:"true",NODE_ENV:"test",JH_OWNER_DEFER_LISTEN:"1"};
delete ciEnv.RENDER_SERVICE_ID;
delete ciEnv.JH_DURABLE_RELEASE;
function clean(built){
 for(const p of [built.runtimeFile,built.ownerFile,built.unifiedFile,built.file,built.stampFile])
  rmSync(p,{force:true});
}
test("default, production, incomplete-operator and CI startup are rejected",async()=>{
 for(const env of [
  {...ciEnv,CI:"false"},
  {...ciEnv,NODE_ENV:"production"},
  {...ciEnv,JH_OWNER_DEFER_LISTEN:"0"},
  {...ciEnv,RENDER_SERVICE_ID:"srv-db0fjl2d0e5s73be114g"},
  {...ciEnv,JH_DURABLE_RELEASE:"SERVE_READY_V1"}
 ]){
  await assert.rejects(buildPendingApprovalOperatorEntrypoint56(root,env),/NOT_AUTHORIZED/);
 }
 await assert.rejects(main(ciEnv),/EXPLICIT_ENABLE_REQUIRED/);
});
test("pinned owner/unified/operational route selects only exact receipt runtime",{
 timeout:120000
},async()=>{
 const protectedFiles=[
  "server-integration/server.mjs",
  "deployment/functional-release-runtime.mjs",
  "deployment/durable-native-runtime-candidate.mjs",
  "deployment/durable-clean-restart-news-review-entry.mjs",
  "deployment/durable-live-release.mjs"
 ];
 const originalBytes=protectedFiles.map(p=>readFileSync(path.join(root,p)));
 const built=await buildPendingApprovalOperatorEntrypoint56(root,ciEnv);
 try {
  const owner=readFileSync(built.ownerFile,"utf8");
  const unified=readFileSync(built.unifiedFile,"utf8");
  const entry=readFileSync(built.file,"utf8");
  const runtime=readFileSync(built.runtimeFile,"utf8");
  assert.equal(built.operatorActivated,false);
  assert.equal(built.listenerStarted,false);
  assert.ok(owner.includes("serverPath=selectPendingApprovalOperatorRuntime56(root,process.env).file;"));
  assert.ok(unified.includes("from './owner-service-pending-approval-operator.mjs'"));
  assert.ok(entry.includes("from './unified-service-pending-approval-operator.mjs'"));
  assert.ok(entry.includes("const runtime=selectPendingApprovalOperatorRuntime56(ROOT,process.env).file;"));
  assert.ok(runtime.includes('registerOAuthTool("life_android_pending_approval_receipt_status"'));
  assert.ok(runtime.includes("durableNativeHooks56?.beforeDispatch("));
  assert.ok(runtime.includes("durableNativeHooks56?.acceptedCompletion("));
  assert.ok(runtime.includes("jhRequireCommand56("));
  assert.equal(selectPendingApprovalOperatorRuntime56(root,ciEnv).file,built.runtimeFile);
  for(let i=0;i<protectedFiles.length;i++){
   assert.deepEqual(readFileSync(path.join(root,protectedFiles[i])),originalBytes[i]);
  }
  for(const p of [built.runtimeFile,built.ownerFile,built.unifiedFile,built.file]){
   const result=spawnSync(process.execPath,["--check",p],{
     cwd:root,encoding:"utf8",timeout:14000
   });
   assert.equal(result.status,0,p+": "+result.stderr);
  }
 } finally{clean(built);}
});
test("runtime bytes cannot change after attestation without operator refusal",{
 timeout:120000
},async()=>{
 const built=await buildPendingApprovalOperatorEntrypoint56(root,ciEnv);
 const bytes=readFileSync(built.runtimeFile);
 try {
  writeFileSync(built.runtimeFile,Buffer.concat([bytes,Buffer.from("\n// altered\n")]));
  assert.throws(()=>selectPendingApprovalOperatorRuntime56(root,ciEnv),/RUNTIME_DRIFT/);
  writeFileSync(built.runtimeFile,bytes);
  assert.equal(selectPendingApprovalOperatorRuntime56(root,ciEnv).file,built.runtimeFile);
 }finally{
  writeFileSync(built.runtimeFile,bytes);
  clean(built);
 }
});
