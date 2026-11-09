/** Review-only composition, NOT an operational startup or installer.
 * Copies the public server and its already installed locked dependencies into
 * an isolated snapshot. No npm, listener, enrollment or device command here.
 * The external expected manifest digest is required before importing the entry.
 * Hash attestation is integrity evidence, not an operator signature/approval.
 * Construction runs in a different process: a builder's cached original policy
 * must never silently replace the verified on-disk policy in the runtime process.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {applyKabiseoMetadataPatch,reverseKabiseoMetadataPatch} from './source-patch.mjs';

const OWNER='jh-server/owner-setup';
const POLICY=OWNER+'/deployment/durable-native-job-policy.mjs';
const PARENT=OWNER+'/server-integration/server-jh168-pending-approval-followup-operator.mjs';
const ENTRY=OWNER+'/server-integration/server-kabiseo-reviewed-assembly.mjs';
const POLICY_SHA='1f0cedab941241f5f2123fa3d429946dfdd478407f21eec697d1774e8a902089';
const ORIGINAL_POLICY_BLOB='39be04401aa360ba6bf87370d291bc6096b5c655';
const SCHEMA='KABISEO_REVIEW_ASSEMBLY_V015';
const SCOPE='REVIEW_ONLY_NOT_OPERATOR_APPROVED';
const BINDING='runtimeDigest:jhWorkflowRuntimeDigest56';
const BUILD_REPORT='KABISEO_ASSEMBLY_BUILD_RESULT=';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const digest=value=>sha(JSON.stringify(value));
const fail=code=>{throw Object.assign(Error(code),{code});};
const relativeSafe=name=>typeof name==='string'&&name.length>0&&name.length<=1024&&
 !name.includes('\\')&&!name.includes('\0')&&!path.posix.isAbsolute(name)&&
 name.split('/').every(p=>p!==''&&p!=='.'&&p!=='..');
const within=(root,value)=>value===root||value.startsWith(root+path.sep);
const loaded=new Set();

function reviewEnvironment(){
 if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||process.env.JH_OWNER_DEFER_LISTEN!=='1'||
 process.env.JH_MOBILE_WEB_13_MODE!=='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1')fail('KABISEO_REVIEW_ENV_REQUIRED');
 const allowed=new Set(['JH_OWNER_DEFER_LISTEN','JH_MOBILE_WEB_13_MODE','JH_OPERATIONAL_ACCOUNT_DIGEST','JH_OAUTH_STATE_FILE']);
 for(const key of Object.keys(process.env)){
  if(key.startsWith('RENDER_')||(key.startsWith('JH_')&&!allowed.has(key))||
     ['NODE_OPTIONS','NODE_PATH','LD_PRELOAD'].includes(key))fail('KABISEO_LIVE_OR_INJECTED_ENV_FORBIDDEN');
 }
}
function inspectFile(file){
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())fail('KABISEO_REGULAR_FILE_REQUIRED');
 if(stat.size>32*1024*1024)fail('KABISEO_FILE_SIZE_LIMIT');
 const bytes=readFileSync(file);
 if(bytes.length!==stat.size)fail('KABISEO_FILE_CHANGED_DURING_READ');
 return {bytes:bytes.length,sha256:sha(bytes)};
}
function inventory(root,{skipBin=false}={}){
 if(lstatSync(root).isSymbolicLink()||realpathSync(root)!==path.resolve(root))fail('KABISEO_REAL_ROOT_REQUIRED');
 const rows=[];let total=0;
 function walk(dir,prefix=''){
  for(const name of readdirSync(dir).sort()){
   if(skipBin&&name==='.bin')continue;
   const rel=prefix?prefix+'/'+name:name;
   if(!relativeSafe(rel))fail('KABISEO_UNSAFE_PATH');
   const target=path.join(dir,name),stat=lstatSync(target);
   if(stat.isSymbolicLink())fail('KABISEO_SYMLINK_FORBIDDEN');
   if(stat.isDirectory()){walk(target,rel);continue;}
   const item=inspectFile(target);total+=item.bytes;
   if(rows.length>=25000||total>256*1024*1024)fail('KABISEO_INVENTORY_LIMIT');
   rows.push({path:rel,...item});
  }
 }
 walk(root);return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function copyTree(source,destination){
 const stat=lstatSync(source);
 if(stat.isSymbolicLink())fail('KABISEO_SOURCE_SYMLINK_FORBIDDEN');
 if(stat.isDirectory()){
  mkdirSync(destination,{mode:0o700});
  for(const name of readdirSync(source).sort()){
   if(name==='.bin')continue; // npm CLI links are not runtime dependencies; never copied or executed.
   if(name.startsWith('.env')||/\.(apk|keystore|jks|sqlite|db)$/i.test(name))fail('KABISEO_NON_SOURCE_INPUT_FORBIDDEN');
   copyTree(path.join(source,name),path.join(destination,name));
  }
 }else{
  inspectFile(source);copyFileSync(source,destination);
 }
}
function cameraBinding(template,id){
 // The full server legitimately uses its workflow digest in other features.
 // Replace only the single binding inside the additive camera helper block.
 const begin='// KABISEO_SERVER_METADATA_V010_BEGIN\n';
 const end='// KABISEO_SERVER_METADATA_V010_END\n';
 if(template.split(begin).length!==2||template.split(end).length!==2)fail('KABISEO_CAMERA_BINDING_SEAM_DRIFT');
 const a=template.indexOf(begin),b=template.indexOf(end,a)+end.length;
 if(b<=a)fail('KABISEO_CAMERA_BINDING_SEAM_DRIFT');
 const block=template.slice(a,b);
 if(block.split(BINDING).length!==2)fail('KABISEO_CAMERA_BINDING_SEAM_DRIFT');
 const next=block.replace(BINDING,'runtimeDigest:'+JSON.stringify(id));
 const result=template.slice(0,a)+next+template.slice(b);
 assert.equal(result.replace('runtimeDigest:'+JSON.stringify(id),BINDING),template);
 return result;
}
function identity(parent,template,files){
 return digest({schema:SCHEMA,node:process.version,parentSha256:sha(parent),
  templateSha256:sha(template),policySha256:POLICY_SHA,dependencies:files});
}

async function buildInFreshProcess({baselineRoot,outputRoot}){
 reviewEnvironment();
 const source=realpathSync(path.resolve(baselineRoot));
 const output=path.resolve(outputRoot);
 if(existsSync(output)||within(source,output)||within(output,source))fail('KABISEO_NEW_SEPARATE_OUTPUT_REQUIRED');
 if(realpathSync(path.dirname(output))!==path.dirname(output))fail('KABISEO_REAL_OUTPUT_PARENT_REQUIRED');
 const baselineCommit=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.match(baselineCommit,/^[a-f0-9]{40}$/);
 const originalPolicy=readFileSync(path.join(source,POLICY));
 const originalBlob=createHash('sha1').update('blob '+originalPolicy.length+'\0').update(originalPolicy).digest('hex');
 assert.equal(originalBlob,ORIGINAL_POLICY_BLOB,'reviewed original durable classifier required');
 const candidatePolicy=readFileSync(fileURLToPath(new URL('./candidate-durable-native-job-policy.mjs',import.meta.url)));
 assert.equal(sha(candidatePolicy),POLICY_SHA,'exact previously reviewed read-only policy required');
 const sourceBefore=inventory(path.join(source,'jh-server'),{skipBin:true});
 mkdirSync(output,{mode:0o700});
 const packageRoot=path.join(output,'package');mkdirSync(packageRoot,{mode:0o700});
 copyTree(path.join(source,'jh-server'),path.join(packageRoot,'jh-server'));
 const ownerRoot=path.join(packageRoot,OWNER);
 const {buildStage25PendingOperatorEntrypoint56}=await import(pathToFileURL(path.join(ownerRoot,'jh168-mobile-unification/stage25-live-operator-followup-entry.mjs')).href);
 const original=await buildStage25PendingOperatorEntrypoint56(ownerRoot,process.env);
 assert.equal(original.listenerStarted,false);assert.equal(original.productionEnabled,false);
 assert.equal(path.relative(packageRoot,original.runtimeFile).split(path.sep).join('/'),PARENT);
 const parent=readFileSync(original.runtimeFile,'utf8');
 const template=applyKabiseoMetadataPatch(parent);
 assert.equal(reverseKabiseoMetadataPatch(template),parent);
 writeFileSync(path.join(packageRoot,POLICY),candidatePolicy);
 const dependencies=inventory(packageRoot);
 const assemblyId=identity(parent,template,dependencies);
 const candidate=cameraBinding(template,assemblyId);
 assert.equal(candidate.replace('runtimeDigest:'+JSON.stringify(assemblyId),BINDING),template);
 const entryFile=path.join(packageRoot,ENTRY);
 writeFileSync(entryFile,candidate,{flag:'wx',mode:0o600});
 execFileSync(process.execPath,['--check',entryFile],{stdio:'pipe',timeout:30000});
 const manifest={schema:SCHEMA,scope:SCOPE,productionStartupAuthorized:false,
  cameraDefault:'OFF',operatorSignaturePresent:false,nodeVersion:process.version,
  baselineCommit,parent:PARENT,entry:ENTRY,policy:POLICY,originalPolicyBlob:originalBlob,
  originalRuntimeSha256:sha(parent),templateSha256:sha(template),policySha256:POLICY_SHA,
  assemblyId,files:inventory(packageRoot)};
 const manifestBytes=json(manifest),manifestPath=path.join(output,'review-manifest.json');
 writeFileSync(manifestPath,manifestBytes,{flag:'wx',mode:0o600});
 assert.deepEqual(inventory(path.join(source,'jh-server'),{skipBin:true}),sourceBefore,'original baseline must remain byte-identical');
 const expectedManifestSha256=sha(manifestBytes);
 const verified=verifyKabiseoReviewAssembly({outputRoot:output,expectedManifestSha256});
 return {...verified,outputRoot:output,packageRoot,ownerRoot,expectedManifestSha256,builderProcessId:process.pid};
}

export async function buildKabiseoReviewAssembly({baselineRoot,outputRoot}){
 reviewEnvironment();
 const source=path.resolve(baselineRoot),output=path.resolve(outputRoot);
 const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--kabiseo-build-child',source,output],{
  env:{PATH:process.env.PATH||'',CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
   JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'},
  encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
 if(child.error||child.signal||child.status!==0)throw Error('KABISEO_ISOLATED_BUILD_FAILED\n'+(child.stderr||'')+'\n'+(child.stdout||''));
 const lines=child.stdout.split('\n').filter(line=>line.startsWith(BUILD_REPORT));
 if(lines.length!==1)fail('KABISEO_ISOLATED_BUILD_RECEIPT_REQUIRED');
 const built=JSON.parse(lines[0].slice(BUILD_REPORT.length));
 if(built.outputRoot!==output||!Number.isSafeInteger(built.builderProcessId)||built.builderProcessId===process.pid)
  fail('KABISEO_BUILD_PROCESS_SEPARATION_REQUIRED');
 // This process has not imported any cloned builder/runtime/policy modules.
 // Recheck bytes here rather than trusting the terminated builder's report.
 const verified=verifyKabiseoReviewAssembly({outputRoot:output,expectedManifestSha256:built.expectedManifestSha256});
 if(verified.assemblyId!==built.assemblyId)fail('KABISEO_BUILD_RESULT_MISMATCH');
 console.log('KABISEO_BUILD_PROCESS_SEPARATION_PASS');
 return {...built,...verified,builderProcessIsolated:true};
}

export function verifyKabiseoReviewAssembly({outputRoot,expectedManifestSha256}){
 if(typeof expectedManifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedManifestSha256))fail('KABISEO_EXTERNAL_DIGEST_REQUIRED');
 const output=path.resolve(outputRoot),manifestPath=path.join(output,'review-manifest.json');
 if(lstatSync(output).isSymbolicLink()||realpathSync(output)!==output)fail('KABISEO_REAL_ROOT_REQUIRED');
 const stat=lstatSync(manifestPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)fail('KABISEO_MANIFEST_FILE_INVALID');
 const bytes=readFileSync(manifestPath);
 if(sha(bytes)!==expectedManifestSha256)fail('KABISEO_MANIFEST_DIGEST_MISMATCH');
 const m=JSON.parse(bytes.toString('utf8'));
 if(m.schema!==SCHEMA||m.scope!==SCOPE||m.productionStartupAuthorized!==false||m.operatorSignaturePresent!==false||
  m.cameraDefault!=='OFF'||m.nodeVersion!==process.version||m.entry!==ENTRY||m.parent!==PARENT||m.policy!==POLICY||
  m.policySha256!==POLICY_SHA||m.originalPolicyBlob!==ORIGINAL_POLICY_BLOB)fail('KABISEO_MANIFEST_BOUNDARY_INVALID');
 if(!Array.isArray(m.files)||m.files.length===0||m.files.length>25000)fail('KABISEO_FILE_LIST_INVALID');
 const names=new Set();
 for(const item of m.files){
  if(!item||!relativeSafe(item.path)||names.has(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<0||
   !/^[a-f0-9]{64}$/.test(item.sha256))fail('KABISEO_FILE_LIST_INVALID');
  names.add(item.path);
 }
 const packageRoot=path.join(output,'package'),actual=inventory(packageRoot);
 if(JSON.stringify(actual)!==JSON.stringify(m.files))fail('KABISEO_ASSEMBLY_FILE_MISMATCH');
 const parent=readFileSync(path.join(packageRoot,PARENT),'utf8');
 const template=applyKabiseoMetadataPatch(parent);
 if(sha(parent)!==m.originalRuntimeSha256||sha(template)!==m.templateSha256||
  inspectFile(path.join(packageRoot,POLICY)).sha256!==POLICY_SHA)fail('KABISEO_COMPONENT_IDENTITY_MISMATCH');
 const id=identity(parent,template,actual.filter(f=>f.path!==ENTRY));
 if(id!==m.assemblyId||readFileSync(path.join(packageRoot,ENTRY),'utf8')!==cameraBinding(template,id))fail('KABISEO_CAMERA_ASSEMBLY_BINDING_MISMATCH');
 return {entryFile:path.join(packageRoot,ENTRY),assemblyId:id,manifestSha256:expectedManifestSha256,
  files:actual.length,dependencyFiles:actual.filter(f=>f.path.includes('/node_modules/')).length,
  nodeVersion:process.version,baselineCommit:m.baselineCommit,productionStartupAuthorized:false};
}

export async function loadKabiseoReviewAssembly(options){
 reviewEnvironment();
 const checked=verifyKabiseoReviewAssembly(options);
 if(loaded.has(checked.entryFile))fail('KABISEO_ASSEMBLY_ALREADY_LOADED');
 loaded.add(checked.entryFile);
 const runtime=await import(pathToFileURL(checked.entryFile).href);
 if(runtime.httpServer?.listening!==false)fail('KABISEO_LISTENER_MUST_REMAIN_CLOSED');
 return runtime;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==5||process.argv[2]!=='--kabiseo-build-child')fail('KABISEO_BUILD_CHILD_ARGUMENTS_REQUIRED');
 globalThis.fetch=async()=>{throw Error('KABISEO_BUILD_EXTERNAL_FETCH_FORBIDDEN');};
 const built=await buildInFreshProcess({baselineRoot:process.argv[3],outputRoot:process.argv[4]});
 console.log(BUILD_REPORT+JSON.stringify(built));
}
