import test from 'node:test';
import assert from 'node:assert/strict';
import {GOAL_EXTENSION,GOAL_TOOL,validGoal,goalRoute,createGoalHost} from './camera-goal.mjs';
import {createCameraHostIntegration} from './camera-host-integration.mjs';
import {BASE_CATALOG_DIGEST,EXPECTED_PACKAGE} from './camera-contract.mjs';
const now=1000;
const goal=()=>({id:'1'.repeat(32),sessionId:'activity:1',frameId:'2'.repeat(32),subject:'검정 안경',
 source:{left:.3,top:.4,right:.7,bottom:.6},target:{left:.1,top:.5,right:.5,bottom:.7},
 zoom:1,aspect:1.5,mode:'GENERAL',style:'REFINED@30',presetId:'P01',expiresAt:10000,
 movementLines:['안경이 왼쪽 ⅓ 지점에 오도록 휴대폰을 오른쪽으로 옮기세요.','안경테 높이까지 카메라를 낮추세요.','목표 크기에 맞춰 가까이 이동한 뒤 고정하세요.']});
const payload=action=>({taskId:'a'.repeat(64),taskDigest:'a'.repeat(64),commandId:'b'.repeat(32),targetDeviceDigest:'c'.repeat(64),
 effect:'READ_ONLY',action:'',index:0,viewportWidth:0,viewportHeight:0,scrollX:0,scrollY:0,waitMs:0,dataClass:'NONE',maxActionsInCall:20,
 secureInvocationExpiresAt:20000,containsCredential:false,mcpToolName:GOAL_TOOL,packageName:EXPECTED_PACKAGE,cameraExtension:GOAL_EXTENSION,
 operation:`KABISEO_GOAL_${action.toUpperCase()}_V1`,allowedSideEffect:`kabiseo_goal_${action}`,secureRequestedEffect:['frame','status'].includes(action)?'READ_ONLY':'WRITE_REVERSIBLE',
 ...(action==='apply'?{goal:goal()}:{}),...(action==='frame'?{frameUploadLease:'fresh-lease'}:{})});
const host=()=>createGoalHost({getCatalogDigest:()=>BASE_CATALOG_DIGEST,runSecure:async()=>{},now:()=>now});
test('off-center goal survives the public contract exactly',()=>{const g=goal();assert.ok(validGoal(g,now));assert.equal(g.target.left,.1);assert.equal(g.presetId,'P01');});
test('expired, unbounded, injected and malformed goals cannot apply',()=>{
 for(const g of [{...goal(),expiresAt:now},{...goal(),expiresAt:now+900001},{...goal(),zoom:NaN},{...goal(),photoBytes:'x'},
 {...goal(),target:{left:-.2,top:.2,right:.5,bottom:.6}},{...goal(),movementLines:['one','two']},{...goal(),movementLines:['one\ntwo','b','c']}])assert.equal(validGoal(g,now),false);
});
test('signed scope distinguishes read from goal apply and keeps photos out of completion payload',()=>{
 const p=payload('apply');assert.equal(goalRoute('kabiseo_goal_apply',p,'phone',now),true);
 assert.equal(goalRoute('kabiseo_goal_apply',{...p,secureRequestedEffect:'READ_ONLY'},'phone',now),false);
 assert.equal(goalRoute('kabiseo_goal_apply',{...p,jpegBase64:'pixels'},'phone',now),false);
 assert.equal(goalRoute('kabiseo_goal_apply',{...p,cameraExtension:{...GOAL_EXTENSION,digest:'0'.repeat(64)}},'phone',now),false);
});
test('durable receipt journals only goal digest; cannot use the old camera scope',()=>{
 const p=payload('apply');const result=host().classify({...p,type:'kabiseo_goal_apply'},p);
 assert.equal(result.kind,'JOURNAL');assert.equal(result.approvalGranted,false);
 assert.equal(JSON.stringify(result).includes('검정 안경'),false);
 assert.equal(host().classify({...p,type:'kabiseo_goal_apply'},{...p,unexpected:true}).kind,'DENY');
 const legacy={...p,cameraExtension:{id:'jh.kabiseo.camera',version:1,digest:'0'.repeat(64)}};
 assert.equal(host().classify({...legacy,type:'kabiseo_goal_apply'},legacy).kind,'DENY');
});
test('real camera integration validates both dispatch and classification paths',()=>{
 const h=createCameraHostIntegration({getCatalogDigest:()=>BASE_CATALOG_DIGEST,runSecure:async()=>{},now:()=>now});
 for(const action of ['frame','apply','status','start','stop']){
  const p=payload(action),job={...p,type:`kabiseo_goal_${action}`};
  h.beforeMk(job.type,p,'phone');assert.equal(h.beforeDispatch(job).allowed,true);assert.notEqual(h.classify(job,p).kind,'DENY');
  assert.equal(h.beforeDispatch({...job,secureRequestedEffect:'BAD'}).allowed,false);
 }
});
const spec=()=>({optional:spec,length:spec,min:spec,max:spec});const z={string:spec,record:spec,unknown:spec,enum:spec};
test('frame uses ephemeral image port and mutations never auto-retry on timeout',async()=>{
 let handler,calls=0,frames=0;
 createGoalHost({getCatalogDigest:()=>BASE_CATALOG_DIGEST,now:()=>now,
  runSecure:async()=>{calls++;throw Error('secret');},runSecureFrame:async req=>{frames++;return {content:[{type:'image',mimeType:'image/jpeg',data:'local-fixture'}]};}
 }).register({z,registerOAuthTool:(_,__,cb)=>handler=cb,textResult:v=>v});
 const args={task_digest:'a'.repeat(64),camera_command_id:'b'.repeat(32),action:'frame'};
 assert.equal((await handler(args)).content[0].type,'image');assert.equal(calls,0);assert.equal(frames,1);
 const r=await handler({...args,action:'apply',goal:goal()});
 assert.equal(calls,1);assert.equal(r.automaticReplayAllowed,false);assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('a client cannot smuggle a goal through a read operation',async()=>{
 let handler,calls=0;
 createGoalHost({getCatalogDigest:()=>BASE_CATALOG_DIGEST,now:()=>now,runSecure:async()=>{calls++;}})
 .register({z,registerOAuthTool:(_,__,cb)=>handler=cb,textResult:v=>v});
 const r=await handler({task_digest:'a'.repeat(64),camera_command_id:'b'.repeat(32),action:'status',goal:goal()});
 assert.equal(r.ok,false);assert.equal(calls,0);
});
test('remote arm is rejected even with an otherwise valid signed scope',async()=>{
 assert.equal(goalRoute('kabiseo_goal_arm',payload('arm'),'phone',now),false);
 let handler,calls=0;
 createGoalHost({getCatalogDigest:()=>BASE_CATALOG_DIGEST,now:()=>now,runSecure:async()=>{calls++;}})
 .register({z,registerOAuthTool:(_,__,cb)=>handler=cb,textResult:v=>v});
 const result=await handler({task_digest:'a'.repeat(64),camera_command_id:'b'.repeat(32),action:'arm',goal_id:'1'.repeat(32)});
 assert.equal(result.ok,false);assert.equal(calls,0);
});
