/** Read-only byte identity boundary between the published entry and 842 source.
 * The pins are build inputs, never caller-supplied assertions or remote auth. */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {assertPcOwnerRuntime} from './pc-owner-runtime-build.mjs';
export const PUBLISHED_COMMIT='9ddc89bba3096abbc6a730b27c0baec59632ba3d';
export const AUTH_BASE_SHA='952390b3d78547cc694566745f4aa4d5e4ad90d6c1fa35a156037cb50ce9f435';
export const PUBLISHED_FILES=Object.freeze({
  "auth-diagnostics-entry.mjs": "f4f3dfa0d474501d21c5f067831cf5e48e652085026485fd2a21ab5b6f73d2b3",
  "browser-events.mjs": "716ddf301e448510224f814c3eef83aed0885fa87490520ad39314eba40caa50",
  "browser-persistence-runtime.mjs": "dd247ef26f6c162bb9ce7ccf6413bea083d4c4d09942a7205f140713c0364011",
  "browser-runtime.mjs": "babaf654064322d3c943aab66b10fa59c4d18729ce1d23c7bef461cf680685d5",
  "browser-session-runtime.mjs": "73af2cc82c8d6b1b96863a991e2d1080f032a099170d296d532bda608b1adc1a",
  "browser-session.mjs": "f1e1e702fd5ac6f36bbc7bd98d318ca5cbc23c00c4fa3f0652dc704c34481fd5",
  "browser-transport.mjs": "2289e56329e76ae86b6f14519958d45c8a31a0d53b134cee3a83fc9220ad008e",
  "connection-diagnostics.mjs": "1d34295258270c029963c2856504819dd28e22c510edf489cfaad851cc2dafcf",
  "package.json": "10f6256b70a1a20f5cedbd41d04ac4a748edd8561f3421ae14af783c2c417c2a",
  "runtime-metadata.mjs": "7fc079dddc4d23243870e24c7d186e64017fa5481a6e86acad0724468167a77c",
  "server.mjs": "2a66e53bde1618be6180cef1fac3172426674f6634efcc4045a07c85c25d8f6e",
  "verification/auth-rejection-probe.mjs": "136d578a0e0b6b70a5e52b6fb09dd03026bc9f2a19958c884641ca22ef845479",
  "verification/build-auth-candidate.mjs": "383206a038d9d678663cdf3a96bed8a17b30703d4601052f303f7f28eaf030e7"
});
const digest=b=>createHash('sha256').update(b).digest('hex');
export function assertPublishedLineage(root){
 const pub=path.join(root,'published-baseline');
 for(const [name,expected] of Object.entries(PUBLISHED_FILES)){
  const file=path.join(pub,name),s=lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||realpathSync(file)!==file||digest(readFileSync(file))!==expected)
   throw Error('PUBLISHED_SOURCE_IDENTITY_MISMATCH');
 }
 if(digest(readFileSync(path.join(root,'server-base/server.after.mjs')))!==AUTH_BASE_SHA)
  throw Error('PUBLISHED_AUTH_LINEAGE_MISMATCH');
 for(const file of ['browser-transport.mjs','browser-session.mjs','browser-events.mjs'])
  if(!readFileSync(path.join(pub,file)).equals(readFileSync(path.join(root,'browser-live',file))))
   throw Error('PUBLISHED_BROWSER_LINEAGE_MISMATCH');
 if(!readFileSync(path.join(pub,'verification/auth-rejection-probe.mjs')).equals(readFileSync(path.join(root,'server-integration/auth-rejection-probe.mjs'))))
  throw Error('PUBLISHED_REJECTION_LINEAGE_MISMATCH');
 const runtime=assertPcOwnerRuntime(root);
 return Object.freeze({publishedCommit:PUBLISHED_COMMIT,authBaseSha256:AUTH_BASE_SHA,
  selectedRuntimeSha256:digest(readFileSync(runtime)),sourceFilesChecked:Object.keys(PUBLISHED_FILES).length,
  browserModulesIdentical:true,listenerOpened:false});
}
