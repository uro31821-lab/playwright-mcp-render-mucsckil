/** Only applies to a generated RIGHT route after the existing original JH guards.
 * Reversible. No runtime startup or Android dispatch in this module.
 */
const HEAD='import {openAndObserveRightChrome56 as jh168ReadAfterOpen56} from "../jh168-mobile-unification/open-and-observe.mjs";\n';
const A='  },async({target,url})=>jhRightWebOpen56({service:String(url||target||"")}));';
const B=[
'  },async({target,url})=>{',
'    const device=chooseDevice(),active=device&&active56(device);',
'    if(!device||!active)return textResult({ok:false,code:"active_secure56_device_required"});',
'    const current=()=>({deviceId:device,sessionId:active56(device)?.sessionId,',
'      commandId:jhRequireCommand56(device)});',
'    return textResult(await jh168ReadAfterOpen56({',
'      service:String(url||target||""),readBinding:current,',
'      open:service=>jhRightWebOpen56({service}),',
'      start:()=>jhSplitScreenJob56("split_screen_session_start",',
'        {workflowId:"jh_split_"+randomBytes(16).toString("hex"),',
'          goal:"Read verified RIGHT Chrome only"},',
'        "READ_ONLY","life_android_capture_work_window")',
'    }));',
'  });'
].join('\n');
export function applyJH168OpenReadPatch(source){
 if(typeof source!=='string'||source.startsWith(HEAD)||source.split(A).length!==2||
 !source.includes('jhRequireCommand56(device)')||!source.includes('jhSplitScreenJob56('))
  throw Error('ORIGINAL_JH_RIGHT_RUNTIME_REQUIRED');
 const out=HEAD+source.replace(A,B);
 if(reverseJH168OpenReadPatch(out)!==source)throw Error('NOT_REVERSIBLE');
 return out;
}
export function reverseJH168OpenReadPatch(source){
 if(!source.startsWith(HEAD)||source.split(B).length!==2)
  throw Error('JH168_PATCH_SCOPE');
 return source.slice(HEAD.length).replace(B,A);
}
