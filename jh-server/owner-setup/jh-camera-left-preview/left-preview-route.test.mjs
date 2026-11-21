import test from 'node:test';
import assert from 'node:assert/strict';
import {planLeftPreview,checkLeftPreviewResult,easyThreeLines,oneTurnGate}
 from './left-preview-route.mjs';
const turn={threadId:'current-room-1',sourceRef:'current-message-1',
 utterance:'이 사진처럼 포근하게 촬영할 구도 예시 보여줘',
 attachments:[{id:'current-reference-photo',role:'REFERENCE'}]};
const receipt={threadId:turn.threadId,sourceRef:turn.sourceRef,
 disposition:'camera',reason:'CAPTURE_REQUEST',pendingReadback:false};
const args={turn,routeReceipt:receipt,mood:'포근한 분위기',verifyShootingRoute:()=>true};
test('current shooting reference+mood => camera lead, pyeon helper, LEFT only',()=>{
 const p=planLeftPreview(args);
 assert.equal(p.allowed,true);assert.equal(p.count,1);
 assert.equal(p.lead,'camera');assert.equal(p.collaborator,'photo');
 assert.equal(p.outputPane,'LEFT_GPT');assert.equal(p.deviceTouched,false);
 assert.ok(p.forbidden.includes('ANDROID_IMAGE_TRANSFER'));
 assert.ok(p.cameraMoves.includes('DIAGONAL_45'));
});
test('different chat, stale receipt or uncertain camera action is not a preview',()=>{
 for(const changes of [
  {routeReceipt:{...receipt,sourceRef:'older-message'}},
  {routeReceipt:{...receipt,disposition:'editor',reason:'EXPLICIT_EXISTING_PHOTO_EDIT'}},
  {routeReceipt:{...receipt,pendingReadback:true}},
  {verifyShootingRoute:()=>false}
 ])assert.equal(planLeftPreview({...args,...changes}).allowed,false);
});
test('reference without mood and mood without reference do not generate',()=>{
 assert.equal(planLeftPreview({...args,mood:''}).allowed,false);
 assert.equal(planLeftPreview({...args,turn:{...turn,attachments:[]}}).allowed,false);
 assert.equal(planLeftPreview({...args,turn:{...turn,attachments:[{id:'old',role:'EDITABLE'}]}}).allowed,false);
});
test('multiple refs require primary selection; no foreign attachment',()=>{
 const t={...turn,attachments:[{id:'a',role:'REFERENCE'},{id:'b',role:'REFERENCE'}]};
 assert.equal(planLeftPreview({...args,turn:t}).allowed,false);
 assert.equal(planLeftPreview({...args,turn:t,selection:'foreign'}).allowed,false);
 assert.equal(planLeftPreview({...args,turn:t,selection:'a'}).allowed,true);
});
test('three short child-friendly camera moves (not product relocation)',()=>{
 const ok=['조금 더 가까이 가요.','왼쪽 옆으로 가요.','폰을 살짝 기울여요.'];
 assert.equal(easyThreeLines(ok),true);
 assert.equal(easyThreeLines(['조명을 켜요.','물건을 옮겨요.','폰을 기울여요.']),false);
 assert.equal(easyThreeLines(ok.slice(0,2)),false);
});
test('image generation success is distinct from plan/claimed status',()=>{
 const p=planLeftPreview(args),lines=['가까이 가요.','왼쪽 옆에 서요.','폰을 기울여요.'];
 assert.equal(checkLeftPreviewResult(p,{leftRendered:true,lines}).completed,false);
 assert.equal(checkLeftPreviewResult(p,{imageToolSucceeded:true,lines}).completed,false);
 assert.equal(checkLeftPreviewResult(p,{imageToolSucceeded:true,leftRendered:true,lines}).completed,true);
});
test('clipboard, right transfer or remote AUTO are forbidden',()=>{
 const p=planLeftPreview(args),lines=['가까이 가요.','왼쪽 옆에 서요.','폰을 기울여요.'];
 assert.equal(checkLeftPreviewResult(p,{imageToolSucceeded:true,leftRendered:true,lines,rightTransferAttempted:true}).completed,false);
 for(const f of ['SECURE56_STAGE','SIGNED_GOAL_APPLY','PAID_IMAGE_API','REMOTE_AUTO','SHUTTER'])
  assert.ok(p.forbidden.includes(f));
});
test('same current reference message cannot be generated twice',()=>{
 const once=oneTurnGate(),p=planLeftPreview(args);
 assert.equal(once.claim(p).claimed,true);assert.equal(once.claim(p).claimed,false);
 const next=planLeftPreview({...args,turn:{...turn,sourceRef:'new-message'},routeReceipt:{...receipt,sourceRef:'new-message'}});
 assert.equal(once.claim(next).claimed,true);
});
