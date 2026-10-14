import {patchSplitComfort10} from './split-comfort-10-mcp-patch.mjs';
import {patchScreenUnderstandMcp56} from './jh-screen-understanding/jh-screen-mcp-patch.mjs';
import {patchJH155MultiStep} from './jh155-multistep-patch.mjs';

const recoveryImport="import {gateRecoveredDispatch as jhGateRecoveredDispatch155} from '../deployment/jh-recovery-write-fence.mjs';\n";
const recoveryHelper=String.raw`
  async function jhOwnerAdmission155(device,commandId,record,firstAttempt){
    if(jhRequireCommand56(device)!==commandId)return false;
    const binding=jhPaymentLifecycle.captureBinding({device_id:device});
    const auth=active56(device);
    const read=await waitJob(mk('agent_snapshot',{},device),15000);
    jhPaymentLifecycle.assertBinding({command_binding:binding});
    if(jhRequireCommand56(device)!==commandId)return false;
    let rows;try{rows=JSON.parse(read?.result?.url);}catch{return false;}
    const proof=jhInspectSplitEvidence155(read?.result,rows);
    const signed=read?.status==='complete'&&read.result?.ok===true&&
      read.secureSessionId===auth?.sessionId&&read.targetDeviceId===device;
    return jhGateRecoveredDispatch155({
      commandState:'ACTIVE',commandEpochCurrent:true,pendingDiscard:jhBlockedCommands56.has(device),
      bridgeAuthenticated:signed&&!!auth,trustedScopeValid:proof.ok===true,
      ledgerStatus:record?.state==='PREPARING'&&firstAttempt&&record.attemptCount===1?'RESERVED':'BLOCKED',
      effect:record?.dispatchStartedAt?'UNKNOWN':'NOT_DISPATCHED',actionKind:'UI_ACTION',
      explicitUserCommand:true,isFreshScreen:signed&&proof.ok===true,
      serverRequestIdValid:typeof record?.executionId==='string'&&typeof record?.dedupeKey==='string',
      sourceIsAuthoritative:true
    }).allowDispatch;
  }
`;

/** Compose reviewed additions in the EXISTING durable startup generator.
 * The sealed host, command ownership, signed jobs and payment lifecycle are
 * unchanged. A source bundle is not evidence of a deployed/connected phone.
 */
export function patchJH155AllModules(source) {
  let output=patchScreenUnderstandMcp56(patchSplitComfort10(source));
  const anchor='  registerChoiceTools({registerOAuthTool,z,textResult,browserTool,store:jhDecisionStoreV2});';
  if(output.split(anchor).length!==2||output.includes('jhRegisterGeneralWorkTools'))
    throw Error('JH155_GENERAL_WORK_ANCHOR_CHANGED');
  const statement="import {registerGeneralWorkTools as jhRegisterGeneralWorkTools} from '../general-work/mcp.mjs';\n";
  const insertion='\n  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});';
  const previous=output;
  output=statement+output.replace(anchor,anchor+insertion);
  if(output.slice(statement.length).replace(anchor+insertion,anchor)!==previous)
    throw Error('JH155_GENERAL_WORK_PATCH_SCOPE_CHANGED');
  const once=(before,after)=>{
    if(output.split(before).length!==2)throw Error('JH155_RECOVERY_ADMISSION_ANCHOR_CHANGED');
    output=output.replace(before,after);
  };
  once('function createMcp(){','function createMcp(){'+recoveryHelper);
  once('      dispatchAction:async context=>{',
    '      beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(w.device,w.commandId,record,firstAttempt),\n      dispatchAction:async context=>{');
  once('      dispatchAction:async()=>{',
    '      beforeDispatch:({record,firstAttempt})=>jhOwnerAdmission155(device,commandId,record,firstAttempt),\n      dispatchAction:async()=>{');
  return patchJH155MultiStep(recoveryImport+output);
}
