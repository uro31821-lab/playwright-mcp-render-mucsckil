import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {composeCameraRuntime} from './camera-compose-audio-host.mjs';
import {createCameraDurableClassifier} from './camera-durable-policy.mjs';
import {
  BASE_CATALOG_DIGEST,CAMERA_TOOL,BINDING_JOB,CONFIG_JOB,
  BINDING_OPERATION,CONFIG_OPERATION,EXPECTED_PACKAGE,CAMERA_EXTENSION
} from './camera-contract.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const root=path.resolve(import.meta.dirname,'..');
assert.equal(
  sha(readFileSync(path.join(root,'server-integration/server.mjs'))),
  'a329fc7e71fb518a711a28146d34c5093a3f31486dc7ea8a9bd547e52d5118c6'
);

const audioRuntime=[
  'import {createAudioHostIntegration} from "../ebiseo-audio-v05/audio-host-integration.mjs";',
  'const jhAudioHost56={}; // JH_EBISEO_AUDIO',
  'function cleanFrameWaiters56(){}',
  'function mk(type,p,targetDeviceId){',
  '  jhAudioHost56.beforeMk(type,p,targetDeviceId);',
  '}',
  'function dispatch(next,res){',
  '    const audioAdmission=jhAudioHost56.beforeDispatch(next);',
  '}',
  'function createMcp(){',
  '  jhAudioHost56.register({z,registerOAuthTool});',
  '}',
  'function hooks(options){',
  ' durableNativeHooks56=jhAudioHost56.wrapDurableHooks(createDurableNativeHooks({...options,mobile13ActionMode:"EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1",classifyExtension:jhAudioHost56.classify}));',
  '}'
].join('\n');
const composed=composeCameraRuntime(audioRuntime);
assert.ok(composed.runtime.includes('createCameraHostIntegration'));
assert.ok(composed.runtime.includes('jhCameraHost56.beforeMk(type,p,targetDeviceId);'));
assert.ok(composed.runtime.includes('jhCameraHost56.register({z,registerOAuthTool,textResult});'));
assert.ok(composed.runtime.includes('jhCameraHost56.classify(job,payload)??jhAudioHost56.classify(job,payload)'));
assert.ok(composed.runtime.includes('jhAudioHost56.beforeMk(type,p,targetDeviceId);'));

const classifier=createCameraDurableClassifier({getCatalogDigest:()=>BASE_CATALOG_DIGEST});
const common={
  taskId:'a'.repeat(64),effect:'READ_ONLY',action:'',index:0,viewportWidth:0,viewportHeight:0,
  scrollX:0,scrollY:0,waitMs:0,dataClass:'NONE',maxActionsInCall:20,
  mcpToolName:CAMERA_TOOL,taskDigest:'a'.repeat(64),targetDeviceDigest:'b'.repeat(64),
  secureInvocationExpiresAt:123456,containsCredential:false,commandId:'c'.repeat(32),
  packageName:EXPECTED_PACKAGE,cameraExtension:CAMERA_EXTENSION
};
const binding={...common,secureRequestedEffect:'READ_ONLY',operation:BINDING_OPERATION,
  allowedSideEffect:'READ_CURRENT_CAMERA_BINDING_ONLY'};
assert.equal(classifier({...binding,type:BINDING_JOB},binding).kind,'READ');

const config={...common,secureRequestedEffect:'WRITE_REVERSIBLE',operation:CONFIG_OPERATION,
  allowedSideEffect:'CURRENT_CAMERA_SETTINGS_ONLY',
  cameraTarget:{deviceId:'phone-1',taskId:'a'.repeat(64),commandId:'c'.repeat(32),sessionId:'activity:7',rightWindowId:77},
  cameraExpiresAtMs:123999,directRequest:'음식을 시원하고 고급스럽게 찍어줘'};
const journal=classifier({...config,type:CONFIG_JOB},config);
assert.equal(journal.kind,'JOURNAL');
assert.equal(journal.approvalGranted,false);
assert.equal(journal.screenConsentGranted,false);
assert.equal(Object.values(journal.identityPayload).includes(config.directRequest),false);
assert.equal(classifier({type:'other'},{}),null);
const bad={...config,cameraExtension:{...CAMERA_EXTENSION,digest:'0'.repeat(64)}};
assert.equal(classifier({...bad,type:CONFIG_JOB},bad).kind,'DENY');

console.log('KABISEO_AUDIO_OVERLAY_PASS=13');
