/** Verified functional update over the EXACT deployed unified JH runtime.
 * No edits to preserved owner baseline, Android, session enrollment, or Life/Memoria.
 * No implicit action replay. Operator controls deployment separately.
 */
import path from 'node:path';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertUnifiedRuntime} from './unified-runtime-build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const LIVE='108ad68ef5c87db4c311e3569a0d2a06b09726a2a638ac4f7ee1319d169fd14b';
const BROWSER='f1e1e702fd5ac6f36bbc7bd98d318ca5cbc23c00c4fa3f0652dc704c34481fd5';
const ROUTE_OLD='const nativeHints=["카카오톡","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
const ROUTE_NEW='const nativeHints=["카카오톡","카카오t","카카오티","kakao t","카카오 택시","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
const STATUS_OLD='registerOAuthTool("life_job_status",{\n    title:"Android job status",\n    description:"Read a queued Android job result.",\n    inputSchema:{job_id:z.string()}\n  },async({job_id})=>jobResult(jobs.get(job_id)));';
const STATUS_NEW=STATUS_OLD.replace('=>jobResult(jobs.get(job_id))','=>{cleanupJobs();return jobResult(jobs.get(job_id));}');
const IMPORT_OLD='import {createBrowserSession} from "../browser-live/browser-session.mjs";';
const IMPORT_NEW='import {createBrowserSession} from "../browser-live/browser-session-functional.mjs";';
const META_OLD='const recover = attempt === 0 && sessionId !== null && expired(error);';
const META_NEW="const recover = attempt === 0 && sessionId !== null && (expired(error) || error?.message === 'browser_event_channel_closed');";
function patchOnce(input,before,after){if(input.split(before).length!==2||input.includes(after))fail('FUNCTIONAL_PATCH_ANCHOR_MISMATCH');return input.replace(before,after);}
function publish(file,content){
 const tmp=file+'.tmp';
 writeFileSync(tmp,content,{mode:0o600});renameSync(tmp,file);
 if(readFileSync(file,'utf8')!==content)fail('FUNCTIONAL_PATCH_READBACK_MISMATCH');
}
export function assertFunctionalReleaseRuntime(root) {
 const baseline=assertUnifiedRuntime(root);
 const source=readFileSync(baseline);
 if(sha(source)!==LIVE)fail('FUNCTIONAL_RUNTIME_BASE_SHA_MISMATCH');
 const src=source.toString('utf8');
 const browserPath=path.join(root,'browser-live/browser-session.mjs');
 const browser=readFileSync(browserPath);
 if(sha(browser)!==BROWSER)fail('FUNCTIONAL_BROWSER_BASE_SHA_MISMATCH');
 const browserFixed=patchOnce(browser.toString('utf8'),META_OLD,META_NEW);
 const fixed=patchOnce(patchOnce(patchOnce(src,ROUTE_OLD,ROUTE_NEW),STATUS_OLD,STATUS_NEW),IMPORT_OLD,IMPORT_NEW);
 if(fixed.replace(IMPORT_NEW,IMPORT_OLD).replace(STATUS_NEW,STATUS_OLD).replace(ROUTE_NEW,ROUTE_OLD)!==src ||
    browserFixed.replace(META_NEW,META_OLD)!==browser.toString('utf8'))fail('FUNCTIONAL_PATCH_SCOPE_MISMATCH');
 publish(path.join(root,'browser-live/browser-session-functional.mjs'),browserFixed);
 const dest=path.join(root,'server-integration/server-functional.mjs');
 publish(dest,fixed);
 return dest;
}
