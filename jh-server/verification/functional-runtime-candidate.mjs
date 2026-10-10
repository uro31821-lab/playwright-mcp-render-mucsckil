/** Functional repair candidate based on the actual operational runtime.
 * The input SHA-256 is pinned to Render's JH_OPERATIONAL_READY log for the
 * deployed commit. Baseline files, auth, owner storage and phone trust are kept.
 * Produces a separate executable for runtime validation; does not deploy it.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const LIVE_RUNTIME_SHA='108ad68ef5c87db4c311e3569a0d2a06b09726a2a638ac4f7ee1319d169fd14b';
export async function buildFunctionalRuntimeCandidate(){
 const {assertUnifiedRuntime}=await import('../owner-setup/deployment/unified-runtime-build.mjs');
 const root=fileURLToPath(new URL('../owner-setup/',import.meta.url));
 const originalUrl=pathToFileURL(assertUnifiedRuntime(root));
 const original=readFileSync(originalUrl,'utf8');
 assert.equal(sha(original),LIVE_RUNTIME_SHA,'input must match the operational server runtime fingerprint');
 const oldRoute='const nativeHints=["카카오톡","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
 const newRoute='const nativeHints=["카카오톡","카카오t","카카오티","kakao t","카카오 택시","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
 const oldStatus='registerOAuthTool("life_job_status",{\n    title:"Android job status",\n    description:"Read a queued Android job result.",\n    inputSchema:{job_id:z.string()}\n  },async({job_id})=>jobResult(jobs.get(job_id)));';
 const newStatus=oldStatus.replace('=>jobResult(jobs.get(job_id))','=>{cleanupJobs();return jobResult(jobs.get(job_id));}');
 const edits=[[oldRoute,newRoute],[oldStatus,newStatus]];
 let output=original;
 for(const [before,after] of edits){
  assert.equal(output.split(before).length-1,1,'functional patch anchor must be unique');
  assert.equal(output.split(after).length-1,0,'candidate may not already be patched');
  output=output.replace(before,after);
 }
 let reversed=output;
 for(const [before,after] of [...edits].reverse())reversed=reversed.replace(after,before);
 assert.equal(reversed,original,'no changes outside the two functional repairs');
 const candidateUrl=new URL('./server-functional-verification.mjs',originalUrl);
 const temp=new URL('./server-functional-verification.mjs.tmp',originalUrl);
 writeFileSync(temp,output,{mode:0o600});renameSync(temp,candidateUrl);
 assert.equal(readFileSync(candidateUrl,'utf8'),output);
 const identity={schema:2,sourceCommit:'6562eecd1710acf3ff5dfc713a1c642ef6ed78bd',runtimeMode:'operational-core',liveRuntimeFingerprintMatched:true,originalSha256:sha(original),candidateSha256:sha(output),exactEdits:2,reversalEqualsOriginal:true,baselineFilesChanged:false,authenticationChanged:false,phoneAutoConnectionChanged:false,memoriaChanged:false,productionDeployment:false};
 writeFileSync(new URL('../functional-runtime-identity.json',originalUrl),JSON.stringify(identity,null,2)+'\n');
 return {originalUrl,candidateUrl,identity};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){console.log(JSON.stringify((await buildFunctionalRuntimeCandidate()).identity));}
