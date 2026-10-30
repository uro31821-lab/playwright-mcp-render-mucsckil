import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {buildPendingApprovalRealRuntimeCandidate56} from "./pending-approval-real-runtime-candidate.mjs";
import {reversePendingApprovalReceiptPatch} from "./pending-approval-receipt-patch.mjs";
const root=path.resolve(import.meta.dirname,"..");
const good={...process.env,CI:"true",NODE_ENV:"test",JH_OWNER_DEFER_LISTEN:"1"};
delete good.RENDER_SERVICE_ID;delete good.JH_DURABLE_RELEASE;
test("non-CI or operating Render startup is explicitly blocked",async()=>{
 for(const bad of [{...good,CI:"false"},{...good,NODE_ENV:"production"},
   {...good,JH_OWNER_DEFER_LISTEN:"0"},{...good,RENDER_SERVICE_ID:"fake"},
   {...good,JH_DURABLE_RELEASE:"SERVE_READY_V1"}]){
   await assert.rejects(buildPendingApprovalRealRuntimeCandidate56(root,bad),
     /PENDING_APPROVAL_REAL_CI_ONLY/);
 }
});
test("fully generated pinned owner runtime imports only one read-only approval receipt tool",{
 timeout:120000
},async()=>{
 const protectedFiles=[
  path.join(root,"server-integration/server.mjs"),
  path.join(root,"deployment/functional-release-runtime.mjs"),
  path.join(root,"deployment/durable-native-runtime-candidate.mjs"),
  path.join(root,"deployment/durable-clean-restart-news-review-entry.mjs")
 ];
 const before=protectedFiles.map(f=>readFileSync(f));
 const built=await buildPendingApprovalRealRuntimeCandidate56(root,good);
 try{
  const source=readFileSync(built.file,"utf8"),parent=readFileSync(built.parentFile,"utf8");
  assert.equal(reversePendingApprovalReceiptPatch(source),parent);
  assert.equal((source.match(/registerOAuthTool\("life_android_pending_approval_receipt_status"/g)||[]).length,1);
  assert.equal((source.match(/registerOAuthTool\(/g)||[]).length,(parent.match(/registerOAuthTool\(/g)||[]).length+1);
  for(const s of ["secureCall56(","durableNativeHooks56?.beforeDispatch(",
    "durableNativeHooks56?.acceptedCompletion(","jhRequireCommand56(","jhInspectSplitEvidence155",
    "const SECURE56_TOOL_CATALOG_DIGEST=","lookupOnly:true"])assert.ok(source.includes(s),s);
  for(let i=0;i<protectedFiles.length;i++)assert.deepEqual(readFileSync(protectedFiles[i]),before[i]);
  assert.equal(built.productionEnabled,false);assert.equal(built.automaticReplayAllowed,false);
  const syntax=spawnSync(process.execPath,["--check",built.file],{cwd:root,encoding:"utf8",timeout:18000});
  assert.equal(syntax.status,0,syntax.stderr);
  const script="const m=await import("+JSON.stringify(pathToFileURL(built.file).href)+");"+
    "if(!m.httpServer||m.httpServer.listening||typeof m.installDurableNativeCircuit56!=='function')process.exit(42);process.exit(0);";
  const check=spawnSync(process.execPath,["--input-type=module","-e",script],
    {cwd:root,encoding:"utf8",timeout:30000,env:good});
  assert.equal(check.status,0,(check.stderr||"").slice(0,2500));
 }finally{rmSync(built.file,{force:true})}
});
