/** Runtime-only browser metadata recovery experiment.
 * Pinned to deployed 2026-10-09 browser session source; original files unchanged.
 * Never auto-replays tools/call, clicks, typing, or any browser action.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceFile=path.join(root,'owner-setup/browser-live/browser-session.mjs');
const expectedSha='f1e1e702fd5ac6f36bbc7bd98d318ca5cbc23c00c4fa3f0652dc704c34481fd5';
const before='const recover = attempt === 0 && sessionId !== null && expired(error);';
const after="const recover = attempt === 0 && sessionId !== null && (expired(error) || error?.message === 'browser_event_channel_closed');";
export function buildBrowserRecoveryCandidate(){
 const source=readFileSync(sourceFile,'utf8');
 if(sha(source)!==expectedSha)throw Error('BROWSER_RECOVERY_SOURCE_NOT_PINNED');
 if(source.split(before).length!==2||source.includes(after))throw Error('BROWSER_RECOVERY_ANCHOR_MISMATCH');
 const candidate=source.replace(before,after);
 if(candidate.replace(after,before)!==source)throw Error('BROWSER_RECOVERY_SCOPE_MISMATCH');
 const dir=path.join(root,'verification-output/candidate');
 mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'browser-session-recovery-candidate.mjs');
 writeFileSync(file,candidate,{mode:0o600});
 if(readFileSync(file,'utf8')!==candidate)throw Error('BROWSER_RECOVERY_READBACK_MISMATCH');
 const identity={sourceSha256:expectedSha,candidateSha256:sha(candidate),exactExpressionEdits:1,unchangedOutsidePatch:true,
  metadataRetryOnly:true,toolActionAutoReplay:false,phoneConnectionChanged:false,memoriaChanged:false,productionDeployed:false};
 return {original:pathToFileURL(sourceFile).href,candidate:pathToFileURL(file).href,identity};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log('JH_BROWSER_RECOVERY_CANDIDATE '+JSON.stringify(buildBrowserRecoveryCandidate().identity));
