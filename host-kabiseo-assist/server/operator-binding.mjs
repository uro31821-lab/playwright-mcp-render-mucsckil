/** Explicit operator-start candidate. No listener, storage key, enrollment or device action.
 * Expected digest comes from separately reviewed host configuration, NOT from this artifact.
 * Hash integrity is not deployment approval and does not defend against a privileged writer.
 */
import path from 'node:path';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const START_SCHEMA='KABISEO_OPERATOR_START_V016';
export const OWNER='jh-server/owner-setup';
export const RUNTIME=OWNER+'/server-integration/server-kabiseo-operator.mjs';
const SERVICE='srv-db0fjl2d0e5s73be114g';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const safe=p=>typeof p==='string'&&p.length>0&&p.length<=1024&&!p.includes('\\')&&!p.includes('\0')&&!path.posix.isAbsolute(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const PROFILE={JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',JH_STAGE26_SIGNED_COMPLETION_ACK:null,JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:null,JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:null,JH_STAGE44_DEVICE_FOCUS:null,JH_MOBILE13_COMMAND_DIAGNOSTICS:null};
const PIN_KEYS=['NODE_ENV','RENDER_SERVICE_ID','JH_KABISEO_OPERATOR_START','JH_KABISEO_START_MANIFEST_SHA256','JH_OPERATIONAL_ACCOUNT_DIGEST','JH_OPERATIONAL_START','JH_PC_OWNER_SETUP_ENABLED','JH_PC_OWNER_SETUP_PLAN_FILE','JH_PENDING_APPROVAL_OPERATOR_ENABLE','JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE','JH_DURABLE_RELEASE',...Object.keys(PROFILE)];
const pin=env=>JSON.stringify(PIN_KEYS.map(k=>[k,env[k]??null]));
let binding=null,attempted=false,selections=0;

export function inventoryOperatorPackage(root){
 const resolved=path.resolve(root);
 if(realpathSync(resolved)!==resolved||lstatSync(resolved).isSymbolicLink())fail('KABISEO_START_REAL_ROOT_REQUIRED');
 const files=[];let total=0;
 function walk(dir,prefix=''){
  for(const name of readdirSync(dir).sort()){
   const rel=prefix?prefix+'/'+name:name;if(!safe(rel))fail('KABISEO_START_PATH_INVALID');
   const file=path.join(dir,name),s=lstatSync(file);
   if(s.isSymbolicLink())fail('KABISEO_START_SYMLINK_FORBIDDEN');
   if(s.isDirectory()){walk(file,rel);continue;}
   if(!s.isFile()||s.size>32*1024*1024)fail('KABISEO_START_FILE_INVALID');
   const bytes=readFileSync(file);if(bytes.length!==s.size)fail('KABISEO_START_FILE_CHANGED');
   total+=bytes.length;if(files.length>=25000||total>256*1024*1024)fail('KABISEO_START_SIZE_LIMIT');
   files.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});
  }
 }
 walk(resolved);return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function verifyOperatorStartBundle({outputRoot,expectedManifestSha256}){
 if(!hex(expectedManifestSha256))fail('KABISEO_START_EXTERNAL_DIGEST_REQUIRED');
 const root=path.resolve(outputRoot);
 if(realpathSync(root)!==root||lstatSync(root).isSymbolicLink())fail('KABISEO_START_REAL_ROOT_REQUIRED');
 const file=path.join(root,'operator-start-manifest.json'),s=lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>8*1024*1024)fail('KABISEO_START_MANIFEST_INVALID');
 const bytes=readFileSync(file);if(sha(bytes)!==expectedManifestSha256)fail('KABISEO_START_DIGEST_MISMATCH');
 const m=JSON.parse(bytes);
 if(m.schema!==START_SCHEMA||m.scope!=='EXPLICIT_OPERATOR_CANDIDATE'||m.deploymentApproved!==false||m.nodeVersion!==process.version||m.runtime!==RUNTIME||!hex(m.parentManifestSha256)||JSON.stringify(m.buildProfile)!==JSON.stringify(PROFILE)||!Array.isArray(m.files)||m.files.length===0||m.files.length>25000)fail('KABISEO_START_MANIFEST_BOUNDARY');
 const names=new Set();for(const f of m.files){if(!f||!safe(f.path)||names.has(f.path)||!hex(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)fail('KABISEO_START_FILE_LIST_INVALID');names.add(f.path);}
 const packageRoot=path.join(root,'package');
 if(JSON.stringify(inventoryOperatorPackage(packageRoot))!==JSON.stringify(m.files))fail('KABISEO_START_FILES_CHANGED');
 const parent=readFileSync(path.join(root,'parent-review-manifest.json'));
 if(sha(parent)!==m.parentManifestSha256)fail('KABISEO_START_PARENT_CHANGED');
 const p=JSON.parse(parent),byPath=new Map(m.files.map(f=>[f.path,f]));
 if(p.schema!=='KABISEO_REVIEW_ASSEMBLY_V015'||p.scope!=='REVIEW_ONLY_NOT_OPERATOR_APPROVED'||p.productionStartupAuthorized!==false||!Array.isArray(p.files))fail('KABISEO_START_PARENT_INVALID');
 for(const f of p.files){if(JSON.stringify(byPath.get(f.path))!==JSON.stringify(f))fail('KABISEO_START_PARENT_SOURCE_CHANGED');}
 if(m.files.length!==p.files.length+5)fail('KABISEO_START_ADDITIVE_SCOPE_CHANGED');
 return Object.freeze({outputRoot:root,packageRoot,ownerRoot:path.join(packageRoot,OWNER),entryFile:path.join(packageRoot,RUNTIME),runtimeDigest:expectedManifestSha256,files:m.files.length,parentFiles:p.files.length,productionDeployed:false});
}
export function validateOperatorStartEnvironment(env,execArgv=[]){
 if(!env||env.CI!==undefined||env.NODE_ENV!=='production'||env.RENDER_SERVICE_ID!==SERVICE||env.JH_OWNER_DEFER_LISTEN!==undefined)fail('KABISEO_EXPLICIT_PRODUCTION_CONTEXT_REQUIRED');
 if(!Array.isArray(execArgv)||execArgv.length||['NODE_OPTIONS','NODE_PATH','LD_PRELOAD','JH_KABISEO_METADATA_REVIEW'].some(k=>env[k]!==undefined))fail('KABISEO_START_TEST_OR_INJECTION_FORBIDDEN');
 if(env.JH_KABISEO_OPERATOR_START!=='EXPLICIT_VERIFIED_CAMERA_METADATA_V1'||!hex(env.JH_KABISEO_START_MANIFEST_SHA256)||!hex(env.JH_OPERATIONAL_ACCOUNT_DIGEST))fail('KABISEO_START_OPERATOR_BINDING_REQUIRED');
 if(env.JH_PENDING_APPROVAL_OPERATOR_ENABLE!=='EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1'||env.JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE!=='EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'||env.JH_DURABLE_RELEASE!=='SERVE_READY_V1')fail('KABISEO_START_EXISTING_OPERATOR_REQUIRED');
 for(const [k,v] of Object.entries(PROFILE))if((env[k]??null)!==v)fail('KABISEO_START_BUILD_PROFILE_MISMATCH');
 if(env.JH_KABISEO_METADATA_MODE!==undefined&&env.JH_KABISEO_METADATA_MODE!=='EXPLICIT_READ_ONLY_CAMERA_V1')fail('KABISEO_START_METADATA_MODE_INVALID');
 return {metadataEnabled:env.JH_KABISEO_METADATA_MODE==='EXPLICIT_READ_ONLY_CAMERA_V1',profile:{...PROFILE}};
}
function current(env){
 return binding&&env===process.env&&pin(env)===binding.pin&&!['CI','NODE_OPTIONS','NODE_PATH','LD_PRELOAD','JH_KABISEO_METADATA_REVIEW'].some(k=>env[k]!==undefined)&&process.execArgv.length===0;
}
/** Called by the cloned ORIGINAL operational main before its original validation/secrets. */
export function assertKabiseoOperatorStart56(env){
 if(env!==process.env)fail('KABISEO_START_ACTUAL_ENV_REQUIRED');
 if(attempted)fail('KABISEO_START_ALREADY_ATTEMPTED');attempted=true;
 const mode=validateOperatorStartEnvironment(env,process.execArgv);
 const ownerRoot=path.resolve(import.meta.dirname,'..');
 const checked=verifyOperatorStartBundle({outputRoot:path.resolve(ownerRoot,'../../..'),expectedManifestSha256:env.JH_KABISEO_START_MANIFEST_SHA256});
 if(checked.ownerRoot!==ownerRoot)fail('KABISEO_START_BINDING_LOCATION_MISMATCH');
 binding={...checked,pin:pin(env),metadataEnabled:mode.metadataEnabled};
}
/** Two original seams: operational preflight, then owner pre-listen selection. */
export function selectKabiseoOperatorRuntime56(root,env=process.env){
 if(!current(env)||root!==binding.ownerRoot||env.JH_OWNER_DEFER_LISTEN!==undefined||selections>=2)fail('KABISEO_START_SELECTION_UNBOUND');
 const checked=verifyOperatorStartBundle({outputRoot:binding.outputRoot,expectedManifestSha256:binding.runtimeDigest});
 selections++;
 return Object.freeze({file:checked.entryFile,sha256:sha(readFileSync(checked.entryFile)),runtimeDigest:checked.runtimeDigest,automaticReplayAllowed:false});
}
export function kabiseoOperatorRuntimeIdentity56(){return current(process.env)&&selections===2?binding.runtimeDigest:null;}
export function kabiseoOperatorMetadataEnabled56(){
 return !!(current(process.env)&&selections===2&&binding.metadataEnabled&&process.env.JH_OWNER_DEFER_LISTEN==='1'&&process.env.JH_KABISEO_METADATA_MODE==='EXPLICIT_READ_ONLY_CAMERA_V1');
}
