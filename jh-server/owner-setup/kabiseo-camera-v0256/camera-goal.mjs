import {createHash} from 'node:crypto';
import {BASE_CATALOG_DIGEST,EXPECTED_PACKAGE} from './camera-contract.mjs';
export const GOAL_TOOL='life_android_camera_goal_v1';
export const actions=Object.freeze({frame:'READ_ONLY',status:'READ_ONLY',apply:'WRITE_REVERSIBLE',start:'WRITE_REVERSIBLE',stop:'WRITE_REVERSIBLE'});
export const GOAL_CONTRACT=Object.freeze({id:'jh.kabiseo.goal',version:1,tool:GOAL_TOOL,actions,
  frame:'foreground_camera_only_local_consent_ephemeral_signed_upload',goal:'exact_observed_frame_subject_bounds_target_bounds_zoom_mode_style_three_lines',
  shutter:'local_user_auto_button_then_goal_bound_one_shot_after_alignment_focus_quality',forbidden:['gallery_read','automatic_replay','raw_pixels_in_completion','unbound_goal','focus_only_capture','remote_arm']});
export const GOAL_EXTENSION=Object.freeze({id:GOAL_CONTRACT.id,version:1,digest:createHash('sha256').update(JSON.stringify(GOAL_CONTRACT)).digest('hex')});
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hex=(v,n)=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v);
const str=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/u.test(v);
const box=v=>exact(v,['left','top','right','bottom'])&&Object.values(v).every(Number.isFinite)&&v.left>=0&&v.top>=0&&v.right<=1&&v.bottom<=1&&v.right-v.left>=.06&&v.bottom-v.top>=.06;
export function validGoal(g,now=Date.now()){
  return exact(g,['id','sessionId','frameId','subject','source','target','zoom','aspect','mode','style','presetId','expiresAt','movementLines'])&&
    hex(g.id,32)&&hex(g.frameId,32)&&str(g.sessionId,240)&&str(g.subject,80)&&box(g.source)&&box(g.target)&&
    g.target.left>=.02&&g.target.top>=.02&&g.target.right<=.98&&g.target.bottom<=.98&&
    Number.isFinite(g.zoom)&&g.zoom>0&&g.zoom<=20&&Number.isFinite(g.aspect)&&g.aspect>=.4&&g.aspect<=3&&
    ['GENERAL','FOOD','PORTRAIT','LANDSCAPE','NIGHT','CLOSEUP_DOCUMENT'].includes(g.mode)&&str(g.style,96)&&
    /^(P(0[1-9]|1[0-8])|X0[1-8])$/.test(g.presetId)&&Number.isSafeInteger(g.expiresAt)&&g.expiresAt>now&&g.expiresAt-now<=900000&&
    Array.isArray(g.movementLines)&&g.movementLines.length===3&&g.movementLines.every(x=>str(x,100));
}
export function goalSignal(type,payload){return GOAL_TOOL===payload?.mcpToolName||String(type||'').startsWith('kabiseo_goal_')||payload?.cameraExtension?.id===GOAL_EXTENSION.id;}
export function goalRoute(type,payload,device,now=Date.now()){
  if(!goalSignal(type,payload))return null;
  const action=String(type).replace(/^kabiseo_goal_/,'');
  if(!Object.hasOwn(actions,action)||payload?.mcpToolName!==GOAL_TOOL||
     !exact(payload.cameraExtension,['id','version','digest'])||Object.keys(GOAL_EXTENSION).some(k=>payload.cameraExtension[k]!==GOAL_EXTENSION[k])||
     payload.secureRequestedEffect!==actions[action]||payload.operation!==`${type.toUpperCase()}_V1`||
     payload.packageName!==EXPECTED_PACKAGE||payload.allowedSideEffect!==type||!hex(payload.commandId,32)||!hex(payload.taskDigest,64))return false;
  if(action==='apply'&&!validGoal(payload.goal,now))return false;
  if(action!=='apply'&&Object.hasOwn(payload,'goal'))return false;
  if(Object.hasOwn(payload,'goalId'))return false;
  if(action==='frame'&&!str(payload.frameUploadLease,120))return false;
  if(action!=='frame'&&Object.hasOwn(payload,'frameUploadLease'))return false;
  if(['photoBytes','rawImage','imageUrl','jpegBase64','_frameBytesLocal'].some(k=>Object.hasOwn(payload,k)))return false;
  return true;
}
export function createGoalHost({getCatalogDigest,runSecure,runSecureFrame,now=Date.now}){
  function validate(type,payload,device){
    const verdict=goalRoute(type,payload,device,now());
    if(verdict===null)return null;
    return verdict&&getCatalogDigest()===BASE_CATALOG_DIGEST;
  }
  return {
    validate,
    classify(job,payload){
      if(!goalSignal(job?.type,payload))return null;
      const allowed=new Set(['taskId','effect','action','index','viewportWidth','viewportHeight','scrollX','scrollY','waitMs','dataClass','maxActionsInCall','mcpToolName','taskDigest','targetDeviceDigest','secureRequestedEffect','secureInvocationExpiresAt','containsCredential','commandId','operation','packageName','cameraExtension','allowedSideEffect','goal','frameUploadLease']);
      if(!validate(job.type,payload)||!record(payload)||Object.keys(payload).some(k=>!allowed.has(k))||payload.containsCredential!==false||
         payload.dataClass!=='NONE'||payload.taskId!==payload.taskDigest||!hex(payload.targetDeviceDigest,64)||
         payload.effect!=='READ_ONLY'||payload.action!==''||payload.maxActionsInCall!==20||
         !['index','viewportWidth','viewportHeight','scrollX','scrollY','waitMs'].every(k=>payload[k]===0)||
         !Number.isSafeInteger(payload.secureInvocationExpiresAt)||payload.secureInvocationExpiresAt<=now()||
         job.mcpToolName!==GOAL_TOOL||job.secureRequestedEffect!==payload.secureRequestedEffect||
         !exact(job.cameraExtension,['id','version','digest'])||Object.keys(GOAL_EXTENSION).some(k=>job.cameraExtension[k]!==GOAL_EXTENSION[k]))
        return {kind:'DENY',code:'GOAL_ENVELOPE_REJECTED'};
      if(payload.secureRequestedEffect==='READ_ONLY')return {kind:'READ'};
      return {kind:'JOURNAL',identityPayload:{operation:payload.operation,commandId:payload.commandId,taskDigest:payload.taskDigest,
        targetDeviceDigest:payload.targetDeviceDigest,goalDigest:createHash('sha256').update(JSON.stringify(payload.goal??null)).digest('hex')},approvalGranted:false,screenConsentGranted:false};
    },
    register({z,registerOAuthTool,textResult}){
      registerOAuthTool(GOAL_TOOL,{
        title:'카비서 현재 화면·GPT 구도·시작 종료',
        description:'Use start/frame/apply/status/stop. frame reads only the locally enabled visible right camera through an ephemeral signed image upload. GPT reads it, chooses subject/target bounds, zoom, style, mode and exactly three physical movement lines. Verify settings with status and deliver the three lines. ONLY the user pressing the native AUTO button starts capture waiting. There is no remote arm or shutter action. Same start/stop functions as Chopper switch. Never retry an unconfirmed mutation automatically.',
        inputSchema:{device_id:z.string().optional(),task_digest:z.string(),camera_command_id:z.string().length(32),action:z.enum(Object.keys(actions)),
          goal:z.record(z.string(),z.unknown()).optional()},
        annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
      },async args=>{
        try {
          if(!hex(args.camera_command_id,32)||!hex(args.task_digest,64)||!Object.hasOwn(actions,args.action))return textResult({ok:false,code:'GOAL_ARGUMENTS_REJECTED'});
          if(args.action==='apply'&&!validGoal(args.goal,now()))return textResult({ok:false,code:'GOAL_INVALID'});
          if(args.action!=='apply'&&args.goal!==undefined||args.goal_id!==undefined)return textResult({ok:false,code:'GOAL_UNEXPECTED_FIELDS'});
          const type=`kabiseo_goal_${args.action}`;
          const req={mcpToolName:GOAL_TOOL,jobType:type,effect:actions[args.action],args:{device_id:args.device_id,task_digest:args.task_digest,command_id:args.camera_command_id},
            extra:{commandId:args.camera_command_id,operation:`${type.toUpperCase()}_V1`,packageName:EXPECTED_PACKAGE,cameraExtension:GOAL_EXTENSION,allowedSideEffect:type,
              ...(args.action==='apply'?{goal:args.goal}:{})}};
          if(args.action==='frame')return typeof runSecureFrame==='function'?await runSecureFrame(req):textResult({ok:false,code:'GOAL_FRAME_PORT_UNAVAILABLE'});
          const outcome=await runSecure(req);
          return textResult(outcome?.result??{ok:false,code:'GOAL_RESULT_UNCONFIRMED',automaticReplayAllowed:false});
        }catch{return textResult({ok:false,code:'GOAL_RESULT_UNCONFIRMED',automaticReplayAllowed:false});}
      });
    }
  };
}
