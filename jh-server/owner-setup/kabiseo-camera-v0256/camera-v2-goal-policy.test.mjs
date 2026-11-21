import test from 'node:test';
import assert from 'node:assert/strict';
import {validStagedV2Goal} from './camera-v2-goal-policy.mjs';
import {validGoal,goalRoute,GOAL_EXTENSION,GOAL_TOOL} from './camera-goal.mjs';
const active=Object.freeze({
 JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE:'EXPLICIT_JH228_CAMERA_V2_STAGE_OPERATOR_V1',
 JH228_CAMERA_V2_UPSTREAM_E2E_GATE:'TRUSTED_HOST_PORTS_AND_DEVICE_VERIFIED_V1',
 JH_DURABLE_RELEASE:'SERVE_READY_V1',
 RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'
});
const ref='camera_reference_001';
const goal=Object.freeze({
 v2Protocol:'JH_AI_CAMERA_V2_REFERENCE_V1',
 referenceId:ref,
 exampleUri:'content://com.koreanlifehub.bridge.kabiseo.mark/ai_camera_examples/'+ref+'.jpg',
 imageSha256:'a'.repeat(64),
 stageLease:'b'.repeat(43),
 stageSize:2048,
 suggestedZoom:1.2
});
test('original camera goal does not admit v2 without explicitly verified E2E operator',()=>{
 assert.equal(validStagedV2Goal(goal,{}),false);
 assert.equal(validGoal(goal),false);
 for(const k of Object.keys(active)){
   const invalid={...active};delete invalid[k];
   assert.equal(validStagedV2Goal(goal,invalid),false);
 }
});
test('exact v2 goal metadata allowed only behind all existing Secure56 gates',()=>{
 assert.equal(validStagedV2Goal(goal,active),true);
 assert.equal(validStagedV2Goal({...goal,suggestedZoom:undefined},active),false);
 assert.equal(validStagedV2Goal({...goal,suggestedZoom:.6},active),true);
 assert.equal(validStagedV2Goal({...goal,suggestedZoom:2},active),true);
 const {suggestedZoom,...withoutZoom}=goal;
 assert.equal(validStagedV2Goal(withoutZoom,active),true);
 const old={
  JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE:process.env.JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE,
  JH228_CAMERA_V2_UPSTREAM_E2E_GATE:process.env.JH228_CAMERA_V2_UPSTREAM_E2E_GATE,
  JH_DURABLE_RELEASE:process.env.JH_DURABLE_RELEASE,
  RENDER_SERVICE_ID:process.env.RENDER_SERVICE_ID
 };
 try{Object.assign(process.env,active);assert.equal(validGoal(goal),true);}
 finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('v2 goal rejects forged URL, oversized or mixed/foreign image content',()=>{
 const cases=[
  {exampleUri:'https://malicious.invalid/example.jpg'},
  {exampleUri:goal.exampleUri.replace('camera_reference_001','another_reference_001')},
  {imageUrl:'https://malicious.invalid/image.jpg'},
  {jpegBase64:'xxx'},
  {source:'foo'},
  {stageLease:'b'.repeat(42)},
  {stageSize:8*1024*1024+1},
  {stageSize:'2048'},
  {imageSha256:'A'.repeat(64)},
  {suggestedZoom:2.1},
  {v2Protocol:'JH_AI_CAMERA_V3_REFERENCE_V1'}
 ];
 for(const change of cases)
   assert.equal(validStagedV2Goal({...goal,...change},active),false,JSON.stringify(change));
});

test('verified JH228 metadata can travel the existing signed apply job type only',()=>{
 const before={};for(const key of Object.keys(active)){before[key]=process.env[key];process.env[key]=active[key];}
 try{
  const payload={mcpToolName:GOAL_TOOL,cameraExtension:GOAL_EXTENSION,
   secureRequestedEffect:'WRITE_REVERSIBLE',operation:'KABISEO_GOAL_APPLY_V1',
   packageName:'com.koreanlifehub.bridge',allowedSideEffect:'kabiseo_goal_apply',
   commandId:'e'.repeat(32),taskDigest:'f'.repeat(64),goal};
  assert.equal(goalRoute('kabiseo_goal_apply',payload,'device'),true);
  assert.equal(goalRoute('kabiseo_goal_stop',{...payload,allowedSideEffect:'kabiseo_goal_stop'},'device'),false);
  assert.equal(goalRoute('kabiseo_goal_apply',{...payload,goal:{...goal,stageLease:'bad'}},'device'),false);
 }finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
