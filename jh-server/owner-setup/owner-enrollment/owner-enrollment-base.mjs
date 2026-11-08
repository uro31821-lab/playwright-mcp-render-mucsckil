import {OAuth2Client} from 'google-auth-library';
import {createHash, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature} from 'node:crypto';
import {deny} from './enrollment-store.mjs';
const ISSUERS=['https://accounts.google.com','accounts.google.com'];
const HEX=/^[a-f0-9]{64}$/;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const hash=x=>createHash('sha256').update(x).digest('hex');
function exact(value,names) {if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==[...names].sort().join('|'))deny('unexpected_fields');}
function integer(n) {return Number.isSafeInteger(n);}
function nowValue(clock) {const n=clock();if(!integer(n)||n<=0)deny('clock_invalid');return n;}
function origin(s) {try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.origin!==s)deny('server_origin_invalid');return s;}catch{deny('server_origin_invalid');}}
function publicKey(spki) {
  if(typeof spki!=='string'||spki.length>1024||!/^[a-zA-Z0-9_-]+$/.test(spki))deny('public_key_invalid');
  try{const bytes=Buffer.from(spki,'base64url');if(bytes.toString('base64url')!==spki)deny('public_key_invalid');
    const k=createPublicKey({key:bytes,format:'der',type:'spki'});
    if(k.asymmetricKeyType!=='ec'||k.asymmetricKeyDetails?.namedCurve!=='prime256v1'||!k.export({format:'der',type:'spki'}).equals(bytes))deny('public_key_invalid');
    return {key:k,keyDigest:hash(bytes)};
  }catch{deny('public_key_invalid');}
}

/** Production verifies Google certificates via Google's library; tests inject a
 * library client backed by a synthetic certificate. Never accepts decoded claims,
 * caller-supplied subject, caller-supplied audience, OAuth cookies or a Boolean.
 * OAuth provisioning and the Android sign-in UI are not implemented here.
 */
