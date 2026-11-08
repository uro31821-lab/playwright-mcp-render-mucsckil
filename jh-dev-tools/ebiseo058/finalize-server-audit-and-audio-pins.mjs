import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../..');
const SERVER=path.join(ROOT,'jh-server');
const AUDIT=path.join(SERVER,'owner-setup/jh168-mobile-unification/reviewed-source-audit.mjs');
const AUDIO=path.join(SERVER,'owner-setup/ebiseo-audio-v05');
const MANIFEST=path.join(AUDIO,'audio-upstream-sources.json');
const COMPOSE=path.join(AUDIO,'audio-compose-current-host.mjs');
const REVIEWED_HEAD='8c9370f873d4312543310cb8aa1da2ed2b06b2c5';
const PRIOR_AUDIO_HEAD='907ac5a0a9255c7b16cb5132921695db3019cb03';
const SERVICE='owner-setup/owner-enrollment/owner-registry-service.mjs';
const SERVICE_SHA='171439eaa28b5a503031f0e863efe0123916d46c';
const TEST_SHA='2d26a53e9cccd68a2ca0427da0dd7a899f8bb149';
const AUDIT_SHA='cc8c7eaebe4cf5c374386eb37ec0b6dac90d6b62';
const sha=x=>createHash('sha256').update(x).digest('hex');
const text=f=>readFileSync(f,'utf8');
const fail=code=>{throw Error(code);};
const replaceOne=(source,before,after,code)=>{
 if(source.split(before).length!==2||source.includes(after))fail(code);
 return source.replace(before,after);
};
const STEP=`   }),\n   Object.freeze({\n    reviewedHead:'${REVIEWED_HEAD}',\n    protectedObjects:Object.freeze({\n     'jh-server/owner-setup/jh168-mobile-unification/ebiseo057-source-audit.mjs':\n      '${AUDIT_SHA}',\n     'jh-server/owner-setup/owner-enrollment/owner-registry-service.mjs':\n      '${SERVICE_SHA}',\n     'jh-server/owner-setup/owner-enrollment/permanent-trust-revocation.test.mjs':\n      '${TEST_SHA}'\n    })\n   })`;
const ANCHOR=`   }),\n   Object.freeze({\n    reviewedHead:'9bced0692d81a9751a3c24ad76ecea38995ae0f9',\n    protectedObjects:Object.freeze({\n     'jh-server/owner-setup/jh168-mobile-unification/ebiseo057-source-audit.mjs':\n      'a257b8696ac3173502f0030a2cb6361530a32e9b',\n     'jh-server/owner-setup/owner-enrollment/owner-enrollment-base.mjs':\n      'd4e7abe44109966994da3d0749b8b5dffc357fcd',\n     'jh-server/owner-setup/owner-enrollment/owner-enrollment.mjs':\n      '51beb4d40b2cd7542b50a47178b56541b762b12d',\n     'jh-server/owner-setup/owner-enrollment/owner-registry-service.mjs':\n      '83cb17d78ed9a668ce0b7f2df6c4a9a243d7153c',\n     'jh-server/owner-setup/owner-enrollment/permanent-trust-revocation.test.mjs':\n      '468320bc9a02b97da4169717249afcad257aa6cc',\n     'jh-server/owner-setup/trusted-server/trusted-device-registry-base.mjs':\n      '859baf0e806f7228ee4efe9b13913d0796fd77f9',\n     'jh-server/owner-setup/trusted-server/trusted-device-registry.mjs':\n      '82b8b1d1ed695394e729c0a98d806df457411d26',\n     'jh-server/owner-setup/trusted-server/trusted-settings-service.mjs':\n      '4838109a0fa085a326ed099dc7cf34e2ffe6007c'\n    })\n   })`;
function verify(){
 const audit=text(AUDIT);if(!audit.includes(STEP))fail('CENTRAL_AUDIT_STEP_MISSING');
 const manifest=JSON.parse(text(MANIFEST));
 if(manifest.sourceCommit!==REVIEWED_HEAD)fail('AUDIO_SOURCE_COMMIT_MISMATCH');
 if(Object.keys(manifest.files).length!==322)fail('AUDIO_SOURCE_COUNT_CHANGED');
 if(manifest.files[SERVICE]!==sha(readFileSync(path.join(SERVER,SERVICE))))fail('AUDIO_SERVICE_PIN_MISMATCH');
 for(const [relative,expected] of Object.entries(manifest.files)){
  const file=path.join(SERVER,relative);if(!existsSync(file)||sha(readFileSync(file))!==expected)fail('AUDIO_UPSTREAM_DRIFT:'+relative);
 }
 const manifestSha=sha(text(MANIFEST)),compose=text(COMPOSE);
 if(!compose.includes(`export const AUDIO_SOURCE_COMMIT='${REVIEWED_HEAD}';`))fail('COMPOSE_SOURCE_COMMIT_MISMATCH');
 if(!compose.includes(`const MANIFEST_SHA256='${manifestSha}';`))fail('COMPOSE_MANIFEST_SHA_MISMATCH');
 const testOut=execFileSync(process.execPath,['--test','--test-reporter=spec',path.join(SERVER,'owner-setup/owner-enrollment/permanent-trust-revocation.test.mjs')],{cwd:ROOT,encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024});
 if(!/fail 0/.test(testOut))fail('EXPIRED_TRUST_REGRESSION_FAILED');
 execFileSync(process.execPath,[path.join(SERVER,'owner-setup/jh168-mobile-unification/ebiseo057-source-audit.mjs')],{cwd:ROOT,encoding:'utf8',timeout:30000});
 execFileSync(process.execPath,[AUDIT],{cwd:ROOT,encoding:'utf8',timeout:30000});
 return {reviewedHead:REVIEWED_HEAD,audioPinnedFiles:322,serverTests:'PASS',automaticReplayAllowed:false};
}
function write(){
 let audit=text(AUDIT);audit=replaceOne(audit,ANCHOR,ANCHOR.replace(/\n   \}\)$/, '')+STEP,'CENTRAL_AUDIT_ANCHOR_CHANGED');writeFileSync(AUDIT,audit);
 const manifest=JSON.parse(text(MANIFEST));
 if(manifest.sourceCommit!==PRIOR_AUDIO_HEAD)fail('UNEXPECTED_AUDIO_SOURCE_COMMIT');
 const mismatches=[];
 for(const [relative,expected] of Object.entries(manifest.files)){
  const actual=sha(readFileSync(path.join(SERVER,relative)));if(actual!==expected)mismatches.push(relative);
 }
 if(JSON.stringify(mismatches.sort())!==JSON.stringify([SERVICE]))fail('UNEXPECTED_AUDIO_UPSTREAM_DRIFT:'+JSON.stringify(mismatches));
 manifest.sourceCommit=REVIEWED_HEAD;manifest.files[SERVICE]=sha(readFileSync(path.join(SERVER,SERVICE)));
 writeFileSync(MANIFEST,JSON.stringify(manifest,null,2)+'\n');
 const manifestSha=sha(text(MANIFEST));
 let compose=text(COMPOSE);
 compose=replaceOne(compose,`export const AUDIO_SOURCE_COMMIT='${PRIOR_AUDIO_HEAD}';`,`export const AUDIO_SOURCE_COMMIT='${REVIEWED_HEAD}';`,'COMPOSE_SOURCE_ANCHOR_CHANGED');
 compose=compose.replace(/const MANIFEST_SHA256='[a-f0-9]{64}';/,`const MANIFEST_SHA256='${manifestSha}';`);
 writeFileSync(COMPOSE,compose);
 return verify();
}
const mode=process.argv[2];
if(mode==='--write')console.log('JH_EBISEO058_FINALIZE_WRITTEN '+JSON.stringify(write()));
else if(mode==='--check')console.log('JH_EBISEO058_FINALIZE_PASS '+JSON.stringify(verify()));
else fail('USAGE: --write | --check');
