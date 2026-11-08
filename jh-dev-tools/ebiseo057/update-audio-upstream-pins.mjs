import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ROOT=path.resolve(import.meta.dirname,'../..');
const SERVER=path.join(ROOT,'jh-server');
const AUDIO=path.join(SERVER,'owner-setup/ebiseo-audio-v05');
const manifestFile=path.join(AUDIO,'audio-upstream-sources.json');
const composeFile=path.join(AUDIO,'audio-compose-current-host.mjs');
const testFile=path.join(AUDIO,'audio-current-host.test.mjs');
const SOURCE_COMMIT='907ac5a0a9255c7b16cb5132921695db3019cb03';
const OLD_SOURCE_COMMIT='fc70914d745dfbc7d34494c771af4f982c9511aa';
const changedExisting=new Set([
  'owner-setup/owner-enrollment/owner-enrollment.mjs',
  'owner-setup/owner-enrollment/owner-registry-service.mjs',
  'owner-setup/trusted-server/trusted-device-registry.mjs',
  'owner-setup/trusted-server/trusted-settings-service.mjs'
]);
const added=[
  'owner-setup/owner-enrollment/owner-enrollment-base.mjs',
  'owner-setup/trusted-server/trusted-device-registry-base.mjs'
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const text=file=>readFileSync(file,'utf8');
const digest=relative=>sha(readFileSync(path.join(SERVER,relative)));
const fail=code=>{throw Error(code);};
const replaceExactly=(source,pattern,replacement,code)=>{
  const found=source.match(pattern);
  if(!found||found.length!==1)fail(code);
  return source.replace(pattern,replacement);
};

function sortedFiles(files){return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));}
function load(){return JSON.parse(text(manifestFile));}
function actualMismatches(manifest){
  const mismatches=[];
  for(const [relative,expected] of Object.entries(manifest.files)){
    const file=path.join(SERVER,relative);
    if(!existsSync(file))fail('PINNED_SOURCE_MISSING:'+relative);
    const actual=digest(relative);
    if(actual!==expected)mismatches.push(relative);
  }
  return mismatches.sort();
}
function assertExactSet(actual,expected,code){
  const a=[...actual].sort(),b=[...expected].sort();
  if(JSON.stringify(a)!==JSON.stringify(b))fail(code+':'+JSON.stringify({actual:a,expected:b}));
}
function verifyFinal(){
  const manifest=load();
  if(manifest.sourceCommit!==SOURCE_COMMIT)fail('SOURCE_COMMIT_NOT_UPDATED');
  if(Object.keys(manifest.files).length!==322)fail('SOURCE_FILE_COUNT_NOT_322');
  for(const relative of added)if(manifest.files[relative]!==digest(relative))fail('NEW_SOURCE_PIN_MISSING:'+relative);
  assertExactSet(actualMismatches(manifest),[], 'FINAL_SOURCE_DRIFT');
  const manifestHash=sha(text(manifestFile));
  const compose=text(composeFile);
  if(!compose.includes(`export const AUDIO_SOURCE_COMMIT='${SOURCE_COMMIT}';`))fail('COMPOSE_SOURCE_COMMIT_MISMATCH');
  if(!compose.includes(`const MANIFEST_SHA256='${manifestHash}';`))fail('COMPOSE_MANIFEST_HASH_MISMATCH');
  if(!text(testFile).includes("assert.equal(verifyCurrentAudioSources(root).files,322);"))fail('TEST_COUNT_NOT_UPDATED');
  return {sourceCommit:SOURCE_COMMIT,manifestSha256:manifestHash,files:322};
}
function write(){
  const manifest=load();
  if(![OLD_SOURCE_COMMIT,SOURCE_COMMIT].includes(manifest.sourceCommit))fail('UNEXPECTED_OLD_SOURCE_COMMIT');
  const mismatches=actualMismatches(manifest);
  if(manifest.sourceCommit===OLD_SOURCE_COMMIT)assertExactSet(mismatches,changedExisting,'UNEXPECTED_UPSTREAM_DRIFT');
  else assertExactSet(mismatches,[],'ALREADY_UPDATED_SOURCE_DRIFT');
  for(const relative of changedExisting)manifest.files[relative]=digest(relative);
  for(const relative of added){
    if(!existsSync(path.join(SERVER,relative)))fail('NEW_SOURCE_MISSING:'+relative);
    manifest.files[relative]=digest(relative);
  }
  manifest.sourceCommit=SOURCE_COMMIT;
  manifest.files=sortedFiles(manifest.files);
  writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  const manifestHash=sha(text(manifestFile));
  let compose=text(composeFile);
  compose=replaceExactly(compose,/export const AUDIO_SOURCE_COMMIT='[a-f0-9]{40}';/,
    `export const AUDIO_SOURCE_COMMIT='${SOURCE_COMMIT}';`,'SOURCE_COMMIT_ANCHOR_CHANGED');
  compose=replaceExactly(compose,/const MANIFEST_SHA256='[a-f0-9]{64}';/,
    `const MANIFEST_SHA256='${manifestHash}';`,'MANIFEST_HASH_ANCHOR_CHANGED');
  writeFileSync(composeFile,compose);
  let tests=text(testFile);
  tests=replaceExactly(tests,/assert\.equal\(verifyCurrentAudioSources\(root\)\.files,320\);/,
    'assert.equal(verifyCurrentAudioSources(root).files,322);','SOURCE_COUNT_TEST_ANCHOR_CHANGED');
  writeFileSync(testFile,tests);
  return verifyFinal();
}

const mode=process.argv[2];
if(mode==='--write')console.log('JH_EBISEO057_AUDIO_PINS_WRITTEN '+JSON.stringify(write()));
else if(mode==='--check')console.log('JH_EBISEO057_AUDIO_PINS_PASS '+JSON.stringify(verifyFinal()));
else fail('USAGE: --write | --check');
