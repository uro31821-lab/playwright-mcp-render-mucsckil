/** JH168 Stage41: exact reversible original-command invalidation provenance.
 * This is telemetry of the existing signed decision, NOT cancellation bypass.
 * Only existing host-authorized BEGIN and HMAC-signed discard producers can
 * change the original jhCommandVersions56/blocked fence.
 */
const PREFIX='// JH_STAGE41_SIGNED_COMMAND_CAUSE_ONLY_V1\n';
const PAIRS=[
[
 'const jhBlockedCommands56=new Set();',
 `const jhBlockedCommands56=new Set();
const jhCommandCauses41=new Map();
function jhRecordCommandCause41(device,cause){
  // Process-local redacted bounded observation only; never persist device IDs.
  if(!device||!['NEW_BEGIN_COMMAND','PHONE_SCOPED_SITE_DISCARD',
      'PHONE_UNSCOPED_SITE_DISCARD'].includes(cause))return;
  if(!jhCommandCauses41.has(device)&&jhCommandCauses41.size>=64)
    jhCommandCauses41.delete(jhCommandCauses41.keys().next().value);
  jhCommandCauses41.set(device,cause);
}
function jhCommandCause41(context){
  if(!context?.device)return 'COMMAND_DEVICE_UNKNOWN';
  if(jhBlockedCommands56.has(context.device))return 'COMMAND_DISCARD_IN_PROGRESS';
  const active=jhCommandVersion56(context.device);
  if(!active)return 'COMMAND_NO_ACTIVE_VERSION';
  if(context.commandId!==active||context.version!==active)
    return jhCommandCauses41.get(context.device)||'COMMAND_CHANGED_SOURCE_UNOBSERVED';
  return 'COMMAND_OTHER_BINDING_FAILURE';
}`
],
[
 '  jhDiscardDeviceWork56(device,eventId);\n  if(jhCommandVersion56(device)!==eventId)throw Error(\'old_command_cannot_restart\');',
 `  const jhPreviousBegin41=jhCommandVersion56(device);
  jhDiscardDeviceWork56(device,eventId);
  if(jhCommandVersion56(device)!==jhPreviousBegin41)
    jhRecordCommandCause41(device,'NEW_BEGIN_COMMAND');
  if(jhCommandVersion56(device)!==eventId)throw Error('old_command_cannot_restart');`
],
[
 '      jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId);\n      res.writeHead(200',
 `      const jhPreviousSite41=jhCommandVersion56(body.deviceId);
      jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId);
      if(jhCommandVersion56(body.deviceId)!==jhPreviousSite41)
        jhRecordCommandCause41(body.deviceId,body.previousCommandId===undefined?
          'PHONE_UNSCOPED_SITE_DISCARD':'PHONE_SCOPED_SITE_DISCARD');
      res.writeHead(200`
],
[
 `        }catch(e){return textResult({ok:false,code:String(e?.message||'command_unconfirmed'),replayAllowed:false});}`,
 `        }catch(e){
          const code=String(e?.message||'command_unconfirmed');
          const diagnostic=code==='new_command_binding_required_or_discarded'?
            jhCommandCause41(context):null;
          return textResult({ok:false,code,replayAllowed:false,
            ...(diagnostic?{commandLifecycleCause:diagnostic,
              automaticReplay:false,verifiedPhoneEffect:false}:{})});
        }`
]
];
function one(s,x,label){
 if(typeof s!=='string'||s.split(x).length!==2)
  throw Error('STAGE41_EXACT_SOURCE_DRIFT_'+label);
}
export function applyStage41CommandLifecyclePatch(source){
 if(typeof source!=='string'||source.startsWith(PREFIX)||
    !source.includes('!eqHex56(mac,hmac56(')||
    !source.includes('jhRequireCommand56(device)')||
    !source.includes('jhCommandVersion56(device)')||
    !source.includes('jhDiscardDeviceWork56('))
  throw Error('STAGE41_ORIGINAL_SIGNED_COMMAND_REQUIRED');
 let out=source;
 for(let i=0;i<PAIRS.length;i++){const [before,after]=PAIRS[i];one(out,before,'A'+i);out=out.replace(before,after);}
 out=PREFIX+out;
 if(reverseStage41CommandLifecyclePatch(out)!==source)
  throw Error('STAGE41_NOT_EXACT_REVERSIBLE');
 return out;
}
export function reverseStage41CommandLifecyclePatch(source){
 if(typeof source!=='string'||!source.startsWith(PREFIX))
  throw Error('STAGE41_PREFIX_REQUIRED');
 let out=source.slice(PREFIX.length);
 for(let i=PAIRS.length-1;i>=0;i--){const [before,after]=PAIRS[i];one(out,after,'R'+i);out=out.replace(after,before);}
 return out;
}
