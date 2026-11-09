/** New separate snapshot; five added files only. Original production files remain byte-identical.
 * Never starts an operator, consumes secrets, signs, deploys or installs anything.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {verifyKabiseoReviewAssembly} from './review-assembly.mjs';
import {OWNER,RUNTIME,START_SCHEMA,inventoryOperatorPackage,verifyOperatorStartBundle} from './operator-binding.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const OLD_IMPORT='import {selectStage25PendingOperatorRuntime56} from "../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs";';
const NEW_IMPORT='import {selectKabiseoOperatorRuntime56,assertKabiseoOperatorStart56} from "./kabiseo-operator-binding.mjs";';
const DEP=OWNER+'/deployment/';
const exact=(source,old,next)=>{assert.equal(source.split(old).length,2,'single original startup seam required');assert.ok(!source.includes(next));const out=source.replace(old,next);assert.equal(out.replace(next,old),source);return out;};
function apply(source,edits){
 let out=source;for(const [old,next] of edits)out=exact(out,old,next);
 // An additive insertion intentionally includes the original statement. Reverse
 // by the unique full inserted block, then compare the COMPLETE original bytes.
 let reversed=out;
 for(const [old,next] of [...edits].reverse()){
  assert.equal(reversed.split(next).length,2,'single exact reverse seam required');
  reversed=reversed.replace(next,old);
 }
 assert.equal(reversed,source,'original startup must restore byte-for-byte');return out;
}
export function composeOperatorStart({reviewRoot,reviewManifestSha256,outputRoot}){
 const parent=verifyKabiseoReviewAssembly({outputRoot:reviewRoot,expectedManifestSha256:reviewManifestSha256});
 const output=path.resolve(outputRoot),source=path.join(path.resolve(reviewRoot),'package');
 if(existsSync(output)||output.startsWith(path.resolve(reviewRoot)+path.sep)||path.resolve(reviewRoot).startsWith(output+path.sep)||realpathSync(path.dirname(output))!==path.dirname(output))throw Error('KABISEO_START_NEW_OUTPUT_REQUIRED');
 mkdirSync(output,{mode:0o700});cpSync(source,path.join(output,'package'),{recursive:true,errorOnExist:true,force:false,dereference:false});
 const pkg=path.join(output,'package');
 const originalManifest=readFileSync(path.join(reviewRoot,'review-manifest.json'));
 writeFileSync(path.join(output,'parent-review-manifest.json'),originalManifest,{flag:'wx',mode:0o600});
 const read=p=>readFileSync(path.join(pkg,p),'utf8');
 const changes=[];
 changes.push([DEP+'owner-service-kabiseo-operator.mjs',apply(read(DEP+'owner-service-stage25-followup-operator.mjs'),[
  [OLD_IMPORT,NEW_IMPORT],
  ["if(runtimeMode==='unified')serverPath=selectStage25PendingOperatorRuntime56(root,process.env).file;","if(runtimeMode==='unified')serverPath=selectKabiseoOperatorRuntime56(root,process.env).file;"]])]);
 changes.push([DEP+'unified-service-kabiseo-operator.mjs',apply(read(DEP+'unified-service-stage25-followup-operator.mjs'),[
  ["from './owner-service-stage25-followup-operator.mjs';","from './owner-service-kabiseo-operator.mjs';"]])]);
 changes.push([DEP+'operational-service-kabiseo-operator.mjs',apply(read(DEP+'operational-service-stage25-followup-operator.mjs'),[
  [OLD_IMPORT,NEW_IMPORT],
  ["from './unified-service-stage25-followup-operator.mjs';","from './unified-service-kabiseo-operator.mjs';"],
  ['const runtime=selectStage25PendingOperatorRuntime56(ROOT,process.env).file;','const runtime=selectKabiseoOperatorRuntime56(ROOT,process.env).file;'],
  [' validateOperationalEnvironment(env);',' assertKabiseoOperatorStart56(env);\n validateOperationalEnvironment(env);']])]);
 const originalRuntime=read(OWNER+'/server-integration/server-kabiseo-reviewed-assembly.mjs');
 const runtimeImport='import {kabiseoOperatorRuntimeIdentity56,kabiseoOperatorMetadataEnabled56} from "../deployment/kabiseo-operator-binding.mjs";\n';
 const begin='// KABISEO_SERVER_METADATA_V010_BEGIN\n',end='// KABISEO_SERVER_METADATA_V010_END\n';
 assert.equal(originalRuntime.split(begin).length,2);assert.equal(originalRuntime.split(end).length,2);
 const a=originalRuntime.indexOf(begin),b=originalRuntime.indexOf(end,a)+end.length;
 const block=originalRuntime.slice(a,b),oldGate="enabled(){return process.env.JH_KABISEO_METADATA_REVIEW==='EXPLICIT_READ_ONLY_CAMERA_V1';}",newGate='enabled(){return kabiseoOperatorMetadataEnabled56();}';
 assert.equal(block.split(oldGate).length,3);
 let next=block.split(oldGate).join(newGate);
 const oldId='runtimeDigest:'+JSON.stringify(parent.assemblyId),newId='runtimeDigest:kabiseoOperatorRuntimeIdentity56()';
 next=exact(next,oldId,newId);
 assert.equal(next.replace(newId,oldId).split(newGate).join(oldGate),block);
 changes.push([RUNTIME,runtimeImport+originalRuntime.slice(0,a)+next+originalRuntime.slice(b)]);
 changes.push([DEP+'kabiseo-operator-binding.mjs',readFileSync(fileURLToPath(new URL('./operator-binding.mjs',import.meta.url)),'utf8')]);
 for(const [name,text] of changes){writeFileSync(path.join(pkg,name),text,{flag:'wx',mode:0o600});execFileSync(process.execPath,['--check',path.join(pkg,name)],{timeout:30000,stdio:'pipe'});}
 const buildProfile={JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',JH_STAGE26_SIGNED_COMPLETION_ACK:null,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:null,JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:null,JH_STAGE44_DEVICE_FOCUS:null,JH_MOBILE13_COMMAND_DIAGNOSTICS:null};
 const manifest={schema:START_SCHEMA,scope:'EXPLICIT_OPERATOR_CANDIDATE',deploymentApproved:false,nodeVersion:process.version,parentManifestSha256:sha(originalManifest),runtime:RUNTIME,buildProfile,files:inventoryOperatorPackage(pkg)};
 const bytes=JSON.stringify(manifest,null,2)+'\n',expectedManifestSha256=sha(bytes);
 writeFileSync(path.join(output,'operator-start-manifest.json'),bytes,{flag:'wx',mode:0o600});
 const checked=verifyOperatorStartBundle({outputRoot:output,expectedManifestSha256});
 verifyKabiseoReviewAssembly({outputRoot:reviewRoot,expectedManifestSha256:reviewManifestSha256});
 return {...checked,expectedManifestSha256,addedFiles:changes.map(([name])=>name),originalReviewUnchanged:true,operatorMain:path.join(pkg,DEP+'operational-service-kabiseo-operator.mjs')};
}
