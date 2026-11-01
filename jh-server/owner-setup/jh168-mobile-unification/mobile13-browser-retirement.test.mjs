import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMobile13BrowserRetirement56 as audit,MOBILE13_TOOL_NAMES56 as names}
 from './mobile13-browser-retirement.mjs';
const reg=name=>'  registerOAuthTool("'+name+'",{inputSchema:{}},async()=>({route:"android_right"}));\n';
const all=names.map(reg).join('');
test('13 mobile routes without legacy code is only CODE-READY, not phone E2E or deletion authorization',()=>{
 const r=audit({runtimeSource:all});
 assert.equal(r.migratedToolCount,13);assert.equal(r.cloudTools.length,0);
 assert.equal(r.readyForRemoval,true);assert.equal(r.deletionAuthorized,false);
 assert.equal(r.phoneE2E,'NOT_RUN');
});
test('missing and duplicated mobile tools block deletion',()=>{
 const d=audit({runtimeSource:all+reg('life_web_click')});
 assert.ok(d.blockers.includes('MIGRATED_TOOL_COUNT:life_web_click:2'));
 const m=audit({runtimeSource:all.replace(reg('life_web_wait'),'')});
 assert.ok(m.blockers.includes('MIGRATED_TOOL_COUNT:life_web_wait:0'));
});
test('tool-level cloud fallback blocks BOTH migrated and leftover unrelated tools',()=>{
 const cloud=all.replace(reg('life_web_type'),
  '  registerOAuthTool("life_web_type",{inputSchema:{}},async()=>browserTool("browser_type",{}));\n')+
  '  registerOAuthTool("life_status",{inputSchema:{}},async()=>ensureBrowser());\n';
 const r=audit({runtimeSource:cloud});
 assert.ok(r.blockers.includes('CLOUD_FALLBACK_IN_MIGRATED_TOOL:life_web_type'));
 assert.ok(r.blockers.includes('CLOUD_BROWSER_REGISTERED_TOOL:life_status'));
});
test('legacy Connection V2 browser probe, session helpers and external modules block deletion',()=>{
 const runtime=all+'async function browserRpc(){}\nasync function browserTool(){}\n'+
  'async function ensureBrowser(){}\nlet browserSessionId=null;const BROWSER_MCP="original";\n';
 const r=audit({runtimeSource:runtime,
  connectionV2Source:'const sessionObserver={probe:()=>browserSession.probe()};\n'+
    'const activeBrowserCalls=0;\nconst probes={browserStatus:async()=>({})};',
  browserFiles:{'browser-session.mjs':'const browserSession={};',
    'browser-transport.mjs':'const browserTransport={};'}});
 assert.equal(r.readyForRemoval,false);
 assert.ok(r.blockers.includes('CONNECTION_V2:connectionV2BrowserProbe'));
 assert.ok(r.blockers.includes('LEGACY_GLOBAL:legacyBrowserRPC'));
 assert.ok(r.blockers.includes('LEGACY_MODULE:browser-transport.mjs'));
});
test('original JH source must never masquerade as Playwright-removed',()=>{
 const raw=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
 const r=audit({runtimeSource:raw});
 assert.equal(r.readyForRemoval,false);
 assert.ok(r.cloudTools.includes('life_web_click'));
 assert.ok(r.globalBrowserHelpers.includes('legacyEnsureBrowser'));
});
test('invalid sources fail closed',()=>{
 assert.throws(()=>audit({runtimeSource:''}),/RUNTIME_REQUIRED/);
 assert.throws(()=>audit({runtimeSource:all,browserFiles:{x:null}}),/FILE_CONTENT_INVALID/);
 assert.throws(()=>audit({runtimeSource:all,connectionV2Source:null}),/DEPENDENCIES_INVALID/);
});