export class GoogleOwnerVerifier {
  #client;#audience;#subjects;#azp;#clock;
  get configurationDigest(){return hash(JSON.stringify(["JH_OWNER_POLICY_V1",this.#audience,[...this.#subjects].sort(),[...this.#azp].sort()]));}
  constructor({clientId, allowedSubjects, allowedPresenters=[clientId], clock=Date.now, oauthClient=new OAuth2Client()}) {
    if(typeof clientId!=='string'||!/^[-a-zA-Z0-9.]+\.apps\.googleusercontent\.com$/.test(clientId)||!Array.isArray(allowedSubjects)||!allowedSubjects.length||allowedSubjects.length>8||allowedSubjects.some(x=>typeof x!=='string'||!/^[-a-zA-Z0-9_]{1,255}$/.test(x)))deny('owner_configuration_required');
    if(!Array.isArray(allowedPresenters)||!allowedPresenters.length||allowedPresenters.some(x=>typeof x!=='string'||x.length>255))deny('presenter_configuration_invalid');
    this.#audience=clientId;this.#subjects=new Set(allowedSubjects);this.#azp=new Set(allowedPresenters);this.#client=oauthClient;this.#clock=clock;
  }
  async verify(idToken,expectedNonce) {
    if(typeof idToken!=='string'||Buffer.byteLength(idToken)>8192||!/^[-a-zA-Z0-9_]+\.[-a-zA-Z0-9_]+\.[-a-zA-Z0-9_]+$/.test(idToken)||!HEX.test(expectedNonce))deny('identity_token_invalid');
    try{const h=JSON.parse(Buffer.from(idToken.split('.')[0],'base64url').toString('utf8'));if(h.alg!=='RS256'||h.jku||h.x5u||h.crit)deny('identity_token_invalid');}catch{deny('identity_token_invalid');}
    let p;
    try{const ticket=await this.#client.verifyIdToken({idToken,audience:this.#audience});p=ticket.getPayload();}
    catch{deny('identity_verification_failed');}
    const now=Math.floor(nowValue(this.#clock)/1000);
    if(!p||!ISSUERS.includes(p.iss)||p.aud!==this.#audience||!this.#subjects.has(p.sub)||(p.azp!==undefined&&!this.#azp.has(p.azp)))deny('owner_not_authorized');
    if(!integer(p.exp)||!integer(p.iat)||p.exp<=now||p.iat>now+30||now-p.iat>300||p.exp-p.iat>3600||p.exp<=p.iat||(p.nbf!==undefined&&(!integer(p.nbf)||p.nbf>now)))deny('identity_time_invalid');
    if(!same(p.nonce,expectedNonce))deny('identity_nonce_mismatch');
    return Object.freeze({accountDigest:hash('JH_GOOGLE_OWNER_V1|https://accounts.google.com|'+p.sub+'|'+this.#audience)});
  }
}

export function enrollmentMessage(manifestDigest,accountDigest) {
  if(!HEX.test(manifestDigest)||!HEX.test(accountDigest))deny('consent_binding_invalid');
  return Buffer.from('JH_OWNER_ENROLL_V1\n'+manifestDigest+'\n'+accountDigest,'utf8');
}

/** Authorization stage only. The receipt is explicitly NOT Bridge registration,
 * a session grant, action approval, screenshot consent, or proof of human touch.
 * The existing trusted UI and Registry must consume this gate in a later integration.
 */
export class OwnerEnrollmentGate {
  #store;#verifier;#origin;#catalog;#clock;
  constructor({store,verifier,serverOrigin,catalogDigest,clock=Date.now}) {
    this.#origin=origin(serverOrigin);if(!HEX.test(catalogDigest))deny('catalog_invalid');
    this.#catalog=catalogDigest;this.#store=store;this.#verifier=verifier;this.#clock=clock;
  }
  begin(input) {
    exact(input,['publicKeySpki','deviceDigest','durationDays']);
    if(!HEX.test(input.deviceDigest)||![1,7,30].includes(input.durationDays))deny('enrollment_scope_invalid');
    const {keyDigest}=publicKey(input.publicKeySpki),now=nowValue(this.#clock),id=randomBytes(24).toString('base64url');
    const manifest={version:1,purpose:'SESSION_RECONNECT_ONLY',requestId:id,serverOrigin:this.#origin,catalogDigest:this.#catalog,deviceDigest:input.deviceDigest,keyDigest,durationDays:input.durationDays,issuedAtMs:now,expiresAtMs:now+120000};
    const manifestDigest=hash(JSON.stringify(manifest));
    this.#store.create({id,expires:manifest.expiresAtMs,manifest,manifestDigest,publicKeySpki:input.publicKeySpki},now);
    return Object.freeze({requestId:id,manifest:Object.freeze(manifest),manifestDigest,googleNonce:manifestDigest,trustCreated:false});
  }
  async authorize(input) {
    exact(input,['requestId','idToken','consentSignature']);
    if(typeof input.requestId!=='string'||!/^[-a-zA-Z0-9_]{32}$/.test(input.requestId)||typeof input.consentSignature!=='string'||input.consentSignature.length>144||!/^[-a-zA-Z0-9_]+$/.test(input.consentSignature))deny('consent_invalid');
    const record=this.#store.beginVerification(input.requestId,nowValue(this.#clock));
    if(record.manifest.serverOrigin!==this.#origin||record.manifest.catalogDigest!==this.#catalog||record.manifest.purpose!=='SESSION_RECONNECT_ONLY')deny('enrollment_policy_changed');
    const owner=await this.#verifier.verify(input.idToken,record.manifestDigest);
    const {key,keyDigest}=publicKey(record.publicKeySpki);
    const sig=Buffer.from(input.consentSignature,'base64url');
    if(sig.toString('base64url')!==input.consentSignature||keyDigest!==record.manifest.keyDigest||!verifySignature('sha256',enrollmentMessage(record.manifestDigest,owner.accountDigest),{key,dsaEncoding:'der'},sig))deny('consent_signature_invalid');
    const done=this.#store.authorize(record.id,record.manifestDigest,owner.accountDigest,nowValue(this.#clock));
    return Object.freeze({code:'AUTHENTICATED_ENROLLMENT_NOT_APPLIED',requestId:done.id,manifestDigest:done.manifestDigest,accountDigest:done.accountDigest,trustCreated:false,sessionCreated:false,actionApproved:false});
  }
}

/** Readiness assessment of operator-supplied deployment metadata; NOT a disk
 * durability attestation. Never provisions or upgrades a paid service.
 */
export function assessEnrollmentDeployment({googleClientConfigured,ownerSubjectConfigured,storage,renderPlan}) {
  const blockers=[];
  if(googleClientConfigured!==true)blockers.push('GOOGLE_CLIENT_CONFIGURATION_REQUIRED');
  if(ownerSubjectConfigured!==true)blockers.push('OWNER_SUBJECT_CONFIGURATION_REQUIRED');
  if(!storage||!['sqlite-persistent-volume','postgres'].includes(storage.kind))blockers.push('DURABLE_STORAGE_REQUIRED');
  else if(storage.kind==='sqlite-persistent-volume'&&(renderPlan==='free'||storage.verifiedMount!==true))blockers.push('SQLITE_PERSISTENT_MOUNT_REQUIRED');
  else if(storage.kind==='postgres'&&(storage.connectionVerified!==true||storage.expiresAt!=null))blockers.push('NONEXPIRING_DATABASE_REQUIRED');
  return {readyForIntegration:blockers.length===0,blockers,provisioned:false,productionChanged:false};
}
