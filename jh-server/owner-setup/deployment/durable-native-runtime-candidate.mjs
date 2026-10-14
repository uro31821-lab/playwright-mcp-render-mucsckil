/** Candidate builder over pinned operational source. No production startup selects this file.
 * Host setup is mandatory before listen. All sealed auth checks remain ahead of journal hooks.
 */
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertFunctionalReleaseRuntime} from './functional-release-runtime.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const PIN='fdf101f9e08c146cada768c2e30eea2b2f23835083b0c6e0d9f342e170e69a47';
const PREFIX='import {createDurableNativeHooks} from "../deployment/durable-native-host.mjs";\nimport {existsSync,mkdirSync,readFileSync as readOAuthFile56,writeFileSync as writeOAuthFile56,renameSync as renameOAuthFile56,chmodSync as chmodOAuthFile56} from "node:fs";\nimport {dirname as oauthDirname56} from "node:path";\nlet durableNativeHooks56=null;\n';
const AUDIT_IMPORT='import {auditSecureCompletionRejection,getSecureCompletion401Summary} from "../deployment/secure-complete-401-audit.mjs";\n';
const install=`
export function installDurableNativeCircuit56(options){
 if(durableNativeHooks56||httpServer.listening||jobs.size||devices.size)throw Error("DURABLE_INSTALL_BEFORE_LISTEN_ONLY");
 durableNativeHooks56=createDurableNativeHooks(options);
 return Object.freeze({installed:true,close(){durableNativeHooks56.close();}});
}
`;
const CAPTURE_OLD='  jobs.set(id,j);\n  if(targetDeviceId){';
const CAPTURE_NEW='  if(durableNativeHooks56)durableNativeHooks56.capture(j,p);\n  jobs.set(id,j);\n  if(targetDeviceId){';
const DISPATCH_OLD='next.status="in_progress";next.startedAtMs=Date.now();';
const DISPATCH_NEW=`const durableAdmission=durableNativeHooks56?.beforeDispatch(next)||{allowed:false,code:"DURABLE_HOST_REQUIRED",httpStatus:503};
    if(!durableAdmission.allowed){
      next.status="error";next.error=durableAdmission.code;next.completedAt=new Date().toISOString();
      res.writeHead(durableAdmission.httpStatus,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({ok:false,code:durableAdmission.code}));return;
    }
    next.status="in_progress";next.startedAtMs=Date.now();`;
const COMPLETE_OLD='    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();';
const COMPLETE_NEW=`    const durableReceipt=durableNativeHooks56?.acceptedCompletion(j,body.result)||{allowed:false,code:"DURABLE_HOST_REQUIRED",httpStatus:503};
    if(!durableReceipt.allowed){
      res.writeHead(durableReceipt.httpStatus,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({ok:false,code:durableReceipt.code}));return;
    }
    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();`;
