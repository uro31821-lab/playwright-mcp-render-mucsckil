/**
 * JH228 candidate: current-turn capture -> actual image generator -> LEFT
 * receipt -> one-shot Secure56 staged JPEG -> signed camera-goal APPLY.
 *
 * This file contains NO generator, ChatGPT rendering, device, or credentials.
 * Missing real host ports fail closed; simulated callbacks are tests ONLY.
 * Do NOT wire into the default Render listener or auto-press native AUTO.
 */
import {randomBytes, createHash} from 'node:crypto';
import {createJH228HostDeliveryPorts} from './camera-v2-verified-host-ports.mjs';
import {inspectJpegHeader56} from '../../camera-v2-secure-stage.mjs';
import {validStagedV2Goal} from './camera-v2-goal-policy.mjs';

const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&x.trim().length>0&&x.length<=1024;
const HEX64=/^[a-f0-9]{64}$/,HEX32=/^[a-f0-9]{32}$/,SESSION=/^[A-Za-z0-9_-]{16,160}$/;
const OUT={copyPasteOperations:0,autoClickedByHost:false,shutterTriggeredByHost:false};
const stop=(code,extra={})=>({ok:false,code,...OUT,...extra});
const sha=b=>createHash('sha256').update(b).digest('hex');
const PRODUCT=/((제품|피사체|소품|물건|배경|조명|램프|불)(을|를|은|는|도)?)\s*.{0,16}(옮기|움직이|밀어|돌리|바꿔|켜|꺼|놓아|치워)/u;
const CAMERA=/(폰|핸드폰|휴대폰|카메라|렌즈|위치|시점|각도|기울|비스듬|사선|대각|옆|왼쪽|오른쪽|가까이|멀리|앞|뒤|위|아래|올려|내려|비켜|걸음|회전|정면|측면|돌아서|비틀)/u;
const ACTION=/(가요|서요|해요|봐요|올려|내려|움직|기울|돌아|비틀|비켜|찍|들어|옮겨|맞춰)/u;
export function validEasyCameraLines(lines){
  return Array.isArray(lines)&&lines.length===3&&lines.every(line=>
    typeof line==='string'&&line.trim()===line&&line.length>=5&&line.length<=40&&
    !/[\r\n<>]/u.test(line)&&!PRODUCT.test(line)&&CAMERA.test(line)&&ACTION.test(line));
}
function currentTurn(t){
  return obj(t)&&id(t.threadId)&&id(t.sourceRef)&&typeof t.utterance==='string'&&
    t.utterance.length>0&&t.utterance.length<=16000&&Array.isArray(t.attachments)&&
    t.attachments.length===1&&id(t.attachments[0]?.id)&&t.attachments[0]?.role==='REFERENCE';
}
function validSignedScope(x,t){
  return obj(x)&&x.verifiedByHost===true&&x.verifiedBySecure56===true&&
    x.threadId===t.threadId&&x.sourceRef===t.sourceRef&&
    x.referenceAttachmentId===t.attachments[0].id&&
    x.cameraSessionStatus!=='ENDED'&&x.hasUnresolvedExternalEffect!==true&&
    SESSION.test(x.secureSessionId??'')&&HEX64.test(x.deviceDigest??'')&&
    HEX64.test(x.taskDigest??'')&&HEX32.test(x.commandId??'');
}
const required=[
  ['readCurrentTurn','CURRENT_TURN_PORT_NOT_CONNECTED'],
  ['routeShootingTurn','JH_ROUTE_PORT_NOT_CONNECTED'],
  ['verifyShootingRoute','JH_VERIFY_PORT_NOT_CONNECTED'],
  ['interpretShooting','JH_INTERPRETER_NOT_CONNECTED'],
  ['readSignedCapture','SECURE56_CAPTURE_PORT_NOT_CONNECTED'],
  ['resolveActiveSignedSession','SECURE56_ACTIVE_SESSION_PORT_NOT_CONNECTED'],
  ['claimOneShot','JH228_DURABLE_ONCE_PORT_NOT_CONNECTED'],
  ['createSingleExample','PYEONBISEO_GENERATOR_NOT_CONNECTED'],
  ['renderInLeftChat','LEFT_GPT_OUTPUT_NOT_CONNECTED'],
  ['verifyLeftPresentationReceipt','LEFT_GPT_RECEIPT_VERIFIER_NOT_CONNECTED'],
  ['applySignedGoal','SIGNED_CAMERA_GOAL_NOT_CONNECTED'],
];
export function createJH228CameraV2Pipeline(ports={},options={}){
  const env=options.env??process.env,store=options.stageStore;
  const now=typeof options.now==='function'?options.now:Date.now;
  if(!store||typeof store.stageVerifiedJpeg!=='function')
    throw Error('JH228_INTERNAL_STAGE_STORE_REQUIRED');
  return Object.freeze({
    async run({mood}={}){
      if(typeof mood!=='string'||!mood.trim()||mood.trim().length>160)
        return stop('V2_MOOD_REQUIRED');
      for(const [name,code] of required)
        if(typeof ports[name]!=='function')return stop(code);
      let turn;
      try{turn=await ports.readCurrentTurn();}catch{return stop('JH_CURRENT_TURN_READ_FAILED');}
      if(!currentTurn(turn))return stop('JH_CURRENT_REFERENCE_TURN_REQUIRED');
      let route;
      try{
        route=await ports.routeShootingTurn(turn,ports.interpretShooting);
        if(route?.disposition!=='camera'||route?.reason!=='CAPTURE_REQUEST'||
           route?.pendingReadback===true||route?.threadId!==turn.threadId||
           route?.sourceRef!==turn.sourceRef||
           await ports.verifyShootingRoute(turn,route)!==true)
          return stop('JH_ROUTE_RECEIPT_NOT_VERIFIED');
      }catch{return stop('JH_ROUTE_RECEIPT_NOT_VERIFIED');}
      let scope;
      try{scope=await ports.readSignedCapture({
        threadId:turn.threadId,sourceRef:turn.sourceRef,
        referenceAttachmentId:turn.attachments[0].id
      });}catch{return stop('SECURE56_SIGNED_CAPTURE_UNAVAILABLE');}
      if(!validSignedScope(scope,turn))return stop('SECURE56_SIGNED_CAPTURE_UNVERIFIED');
      // Deny before consuming the journal if operator / E2E gate is missing.
      const referenceProbe={
        v2Protocol:'JH_AI_CAMERA_V2_REFERENCE_V1',
        referenceId:'reference_probe_001',stageLease:'b'.repeat(43),
        imageSha256:'a'.repeat(64),stageSize:512,
        exampleUri:'content://com.koreanlifehub.bridge.kabiseo.mark/ai_camera_examples/reference_probe_001.jpg'
      };
      if(!validStagedV2Goal(referenceProbe,env))
        return stop('JH228_OPERATOR_E2E_GATE_NOT_VERIFIED');
      let claim;
      try{claim=await ports.claimOneShot({
        threadId:turn.threadId,sourceRef:turn.sourceRef,
        commandId:scope.commandId,taskDigest:scope.taskDigest,
        deviceDigest:scope.deviceDigest,secureSessionId:scope.secureSessionId
      });}catch{return stop('JH228_ONCE_CLAIM_UNCERTAIN');}
      if(claim?.claimed!==true)return stop('JH228_ALREADY_CLAIMED_OR_UNCERTAIN');
      // From here, no automatic retries. An unknown downstream effect keeps
      // the durable claim reserved; any future attempt requires reconciliation.
      let image;
      try{
        image=await ports.createSingleExample({
          source:{id:turn.attachments[0].id,role:'REFERENCE'},
          mood:mood.trim(),count:1,
          conservation:'ORIGINAL_OBJECT_AND_BACKGROUND',
          cameraViewpointChangesAllowed:true
        });
      }catch{return stop('PYEONBISEO_GENERATION_UNCONFIRMED');}
      if(!obj(image)||image.count!==1||image.sourceReferenceId!==turn.attachments[0].id||
         !Buffer.isBuffer(image.jpegBytes)||!validEasyCameraLines(image.movementLines)||
         (image.suggestedZoom!=null&&(!Number.isFinite(image.suggestedZoom)||
           image.suggestedZoom<.6||image.suggestedZoom>2)))
        return stop('PYEONBISEO_RESULT_INVALID');
      const dims=inspectJpegHeader56(image.jpegBytes);
      if(!dims)return stop('PYEONBISEO_JPEG_INVALID');
      const signedScope={
        secureSessionId:scope.secureSessionId,
        deviceDigest:scope.deviceDigest,
        taskDigest:scope.taskDigest,commandId:scope.commandId
      };
      const host=createJH228HostDeliveryPorts({
        currentTurn:{threadId:turn.threadId,sourceRef:turn.sourceRef,
          referenceAttachmentId:turn.attachments[0].id},
        signedScope,resolveActiveSignedSession:ports.resolveActiveSignedSession,
        renderInLeftChat:ports.renderInLeftChat,
        verifyLeftPresentationReceipt:ports.verifyLeftPresentationReceipt,store,now
      });
      const displayed=await host.chat.showLeft({
        sourceReferenceId:turn.attachments[0].id,exampleJpeg:image.jpegBytes,
        lines:image.movementLines,
        caption:'AI가 만든 구도 예시 · 실제 사진과 다를 수 있어요',
        referenceIsSimulated:true
      });
      if(displayed.shown!==true)return stop('LEFT_GPT_PRESENTATION_NOT_VERIFIED');
      const referenceId=randomBytes(16).toString('hex');
      const staged=await host.imageStage.stageVerifiedJpeg({
        threadId:turn.threadId,referenceId,bytes:image.jpegBytes,
        size:image.jpegBytes.length,sha256:sha(image.jpegBytes),dimensions:dims,
        ...signedScope
      });
      if(staged.acknowledged!==true||staged.referenceId!==referenceId||
         staged.sha256!==sha(image.jpegBytes)||
         staged.deviceDigest!==scope.deviceDigest||
         staged.secureSessionId!==scope.secureSessionId||
         staged.taskDigest!==scope.taskDigest||staged.commandId!==scope.commandId||
         !Number.isSafeInteger(staged.expiresAtMs)||
         staged.expiresAtMs<=now()||staged.expiresAtMs>now()+30000)
        return stop('SECURE56_IMAGE_STAGE_NOT_VERIFIED',{exampleShown:true});
      const goal={
        v2Protocol:'JH_AI_CAMERA_V2_REFERENCE_V1',referenceId,
        exampleUri:'content://com.koreanlifehub.bridge.kabiseo.mark/ai_camera_examples/'+referenceId+'.jpg',
        imageSha256:staged.sha256,stageLease:staged.stageLease,stageSize:staged.size,
        ...(image.suggestedZoom==null?{}:{suggestedZoom:image.suggestedZoom})
      };
      if(!validStagedV2Goal(goal,env))return stop('JH228_GOAL_METADATA_INVALID',{exampleShown:true});
      let result;
      try{
        result=await ports.applySignedGoal({
          tool:'life_android_camera_goal_v1',action:'apply',
          camera_command_id:scope.commandId,task_digest:scope.taskDigest,
          deviceDigest:scope.deviceDigest,secureSessionId:scope.secureSessionId,
          goal
        });
      }catch{return stop('CAMERA_GOAL_RESULT_UNKNOWN',{exampleShown:true});}
      if(result?.ok!==true||result.code!=='V2_REFERENCE_APPLIED'||
         result.referenceId!==referenceId||result.referenceVisible!==true||
         result.autoArmed!==false||result.instructionsLocation!=='LEFT_GPT_ONLY')
        return stop('CAMERA_REFERENCE_APPLY_NOT_VERIFIED',{exampleShown:true});
      return {ok:true,code:'EXAMPLE_APPLIED_AWAIT_LOCAL_AUTO',exampleShown:true,
        phoneReferenceVisible:true,referenceId,lines:[...image.movementLines],...OUT};
    }
  });
}
