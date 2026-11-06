/** Actual generated operational entry, but no live keys, storage or phone.
 * Success here is NOT success starting the owner's production service. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildKabiseoReviewAssembly} from './review-assembly.mjs';
import {composeOperatorStart} from './operator-start-compose.mjs';
import {validateOperatorStartEnvironment,verifyOperatorStartBundle} from './operator-binding.mjs';
const checks=[];const pass=name=>{checks.push(name);console.log('START PASS '+name);};
function fixtureEnv(digest){return {PATH:process.env.PATH||'',NODE_ENV:'production',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',
 JH_KABISEO_OPERATOR_START:'EXPLICIT_VERIFIED_CAMERA_METADATA_V1',JH_KABISEO_START_MANIFEST_SHA256:digest,
 JH_OPERATIONAL_ACCOUNT_DIGEST:'a'.repeat(64),JH_OPERATIONAL_START:'PREPARE_AND_SERVE_V1',JH_PC_OWNER_SETUP_ENABLED:'1',JH_PC_OWNER_SETUP_PLAN_FILE:'/var/data/jh-pc-bootstrap/plan.json',
 JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1',JH_DURABLE_RELEASE:'SERVE_READY_V1',JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'};}
async function child(mode,output){
 const owner=path.join(output,'package/jh-server/owner-setup');
 let listeners=0,fetches=0;
 const net=await import('node:net');const oldListen=net.Server.prototype.listen;
 net.Server.prototype.listen=function(){listeners++;throw Error('TEST_LISTENER_FORBIDDEN');};
 globalThis.fetch=async()=>{fetches++;throw Error('TEST_EXTERNAL_FETCH_FORBIDDEN');};
 try{
  const b=await import(pathToFileURL(path.join(owner,'deployment/kabiseo-operator-binding.mjs')).href);
  if(mode==='entry'){
   const op=await import(pathToFileURL(path.join(owner,'deployment/operational-service-kabiseo-operator.mjs')).href);
   let error;try{await op.main(process.env);}catch(e){error=e;}
   assert.ok(error,'original gate must stop missing secrets');
   assert.match(error.code||error.message,/SECRET|KEY/,'expected original storage secret error, not routing failure');
   assert.equal(b.kabiseoOperatorMetadataEnabled56(),false);
   console.log('ORIGINAL_ENTRY_SECRET_GATE='+String(error.code||error.message));
  }else{
   assert.equal(b.kabiseoOperatorMetadataEnabled56(),false);
   assert.throws(()=>b.selectKabiseoOperatorRuntime56(owner),/SELECTION_UNBOUND/);
   b.assertKabiseoOperatorStart56(process.env);
   assert.equal(b.kabiseoOperatorRuntimeIdentity56(),null);
   const first=b.selectKabiseoOperatorRuntime56(owner),second=b.selectKabiseoOperatorRuntime56(owner);
   assert.equal(first.file,second.file);assert.equal(first.runtimeDigest,process.env.JH_KABISEO_START_MANIFEST_SHA256);
   assert.throws(()=>b.selectKabiseoOperatorRuntime56(owner),/SELECTION_UNBOUND/);
   assert.throws(()=>b.assertKabiseoOperatorStart56(process.env),/ALREADY_ATTEMPTED/);
   assert.equal(b.kabiseoOperatorMetadataEnabled56(),false);
   process.env.JH_OWNER_DEFER_LISTEN='1'; // synthetic imitation of original owner pre-listen transition
   assert.equal(b.kabiseoOperatorMetadataEnabled56(),mode==='enabled');
   assert.equal(b.kabiseoOperatorRuntimeIdentity56(),first.runtimeDigest);
   const runtime=await import(pathToFileURL(first.file).href);
   assert.equal(runtime.httpServer.listening,false);
   delete process.env.JH_KABISEO_METADATA_MODE;assert.equal(b.kabiseoOperatorMetadataEnabled56(),false);
   process.env.JH_KABISEO_METADATA_REVIEW='EXPLICIT_READ_ONLY_CAMERA_V1';assert.equal(b.kabiseoOperatorMetadataEnabled56(),false);
   assert.equal(b.kabiseoOperatorRuntimeIdentity56(),null);
   runtime.httpServer.closeAllConnections();
  }
  assert.equal(listeners,0);assert.equal(fetches,0);console.log('KABISEO_START_CHILD_PASS='+mode);
 }finally{net.Server.prototype.listen=oldListen;}
}
async function parent(baseline,out){
 assert.deepEqual(Object.keys(process.env),['PATH']);
 const dir=mkdtempSync(path.join(tmpdir(),'kabiseo-start-'));
 try{
  Object.assign(process.env,{CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'});
  const reviewed=await buildKabiseoReviewAssembly({baselineRoot:path.resolve(baseline),outputRoot:path.join(dir,'review')});
  const built=composeOperatorStart({reviewRoot:reviewed.outputRoot,reviewManifestSha256:reviewed.expectedManifestSha256,outputRoot:path.join(dir,'operator')});
  assert.equal(built.addedFiles.length,5);assert.equal(built.files,built.parentFiles+5);pass('five additive startup files; every parent file preserved');
  const verify=()=>verifyOperatorStartBundle({outputRoot:built.outputRoot,expectedManifestSha256:built.expectedManifestSha256});
  assert.equal(verify().runtimeDigest,built.expectedManifestSha256);pass('externally pinned full startup manifest verified');
  assert.throws(()=>verifyOperatorStartBundle({outputRoot:built.outputRoot,expectedManifestSha256:'0'.repeat(64)}),/DIGEST_MISMATCH/);pass('wrong external manifest digest rejected');
  const file=path.join(built.ownerRoot,'deployment/owner-service-kabiseo-operator.mjs'),original=readFileSync(file);
  writeFileSync(file,Buffer.concat([original,Buffer.from('\n// changed')]));assert.throws(verify,/FILES_CHANGED/);writeFileSync(file,original);pass('changed owner startup rejected');
  const added=path.join(built.packageRoot,'extra.mjs');writeFileSync(added,'');assert.throws(verify,/FILES_CHANGED/);unlinkSync(added);pass('unexpected extra source rejected');
  symlinkSync(file,added);assert.throws(verify,/SYMLINK/);unlinkSync(added);pass('symlink addition rejected');
  const base=fixtureEnv(built.expectedManifestSha256);assert.equal(validateOperatorStartEnvironment(base).metadataEnabled,false);pass('valid candidate defaults to metadata OFF');
  let rejected=0;
  const bad=[['CI','true'],['CI','false'],['NODE_ENV','test'],['RENDER_SERVICE_ID','another-service'],['JH_OWNER_DEFER_LISTEN','1'],['NODE_OPTIONS','--import=evil.mjs'],['NODE_PATH','/tmp'],['LD_PRELOAD','/tmp/x'],['JH_KABISEO_METADATA_REVIEW','EXPLICIT_READ_ONLY_CAMERA_V1'],['JH_KABISEO_OPERATOR_START','yes'],['JH_KABISEO_START_MANIFEST_SHA256','bad'],['JH_OPERATIONAL_ACCOUNT_DIGEST','bad'],['JH_PENDING_APPROVAL_OPERATOR_ENABLE','yes'],['JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE','yes'],['JH_DURABLE_RELEASE','EXPLICIT_INITIALIZE_AND_SERVE_V1'],['JH_MOBILE_WEB_13_MODE','other'],['JH_STAGE26_SIGNED_COMPLETION_ACK','EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'],['JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS','on'],['JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS','on'],['JH_STAGE44_DEVICE_FOCUS','on'],['JH_MOBILE13_COMMAND_DIAGNOSTICS','on'],['JH_KABISEO_METADATA_MODE','yes']];
  for(const [key,value] of bad){assert.throws(()=>validateOperatorStartEnvironment({...base,[key]:value}));rejected++;}
  assert.throws(()=>validateOperatorStartEnvironment(base,['--import=other.mjs']));rejected++;pass('23 invalid environments and execution flags rejected');
  for(const mode of ['entry','disabled','enabled']){
   const env={...base,...(mode==='enabled'?{JH_KABISEO_METADATA_MODE:'EXPLICIT_READ_ONLY_CAMERA_V1'}:{})};
   const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',mode,built.outputRoot],{env,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
   assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
   assert.ok(r.stdout.includes('KABISEO_START_CHILD_PASS='+mode));console.log(r.stdout);
   pass(mode==='entry'?'actual original main stops at original secret gate; no listener':'fresh '+mode+' binding and generated runtime import; no listener');
  }
  verify();pass('startup snapshot unchanged after execution');
  const result={schema:'KABISEO_OPERATOR_START_TEST_V016',status:'PASS',checks,count:checks.length,rejectedEnvironments:rejected,files:built.files,parentFiles:built.parentFiles,addedFiles:built.addedFiles,manifestSha256:built.expectedManifestSha256,parentManifestSha256:reviewed.expectedManifestSha256,nodeVersion:process.version,
   actualOriginalOperationalMainInvoked:true,operationalMainStoppedAtOriginalSecretGate:true,syntheticStartupContext:true,fullOwnerStartupSuccess:false,actualSavedOwnerStorageUsed:false,listenerStarts:0,physicalPhoneCommands:0,newDependencies:0,productionDeployed:false,androidRebuilt:false,automaticZoomEnabled:false,restoreVerified:false};
  mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'operator-start-result.json'),JSON.stringify(result,null,2)+'\n');console.log('KABISEO_OPERATOR_START_RESULT='+JSON.stringify(result));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[2]==='--child')await child(process.argv[3],process.argv[4]);
else if(process.argv[2]==='--parent')await parent(process.argv[3],process.argv[4]);
else {
 const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--parent',...process.argv.slice(2)],{env:{PATH:process.env.PATH||''},encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert.equal(r.status,0,'operator-start integration failed');
}
