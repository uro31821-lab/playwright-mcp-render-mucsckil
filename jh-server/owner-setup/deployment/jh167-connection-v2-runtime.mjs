/**
 * Server-only JH167 V2 wiring for the existing Secure56 owner runtime.
 * Inserts no tool into the secure Android catalog; never edits an APK, auth,
 * site navigation, payments, device security, or saved workflow commands.
 * Source is patched only after existing pinned durable/news guards pass.
 */
export function patchJH167ConnectionV2Runtime(input){
  if(typeof input!=='string'||input.includes('jhV2OwnerBindings56'))throw Error('JH_V2_ALREADY_PATCHED_OR_INVALID');
  const edits=[];
  function once(oldText,newText,code){
    if(input.split(oldText).length!==2||oldText===newText||input.includes(newText))throw Error(code);
    input=input.replace(oldText,newText);edits.push([oldText,newText]);
  }
  const imports=`import {createJH167DiagnosticIntegration as jhV2CreateIntegration56} from '../connection-v2/jh167-v2-bridge.mjs';\nimport {createJH167OperationalHostBindings as jhV2CreateBindings56} from '../connection-v2/jh-operational-host-bindings.mjs';\n`;
  if(!input.startsWith('import '))throw Error('JH_V2_MODULE_SCOPE_REQUIRED');
  input=imports+input;edits.push(['',imports]);
  const shared=String.raw`
// JH167 V2 binds the trusted, existing Secure56 owner; no new job authority.
const jhV2State56={configured:process.env.JH_CONNECTION_V2_RECOVERY==='1',
  installed:false,activeMcpCalls:0,activeBrowserCalls:0,lastMcpAt:0,
  lastBrowser:'unknown',lastSignedRead:null,stopping:false,lastResult:null,timer:null};
let jhV2OwnerBindings56=null;
let jhV2Integration56=null;
let jhV2Admission56=null;
function jhV2BeginAdmission56(){
  if(jhV2Admission56?.allowBeginCommand()===false)throw Error('JH_V2_MAINTENANCE_BUSY');
}
function jhV2JobAdmission56(){
  if(jhV2Admission56?.allowJobDispatch()===false)throw Error('JH_V2_MAINTENANCE_BUSY');
}
function jhV2OwnerSnapshot56(){
  const v=jhV2State56;
  let unresolvedEffects;
  try{unresolvedEffects=durableNativeHooks56?.uncertainEffectsForMaintenance?.();}
  catch{return null;}
  if(!v.installed||v.stopping||!Number.isSafeInteger(unresolvedEffects)||unresolvedEffects<0)return null;
  const now=Date.now();
  return {authenticatedOwner:true,sameProcess:true,pendingDiscard:jhBlockedCommands56.size>0,
    serverRestarting:v.stopping,activeMcpCalls:v.activeMcpCalls,
    activeWorkflows:[...jhMcpWorkflows56.values()].filter(w=>w&&w.expiresAt>now&&w.phase!=='VERIFIED').length,
    queuedJobs:[...jobs.values()].filter(j=>j.status==='queued').length,
    runningJobs:[...jobs.values()].filter(j=>j.status==='in_progress').length,
    unresolvedEffects,activeBrowserCalls:v.activeBrowserCalls};
}
function jhV2Status56(){
  const v=jhV2State56,r=v.lastResult;
  return {version:'JH167_SELF_DIAGNOSTIC_V2',installed:v.installed,
    enabled:v.configured,active:v.installed&&v.configured,
    lastStatus:r?.status??'NOT_CHECKED',checks:Array.isArray(r?.checks)?r.checks:[],
    recoveryActions:Array.isArray(r?.recoveryActions)?r.recoveryActions:[],
    manualRequired:r?.manualAction?.cause??null,
    notificationDelivery:r?.notificationDelivery??'NOT_CONFIGURED',
    replayPreviousCommand:false,canAlterPhone:false};
}
function jhV2Install56(){
  if(jhV2State56.installed)throw Error('JH_V2_ALREADY_INSTALLED');
  const state=jhV2State56;
  const sessionObserver={probe:async()=>{await browserSession.probe();state.lastBrowser='ready';}};
  const snap=()=>jhV2OwnerSnapshot56();
  const hooks=jhV2CreateBindings56({
    readOwnerSnapshot:snap,
    installOwnerAdmissionGate(gates){
      if(jhV2Admission56)throw Error('JH_V2_OWNER_ADMISSION_ALREADY_SET');
      if(typeof gates?.allowBeginCommand!=='function'||typeof gates?.allowJobDispatch!=='function')
        throw Error('JH_V2_OWNER_FENCE_INVALID');
      jhV2Admission56=gates;
      // Both actual synchronous sites were enforced by the exact source transformer.
      return {ownerVerified:true,beginCommandHooked:true,jobDispatchHooked:true,sameProcess:true};
    },
    browserSession:sessionObserver,
    approvedOwnerNotifier:null // Never invent owner approval or notification ACK.
  });
  jhV2OwnerBindings56=hooks;
  const probes={
    serverStatus:async()=>({version:'JH167_SECURE56_LIVE_OWNER'}),
    mcpProbe:async()=>({verified:(state.lastMcpAt>0&&Date.now()-state.lastMcpAt<900000)?true:null}),
    browserStatus:async()=>({browser:state.lastBrowser}),
    androidDevices:async()=>({devices:recentDevices().map(([d,m])=>({active:!!active56(d)&&Date.now()-m.lastSeen<90000}))}),
    secureStatus:async()=>{
      const latest=[...jobs.values()].reverse().find(j=>j.type==='secure_device_status'&&j.status==='complete'
        &&j.completedAt&&Date.now()-Date.parse(j.completedAt)<90000&&j.secureSessionId
        &&j.secureSessionId===active56(j.targetDeviceId)?.sessionId);
      return latest?{status:'complete',result:latest.result}:null;
    }
  };
  jhV2Integration56=jhV2CreateIntegration56({probes,workflow:hooks},{enableRecovery:state.configured});
  state.installed=true;
  const stop=()=>{state.stopping=true;if(state.timer)clearInterval(state.timer);jhV2Integration56?.stop();hooks.close();};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  if(state.configured){
    state.timer=setInterval(()=>{
      void jhV2Integration56.tick().then(x=>{state.lastResult=x;
        if(x.status==='MANUAL_REQUIRED')console.warn('JH_CONNECTION_V2_MANUAL '+JSON.stringify({
          stage:x.failure?.id??'UNKNOWN',code:x.failure?.code??'UNKNOWN',
          notification:'NOT_CONFIGURED',replay:false}));
      }).catch(()=>{});
    },60000);
    state.timer.unref?.();
  }
  console.log('JH_CONNECTION_V2_WIRING '+JSON.stringify({installed:true,enabled:state.configured,
    beginFence:true,dispatchFence:true,browserTransportOnly:true,notificationChannel:'NOT_CONFIGURED',
    automaticTaskReplay:false}));
}
`;
  const cmd='const jhCommandContext56=new JhAsyncLocalStorage56();';
  once(cmd,cmd+shared,'JH_V2_SHARED_ANCHOR');
  const begin='function jhStartCommand56(device,eventId){';
  once(begin,begin+'\n  jhV2BeginAdmission56();','JH_V2_BEGIN_FENCE_ANCHOR');
  const mk='function mk(type,p={},deviceId=null) {';
  once(mk,mk+'\n  jhV2JobAdmission56();','JH_V2_DISPATCH_FENCE_ANCHOR');
  const auth='return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},scoped.handler);';
  const monitoredAuth='return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},async(...a)=>{jhV2State56.activeMcpCalls++;try{const result=await scoped.handler(...a);jhV2State56.lastMcpAt=Date.now();return result;}finally{jhV2State56.activeMcpCalls--;}});';
  once(auth,monitoredAuth,'JH_V2_AUTH_ACCOUNTING_ANCHOR');
  const transport='return browserEventTransport.request(options);';
  const monitoredTransport=`jhV2State56.activeBrowserCalls++;
      return Promise.resolve().then(()=>browserEventTransport.request(options))
        .then(r=>{if(r.ok){jhV2State56.lastBrowser='ready';}
          else if([401,403,404,408,429,500,502,503,504].includes(r.status))jhV2State56.lastBrowser='unavailable';
          return r;},e=>{jhV2State56.lastBrowser='unavailable';throw e;})
        .finally(()=>{jhV2State56.activeBrowserCalls--;});`;
  once(transport,monitoredTransport,'JH_V2_TRANSPORT_ANCHOR');
  const status='completion401Summary:getSecureCompletion401Summary()});';
  once(status,'completion401Summary:getSecureCompletion401Summary(),connectionV2:jhV2Status56()});',
    'JH_V2_STATUS_COMPAT_ANCHOR');
  const install='durableNativeHooks56=createDurableNativeHooks(options);';
  once(install,install+'\n jhV2Install56();','JH_V2_HOST_BOOT_ANCHOR');
  // Validate a strict one-to-one reversible diff, including the inserted imports.
  let reverse=input;
  for(const [before,after] of edits.slice().reverse()){
    if(before===''){if(!reverse.startsWith(after))throw Error('JH_V2_IMPORT_REVERSAL');reverse=reverse.slice(after.length);}
    else {if(reverse.split(after).length!==2)throw Error('JH_V2_PATCH_REVERSAL');reverse=reverse.replace(after,before);}
  }
  if(reverse!==arguments[0]||edits.length!==8)throw Error('JH_V2_SCOPE_MISMATCH');
  return input;
}
