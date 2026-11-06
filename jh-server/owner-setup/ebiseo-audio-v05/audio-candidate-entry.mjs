/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
/** Explicit alternative startup candidate. The published package/router remain
 * unchanged. Selecting this file is a separate operator release action. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOURCE_PINS} from './audio-compose-host.mjs';
import {buildCurrentAudioReleaseCandidate,verifyCurrentAudioSources} from './audio-compose-current-host.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function main(env=process.env) {
  if(path.basename(import.meta.dirname)!=='ebiseo-audio-v05')throw Error('AUDIO_CURRENT_INSTALL_DIRECTORY_REQUIRED');
  const root=path.resolve(import.meta.dirname,'..'),hostRoot=path.dirname(root);
  if(path.basename(root)!=='owner-setup')throw Error('AUDIO_INSTALLED_HOST_LAYOUT_REQUIRED');
  const routerFile=path.join(root,'deployment/published-host-router.mjs');
  if(hash(readFileSync(routerFile))!==SOURCE_PINS.publishedRouter)throw Error('AUDIO_PUBLISHED_ROUTER_CHANGED');
  verifyCurrentAudioSources(root);
  const router=await import(pathToFileURL(routerFile).href);
  // Preserve the actual published host, Node, durable mode and service identity gates.
  router.assertPublishedHost(hostRoot,root);router.requirePcNodeVersion(process.versions.node);
  // Require the existing latest operator selection. Do not fall back to the
  // historical durable-only entry, or enable any feature flag on its behalf.
  if(router.selectPendingApprovalStartup56(env)!=='pending-approval'||
    router.selectJH168FollowupOperator56(env)!=='followup')throw Error('AUDIO_EXISTING_STAGE71_OPERATOR_REQUIRED');
  const built=await buildCurrentAudioReleaseCandidate(root,env);
  const entry=await import(pathToFileURL(built.entryFile).href);
  return entry.main(env);
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e?.code||e?.message||'')?e.code||e.message:'AUDIO_CANDIDATE_START_FAILED');process.exitCode=1;});
}
