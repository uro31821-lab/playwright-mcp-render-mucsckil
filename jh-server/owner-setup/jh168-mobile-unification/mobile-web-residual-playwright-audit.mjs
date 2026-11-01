/**
 * Single-engine conversion inventory, inspect GENERATED operator source only.
 * Does not phone-open, deploy, grant approval, mutate owner SQLite or remove
 * any legacy browser module until its consumers are confirmed replaced.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56}
 from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {selectJH168MobileWeb13Mode56} from './mobile-web-tool-patch.mjs';

assert.equal(selectJH168MobileWeb13Mode56(process.env),'PHONE_RIGHT',
 'RESIDUAL_SCAN_REQUIRES_EXPLICIT_CI_MOBILE_MODE');
const base=buildCleanRestartRelease56();
const mod=await import(pathToFileURL(base.file).href);
const generated=mod.buildDurableRoutedRuntime(path.resolve('jh-server/owner-setup'));
const source=readFileSync(generated.file,'utf8');
const reg=/^[ \t]*registerOAuthTool\((["'])(life_[A-Za-z0-9_]+)\1,\{/gm;
const offsets=[...source.matchAll(reg)].map(x=>({name:x[2],at:x.index}));
const required=[
 'life_web_navigate','life_web_snapshot','life_web_click','life_web_type',
 'life_web_select','life_web_press_key','life_web_wait','life_web_back',
 'life_web_screenshot','life_route','life_open_service','life_naver_mail',
 'life_android_open'
];
const active=[];
const cloud=[];
for(let i=0;i<offsets.length;i++){
 const {name,at}=offsets[i];
 const end=i+1<offsets.length?offsets[i+1].at:source.length;
 const block=source.slice(at,end);
 const direct=block.includes('browserTool(')||
  block.includes('browserRpc(')||block.includes('ensureBrowser(');
 const legacyRoute=block.includes('route:"playwright"');
 const row={tool:name,browserCalls:(block.match(/\bbrowserTool\(/g)||[]).length,
  serverBrowserRPC:(block.match(/\b(?:browserRpc|ensureBrowser)\(/g)||[]).length,
  cloudRoute:legacyRoute,requiresMobile:item=>{
   return required.includes(item);
  }};
 if(required.includes(name))active.push({name,direct,legacyRoute});
 if(!required.includes(name)&&(direct||legacyRoute))cloud.push({
  name,browserCalls:row.browserCalls,serverBrowserRPC:row.serverBrowserRPC,
  cloudRoute:legacyRoute
 });
}
assert.equal(active.length,13,'MOBILE_THIRTEEN_MISSING_OR_DUPLICATED');
assert.equal(active.filter(r=>!r.direct&&!r.legacyRoute).length,13,
 'MOBILE_THIRTEEN_STILL_HAS_CLOUD_FALLBACK');
assert.equal(cloud.length,0,'MOBILE_REGISTERED_TOOLS_MUST_NOT_CALL_CLOUD_BROWSER');
assert.ok(source.includes('cloudBrowserProbed:false'),
 'MOBILE_STATUS_SIGNED_POLL_NOT_CONNECTED');
assert.ok(source.includes('async function browserTool('),
 'LEGACY_BROWSER_HELPER_ALREADY_REMOVED_REVISIT_INVENTORY');
const globalLegacy={
 browserToolFunction:source.includes('async function browserTool('),
 browserRPCFunction:source.includes('async function browserRpc('),
 ensureBrowserFunction:source.includes('async function ensureBrowser('),
 browserMcpEndpoint:source.includes('BROWSER_MCP'),
 serverBrowserSession:source.includes('browserSessionId'),
 registeredToolCount:offsets.length
};
for(const row of cloud)console.log('JH_MOBILE_REMAINING_CLOUD_TOOL '+JSON.stringify(row));
console.log('JH_MOBILE_GENERATED_THIRTEEN '+JSON.stringify(active));
console.log('JH_MOBILE_LEGACY_SESSION_INVENTORY '+JSON.stringify(globalLegacy));
console.log('JH_MOBILE_RESIDUAL_RESULT '+JSON.stringify({
 convertedAliasAndEntrypoints:active.length,
 remainingDirectCloudToolRegistrations:cloud.length,
 completePlaywrightRemoval:false,
 actualDeviceE2E:'NOT_RUN',
 safeToDeleteLegacyModules:false
}));
