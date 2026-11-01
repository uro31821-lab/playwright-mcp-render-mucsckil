/** Apply ONLY to the generated pinned Secure56 + original JH155 split runtime.
 * Full reversible source patch. No listener, Android APK, deploy or job replay.
 */
const IMPORT='import {createSplitReadReceiptRegistry56} from "../jh168-mobile-unification/split-read-receipts.mjs";\n';
const STATE_OLD='const recentWeb=new Map();';
const STATE_NEW=STATE_OLD+'\nconst jhSplitReadReceipts56=createSplitReadReceiptRegistry56();';
const ANCHOR='  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){';
const STATUS_HELPER=[
  '  function jhSplitReadStatus56(receiptRef){',
  '    const device=chooseDevice(),auth=device&&active56(device);',
  '    if(!device||!auth||devices.get(device)?.secureBridgeVersion!==56)',
  "      return {ok:false,code:'active_secure56_device_required',automaticReplay:false};",
  '    const commandId=jhRequireCommand56(device);',
  '    return jhSplitReadReceipts56.read({',
  '      receiptRef,deviceId:device,sessionId:auth.sessionId,commandId',
  '    },id=>jobs.get(id),screen=>jhInspectSplitEvidence155(screen).ok===true);',
  '  }',
  ''
].join('\n');
const WAIT_OLD="    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));";
const WAIT_NEW="    if(type==='split_screen_session_start'&&\n       effect==='READ_ONLY'&&\n       secureToolName==='life_android_capture_work_window'&&\n       payload?.goal==='JH168_SPLIT_READ_DIAGNOSTIC_V1'){\n      const receipt=jhSplitReadReceipts56.issue({\n        job:j,deviceId:device,sessionId:auth.sessionId,commandId,taskDigest\n      });\n      return {ok:false,code:'SPLIT_READ_STILL_PENDING',\n        ...(receipt||{}),jobStatus:j.status,automaticReplay:false};\n    }\n    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));";
const TIMEOUT_OLD=[
  "    if(!completed||completed.status!=='complete')",
  "      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed'};"
].join('\n');
const TIMEOUT_NEW=[
  "    if(!completed||completed.status!=='complete'){",
  "      const pending=effect==='READ_ONLY'&&",
  "        secureToolName==='life_android_capture_work_window'&&",
  "        ['split_screen_session_start','split_screen_session_status','split_comfort_status'].includes(type)&&",
  "        ['queued','in_progress'].includes(completed?.status);",
  "      const receipt=pending?jhSplitReadReceipts56.issue({",
  "        job:j,deviceId:device,sessionId:auth.sessionId,",
  "        commandId,taskDigest",
  "      }):null;",
  "      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed',",
  "        ...(receipt?{...receipt,jobStatus:completed.status}:{}),",
  "        ...(receipt&&type==='split_comfort_status'?{followUp:{",
  "          tool:'life_android_split_screen_assistant',readOnly:true,",
  "          arguments:{mode:'READBACK_PENDING',receipt_ref:receipt.receiptRef,command_id:commandId}}}:{}),",
  "        automaticReplay:false};",
  "    }"
].join('\n');
const MODE_OLD="mode:z.enum(['START','SAVE_ANALYSIS','FOLLOW_UP','STATUS','FINISH','CANCEL']),";
const MODE_NEW="mode:z.enum(['START','SAVE_ANALYSIS','FOLLOW_UP','STATUS','FINISH','CANCEL','READBACK_PENDING']),";
const FIELD_OLD='context_id:z.string().optional(),request_id:z.string().optional(),goal:z.string().optional(),';
const FIELD_NEW='context_id:z.string().optional(),request_id:z.string().optional(),receipt_ref:z.string().optional(),goal:z.string().optional(),';
const CHECK_OLD="    if(!jhSplitScreenContextId56(args.context_id))return textResult({ok:false,code:'split_screen_context_id_required'});";
const CHECK_NEW=[
  "    if(mode==='READBACK_PENDING'||",
  "       (mode==='STATUS'&&typeof args.context_id==='string'&&",
  "        /^srr_[A-Za-z0-9_-]{32}$/.test(args.context_id))){",
  "      if(args.target_item_ref||args.value||args.command||",
  "         (mode==='READBACK_PENDING'&&",
  "          (args.context_id||typeof args.receipt_ref!=='string')))",
  "        return textResult({ok:false,code:'split_read_receipt_arguments_invalid',",
  "          automaticReplay:false});",
  "      return textResult(jhSplitReadStatus56(",
  "        mode==='STATUS'?args.context_id:args.receipt_ref));",
  "    }",
  CHECK_OLD
].join('\n');
const PAIRS=[
  [STATE_OLD,STATE_NEW],[ANCHOR,STATUS_HELPER+ANCHOR],
  [WAIT_OLD,WAIT_NEW],[TIMEOUT_OLD,TIMEOUT_NEW],[MODE_OLD,MODE_NEW],
  [FIELD_OLD,FIELD_NEW],[CHECK_OLD,CHECK_NEW]
];
export function applyJH168SplitReadReceiptPatch(source){
  if(typeof source!=='string'||source.startsWith(IMPORT)||
     !source.includes("registerOAuthTool('life_android_split_screen_assistant'")||
     !source.includes('jhRequireCommand56(')||
     !source.includes('jhInspectSplitEvidence155')||
     !source.includes('durableNativeHooks56?.beforeDispatch('))
    throw Error('JH168_SPLIT_RECEIPT_ORIGINAL_GUARDS_REQUIRED');
  let out=source;
  for(const [before,after] of PAIRS){
    if(out.split(before).length!==2||out.includes(after))
      throw Error('JH168_SPLIT_RECEIPT_ANCHOR_CHANGED');
    out=out.replace(before,after);
  }
  out=IMPORT+out;
  if(reverseJH168SplitReadReceiptPatch(out)!==source)
    throw Error('JH168_SPLIT_RECEIPT_SCOPE_INVALID');
  return out;
}
export function reverseJH168SplitReadReceiptPatch(source){
  if(typeof source!=='string'||!source.startsWith(IMPORT))
    throw Error('JH168_SPLIT_RECEIPT_PREFIX_MISSING');
  let out=source.slice(IMPORT.length);
  for(const [before,after] of PAIRS.slice().reverse()){
    if(out.split(after).length!==2)
      throw Error('JH168_SPLIT_RECEIPT_REVERSE_ANCHOR');
    out=out.replace(after,before);
  }
  return out;
}
