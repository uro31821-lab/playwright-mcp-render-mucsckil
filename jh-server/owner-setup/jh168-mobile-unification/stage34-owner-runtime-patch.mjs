/**
 * Stage34 reversible source-only candidate over the Stage30 owner host and
 * current generated Stage25/26 original OAuth + Secure56 operator.
 * No production startup changes, device work, approval reuse or secrets.
 */
const fail=code=>{throw Object.assign(Error(code),{code});};
const exact=(source,from,to)=>{
 if(typeof source!=='string'||source.split(from).length!==2||source.includes(to))
  fail('STAGE34_EXACT_SOURCE_ANCHOR_CHANGED');
 return source.replace(from,to);
};
const HOST_IMPORT="import {createStage30AtomicReceiptWriter} from '../jh168-mobile-unification/stage30-atomic-receipt-writer.mjs';";
const HOST_NEW_IMPORT=HOST_IMPORT+"\n"+
 "import {createStage34OriginalReceiptReader} from '../jh168-mobile-unification/stage34-original-receipt-reader.mjs';";
const HOST_INIT=" const stage30Writer=createStage30AtomicReceiptWriter({file,key,namespace});";
const HOST_NEW_INIT=[
 HOST_INIT,
 " const stage34Principal=Object.freeze({});",
 " const stage34Reader=createStage34OriginalReceiptReader({",
 "   file,key,namespace,",
 "   authorizeCurrentOwner:(binding,principal)=>principal===stage34Principal",
 " });"
].join('\n');
const HOST_BEFORE="  uncertainEffectsForMaintenance(){";
const HOST_READ=[
 "  readOriginalReceipt(reference,observedSecure56){",
 "    if(closed)return {ok:false,code:'STAGE34_HOST_CLOSED',automaticReplay:false};",
 "    // Observed scope comes only from the ORIGINAL OAuth and active56 handler.",
 "    // The public request cannot provide the observedSecure56 argument.",
 "    if(!observedSecure56||typeof observedSecure56!=='object'||",
 "       observedSecure56.secureBridgeVersion!==56||",
 "       typeof observedSecure56.sessionId!=='string'||",
 "       observedSecure56.sessionId.length<1||",
 "       observedSecure56.deviceId!==reference?.deviceId||",
 "       observedSecure56.deviceDigest!==reference?.deviceDigest)",
 "      return {ok:false,code:'STAGE34_CURRENT_SIGNED_DEVICE_SCOPE_REQUIRED',",
 "        readOnly:true,automaticReplay:false,replayAllowed:false,",
 "        resultReceived:false,taskSuccessVerified:false,",
 "        uiTransitionVerified:false,newJobCreated:false};",
 "    return stage34Reader.read({reference,principal:stage34Principal});",
 "  },",
 ""
].join('\n');
const HOST_CLOSE="  close(){if(closed)return;closed=true;try{journal.close()}finally{stage30Writer.close()}}";
const HOST_NEW_CLOSE="  close(){if(closed)return;closed=true;try{journal.close()}finally{try{stage34Reader.close()}finally{stage30Writer.close()}}}";
const REGISTER_ANCHOR='  registerOAuthTool("life_status",{';
const ROUTE=[
 '  registerOAuthTool("life_android_original_completion_receipt_status",{',
 '    title:"Original signed device-result receipt (read only)",',
 '    description:"Original Secure56 device completion RECEIVED only. Existing OAuth, active Secure56 device and original reference required. Never dispatches Android work, rebinds a session, or claims UI success.",',
 '    inputSchema:{',
 '      original_reference:z.object({',
 '        deviceId:z.string(),deviceDigest:z.string(),',
 '        secureSessionId:z.string(),jobId:z.string(),',
 '        commandId:z.string(),taskDigest:z.string(),requestId:z.string(),',
 '        contextId:z.string(),targetItemRef:z.string(),',
 '        commandDigest:z.string(),expiresAtMs:z.number().int()',
 '      }).strict()',
 '    }',
 '  },async args=>{',
 '    // ORIGINAL registerOAuthTool wrapper authenticates the current OAuth.',
 '    // ORIGINAL active56() verifies an existing current signed device session.',
 '    const device=chooseDevice(),live=device&&active56(device);',
 '    const deviceRecord=device&&devices.get(device);',
 '    if(!device||!live||deviceRecord?.secureBridgeVersion!==56)',
 "      return textResult({ok:false,code:'STAGE34_CURRENT_SECURE56_SESSION_REQUIRED',",
 '        readOnly:true,automaticReplay:false,replayAllowed:false,',
 '        taskSuccessVerified:false,uiTransitionVerified:false});',
 '    const original=args?.original_reference;',
 '    if(!original||original.deviceId!==device||',
 '       original.deviceDigest!==deviceRecord.deviceDigest)',
 "      return textResult({ok:false,code:'STAGE34_CURRENT_DEVICE_SCOPE_CHANGED',",
 '        readOnly:true,automaticReplay:false,replayAllowed:false,',
 '        taskSuccessVerified:false,uiTransitionVerified:false});',
 "    if(typeof durableNativeHooks56?.readOriginalReceipt!=='function')",
 "      return textResult({ok:false,code:'STAGE34_ORIGINAL_OWNER_JOURNAL_NOT_INSTALLED',",
 '        readOnly:true,automaticReplay:false,replayAllowed:false,',
 '        taskSuccessVerified:false,uiTransitionVerified:false});',
 '    return textResult(durableNativeHooks56.readOriginalReceipt(original,{',
 '      deviceId:device,deviceDigest:deviceRecord.deviceDigest,',
 '      sessionId:live.sessionId,secureBridgeVersion:56',
 '    }));',
 '  });',
 '',
 ''
].join('\n');
const HOST_PAIRS=[
 [HOST_IMPORT,HOST_NEW_IMPORT],
 [HOST_INIT,HOST_NEW_INIT],
 [HOST_BEFORE,HOST_READ+HOST_BEFORE],
 [HOST_CLOSE,HOST_NEW_CLOSE]
];
const RUNTIME_IMPORT='import {createDurableNativeHooks} from "../deployment/stage30-durable-native-host-candidate.mjs";';
const RUNTIME_NEW_IMPORT='import {createDurableNativeHooks} from "../deployment/stage34-durable-native-host-candidate.mjs";';
const RUNTIME_PAIRS=[[RUNTIME_IMPORT,RUNTIME_NEW_IMPORT],
 [REGISTER_ANCHOR,ROUTE+REGISTER_ANCHOR]];
