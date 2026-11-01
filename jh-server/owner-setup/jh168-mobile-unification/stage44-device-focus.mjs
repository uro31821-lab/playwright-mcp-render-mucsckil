/** JH168 Stage44 opt-in bounded exclusive focus for ONE signed mobile workflow.
 * Process-local admission fence, never a phone authority, signature, grant,
 * result classifier or override of original signed /device/discard-work.
 */
export function createStage44DeviceFocus({now=Date.now,maxMs=120000,maxEntries=32}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(maxMs)||maxMs<1000||maxMs>120000||
  !Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>64)throw Error('STAGE44_INVALID_CONFIG');
 const map=new Map();
 const valid=s=>typeof s==='string'&&s.length>0&&s.length<=256;
 const cmd=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
 const purge=(device,current)=>{
  const r=map.get(device);
  if(r&&(now()>=r.until||r.commandId!==current)){map.delete(device);return null;}
  return r||null;
 };
 function mayBegin({device,eventId,currentCommand}={}){
  if(!valid(device)||!cmd(eventId))return Object.freeze({allowed:false,reason:'FOCUS_INVALID_SCOPE'});
  const active=purge(device,currentCommand);
  if(!active)return Object.freeze({allowed:true,reason:'FOCUS_FREE'});
  return Object.freeze(active.commandId===eventId?
   {allowed:true,reason:'FOCUS_SAME_COMMAND'}:
   {allowed:false,reason:'FOCUS_OTHER_TASK_ACTIVE'});
 }
 function start({device,commandId,currentCommand}={}){
  if(!valid(device)||!cmd(commandId)||commandId!==currentCommand)
   return Object.freeze({ok:false,code:'FOCUS_COMMAND_NOT_CURRENT'});
  const existing=purge(device,currentCommand);
  if(existing&&existing.commandId!==commandId)return Object.freeze({ok:false,code:'FOCUS_OTHER_TASK_ACTIVE'});
  if(!existing&&map.size>=maxEntries)return Object.freeze({ok:false,code:'FOCUS_CAPACITY'});
  if(!existing)map.set(device,{commandId,until:now()+maxMs});
  return Object.freeze({ok:true,code:'FOCUS_STARTED',leaseMillis:maxMs,automaticReplay:false});
 }
 function release({device,commandId}={}){
  const row=map.get(device);
  if(row?.commandId!==commandId)return false;
  map.delete(device);return true;
 }
 return Object.freeze({mayBegin,start,release});
}
