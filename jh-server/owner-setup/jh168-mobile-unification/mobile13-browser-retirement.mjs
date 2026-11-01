/**
 * JH168 Playwright retirement dependency gate. Source-only: DO NOT remove
 * modules or interpret this scan as phone E2E or a license to drop login.
 */
export const MOBILE13_TOOL_NAMES56=Object.freeze([
 'life_web_navigate','life_web_snapshot','life_web_click','life_web_type',
 'life_web_select','life_web_press_key','life_web_wait','life_web_back',
 'life_web_screenshot','life_route','life_open_service','life_naver_mail',
 'life_android_open'
]);
export function auditMobile13BrowserRetirement56({runtimeSource,connectionV2Source='',browserFiles={}}={}){
 if(typeof runtimeSource!=='string'||!runtimeSource.includes('registerOAuthTool('))
  throw Error('JH_MOBILE_RETIRE_RUNTIME_REQUIRED');
 if(typeof connectionV2Source!=='string'||!browserFiles||typeof browserFiles!=='object'||Array.isArray(browserFiles))
  throw Error('JH_MOBILE_RETIRE_DEPENDENCIES_INVALID');
 const registrations=[...runtimeSource.matchAll(/^[ \t]*registerOAuthTool\((['"])(life_[A-Za-z0-9_]+)\1,\{/gm)]
  .map(m=>({name:m[2],index:m.index}));
 const counts=new Map();
 for(const r of registrations)counts.set(r.name,(counts.get(r.name)||0)+1);
 const required=MOBILE13_TOOL_NAMES56.map(name=>({name,count:counts.get(name)||0}));
 const notMigrated=[],cloudTools=[];
 for(let i=0;i<registrations.length;i++){
  const r=registrations[i];
  const stop=i+1<registrations.length?registrations[i+1].index:runtimeSource.length;
  const block=runtimeSource.slice(r.index,stop);
  const cloud=/(?:\bbrowserTool\s*\(|\bbrowserRpc\s*\(|\bensureBrowser\s*\(|route:\s*['"]playwright['"])/.test(block);
  if(cloud){
   if(MOBILE13_TOOL_NAMES56.includes(r.name))notMigrated.push(r.name);
   cloudTools.push(r.name);
  }
 }
 const globals=[
  ['legacyBrowserRPC',/\b(?:async\s+)?function\s+browserRpc\s*\(/],
  ['legacyBrowserTool',/\b(?:async\s+)?function\s+browserTool\s*\(/],
  ['legacyEnsureBrowser',/\b(?:async\s+)?function\s+ensureBrowser\s*\(/],
  ['browserSessionState',/\bbrowserSessionId\b|\bbrowserInitialized\b/],
  ['browserEndpoint',/\bBROWSER_MCP\b/]
 ].filter(([,re])=>re.test(runtimeSource)).map(([name])=>name);
 const connection=[
  ['connectionV2BrowserProbe',/\bbrowserSession\.probe\s*\(/],
  ['connectionV2BrowserCounter',/\bactiveBrowserCalls\b/],
  ['connectionV2BrowserStatus',/\bbrowserStatus\s*:/],
  ['connectionV2BrowserObserver',/\bsessionObserver\s*=/]
 ].filter(([,re])=>re.test(connectionV2Source)).map(([name])=>name);
 const external=[];
 for(const [name,content] of Object.entries(browserFiles)){
  if(typeof content!=='string')throw Error('JH_MOBILE_RETIRE_FILE_CONTENT_INVALID:'+name);
  if(/(?:\bbrowserTool\s*\(|\bbrowserSession\b|\bBROWSER_MCP\b|\bbrowserTransport\b|playwright-mcp)/i.test(content))
   external.push(name);
 }
 const blockers=[
  ...required.filter(r=>r.count!==1).map(r=>'MIGRATED_TOOL_COUNT:'+r.name+':'+r.count),
  ...notMigrated.map(name=>'CLOUD_FALLBACK_IN_MIGRATED_TOOL:'+name),
  ...cloudTools.filter(n=>!MOBILE13_TOOL_NAMES56.includes(n)).map(n=>'CLOUD_BROWSER_REGISTERED_TOOL:'+n),
  ...globals.map(x=>'LEGACY_GLOBAL:'+x),
  ...connection.map(x=>'CONNECTION_V2:'+x),
  ...external.map(x=>'LEGACY_MODULE:'+x)
 ];
 return {
  expectedTools:MOBILE13_TOOL_NAMES56.length,registeredTools:registrations.length,
  migratedToolCount:required.filter(x=>x.count===1&&!notMigrated.includes(x.name)).length,
  cloudTools:cloudTools.slice(),globalBrowserHelpers:globals,
  connectionV2Dependencies:connection,externalBrowserModules:external,blockers,
  deletionAuthorized:false,readyForRemoval:blockers.length===0,
  phoneE2E:'NOT_RUN'
 };
}
