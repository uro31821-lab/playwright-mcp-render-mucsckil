/**
 * Stage22 review candidate: integrates the already reviewed JH168 split read
 * and same-job FOLLOW_UP receipt patches into the generated Secure56 runtime.
 * This builder does NOT start the HTTP listener, alter production, approve
 * actions, create an Android job, or change the original pinned source.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-release.mjs';
import {applyJH168SplitReadReceiptPatch,reverseJH168SplitReadReceiptPatch} from './split-read-receipt-patch.mjs';
import {applyJH168SplitFollowupReceiptPatch,reverseJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
export async function buildJH168Stage22ServerCandidate(root=resolve(import.meta.dirname,'..')){
 const built=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(built.file).href+'?stage22='+built.sha256);
 const base=mod.buildDurableRoutedOperationalEntrypoint(root);
 const before=readFileSync(base.runtimeFile,'utf8');
 if(!before.includes('durableNativeHooks56?.beforeDispatch(')||
    !before.includes("registerOAuthTool('life_android_split_screen_assistant'")||
    !before.includes('jhRequireCommand56('))throw Error('STAGE22_ORIGINAL_AUTHORITY_MISSING');
 const readPatch=applyJH168SplitReadReceiptPatch(before);
 const after=applyJH168SplitFollowupReceiptPatch(readPatch);
 if(reverseJH168SplitFollowupReceiptPatch(after)!==readPatch ||
    reverseJH168SplitReadReceiptPatch(readPatch)!==before)
   throw Error('STAGE22_RUNTIME_NOT_REVERSIBLE');
 if(after.split('jhSplitFollowupReceipts56.issue(').length!==2||
    after.split('jhSplitFollowupReceipts56.read(').length!==2||
    after.split("if(mode==='READBACK_PENDING'&&typeof args.receipt_ref").length!==2)
   throw Error('STAGE22_SOURCE_BINDING_INVALID');
 const file=join(dirname(base.runtimeFile),'server-jh168-stage22-review.mjs');
 const tmp=file+'.tmp';
 writeFileSync(tmp,after,{encoding:'utf8',mode:0o600});
 renameSync(tmp,file);
 if(readFileSync(file,'utf8')!==after)throw Error('STAGE22_OUTPUT_MISMATCH');
 return Object.freeze({status:'REVIEW_ONLY_NOT_DEPLOYED',runtimeFile:file,
  sha256:sha(after),originalRuntimeSha256:sha(before),
  originalSecure56Unmodified:true,androidApkUnaffected:true,
  autoClickReplay:false,readOnlyFollowupRecovery:true,
  durableJobPolicyUnmodified:true,productionEnabled:false});
}
