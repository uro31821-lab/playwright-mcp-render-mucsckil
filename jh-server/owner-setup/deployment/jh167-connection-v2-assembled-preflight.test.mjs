/** Real JH owner generated-source preflight. Never opens a network listener,
 * writes production state, changes permissions, replays jobs, or installs an APK.
 * This would have caught the literal \\n template insertion in release #26.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from './durable-clean-restart-news-review-entry.mjs';

const root=path.resolve(import.meta.dirname,'..');
const parse=(file)=>{
 const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,'Assembled Node syntax failed in '+path.basename(file)+'\n'+result.stderr);
};
test('known literal backslash-n corrupted source is rejected',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'jh-v2-syntax-'));
 const file=path.join(dir,'invalid.mjs');
 try {
  writeFileSync(file,'const proof={ok:true,\\\\n corrupt:true};\n');
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.notEqual(r.status,0,'Guard must reject literal \\n in JavaScript source');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('ACTUAL protected owner composition generates parsable and importable runtime without listening',async()=>{
 const release=buildCleanRestartRelease56();
 parse(release.file);
 const mod=await import(pathToFileURL(release.file).href);
 assert.equal(typeof mod.buildDurableRoutedOperationalEntrypoint,'function');
 const compiled=mod.buildDurableRoutedOperationalEntrypoint(root);
 const paths=[release.file,compiled.runtimeFile,compiled.ownerFile,compiled.unifiedFile,compiled.file];
 for(const file of new Set(paths)){
   assert.equal(typeof file,'string');
   parse(file);
 }
 const generated=readFileSync(compiled.runtimeFile,'utf8');
 assert.ok(generated.includes('jhV2Install56();'));
 assert.ok(generated.includes('lastRecoveryEvent:v.lastRecoveryEvent'));
 assert.ok(generated.includes('JH_CONNECTION_V2_EVENT'));
 const serviceStart=generated.indexOf('  registerOAuthTool("life_open_service",{');
 const serviceEnd=generated.indexOf('  registerOAuthTool("life_naver_mail",{',serviceStart);
 assert.ok(serviceStart>=0&&serviceEnd>serviceStart);
 const route=generated.slice(serviceStart,serviceEnd);
 assert.equal(route.split('target:"right_web_link",url}').length-1,1);
 assert.equal(route.split('target:"right_web_link",url:raw}').length-1,1);
 assert.equal(route.includes('target:"chrome",url}'),false);
 assert.equal(route.includes('target:"chrome",url:raw}'),false);
 assert.ok(route.includes('page/service/service/KakaoTalk'));
 assert.ok(route.includes('page/service/service/KakaoT'));
 assert.ok(route.includes('music.youtube.com/'));
 assert.ok(route.indexOf('music.youtube.com/')<route.indexOf('https://www.youtube.com'));

 // The actual assembled owner must NEVER select another session or native app
 // for an ordinary website-open request, including Kakao-branded names.
 assert.ok(route.includes('jhRightWebOpen56=async({service})'));
 assert.ok(route.includes('RIGHT_WEB_URL_NOT_MAPPED'));
 assert.ok(!route.includes('target:"카카오T"'));
 assert.ok(!route.includes('browserTool("browser_navigate"'));
 const mailStart=generated.indexOf('  registerOAuthTool("life_naver_mail",{');
 const navigateStart=generated.indexOf('  registerOAuthTool("life_web_navigate",{',mailStart);
 const mail=generated.slice(mailStart,navigateStart);
 assert.ok(mail.includes('jhRightWebOpen56({service:"네이버 메일"})'));
 assert.ok(!mail.includes('browserTool('));
 const starterStart=generated.indexOf('  registerOAuthTool("life_android_open_and_snapshot",{');
 const stepStart=generated.indexOf('  registerOAuthTool("life_android_step_and_snapshot",{',starterStart);
 const starter=generated.slice(starterStart,stepStart);
 assert.ok(starter.includes('jhRightWebOpen56({service:'));
 assert.ok(!starter.includes('mk("open_url"'));
 const androidStart=generated.indexOf('  registerOAuthTool("life_android_open",{');
 const schemaStart=generated.indexOf('  const cuSchema56={',androidStart);
 const android=generated.slice(androidStart,schemaStart);
 assert.ok(android.includes('jhRightWebOpen56({service:raw})'));
 assert.ok(!android.includes('browserTool('));
 const routeStart=generated.indexOf('  registerOAuthTool("life_route",{');
 const routeEnd=generated.indexOf('  registerOAuthTool("life_open_service",{',routeStart);
 const routing=generated.slice(routeStart,routeEnd);
 assert.ok(routing.includes('const nativeHints=[]'));
 assert.ok(routing.includes('life_android_split_screen_assistant START'));
 const clickStart=generated.indexOf('  registerOAuthTool("life_web_click",{');
 const typeStart=generated.indexOf('  registerOAuthTool("life_web_type",{',clickStart);
 const click=generated.slice(clickStart,typeStart);
 // Legacy execution remains intact when the temporary candidate mode is OFF.
 // Explicit mobile test mode alone removes the cloud Playwright CLICK route.
 const migrationEnabled=process.env.JH_MOBILE_WEB_13_MODE==='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
 if(migrationEnabled){
   assert.ok(click.includes('jhMobileWebFollow56(args,"CLICK"'));
   assert.ok(!click.includes('browserTool("browser_click",args)'));
   assert.ok(generated.includes('MOBILE_REQUEST_ID_REQUIRED'));
   assert.ok(generated.includes('requestId,command,targetItemRef:bound.itemRef,action'));
   assert.ok(generated.includes('jhSplitScreenOnce155(device,commandId,type,payload,dispatch)'));
 }else{
   assert.ok(click.includes('RIGHT_PHONE_ITEM_REQUIRES_ANDROID_COMPUTER_USE'));
   assert.ok(click.includes('browserTool("browser_click",args)'));
   assert.ok(!generated.includes('MOBILE_REQUEST_ID_REQUIRED'));
 }
 assert.ok(generated.includes('registerOAuthTool("life_android_computer_prepare"'));
 assert.ok(generated.includes('registerOAuthTool("life_android_execute_computer_action"'));
 assert.ok(generated.includes('registerOAuthTool("life_android_split_screen_assistant"') ||
   generated.includes("registerOAuthTool('life_android_split_screen_assistant'"));


 // An import-time probe is closer to the actual production boot than checking
 // the patch-transformation source alone. The owner is explicitly DEFERRED.
 const script='const s=await import('+JSON.stringify(pathToFileURL(compiled.runtimeFile).href)+');'+
   'if(s.httpServer?.listening)throw Error("UNEXPECTED_PRODUCTION_LISTENER");';
 const run=spawnSync(process.execPath,['--input-type=module','-e',script],{
   cwd:root,encoding:'utf8',timeout:20000,
   env:{...process.env,JH_OWNER_DEFER_LISTEN:'1',JH_CONNECTION_V2_RECOVERY:'0',
     JH_OAUTH_STATE_FILE:path.join(os.tmpdir(),'jh-v2-preflight-nonexistent-state.json')}
 });
 assert.equal(run.status,0,'Deferred generated owner import failed: '+run.stderr.slice(0,1800));
});