const SUMMARY_OLD='  registerOAuthTool("life_status",{';
const SUMMARY_NEW='  registerOAuthTool("life_android_complete_401_summary",{\n    title:"Secure completion 401 diagnostics (this process)",\n    description:"Read-only, OAuth-required aggregated Secure Android completion 401 causes in this server process. No device IDs, command IDs, nonce, MAC or payload; no historical cause claims.",\n    inputSchema:{}\n  },async()=>textResult(getSecureCompletion401Summary()));\n\n  registerOAuthTool("life_status",{';
const STATUS_OLD='return textResult({version:"1.5.0-fix5-local-prompts",browser,registeredAndroidDevices:devices.size,secureBridgeVersion:56});';
const STATUS_NEW='return textResult({version:"1.5.0-fix5-local-prompts",browser,registeredAndroidDevices:devices.size,secureBridgeVersion:56,completion401Summary:getSecureCompletion401Summary()});';
const OAUTH_OLD=`const oauthCodes56=new Map();
const oauthAccess56=new Map();
const oauthRefresh56=new Map();
function purgeOAuth56(){
  const now=Date.now();
  for(const [k,v] of oauthCodes56)if(now>v.expiresAt)oauthCodes56.delete(k);
  for(const [k,v] of oauthAccess56)if(now>v.expiresAt)oauthAccess56.delete(k);
  for(const [k,v] of oauthRefresh56)if(now>v.expiresAt)oauthRefresh56.delete(k);
}
function oauthAccessAuthorized56(token){
  if(typeof token!=="string"||token.length<20)return false;
  purgeOAuth56();
  const x=oauthAccess56.get(sha56("oauth-access|"+token));
  return !!x&&x.expiresAt>Date.now()&&x.scope===OAUTH_SCOPE56;
}`;
const OAUTH_NEW=`const oauthCodes56=new Map();
const oauthAccess56=new Map();
const oauthRefresh56=new Map();
const OAUTH_STATE_FILE56=String(process.env.JH_OAUTH_STATE_FILE||"/var/data/jh-oauth56-state.json");
function validOAuthStateRow56(row){
  return Array.isArray(row)&&row.length===2&&validHex56(row[0])&&row[1]&&
    Number.isSafeInteger(row[1].expiresAt)&&row[1].expiresAt>0&&row[1].scope===OAUTH_SCOPE56;
}
function persistOAuth56(){
  try{
    mkdirSync(oauthDirname56(OAUTH_STATE_FILE56),{recursive:true,mode:0o700});
    const payload=JSON.stringify({version:1,savedAt:Date.now(),
      access:[...oauthAccess56].filter(validOAuthStateRow56),
      refresh:[...oauthRefresh56].filter(validOAuthStateRow56)});
    const tmp=OAUTH_STATE_FILE56+"."+process.pid+".tmp";
    writeOAuthFile56(tmp,payload,{encoding:"utf8",mode:0o600});
    chmodOAuthFile56(tmp,0o600);
    renameOAuthFile56(tmp,OAUTH_STATE_FILE56);
    chmodOAuthFile56(OAUTH_STATE_FILE56,0o600);
    return true;
  }catch(e){console.error("JH_OAUTH_STATE_PERSIST_FAILED",String(e?.message||e));return false;}
}
function loadOAuth56(){
  if(!existsSync(OAUTH_STATE_FILE56))return;
  try{
    const parsed=JSON.parse(readOAuthFile56(OAUTH_STATE_FILE56,"utf8")),now=Date.now();
    if(parsed?.version!==1)throw Error("schema");
    for(const row of Array.isArray(parsed.access)?parsed.access:[])
      if(validOAuthStateRow56(row)&&row[1].expiresAt>now)oauthAccess56.set(row[0],row[1]);
    for(const row of Array.isArray(parsed.refresh)?parsed.refresh:[])
      if(validOAuthStateRow56(row)&&row[1].expiresAt>now)oauthRefresh56.set(row[0],row[1]);
    console.log("JH_OAUTH_STATE_LOADED",JSON.stringify({access:oauthAccess56.size,refresh:oauthRefresh56.size,durable:true}));
  }catch(e){console.error("JH_OAUTH_STATE_LOAD_FAILED",String(e?.message||e));}
}
function purgeOAuth56(){
  const now=Date.now();let changed=false;
  for(const [k,v] of oauthCodes56)if(now>v.expiresAt){oauthCodes56.delete(k);changed=true;}
  for(const [k,v] of oauthAccess56)if(now>v.expiresAt){oauthAccess56.delete(k);changed=true;}
  for(const [k,v] of oauthRefresh56)if(now>v.expiresAt){oauthRefresh56.delete(k);changed=true;}
  if(changed)persistOAuth56();
}
function oauthAccessAuthorized56(token){
  if(typeof token!=="string"||token.length<20)return false;
  purgeOAuth56();
  const x=oauthAccess56.get(sha56("oauth-access|"+token));
  return !!x&&x.expiresAt>Date.now()&&x.scope===OAUTH_SCOPE56;
}
loadOAuth56();`;
const OAUTH_TOKEN_OLD=`function oauthTokenResponse56(){
  const access="at56_"+token56(32),refresh="rt56_"+token56(32),now=Date.now();
  oauthAccess56.set(sha56("oauth-access|"+access),{expiresAt:now+OAUTH_ACCESS_MS56,scope:OAUTH_SCOPE56});
  oauthRefresh56.set(sha56("oauth-refresh|"+refresh),{expiresAt:now+OAUTH_REFRESH_MS56,scope:OAUTH_SCOPE56});
  return {access_token:access,token_type:"Bearer",expires_in:Math.floor(OAUTH_ACCESS_MS56/1000),refresh_token:refresh,scope:OAUTH_SCOPE56};
}`;
const OAUTH_TOKEN_NEW=`function oauthTokenResponse56(){
  const access="at56_"+token56(32),refresh="rt56_"+token56(32),now=Date.now();
  oauthAccess56.set(sha56("oauth-access|"+access),{expiresAt:now+OAUTH_ACCESS_MS56,scope:OAUTH_SCOPE56});
  oauthRefresh56.set(sha56("oauth-refresh|"+refresh),{expiresAt:now+OAUTH_REFRESH_MS56,scope:OAUTH_SCOPE56});
  persistOAuth56();
  return {access_token:access,token_type:"Bearer",expires_in:Math.floor(OAUTH_ACCESS_MS56/1000),refresh_token:refresh,scope:OAUTH_SCOPE56};
}`;
const START_OLD='if(process.env.JH_OWNER_DEFER_LISTEN!=="1")httpServer.listen(PORT,"0.0.0.0");';
const START_NEW='if(process.env.JH_OWNER_DEFER_LISTEN!=="1")throw Error("DURABLE_HOST_BOOTSTRAP_REQUIRED");';
const AUTH_REJECT_OLD="if(!a||sid!==j.secureSessionId||sid!==a.sessionId||dev!==a.deviceDigest||rd!==actual||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(a.secret,\"complete|\"+sid+\"|\"+j.id+\"|\"+dev+\"|\"+nonce+\"|\"+exp+\"|\"+rd))||!seen56(a.seenComplete,nonce)){raw.fill(0);res.writeHead(401).end(\"secure completion invalid\");return;}";
const AUTH_AUDIT_STATEMENT="try{auditSecureCompletionRejection({\n sessionAbsent:!a,\n jobSessionMismatch:sid!==j.secureSessionId,\n activeSessionMismatch:!!a&&sid!==a.sessionId,\n deviceMismatch:!!a&&dev!==a.deviceDigest,\n bodyMismatch:rd!==actual,\n nonceInvalid:!validToken56(nonce),\n expired:exp<Date.now(),\n tooFar:exp-Date.now()>60000,\n signatureMismatch:!!a&&!eqHex56(mac,hmac56(a.secret,\"complete|\"+sid+\"|\"+j.id+\"|\"+dev+\"|\"+nonce+\"|\"+exp+\"|\"+rd)),\n nonceReplayed:!!a&&a.seenComplete.has(nonce)\n });}catch{};";
const AUTH_REJECT_NEW=AUTH_REJECT_OLD.replace('{raw.fill(0);','{'+AUTH_AUDIT_STATEMENT+'raw.fill(0);');
const edits=[[CAPTURE_OLD,CAPTURE_NEW],[DISPATCH_OLD,DISPATCH_NEW],[COMPLETE_OLD,COMPLETE_NEW],[START_OLD,START_NEW],[OAUTH_OLD,OAUTH_NEW],[OAUTH_TOKEN_OLD,OAUTH_TOKEN_NEW]];
export function buildDurableNativeRuntime(root){
 const baseline=readFileSync(assertFunctionalReleaseRuntime(root),'utf8');
 if(sha(baseline)!==PIN)throw Error('DURABLE_BASELINE_IDENTITY_CHANGED');
 let candidate=baseline;
 for(const [before,after]of edits){
  if(candidate.split(before).length!==2||candidate.includes(after))throw Error('DURABLE_PATCH_ANCHOR');
  candidate=candidate.replace(before,after);
 }
 if(candidate.split(AUTH_REJECT_OLD).length!==2||candidate.includes(AUTH_REJECT_NEW))throw Error('DURABLE_COMPLETE_AUDIT_ANCHOR');
 candidate=candidate.replace(AUTH_REJECT_OLD,AUTH_REJECT_NEW);
 if(candidate.split(SUMMARY_OLD).length!==2||candidate.includes(SUMMARY_NEW))throw Error('DURABLE_COMPLETE_SUMMARY_ANCHOR');
 candidate=candidate.replace(SUMMARY_OLD,SUMMARY_NEW);
 if(candidate.split(STATUS_OLD).length!==2||candidate.includes(STATUS_NEW))throw Error('DURABLE_STATUS_COMPAT_ANCHOR');
 candidate=candidate.replace(STATUS_OLD,STATUS_NEW);
 let reversed=candidate.replace(STATUS_NEW,STATUS_OLD).replace(SUMMARY_NEW,SUMMARY_OLD).replace(AUTH_REJECT_NEW,AUTH_REJECT_OLD);
 for(const [before,after]of edits.slice().reverse())reversed=reversed.replace(after,before);
 if(reversed!==baseline)throw Error('DURABLE_PATCH_SCOPE');
 candidate=PREFIX+AUDIT_IMPORT+candidate+install;
 const file=path.join(root,'server-integration/server-durable-native-candidate.mjs');
 writeFileSync(file,candidate,{mode:0o600});
 if(readFileSync(file,'utf8')!==candidate)throw Error('DURABLE_BUILD_READBACK');
 return {file,baselineSha256:PIN,candidateSha256:sha(candidate),exactHookEdits:6,diagnosticOnlyEdits:3,oauthDurableState:true,oauthSecretsPersisted:false,productionEnabled:false};
}
