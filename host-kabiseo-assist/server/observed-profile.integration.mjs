/** Source/profile reconciliation, fresh original startup and no live operations.
 * Reuses the reviewed Node22 toolchain. Node26 runtime equivalence is NOT claimed.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {OBSERVED_PROFILE,prepareObservedProfileTools,compareObservedProfile} from './observed-profile-assembly.mjs';
import {validateOperatorStartEnvironment as oldValidate} from './operator-binding.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const observation=JSON.parse(readFileSync(path.join(here,'../docs/LIVE_PROFILE_OBSERVATION_V017.json')));
const checks=[];const pass=x=>{checks.push(x);console.log('OBSERVED PASS '+x);};
function startupEnv(digest){return {PATH:process.env.PATH||'',NODE_ENV:'production',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',
 JH_KABISEO_OPERATOR_START:'EXPLICIT_VERIFIED_CAMERA_METADATA_V1',JH_KABISEO_START_MANIFEST_SHA256:digest,
 JH_OPERATIONAL_ACCOUNT_DIGEST:'a'.repeat(64),JH_OPERATIONAL_START:'PREPARE_AND_SERVE_V1',JH_PC_OWNER_SETUP_ENABLED:'1',JH_PC_OWNER_SETUP_PLAN_FILE:'/var/data/jh-pc-bootstrap/plan.json',
 JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1',JH_DURABLE_RELEASE:'SERVE_READY_V1',...OBSERVED_PROFILE};}
async function run(baseline,evidence){
 assert.deepEqual(Object.keys(process.env),['PATH']);
 const temp=mkdtempSync(path.join(tmpdir(),'kabiseo-profile-'));let result;
 try{
  assert.throws(()=>oldValidate(startupEnv('a'.repeat(64))),/BUILD_PROFILE_MISMATCH/);
  pass('v0.16 rejection of positively observed enabled profile reproduced');
  const minimal={...OBSERVED_PROFILE};for(const k of Object.keys(minimal))if(k!=='JH_MOBILE_WEB_13_MODE')minimal[k]=null;
  const oldComparison=compareObservedProfile({buildProfile:minimal,nodeVersion:'v22.23.4'},observation);
  assert.equal(oldComparison.profileMismatches.length,5);assert.equal(oldComparison.runtimeVersionMatched,false);
  pass('five profile differences and independent Node version mismatch preserved');
  const unknown={...OBSERVED_PROFILE,JH_UNKNOWN_SWITCH:'yes'};
  assert.equal(compareObservedProfile({buildProfile:unknown,nodeVersion:observation.loggedNodeVersion},observation).status,'BLOCKED_FOR_RELEASE');
  const hypothetical=compareObservedProfile({buildProfile:OBSERVED_PROFILE,nodeVersion:observation.loggedNodeVersion},observation);
  assert.equal(hypothetical.releaseApproved,false);assert.equal(hypothetical.status,'PROFILE_MATCH_ONLY_NOT_RELEASE_APPROVED');
  pass('unknown flags blocked and even matching profile is not release approval');
  const tools=prepareObservedProfileTools(path.join(temp,'tools'));
  assert.equal(tools.changedFiles.length,3);pass('only three generator files adapted; complete reverse byte equality verified');
  const binding=await import(pathToFileURL(path.join(tools.directory,'operator-binding.mjs')).href);
  const valid=startupEnv('a'.repeat(64));assert.equal(binding.validateOperatorStartEnvironment(valid).metadataEnabled,false);
  let rejected=0;
  for(const key of Object.keys(OBSERVED_PROFILE)){
   const bad={...valid};delete bad[key];assert.throws(()=>binding.validateOperatorStartEnvironment(bad),/BUILD_PROFILE_MISMATCH/);rejected++;
   assert.throws(()=>binding.validateOperatorStartEnvironment({...valid,[key]:'unexpected'}),/BUILD_PROFILE_MISMATCH/);rejected++;
  }
  pass('all six observed flags required; missing or incorrect values fail closed');
  Object.assign(process.env,{CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',...OBSERVED_PROFILE});
  const builder=await import(pathToFileURL(path.join(tools.directory,'review-assembly.mjs')).href);
  const compose=await import(pathToFileURL(path.join(tools.directory,'operator-start-compose.mjs')).href);
  const reviewed=await builder.buildKabiseoReviewAssembly({baselineRoot:path.resolve(baseline),outputRoot:path.join(temp,'review')});
  const parent=JSON.parse(readFileSync(path.join(reviewed.outputRoot,'review-manifest.json')));
  assert.equal(parent.baselineCommit,observation.deployedCommit);
  assert.equal(parent.originalRuntimeSha256,observation.loggedOriginalRuntimeSha256,'must reproduce logged source before adding camera');
  pass('generated original runtime SHA256 exactly matches logged deployed runtime');
  const built=compose.composeOperatorStart({reviewRoot:reviewed.outputRoot,reviewManifestSha256:reviewed.expectedManifestSha256,outputRoot:path.join(temp,'operator')});
  const manifest=JSON.parse(readFileSync(path.join(built.outputRoot,'operator-start-manifest.json')));
  assert.deepEqual(manifest.buildProfile,OBSERVED_PROFILE);assert.equal(manifest.deploymentApproved,false);
  assert.equal(built.files,built.parentFiles+5);pass('whole camera candidate preserves observed profile and original parent files');
  for(const mode of ['entry','disabled','enabled']){
   const env=startupEnv(built.expectedManifestSha256);
   if(mode==='enabled')env.JH_KABISEO_METADATA_MODE='EXPLICIT_READ_ONLY_CAMERA_V1';
   const child=spawnSync(process.execPath,[path.join(here,'operator-start.integration.mjs'),'--child',mode,built.outputRoot],{env,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
   assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
   assert.ok(child.stdout.includes('KABISEO_START_CHILD_PASS='+mode));console.log(child.stdout);
   pass('observed-profile '+mode+' original startup boundary passed with no listener');
  }
  binding.verifyOperatorStartBundle({outputRoot:built.outputRoot,expectedManifestSha256:built.expectedManifestSha256});
  const finalComparison=compareObservedProfile({buildProfile:manifest.buildProfile,nodeVersion:process.version},observation);
  assert.deepEqual(finalComparison.profileMismatches,[]);
  assert.equal(finalComparison.releaseApproved,false);
  pass('runtime-version gap remains explicit; no implicit deployment or downgrade');
  result={schema:'KABISEO_OBSERVED_PROFILE_TEST_V017',status:'PASS',checks,checksCount:checks.length,rejectedProfileVariants:rejected,
   observationSource:'Authenticated Render startup log read, exact positive markers; not full env export',
   deployedCommit:observation.deployedCommit,loggedOriginalRuntimeSha256:observation.loggedOriginalRuntimeSha256,
   reproducedOriginalRuntimeSha256:parent.originalRuntimeSha256,priorComparison:oldComparison,finalComparison,
   changedGeneratorFiles:tools.changedFiles,originalGeneratorFilesPreserved:tools.originalFilesPreserved,
   candidateFiles:built.files,parentFiles:built.parentFiles,candidateManifestSha256:built.expectedManifestSha256,
   testNodeVersion:process.version,originalMainStoppedAtOriginalSecretGate:true,syntheticStartupContexts:true,
   fullSavedOwnerStartup:false,liveEnvExported:false,newExternalRuntimeDownloaded:false,
   liveConfigurationChanged:false,serverDeployed:false,phoneCommands:0,apkRebuilt:false,automaticZoomEnabled:false,restoreVerified:false};
  mkdirSync(evidence,{recursive:true});writeFileSync(path.join(evidence,'observed-profile-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log('KABISEO_OBSERVED_PROFILE_RESULT='+JSON.stringify(result));
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[2]==='--isolated')await run(process.argv[3],process.argv[4]);
else{
 const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--isolated',...process.argv.slice(2)],{env:{PATH:process.env.PATH||''},encoding:'utf8',timeout:240000,maxBuffer:4*1024*1024});
 if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,'observed-profile integration failed');
}
