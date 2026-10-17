/** Source-only minimal integration after the EXISTING JH155/JH167 runtime composition.
 * Do not alter Secure/OAuth/MCP command fences, signatures or approval mechanics.
 */
const IMPORT="import {registerReservationLinkTools as jhRegisterReservationLinkTools,hostAllowlist as jhReservationHostAllowlist} from '../reservation-link/host-tools.mjs';\n";
const ANCHOR='  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});';
const INVOKE=String.raw`
  jhRegisterReservationLinkTools({registerOAuthTool,z,textResult,
    allowedBookingHosts:jhReservationHostAllowlist(process.env.JH_RESERVATION_ALLOWED_BOOKING_HOSTS||''),
    getHostContext:()=>{const device=chooseDevice();return {command_id:jhRequireCommand56(device)};},
    readVerifiedRight:async(question,commandId)=>{
      const device=chooseDevice();
      const auth=device&&active56(device);
      if(!auth)return {verified:false,code:'SECURE_SESSION_UNAVAILABLE'};
      if(jhRequireCommand56(device)!==commandId)return {verified:false,code:'COMMAND_CHANGED'};
      const job=mk('agent_snapshot',{},device),done=await waitJob(job,20000);
      if(jhRequireCommand56(device)!==commandId)return {verified:false,code:'COMMAND_CHANGED'};
      if(done?.status!=='complete'||done?.result?.ok!==true||done.secureSessionId!==auth.sessionId||done.targetDeviceId!==device)
        return {verified:false,code:'SIGNED_READBACK_UNVERIFIED'};
      let rows;try{rows=JSON.parse(done.result.url);if(!Array.isArray(rows))throw Error('ROWS_INVALID');}
      catch{return {verified:false,code:'SIGNED_ROWS_INVALID'};}
      const proof=jhInspectSplitEvidence155(done.result,rows);
      if(!proof.ok)return {verified:false,code:proof.reason};
      const understood=jhScreenUnderstanding56.analyze({mode:'EXPLAIN',query:question,rows,
        commandId,deviceKey:sha56(device),trustKey:sha56(auth.trustId+'|'+auth.sessionId),observedAt:Date.now()});
      if(!understood?.ok||understood.screen?.verifiedRightPane!==true||understood.screen.package!==proof.workPackage)
        return {verified:false,code:'SAFE_SCREEN_EVIDENCE_UNAVAILABLE'};
      const evidence=(understood.observed||[]).filter(x=>typeof x.quote==='string').slice(0,40)
        .map(x=>({id:x.id,quote:x.quote.slice(0,160)}));
      return {verified:true,observation:{app:proof.workPackage,window_id:proof.workWindowId,
        observed_at:new Date(proof.observedAtMs).toISOString(),partial:understood.screen.partial!==false,
        visible_elements:evidence.map(x=>({label:x.quote,role:'observed',visible:true}))},evidence};
    }
  });
`;
export function patchReservationLinkAssistant(source){
  if(typeof source!=='string'||source.split(ANCHOR).length!==2||source.includes('jhRegisterReservationLinkTools('))
    throw Error('RESERVATION_LINK_HOST_ANCHOR_CHANGED_OR_ALREADY_PATCHED');
  const out=IMPORT+source.replace(ANCHOR,ANCHOR+INVOKE);
  if(out.slice(IMPORT.length).replace(ANCHOR+INVOKE,ANCHOR)!==source)
    throw Error('RESERVATION_LINK_PATCH_SCOPE_CHANGED');
  return out;
}
