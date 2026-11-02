/**
 * Stage49 SOURCE-ONLY, post-HMAC, redacted Android structural window diagnostic.
 * Accepts only an ORIGINAL failed Stage45/48 OPEN result. Never maps a window
 * to a clickable option, changes owner CAS, or produces an action grant.
 * The original Secure56 reader MUST validate the phone's signed receipt before
 * passing serverSignedFrameVerified=true; this pure module cannot verify HMAC.
 */
const failures=new Set(['STAGE45_FOREIGN_OVERLAY_UNVERIFIED',
 'STAGE45_APPLICATION_WINDOW_COUNT_UNVERIFIED']);
const diagnosticCodes=new Set(['STAGE49_OVERLAPPING_NON_APP_WINDOW_OBSERVED',
 'STAGE49_APPLICATION_WINDOW_COUNT_DIAGNOSTIC','STAGE49_NO_OVERLAPPING_NON_APP_WINDOW',
 'STAGE49_ORIGINAL_WORK_BOUNDS_UNAVAILABLE']);
const types=new Set(['TYPE_APPLICATION','TYPE_INPUT_METHOD','TYPE_SYSTEM',
 'TYPE_ACCESSIBILITY_OVERLAY','TYPE_SPLIT_SCREEN_DIVIDER','TYPE_UNKNOWN']);
const topFields=new Set(['schema','code','readOnly','originalActionResultVerified',
 'authorizedToPick','phoneActionDispatched','automaticReplay','observedWindowCount',
 'applicationWindowCount','nonApplicationWindowCount','overlapCount',
 'sampledWindowCount','sampleTruncated','windows']);
const rowFields=new Set(['windowId','displayId','type','layer','active','focused',
 'overlapsOriginalWork','parentIsOriginalWork','anchorIsOriginalWork','bounds']);
const goodObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nat=(x,max=100000)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const rect=x=>Array.isArray(x)&&x.length===4&&x.every(v=>nat(v))&&
 x[2]>x[0]&&x[3]>x[1];
const safe=(code)=>Object.freeze({ok:false,code,originalActionResultVerified:false,
 verifiedNativeWindowAssociation:false,authorizedToPick:false,
 phoneActionDispatched:false,automaticReplay:false,readOnly:true});
function rowValid(x){
 return goodObj(x)&&Object.keys(x).every(k=>rowFields.has(k))&&
  (x.windowId===null||(nat(x.windowId)&&x.windowId>0))&&
  (x.displayId===null||nat(x.displayId,65535))&&
  types.has(x.type)&&(x.layer===null||nat(x.layer,10000))&&
  typeof x.active==='boolean'&&typeof x.focused==='boolean'&&
  x.overlapsOriginalWork===true&&typeof x.parentIsOriginalWork==='boolean'&&
  typeof x.anchorIsOriginalWork==='boolean'&&rect(x.bounds);
}
export function validateStage49SignedWindowDiagnostic({
 originalFailure,diagnostic,serverSignedFrameVerified=false
}={}){
 if(serverSignedFrameVerified!==true)return safe('ORIGINAL_SIGNED_RECEIPT_REQUIRED');
 if(!goodObj(originalFailure)||!failures.has(originalFailure.code)||
   originalFailure.popupReadOnly!==true||
   originalFailure.originalActionResultVerified!==false||
   originalFailure.authorizedToPick!==false||
   originalFailure.phoneActionDispatched!==false||
   originalFailure.automaticReplay!==false)
   return safe('ORIGINAL_SELECT_EFFECT_MUST_REMAIN_UNKNOWN');
 if(!goodObj(diagnostic)||Object.keys(diagnostic).some(k=>!topFields.has(k))||
   diagnostic.schema!=='JH168_NATIVE_SELECT_WINDOW_DIAGNOSTIC_V1'||
   !diagnosticCodes.has(diagnostic.code)||diagnostic.readOnly!==true||
   diagnostic.originalActionResultVerified!==false||
   diagnostic.authorizedToPick!==false||diagnostic.phoneActionDispatched!==false||
   diagnostic.automaticReplay!==false)
   return safe('WINDOW_DIAGNOSTIC_SCHEMA_OR_ACTION_FLAG_INVALID');
 const d=diagnostic;
 if(!nat(d.observedWindowCount,1024)||!nat(d.applicationWindowCount,1024)||
   !nat(d.nonApplicationWindowCount,1024)||!nat(d.overlapCount,1024)||
   d.applicationWindowCount+d.nonApplicationWindowCount!==d.observedWindowCount||
   d.overlapCount>d.nonApplicationWindowCount||
   !nat(d.sampledWindowCount,12)||!Array.isArray(d.windows)||
   d.windows.length!==d.sampledWindowCount||d.sampledWindowCount>d.observedWindowCount||
   typeof d.sampleTruncated!=='boolean'||
   d.windows.some(x=>!rowValid(x)))
   return safe('WINDOW_DIAGNOSTIC_STRUCTURE_INVALID');
 if(d.code==='STAGE49_ORIGINAL_WORK_BOUNDS_UNAVAILABLE'){
   if(d.windows.length!==0)return safe('NO_WINDOW_CONTENT_WITHOUT_ORIGINAL_BOUNDS');
   return safe('ORIGINAL_WORK_BOUNDS_UNAVAILABLE');
 }
 if(d.code==='STAGE49_APPLICATION_WINDOW_COUNT_DIAGNOSTIC'&&d.applicationWindowCount<=2)
   return safe('DIAGNOSTIC_COUNT_INCONSISTENT');
 if(d.code==='STAGE49_NO_OVERLAPPING_NON_APP_WINDOW'&&
    (d.overlapCount!==0||d.applicationWindowCount>2))
   return safe('DIAGNOSTIC_COUNT_INCONSISTENT');
 if(d.code==='STAGE49_OVERLAPPING_NON_APP_WINDOW_OBSERVED'&&d.overlapCount===0)
   return safe('DIAGNOSTIC_COUNT_INCONSISTENT');
 return Object.freeze({ok:true,code:'WINDOW_METADATA_PARSED_READ_ONLY',
   appWindowCount:d.applicationWindowCount,nonAppOverlapCount:d.overlapCount,
   sampledWindowCount:d.sampledWindowCount,truncated:d.sampleTruncated,
   typesSeen:Object.freeze([...new Set(d.windows.map(x=>x.type))]),
   originalActionResultVerified:false,verifiedNativeWindowAssociation:false,
   authorizedToPick:false,phoneActionDispatched:false,
   automaticReplay:false,readOnly:true});
}
