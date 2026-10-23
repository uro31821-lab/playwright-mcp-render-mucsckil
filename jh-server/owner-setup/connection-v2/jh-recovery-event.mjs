/** Redacted, status-only evidence of a JH V2 recovery state transition.
 * Never includes URLs, device/session IDs, user input, tokens, screenshots,
 * browser content or approval data. Does not send alerts or execute actions.
 */
const STATES=new Set(['OBSERVING','WAITING_FOR_IDLE','WAITING_FOR_SAFE_WINDOW',
 'RETRY_SCHEDULED','RECOVERED','MANUAL_REQUIRED']);
const STAGES=new Set(['server','mcp','browser','bridge','security']);
const OUTCOMES=new Set(['VERIFIED','NOT_CONFIRMED','VERIFICATION_FAILED','UNVERIFIED']);
const DELIVERIES=new Set(['NOT_NEEDED','NOT_CONFIGURED','NOT_CONFIRMED',
 'DELIVERED','DELIVERY_FAILED','ALREADY_SENT','RETRY_DEFERRED']);
const safeCode=x=>typeof x==='string' && /^[A-Z0-9_]{1,72}$/.test(x)?x:'UNKNOWN';
export function redactedRecoveryEvent(raw,at=Date.now()){
 if(!raw||!STATES.has(raw.status))return null;
 const first=Array.isArray(raw.recoveryActions)?raw.recoveryActions[0]:null;
 const result=Object.freeze({
  schemaVersion:1,atUtc:new Date(Number.isFinite(at)?at:0).toISOString(),
  status:raw.status,stage:STAGES.has(raw.failure?.id)?raw.failure.id:'unknown',
  code:safeCode(raw.failure?.code),
  action:first?.action==='BROWSER_TRANSPORT_SOFT_RECONNECT'
    ?'BROWSER_TRANSPORT_SOFT_RECONNECT':null,
  outcome:OUTCOMES.has(first?.outcome)?first.outcome:null,
  notificationDelivery:DELIVERIES.has(raw.notificationDelivery)
    ?raw.notificationDelivery:'NOT_CONFIRMED',
  replayPreviousCommand:false
 });
 return result;
}
export function recoveryEventKey(x){
 if(!x)return null;
 return [x.status,x.stage,x.code,x.action,x.outcome,x.notificationDelivery].join('|');
}
