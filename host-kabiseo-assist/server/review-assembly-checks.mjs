/** Fault injection on a disposable review snapshot. Every mutation is restored.
 * No production start, installed device, operator key or APK is used.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync,renameSync,symlinkSync} from 'node:fs';
import {verifyKabiseoReviewAssembly,loadKabiseoReviewAssembly} from './review-assembly.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function checkKabiseoAssemblyFaults(built){
 const options={outputRoot:built.outputRoot,expectedManifestSha256:built.expectedManifestSha256};
 const manifestPath=path.join(built.outputRoot,'review-manifest.json');
 const original=readFileSync(manifestPath),manifest=JSON.parse(original);
 const checks=[];
 const pass=name=>{checks.push(name);console.log('ASSEMBLY PASS '+name);};
 const verify=()=>verifyKabiseoReviewAssembly(options);
 assert.equal(verify().assemblyId,built.assemblyId);pass('complete manifest verifies with external digest');
 assert.throws(()=>verifyKabiseoReviewAssembly({outputRoot:built.outputRoot}),/EXTERNAL_DIGEST_REQUIRED/);pass('missing external digest rejected');
 assert.throws(()=>verifyKabiseoReviewAssembly({...options,expectedManifestSha256:'0'.repeat(64)}),/MANIFEST_DIGEST_MISMATCH/);pass('incorrect external digest rejected');
 const mutate=async(rel,name)=>{
  assert.ok(rel,name+' target exists');const file=path.join(built.packageRoot,rel),bytes=readFileSync(file);
  try{
   writeFileSync(file,Buffer.concat([bytes,Buffer.from('\nKABISEO_TAMPER_PROBE\n')]));
   await assert.rejects(()=>loadKabiseoReviewAssembly(options),/ASSEMBLY_FILE_MISMATCH/);
   pass(name+' rejected before module import');
  }finally{writeFileSync(file,bytes);}
 };
 await mutate(manifest.entry,'changed generated entry');
 await mutate(manifest.policy,'mixed durable policy');
 await mutate(manifest.parent,'changed original runtime');
 await mutate(manifest.files.find(f=>f.path.endsWith('/trusted-device-registry.mjs'))?.path,'changed trusted registry');
 await mutate(manifest.files.find(f=>f.path.includes('/node_modules/')&&f.path.endsWith('.js'))?.path,'changed installed dependency');
 await mutate(manifest.files.find(f=>f.path.endsWith('/package-lock.json'))?.path,'changed dependency lock');
 const unexpected=path.join(built.packageRoot,'unexpected-executable.mjs');
 try{writeFileSync(unexpected,'throw Error("must never execute")');assert.throws(verify,/ASSEMBLY_FILE_MISMATCH/);pass('unexpected extra file rejected');}
 finally{unlinkSync(unexpected);}
 const policy=path.join(built.packageRoot,manifest.policy),parked=path.join(built.outputRoot,'policy.parked');
 renameSync(policy,parked);
 try{assert.throws(verify,/ASSEMBLY_FILE_MISMATCH/);pass('missing policy rejected');}finally{renameSync(parked,policy);}
 renameSync(policy,parked);
 try{symlinkSync(parked,policy);assert.throws(verify,/SYMLINK_FORBIDDEN/);pass('symlink policy replacement rejected');}
 finally{unlinkSync(policy);renameSync(parked,policy);}
 try{
  writeFileSync(manifestPath,Buffer.concat([original,Buffer.from(' ')]));
  assert.throws(verify,/MANIFEST_DIGEST_MISMATCH/);pass('manifest byte change rejected');
 }finally{writeFileSync(manifestPath,original);}
 function malformed(change,pattern,name){
  const value=JSON.parse(original);change(value);const bytes=JSON.stringify(value,null,2)+'\n';
  try{writeFileSync(manifestPath,bytes);assert.throws(()=>verifyKabiseoReviewAssembly({...options,expectedManifestSha256:sha(bytes)}),pattern);pass(name);}
  finally{writeFileSync(manifestPath,original);}
 }
 malformed(m=>{m.files[0].path='../outside.mjs';},/FILE_LIST_INVALID/,'path traversal rejected even with caller-pinned malformed manifest');
 malformed(m=>{m.files.push(m.files[0]);},/FILE_LIST_INVALID/,'duplicate manifest entry rejected');
 malformed(m=>{m.productionStartupAuthorized=true;},/MANIFEST_BOUNDARY_INVALID/,'manifest cannot grant production startup');
 malformed(m=>{m.nodeVersion='v0.0.0';},/MANIFEST_BOUNDARY_INVALID/,'different Node runtime rejected');
 malformed(m=>{m.assemblyId='0'.repeat(64);},/CAMERA_ASSEMBLY_BINDING_MISMATCH/,'incorrect camera assembly identity rejected');
 for(const key of ['RENDER_SERVICE_ID','JH_KABISEO_METADATA_REVIEW','NODE_OPTIONS']){
  const old=process.env[key];process.env[key]='forbidden-test-value';
  try{await assert.rejects(()=>loadKabiseoReviewAssembly(options),/LIVE_OR_INJECTED_ENV_FORBIDDEN/);pass(key+' refused before load');}
  finally{if(old===undefined)delete process.env[key];else process.env[key]=old;}
 }
 assert.equal(verify().assemblyId,built.assemblyId);pass('all fault mutations restored before the genuine load');
 return {schema:'KABISEO_ASSEMBLY_FAULTS_V015',status:'PASS',checks,
  count:checks.length,physicalPhoneCommands:0,productionStartup:false,operatorApproval:false};
}
