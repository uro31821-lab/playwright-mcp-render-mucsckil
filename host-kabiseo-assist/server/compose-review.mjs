import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {applyKabiseoMetadataPatch,reverseKabiseoMetadataPatch} from './source-patch.mjs';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const owner=path.join(root,'jh-server/owner-setup');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'};
Object.assign(process.env,env);
const {buildStage25PendingOperatorEntrypoint56,selectStage25PendingOperatorRuntime56}=await import(pathToFileURL(path.join(owner,'jh168-mobile-unification/stage25-live-operator-followup-entry.mjs')));
const original=await buildStage25PendingOperatorEntrypoint56(owner,env);
assert.equal(original.listenerStarted,false);
assert.equal(original.productionEnabled,false);
const before=readFileSync(original.runtimeFile,'utf8'),candidate=applyKabiseoMetadataPatch(before);
assert.equal(reverseKabiseoMetadataPatch(candidate),before);
assert.throws(()=>applyKabiseoMetadataPatch(candidate));
assert.throws(()=>applyKabiseoMetadataPatch(readFileSync(path.join(root,'jh-server/server.mjs'),'utf8')));
assert.equal(selectStage25PendingOperatorRuntime56(owner,env).sha256,original.stamp.runtimeSha256);
assert.equal(readFileSync(original.runtimeFile,'utf8'),before);
mkdirSync(out,{recursive:true});
const file=path.join(out,'server-kabiseo-metadata-review.mjs');writeFileSync(file,candidate);
execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
const result={schema:'KABISEO_SERVER_COMPOSITION_V010',baselineCommit:process.env.KABISEO_BASELINE_COMMIT,
  sourceSha256:createHash('sha256').update(before).digest('hex'),candidateSha256:createHash('sha256').update(candidate).digest('hex'),
  sourceReversible:true,originalAttestationStillValid:true,syntaxCheck:'PASS',listenerStarted:false,
  phoneCommandsSent:0,productionStartupChanged:false,fullApkBuild:'NOT_RUN',deviceE2E:'NOT_RUN'};
writeFileSync(path.join(out,'server-composition-result.json'),JSON.stringify(result,null,2)+'\n');
console.log('KABISEO_COMPOSITION_RESULT='+JSON.stringify(result));
