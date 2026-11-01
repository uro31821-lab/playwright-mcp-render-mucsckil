/**
 * Stage35 reversible exact-source host and original Secure56 OAuth tool patch.
 *
 * The sealed handle is NOT authorization. Issue requires SAME ORIGINAL CLICK
 * command + signed result receipt; read requires new authenticated OAuth and
 * live Secure56 device, and re-verifies the original SQLite record.
 *
 * Generated candidate only: production startup, approval, Android and all
 * existing tool names remain unchanged.
 */
const fail=x=>{throw Object.assign(Error(x),{code:x});};
const once=(source,oldText,newText)=>{
 if(typeof source!=='string'||source.split(oldText).length!==2||
    source.includes(newText))fail('STAGE35_EXACT_SOURCE_ANCHOR_CHANGED');
 return source.replace(oldText,newText);
};
const apply=(source,pairs)=>{
 let s=source;
 for(const [a,b]of pairs)s=once(s,a,b);
 return s;
};
const reverse=(source,pairs)=>{
 let s=source;
 for(const [a,b]of [...pairs].reverse()){
  if(s.split(b).length!==2)fail('STAGE35_REVERSE_ANCHOR_CHANGED');
  s=s.replace(b,a);
 }
 return s;
};
const HOST_IMPORT="import {createStage34OriginalReceiptReader} from '../jh168-mobile-unification/stage34-original-receipt-reader.mjs';";
const HOST_IMPORT_NEW=HOST_IMPORT+"\n"+
 "import {createStage35OriginalReferenceHandoff} from '../jh168-mobile-unification/stage35-sealed-reference.mjs';\n"+
 "import {stage30BindingForOriginalJob} from '../jh168-mobile-unification/stage30-atomic-receipt-writer.mjs';";
