import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=p=>readFileSync(path.join(here,p),'utf8');
const paid=['camera-v2-opt-in-gpt-image-port.mjs','camera-v2-opt-in-gpt-image-port.test.mjs'];

test('default camera V2 candidate contains no separate paid image REST adapter',()=>{
 for(const name of paid)assert.equal(existsSync(path.join(here,name)),false,name);
 for(const name of [
  'camera-v2-chatgpt-native-image-ports.mjs',
  'camera-v2-chatgpt-native-capture-flow.mjs',
  'camera-v2-current-turn-pipeline.mjs'
 ]){
  const s=source(name);
  assert.doesNotMatch(s,/https:\/\/api\.openai\.com\/v1\/images\//);
  assert.doesNotMatch(s,/createJH228OptInGPTImagePort/);
  assert.doesNotMatch(s,/OPENAI_API_KEY/);
  assert.doesNotMatch(s,/fetch\s*\(\s*['"]https?:\/\//);
 }
});

test('native producer remains mandatory with no silent alternative',()=>{
 const flow=source('camera-v2-chatgpt-native-capture-flow.mjs');
 const pipeline=source('camera-v2-current-turn-pipeline.mjs');
 const native=source('camera-v2-chatgpt-native-image-ports.mjs');
 assert.match(flow,/mode:'CHATGPT_NATIVE_IMAGEGEN_ONLY'/);
 assert.match(flow,/createSingleExample:native\.createSingleExample/);
 assert.match(flow,/confirmImageGenerationReady:native\.confirmImageGenerationReady/);
 assert.match(pipeline,/readiness\.provider!==NATIVE_PROVIDER/);
 assert.match(pipeline,/readiness\.externalApiRequired!==false/);
 assert.match(pipeline,/readiness\.paidApiBillingAuthorized!==false/);
 assert.match(native,/capability\.externalApiRequired!==false/);
 assert.match(native,/capability\.paidApiBillingAuthorized!==false/);
 assert.match(native,/verifyNativeGenerationReceipt/);
 assert.match(native,/readVerifiedNativeJpeg/);
});
