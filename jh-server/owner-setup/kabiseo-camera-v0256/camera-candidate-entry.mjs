import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOURCE_PINS} from '../ebiseo-audio-v05/audio-compose-host.mjs';
import {verifyCurrentAudioSources} from '../ebiseo-audio-v05/audio-compose-current-host.mjs';
import {buildCameraReleaseCandidate} from './camera-compose-audio-host.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
export async function main(env=process.env){
  if(path.basename(import.meta.dirname)!=='kabiseo-camera-v0256')throw Error('CAMERA_INSTALL_DIRECTORY_REQUIRED');
  const root=path.resolve(import.meta.dirname,'..'),hostRoot=path.dirname(root);
  if(path.basename(root)!=='owner-setup')throw Error('CAMERA_HOST_LAYOUT_REQUIRED');
  const routerFile=path.join(root,'deployment/published-host-router.mjs');
  if(hash(readFileSync(routerFile))!==SOURCE_PINS.publishedRouter)throw Error('CAMERA_PUBLISHED_ROUTER_CHANGED');
  verifyCurrentAudioSources(root);
  const router=await import(pathToFileURL(routerFile).href);
  router.assertPublishedHost(hostRoot,root);
  router.requirePcNodeVersion(process.versions.node);
  if(router.selectPendingApprovalStartup56(env)!=='pending-approval'||
     router.selectJH168FollowupOperator56(env)!=='followup')
    throw Error('CAMERA_EXISTING_STAGE25_OPERATOR_REQUIRED');

  const built=await buildCameraReleaseCandidate(root,env);
  const mod=await import(pathToFileURL(built.entryFile).href+'?sha='+built.candidateSha256);
  if(typeof mod.main!=='function')throw Error('CAMERA_MAIN_MISSING');
  const running=await mod.main(env);
  console.log('JH_KABISEO_CAMERA_V0256_ACTIVE '+JSON.stringify({
    schema:'KABISEO_CAMERA_V0256_OVER_AUDIO_V1',
    candidateSha256:built.candidateSha256,
    parentAudioSha256:built.parentAudioSha256,
    baseCatalogChanged:false,automaticReplayAllowed:false,apkChanged:false
  }));
  return running;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e?.code||e?.message||'')?e.code||e.message:'CAMERA_CANDIDATE_START_FAILED');process.exitCode=1;});
}