const HOST_INIT=" const stage34Principal=Object.freeze({});";
const HOST_INIT_NEW=HOST_INIT+[
 "",
 " const stage35Principal=Object.freeze({});",
 " let stage35Observed=null;",
 " const stage35Handoff=createStage35OriginalReferenceHandoff({",
 "   file,key,namespace,",
 "   authorizeCurrentOwner:(reference,principal)=>",
 "     principal===stage35Principal&&stage35Observed!==null&&",
 "     stage35Observed.secureBridgeVersion===56&&",
 "     typeof stage35Observed.sessionId==='string'&&",
 "     stage35Observed.sessionId.length>0&&",
 "     stage35Observed.deviceId===reference.deviceId&&",
 "     stage35Observed.deviceDigest===reference.deviceDigest",
 " });",
 " const stage35WithCurrentSignedDevice=(observed,fn)=>{",
 "   if(!observed||typeof observed!=='object'||",
 "      observed.secureBridgeVersion!==56||",
 "      typeof observed.sessionId!=='string'||!observed.sessionId||",
 "      typeof observed.deviceId!=='string'||",
 "      !/^[a-f0-9]{64}$/.test(observed.deviceDigest||''))",
 "     return {ok:false,code:'STAGE35_CURRENT_SIGNED_DEVICE_REQUIRED',",
 "       readOnly:true,automaticReplay:false,replayAllowed:false};",
 "   stage35Observed=observed;",
 "   try{return fn(stage35Principal)}",
 "   finally{stage35Observed=null}",
 " };"
].join('\n');
const HOST_METHOD_BEFORE="  readOriginalReceipt(reference,observedSecure56){";
const HOST_METHOD_NEW=[
 "  issueOriginalReceiptHandle(job,observedSecure56){",
 "    if(closed)return {ok:false,code:'STAGE35_OWNER_HOST_CLOSED',automaticReplay:false};",
 "    const policy=job&&policies.get(job),record=job&&records.get(job);",
 "    if(!policy||policy.kind!=='JOURNAL'||!record?.stage30OriginalIdentity||",
 "       job.status!=='complete'||job.action!=='CLICK'||",
 "       job.type!=='split_screen_session_followup'||",
 "       Object.entries(record.stage30OriginalIdentity).some(([k,v])=>job[k]!==v)||",
 "       observedSecure56?.commandId!==job.commandId)",
 "      return {ok:false,code:'STAGE35_EXACT_COMPLETED_ORIGINAL_COMMAND_REQUIRED',",
 "        automaticReplay:false,replayAllowed:false};",
 "    let original;",
 "    try{",
 "      const binding=stage30BindingForOriginalJob(job,policy.identityPayload,namespace);",
 "      const {ownerDigest,...reference}=binding;",
 "      original=reference;",
 "    }catch{",
 "      return {ok:false,code:'STAGE35_ORIGINAL_REFERENCE_UNAVAILABLE',",
 "        automaticReplay:false,replayAllowed:false};",
 "    }",
 "    return stage35WithCurrentSignedDevice(observedSecure56,",
 "      principal=>stage35Handoff.issue({reference:original,principal}));",
 "  },",
 "  readOriginalReceiptHandle(handle,observedSecure56){",
 "    if(closed)return {ok:false,code:'STAGE35_OWNER_HOST_CLOSED',automaticReplay:false};",
 "    return stage35WithCurrentSignedDevice(observedSecure56,",
 "      principal=>stage35Handoff.read({sealedHandle:handle,principal}));",
 "  },",
 ""
].join('\n')+HOST_METHOD_BEFORE;
const HOST_CLOSE="  close(){if(closed)return;closed=true;try{journal.close()}finally{try{stage34Reader.close()}finally{stage30Writer.close()}}}";
const HOST_CLOSE_NEW="  close(){if(closed)return;closed=true;try{journal.close()}finally{try{stage35Handoff.close()}finally{try{stage34Reader.close()}finally{stage30Writer.close()}}}}";
const HOST_PAIRS=[
 [HOST_IMPORT,HOST_IMPORT_NEW],
 [HOST_INIT,HOST_INIT_NEW],
 [HOST_METHOD_BEFORE,HOST_METHOD_NEW],
 [HOST_CLOSE,HOST_CLOSE_NEW]
];
const RUNTIME_IMPORT='import {createDurableNativeHooks} from "../deployment/stage34-durable-native-host-candidate.mjs";';
const RUNTIME_NEW_IMPORT='import {createDurableNativeHooks} from "../deployment/stage35-durable-native-host-candidate.mjs";';
const ORIGINAL_ROUTE='  registerOAuthTool("life_android_original_completion_receipt_status",{';
const HANDLE_ROUTES=[
 '  registerOAuthTool("life_android_original_completion_handle_issue",{',
 '    title:"Sealed original signed completion reference (no new action)",',
 '    description:"Issue an encrypted short-lived ORIGINAL receipt handle only after the same original signed CLICK was accepted; current OAuth/device/command binding is mandatory. No phone action.",',
 '    inputSchema:{original_job_id:z.string().regex(/^job_[0-9]+$/)}',
 '  },async args=>{',
 '    const device=chooseDevice(),auth=device&&active56(device);',
 '    const record=device&&devices.get(device);',
 '    if(!device||!auth||record?.secureBridgeVersion!==56)',
 "      return textResult({ok:false,code:'STAGE35_CURRENT_SECURE56_DEVICE_REQUIRED',",
 '        automaticReplay:false,replayAllowed:false});',
 '    const commandId=jhRequireCommand56(device);',
 '    const original=jobs.get(args.original_job_id);',
 '    if(!original||original.targetDeviceId!==device||',
 '       original.targetDeviceDigest!==record.deviceDigest||',
 '       original.commandId!==commandId||',
 '       original.secureSessionId!==auth.sessionId||',
 "       original.status!=='complete')",
 "      return textResult({ok:false,code:'STAGE35_SAME_ORIGINAL_COMMAND_NOT_AVAILABLE',",
 '        automaticReplay:false,replayAllowed:false});',
 "    if(typeof durableNativeHooks56?.issueOriginalReceiptHandle!=='function')",
 "      return textResult({ok:false,code:'STAGE35_OWNER_HANDLE_ISSUER_UNAVAILABLE',",
 '        automaticReplay:false,replayAllowed:false});',
 '    return textResult(durableNativeHooks56.issueOriginalReceiptHandle(original,{',
 '      deviceId:device,deviceDigest:record.deviceDigest,',
 '      sessionId:auth.sessionId,commandId,secureBridgeVersion:56',
 '    }));',
 '  });',
 '',
 '  registerOAuthTool("life_android_original_completion_handle_status",{',
 '    title:"Original signed result status by sealed handle (read only)",',
 '    description:"Read only the ORIGINAL signed device result receipt. Authenticates current OAuth and live Secure56 device; does not replay actions or extend signed expiry.",',
 '    inputSchema:{sealed_handle:z.string().min(40).max(1800)}',
 '  },async args=>{',
 '    const device=chooseDevice(),auth=device&&active56(device);',
 '    const record=device&&devices.get(device);',
 '    if(!device||!auth||record?.secureBridgeVersion!==56)',
 "      return textResult({ok:false,code:'STAGE35_CURRENT_SECURE56_DEVICE_REQUIRED',",
 '        automaticReplay:false,replayAllowed:false});',
 "    if(typeof durableNativeHooks56?.readOriginalReceiptHandle!=='function')",
 "      return textResult({ok:false,code:'STAGE35_OWNER_HANDLE_READER_UNAVAILABLE',",
 '        automaticReplay:false,replayAllowed:false});',
 '    return textResult(durableNativeHooks56.readOriginalReceiptHandle(args.sealed_handle,{',
 '      deviceId:device,deviceDigest:record.deviceDigest,',
 '      sessionId:auth.sessionId,secureBridgeVersion:56',
 '    }));',
 '  });',
 '',
 ORIGINAL_ROUTE
].join('\n');
const RUNTIME_PAIRS=[
 [RUNTIME_IMPORT,RUNTIME_NEW_IMPORT],
 [ORIGINAL_ROUTE,HANDLE_ROUTES]
];
export function applyStage35HostPatch(source){
 if(typeof source!=='string'||!source.includes('stage34Reader.read(')||
    !source.includes('stage30OriginalIdentity')||
    !source.includes('stage30ReceiptWriter:stage30Writer.append'))
  fail('STAGE35_ORIGINAL_STAGE30_STAGE34_HOST_REQUIRED');
 const out=apply(source,HOST_PAIRS);
 if(reverseStage35HostPatch(out)!==source)fail('STAGE35_HOST_SCOPE_CHANGED');
 return out;
}
export function reverseStage35HostPatch(source){return reverse(source,HOST_PAIRS)}
export function applyStage35RuntimePatch(source){
 if(typeof source!=='string'||!source.includes(RUNTIME_IMPORT)||
    !source.includes(ORIGINAL_ROUTE)||
    !source.includes('jhSplitFollowupReceipts56.read(')||
    !source.includes('if(!a||sid!==j.secureSessionId')||
    !source.includes('const stage26Ack56=')||
    !source.includes('durableNativeHooks56?.acceptedCompletion(')||
    !source.includes('registerOAuthTool("life_android_complete_401_summary"'))
  fail('STAGE35_ORIGINAL_SIGNED_OAUTH_OPERATOR_REQUIRED');
 const out=apply(source,RUNTIME_PAIRS);
 if(reverseStage35RuntimePatch(out)!==source)fail('STAGE35_RUNTIME_SCOPE_CHANGED');
 const signed=out.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=out.indexOf('const stage26Ack56=');
 const durable=out.indexOf('durableNativeHooks56?.acceptedCompletion(');
 if(!(signed>=0&&signed<ack&&ack<durable))
  fail('STAGE35_ORIGINAL_SIGNED_COMPLETION_ORDER_CHANGED');
 for(const name of ['life_android_original_completion_handle_issue',
                     'life_android_original_completion_handle_status']){
  if(out.split('registerOAuthTool("'+name+'"').length!==2)
   fail('STAGE35_DUPLICATE_OR_MISSING_OAUTH_ROUTE');
 }
 return out;
}
export function reverseStage35RuntimePatch(source){return reverse(source,RUNTIME_PAIRS)}