const patch=(source,pairs)=>{
 let out=source;
 for(const [from,to]of pairs)out=exact(out,from,to);
 return out;
};
const reverse=(source,pairs)=>{
 let out=source;
 for(const [from,to]of [...pairs].reverse()){
  if(out.split(to).length!==2)fail('STAGE34_REVERSE_ANCHOR_CHANGED');
  out=out.replace(to,from);
 }
 return out;
};
export function applyStage34HostPatch(source){
 if(typeof source!=='string'||!source.includes('stage30ReceiptWriter:stage30Writer.append')||
    !source.includes('stage30OriginalIdentity')||
    !source.includes('journal.recordAuthenticatedDeviceResult('))
  fail('STAGE34_STAGE30_OWNER_HOST_REQUIRED');
 const out=patch(source,HOST_PAIRS);
 if(reverseStage34HostPatch(out)!==source)fail('STAGE34_HOST_SCOPE_CHANGED');
 return out;
}
export function reverseStage34HostPatch(source){return reverse(source,HOST_PAIRS)}
export function applyStage34RuntimePatch(source){
 if(typeof source!=='string'||
    !source.includes('stage30-durable-native-host-candidate.mjs')||
    !source.includes('durableNativeHooks56?.acceptedCompletion(')||
    !source.includes('const stage26Ack56=')||
    !source.includes('if(!a||sid!==j.secureSessionId')||
    !source.includes('jhSplitFollowupReceipts56.read(')||
    !source.includes('registerOAuthTool("life_android_complete_401_summary"'))
  fail('STAGE34_ORIGINAL_SIGNED_STAGE26_OAUTH_REQUIRED');
 const out=patch(source,RUNTIME_PAIRS);
 if(reverseStage34RuntimePatch(out)!==source)fail('STAGE34_RUNTIME_SCOPE_CHANGED');
 const guard=out.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=out.indexOf('const stage26Ack56=');
 const durable=out.indexOf('durableNativeHooks56?.acceptedCompletion(');
 if(guard<0||ack<=guard||durable<=ack)
  fail('STAGE34_ORIGINAL_AUTH_AND_COMPLETION_ORDER_CHANGED');
 if(out.split('registerOAuthTool("life_android_original_completion_receipt_status"').length!==2)
  fail('STAGE34_DUPLICATE_READ_ROUTE');
 return out;
}
export function reverseStage34RuntimePatch(source){return reverse(source,RUNTIME_PAIRS)}
