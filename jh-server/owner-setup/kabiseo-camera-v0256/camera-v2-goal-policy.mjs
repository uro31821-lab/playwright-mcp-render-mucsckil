// JH228 v2 metadata-only compatibility. Never changes the sealed v1 goal format.
const HEX=/^[a-f0-9]{64}$/;
const REF=/^[A-Za-z0-9_-]{16,64}$/;
const LEASE=/^[A-Za-z0-9_-]{43}$/;
const PROTOCOL='JH_AI_CAMERA_V2_REFERENCE_V1';
const ENABLE='EXPLICIT_JH228_CAMERA_V2_STAGE_OPERATOR_V1';
const E2E='TRUSTED_HOST_PORTS_AND_DEVICE_VERIFIED_V1';
const SERVICE='srv-db0fjl2d0e5s73be114g';
export function validStagedV2Goal(goal,env=process.env){
 if(env?.JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE!==ENABLE||
    env?.JH228_CAMERA_V2_UPSTREAM_E2E_GATE!==E2E||
    env?.JH_DURABLE_RELEASE!=='SERVE_READY_V1'||env?.RENDER_SERVICE_ID!==SERVICE)
   return false;
 if(!goal||typeof goal!=='object'||Array.isArray(goal))return false;
 const required=['v2Protocol','referenceId','exampleUri','imageSha256','stageLease','stageSize'];
 const keys=Object.keys(goal);
 if((keys.length!==6&&keys.length!==7)||
    keys.some(k=>!required.includes(k)&&k!=='suggestedZoom')||
    required.some(k=>!Object.hasOwn(goal,k)))return false;
 if(goal.v2Protocol!==PROTOCOL||typeof goal.referenceId!=='string'||!REF.test(goal.referenceId)||
    typeof goal.imageSha256!=='string'||!HEX.test(goal.imageSha256)||
    typeof goal.stageLease!=='string'||!LEASE.test(goal.stageLease)||
    !Number.isSafeInteger(goal.stageSize)||goal.stageSize<64||goal.stageSize>8*1024*1024||
    goal.exampleUri!=='content://com.koreanlifehub.bridge.kabiseo.mark/ai_camera_examples/'+goal.referenceId+'.jpg')
   return false;
 return !Object.hasOwn(goal,'suggestedZoom')||
   Number.isFinite(goal.suggestedZoom)&&goal.suggestedZoom>=.6&&goal.suggestedZoom<=2;
}
