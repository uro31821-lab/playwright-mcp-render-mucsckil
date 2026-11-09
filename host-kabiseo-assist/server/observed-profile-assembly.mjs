/** Exact profile adapter for the already-reviewed v0.16 generators.
 * Generates a NEW isolated tools directory. Does not mutate existing tools,
 * production configuration, host source, dependencies or Android.
 * Startup logs are historical evidence, never deployment authorization.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,readdirSync,lstatSync,mkdirSync,existsSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export const OBSERVED_PROFILE=Object.freeze({
 JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
 JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
 JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
 JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
 JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'
});
const OLD_PROFILE="{JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',JH_STAGE26_SIGNED_COMPLETION_ACK:null,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:null,JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:null,JH_STAGE44_DEVICE_FOCUS:null,JH_MOBILE13_COMMAND_DIAGNOSTICS:null}";
const jsonProfile=JSON.stringify(OBSERVED_PROFILE);
const observedKeys=Object.keys(OBSERVED_PROFILE);
const originalAllowed=" const allowed=new Set(['JH_OWNER_DEFER_LISTEN','JH_MOBILE_WEB_13_MODE','JH_OPERATIONAL_ACCOUNT_DIGEST','JH_OAUTH_STATE_FILE']);";
const newAllowed=" const exactObservedProfile="+jsonProfile+";\n for(const [key,value] of Object.entries(exactObservedProfile))if(process.env[key]!==value)fail('KABISEO_OBSERVED_PROFILE_REQUIRED');\n const allowed=new Set(['JH_OWNER_DEFER_LISTEN','JH_OPERATIONAL_ACCOUNT_DIGEST','JH_OAUTH_STATE_FILE',...Object.keys(exactObservedProfile)]);";
function patch(source,edits){
 let next=source;
 for(const [old,value] of edits){assert.equal(next.split(old).length,2,'exact unique source seam');assert.ok(!next.includes(value),'not already patched');next=next.replace(old,value);}
 let reversed=next;
 for(const [old,value] of [...edits].reverse()){assert.equal(reversed.split(value).length,2,'unique reverse seam');reversed=reversed.replace(value,old);}
 assert.equal(reversed,source,'full original generator bytes preserved');return next;
}
export function compareObservedProfile({buildProfile,nodeVersion},observation){
 assert.equal(observation.schema,'KABISEO_LIVE_PROFILE_OBSERVATION_V017');
 assert.equal(observation.serviceId,'srv-db0fjl2d0e5s73be114g');
 assert.equal(observation.deployedCommit,'0663e0c3b434f300803e5cf272609032a5e519d3');
 assert.deepEqual(observation.buildProfile,OBSERVED_PROFILE);
 assert.match(observation.loggedNodeVersion,/^v\d+\.\d+\.\d+$/);
 assert.ok(buildProfile&&typeof buildProfile==='object'&&!Array.isArray(buildProfile));
 const profileMismatches=observedKeys.filter(k=>(buildProfile[k]??null)!==OBSERVED_PROFILE[k]);
 const unexpectedProfileKeys=Object.keys(buildProfile).filter(k=>!observedKeys.includes(k));
 const runtimeVersionMatched=nodeVersion===observation.loggedNodeVersion;
 return {schema:'KABISEO_PROFILE_RECONCILIATION_V017',profileMismatches,unexpectedProfileKeys,runtimeVersionMatched,
  status:profileMismatches.length||unexpectedProfileKeys.length||!runtimeVersionMatched?'BLOCKED_FOR_RELEASE':'PROFILE_MATCH_ONLY_NOT_RELEASE_APPROVED',
  observedNodeVersion:observation.loggedNodeVersion,candidateNodeVersion:nodeVersion??null,
  releaseApproved:false,liveConfigurationChangeRequired:false,automaticDowngradeAllowed:false};
}
export function prepareObservedProfileTools(destination){
 const out=path.resolve(destination);
 assert.ok(!existsSync(out),'new output directory required');
 assert.equal(realpathSync(path.dirname(out)),path.dirname(out),'real existing output parent');
 assert.ok(!out.startsWith(ROOT+path.sep)&&!ROOT.startsWith(out+path.sep),'separate tools directory');
 mkdirSync(out,{mode:0o700});const originals=[],changed=[];
 const edits={
  'operator-binding.mjs':[["const PROFILE="+OLD_PROFILE+';',"const PROFILE="+jsonProfile+';']],
  'operator-start-compose.mjs':[[" const buildProfile="+OLD_PROFILE+';'," const buildProfile="+jsonProfile+';']],
  'review-assembly.mjs':[
   [originalAllowed,newAllowed],
   ["   JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'},","   ..."+jsonProfile+"},"]
  ]
 };
 for(const name of readdirSync(ROOT).sort()){
  if(!name.endsWith('.mjs'))continue;
  const src=path.join(ROOT,name),stat=lstatSync(src);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<1024*1024);
  const bytes=readFileSync(src),text=bytes.toString('utf8');
  assert.equal(Buffer.from(text).compare(bytes),0,'UTF8 source required');
  const output=edits[name]?patch(text,edits[name]):text;
  writeFileSync(path.join(out,name),output,{flag:'wx',mode:0o600});
  originals.push({path:name,sha256:sha(bytes)});
  if(edits[name])changed.push({path:name,originalSha256:sha(bytes),candidateSha256:sha(output),exactReversalVerified:true});
 }
 assert.equal(changed.length,3);
 for(const record of originals)assert.equal(sha(readFileSync(path.join(ROOT,record.path))),record.sha256);
 return {directory:out,changedFiles:changed,originalFilesPreserved:originals.length,buildProfile:{...OBSERVED_PROFILE},liveConfigurationChanged:false};
}
