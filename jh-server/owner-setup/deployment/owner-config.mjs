/** Operator-only deployment configuration. Never reads connected-app cookies,
 * guesses an owner, provisions resources, or treats an ID token as configuration. */
import {constants,openSync,closeSync,readFileSync,lstatSync,fstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseOwnerJson} from '../owner-enrollment/owner-enrollment-http.mjs';
export const EXPECTED_ORIGIN='https://jh-secure-bridge-fix4.onrender.com';
export const EXPECTED_CATALOG='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
export class DeploymentError extends Error {constructor(code){super(code);this.code=code;this.name='DeploymentError';}}
export const fail=code=>{throw new DeploymentError(code);};
export const sha=value=>createHash('sha256').update(value).digest('hex');
const configs=new WeakSet();
const fields=['version','serverOrigin','catalogDigest','googleWebClientId','allowedPresenterClientIds','ownerSubject','ownerLabel','storageMount','storageEpoch'];
export function privateBytes(filename,maxBytes) {
  if(typeof filename!=='string'||!path.isAbsolute(filename)||filename.includes('\0')||path.normalize(filename)!==filename)fail('PRIVATE_FILE_PATH_REQUIRED');
  // Refuse links at every directory component, not just at the last filename.
  if(realpathSync(path.dirname(filename))!==path.dirname(filename))fail('PRIVATE_FILE_LINK_FORBIDDEN');
  let fd;
  try {
    const before=lstatSync(filename);
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o077)!==0||before.uid!==process.getuid())fail('PRIVATE_FILE_PERMISSIONS_REQUIRED');
    fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
    const st=fstatSync(fd);
    if(!st.isFile()||st.dev!==before.dev||st.ino!==before.ino||st.size<=0||st.size>maxBytes)fail('PRIVATE_FILE_INVALID');
    const data=readFileSync(fd);const after=fstatSync(fd);
    if(data.length!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs)fail('PRIVATE_FILE_CHANGED');
    return data;
  }finally {if(fd!==undefined)closeSync(fd);}
}
export function validateOwnerConfiguration(input) {
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join('|')!==fields.slice().sort().join('|'))fail('OWNER_CONFIGURATION_FIELDS_INVALID');
  if(input.version!==1||input.serverOrigin!==EXPECTED_ORIGIN||input.catalogDigest!==EXPECTED_CATALOG)fail('APP_SERVER_IDENTITY_MISMATCH');
  if(typeof input.googleWebClientId!=='string'||!/^[-a-zA-Z0-9.]+\.apps\.googleusercontent\.com$/.test(input.googleWebClientId)||input.googleWebClientId.length>255)fail('GOOGLE_CLIENT_REQUIRED');
  if(!Array.isArray(input.allowedPresenterClientIds)||input.allowedPresenterClientIds.length<1||input.allowedPresenterClientIds.length>8||new Set(input.allowedPresenterClientIds).size!==input.allowedPresenterClientIds.length||!input.allowedPresenterClientIds.includes(input.googleWebClientId)||input.allowedPresenterClientIds.some(x=>typeof x!=='string'||x.length>255||!/^[-a-zA-Z0-9.]+\.apps\.googleusercontent\.com$/.test(x)))fail('PRESENTER_POLICY_REQUIRED');
  if(typeof input.ownerSubject!=='string'||!/^[-a-zA-Z0-9_]{1,255}$/.test(input.ownerSubject))fail('OWNER_SUBJECT_REQUIRED');
  // Do not accept URLs/control characters or Android resource escapes as labels.
  if(typeof input.ownerLabel!=='string'||!input.ownerLabel.trim()||input.ownerLabel!==input.ownerLabel.trim()||input.ownerLabel.length>100||/[\p{Cc}\p{Cf}]/u.test(input.ownerLabel))fail('OWNER_LABEL_INVALID');
  if(typeof input.storageMount!=='string'||!path.isAbsolute(input.storageMount)||input.storageMount==='/'||path.normalize(input.storageMount)!==input.storageMount||/[\0\n\r]/.test(input.storageMount))fail('STORAGE_MOUNT_INVALID');
  if(typeof input.storageEpoch!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(input.storageEpoch))fail('STORAGE_EPOCH_REQUIRED');
  const accountDigest=sha('JH_GOOGLE_OWNER_V1|https://accounts.google.com|'+input.ownerSubject+'|'+input.googleWebClientId);
  const canonical={version:1,serverOrigin:input.serverOrigin,catalogDigest:input.catalogDigest,googleWebClientId:input.googleWebClientId,accountDigest,allowedPresenterClientIds:[...input.allowedPresenterClientIds].sort(),storageEpoch:input.storageEpoch};
  const config=Object.freeze({...input,allowedPresenterClientIds:Object.freeze([...input.allowedPresenterClientIds].sort()),accountDigest,policyDigest:sha(JSON.stringify(canonical)),stateDir:path.join(input.storageMount,'jh-owner-state')});
  configs.add(config);return config;
}
export function assertConfig(config){if(!configs.has(config))fail('VALIDATED_CONFIGURATION_REQUIRED');}
export function loadOwnerConfiguration(filename) {
  const bytes=privateBytes(filename,8192);let parsed;
  try{parsed=parseOwnerJson(bytes);}catch{fail('OWNER_CONFIGURATION_JSON_INVALID');}
  return validateOwnerConfiguration(parsed);
}
export function loadOwnerKey(filename,config) {
  assertConfig(config);
  if(typeof filename!=='string'||!path.isAbsolute(filename))fail('KEY_FILE_REQUIRED');
  const relative=path.relative(config.storageMount,filename);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('KEY_MUST_BE_OUTSIDE_STATE_VOLUME');
  const key=privateBytes(filename,32);if(key.length!==32){key.fill(0);fail('KEY_SIZE_INVALID');}return key;
}
export function publicAppPolicy(config) {
  assertConfig(config);
  return Object.freeze({serverOrigin:config.serverOrigin,catalogDigest:config.catalogDigest,
    googleWebClientId:config.googleWebClientId,accountDigest:config.accountDigest,accountLabel:config.ownerLabel});
}
const androidXml=text=>String(text).replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('"','\\"').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('@','\\@').replaceAll('?','\\?');
export function renderAppResources(template,config) {
  const p=publicAppPolicy(config);let out=template;
  for(const [name,value] of Object.entries({owner_google_web_client_id:p.googleWebClientId,owner_account_digest:p.accountDigest,owner_account_label:p.accountLabel})){
    const re=new RegExp('(<string name="'+name+'"[^>]*>)[\\s\\S]*?(</string>)','g');let matches=0;
    out=out.replace(re,(_,begin,end)=>{matches++;return begin+androidXml(value)+end;});
    if(matches!==1)fail('APP_RESOURCE_NOT_UNIQUE');
  }
  // Returns a candidate file; does not edit the baseline app or activate anything.
  return out;
}
export function hostOptions(config,key,stateDir=config.stateDir) {
  assertConfig(config);if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_SIZE_INVALID');
  return {googleClientId:config.googleWebClientId,allowedOwnerSubjects:[config.ownerSubject],allowedPresenters:[...config.allowedPresenterClientIds],
    serverOrigin:config.serverOrigin,catalogDigest:config.catalogDigest,encryptionKey:key,storageEpoch:config.storageEpoch,
    ownerJournalPath:path.join(stateDir,'owner-intents.sqlite'),registryPath:path.join(stateDir,'trusted-devices.sqlite'),initialize:false};
}
