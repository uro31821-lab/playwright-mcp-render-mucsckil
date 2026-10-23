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