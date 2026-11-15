/**
 * Optional read-only ports for the uploaded JH E2E Recovery V1 engine.
 * No startup hook, network endpoint, credential handling, job creation, retry,
 * server restart or Android mutation. Only the existing authenticated JH host
 * may supply these callbacks. Caller decides whether/when to use this module.
 */
const fresh = (timestamp, now, maxAgeMs=120_000) => {
  const t=Date.parse(timestamp||'');
  return Number.isFinite(t) && t<=now+5000 && now-t<=maxAgeMs;
};
const safeRead = async fn => {
  if(typeof fn!=='function')return null;
  try {return await fn();}catch{return null;}
};
const validStatus = x => x && typeof x==='object' && !Array.isArray(x) &&
  ('version' in x || 'connectionV2' in x);
const validDevices = x => x && typeof x==='object' && Array.isArray(x.devices);
const isCode = x => typeof x==='string' && /^[A-Z0-9_]{1,64}$/.test(x);

/**
 * Host contracts:
 * - lifeStatus/devices: pre-existing authenticated READ ONLY functions.
 * - mcpEvidence: from the ChatGPT-facing OAuth invocation host, not a backend
 *   self-check. A live server cannot prove a user's external MCP OAuth.
 * - signedPhoneStatus: verified by existing Secure56 before returning. Its
 *   verified=true is NOT a user/device-supplied flag; this port must be wired
 *   only to the existing signature/trust verifier.
 * - independentWatchdog: truly OUTSIDE the process whose reachability it tests.
 * - originalJobReceipt: only for an explicitly supplied original job+command.
 * All observations are in-memory, not for raw external logs.
 */
export function makeJHE2EV1ReadOnlyPorts({
  lifeStatus, devices, mcpEvidence, signedPhoneStatus,
  independentWatchdog, originalJobReceipt,
  now=Date.now,
}={}) {
  if(typeof lifeStatus!=='function'||typeof devices!=='function')
    throw new Error('EXISTING_AUTHENTICATED_READ_ONLY_PORTS_REQUIRED');
  if(typeof now!=='function')throw new Error('CLOCK_REQUIRED');
  async function observe({originalJobId,originalCommandId}={}) {
    const clock=now(), observedAt=new Date(clock).toISOString();
    const [rawStatus,rawDevices,rawMcp,rawWatchdog]=await Promise.all([
      safeRead(lifeStatus),safeRead(devices),safeRead(mcpEvidence),safeRead(independentWatchdog),
    ]);
    const lifeStatusValue=validStatus(rawStatus)?rawStatus:null;
    const devicesRead=validDevices(rawDevices)?rawDevices:null;
    const mcpCall={};
    if(rawMcp?.source==='EXTERNAL_OAUTH_TOOL_INVOCATION' &&
       rawMcp?.trustedByHost===true && fresh(rawMcp.observedAt,clock)) {
      if(rawMcp.ok===true && lifeStatusValue) mcpCall.ok=true;
      else if(rawMcp.ok===false) {
        mcpCall.ok=false;
        mcpCall.errorCode=isCode(rawMcp.errorCode)?rawMcp.errorCode:'TRANSPORT_UNVERIFIED';
      }
    }
    let serverObservation=null;
    if(rawWatchdog?.source==='INDEPENDENT_WATCHDOG' && rawWatchdog?.trustedByHost===true &&
       rawWatchdog?.checked===true && typeof rawWatchdog.reachable==='boolean' &&
       fresh(rawWatchdog.observedAt,clock)) {
      serverObservation={trusted:true,checked:true,fresh:true,reachable:rawWatchdog.reachable};
    }
    let phoneObservation=null;
    const device=devicesRead?.devices?.find(d=>d.deviceId===devicesRead.selectedDeviceId);
    if(device && typeof signedPhoneStatus==='function') {
      const raw=await safeRead(()=>signedPhoneStatus({selectedDeviceId:device.deviceId}));
      if(raw?.source==='SECURE56_VERIFIER' && raw?.verifiedByHost===true &&
         raw?.signatureVerified===true && raw?.deviceId===device.deviceId &&
         fresh(raw.observedAt,clock)) {
        phoneObservation={signed:true,deviceMatched:true,fresh:true,
          accessibilitySetting:['ON','OFF'].includes(raw.accessibilitySetting)?raw.accessibilitySetting:'UNKNOWN',
          accessibilityBound:typeof raw.accessibilityBound==='boolean'?raw.accessibilityBound:null,
          secureSessionActive:typeof raw.secureSessionActive==='boolean'?raw.secureSessionActive:null,
          userDisconnected:raw.userDisconnected===true};
      }
    }
    let jobObservation=null;
    if(typeof originalJobId==='string' && originalJobId &&
       typeof originalCommandId==='string' && originalCommandId &&
       typeof originalJobReceipt==='function') {
      const raw=await safeRead(()=>originalJobReceipt({originalJobId,originalCommandId}));
      if(raw?.source==='ORIGINAL_SIGNED_RECEIPT' && raw?.verifiedByHost===true &&
         raw?.originalJobId===originalJobId && raw?.originalCommandId===originalCommandId &&
         fresh(raw.observedAt,clock) &&
         ['COMPLETED_VERIFIED','FAILED_VERIFIED'].includes(raw.state)) {
        jobObservation={state:raw.state,originalJobId,receiptVerified:true};
      } else if(raw?.state==='PENDING' || raw?.state==='QUEUED') {
        jobObservation={state:raw.state,originalJobId,receiptVerified:false};
      }
    }
    return {observedAt,lifeStatus:lifeStatusValue,devicesRead,mcpCall,
      serverObservation,phoneObservation,jobObservation,
      // A backend-derived status does not prove a fresh signed phone poll.
      securePollFresh:false};
  }
  return Object.freeze({observe});
}
