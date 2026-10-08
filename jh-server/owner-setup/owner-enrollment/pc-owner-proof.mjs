/** PC bootstrap identity proof only. Never issues application tokens, enables
 * an owner, opens a database, grants device trust, or approves an action.
 * Passwords/OTP stay at Google; only a transient ID token is verified here. */
import {OAuth2Client} from 'google-auth-library';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {parseOwnerJson} from './owner-enrollment-http.mjs';
const ORIGIN='https://jh-secure-bridge-fix4.onrender.com';
const CLIENT=/^[-a-zA-Z0-9.]{1,220}\.apps\.googleusercontent\.com$/;
const HEX=/^[a-f0-9]{64}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
const proofs=new WeakSet();
export function assertPcIdentityEvidence(value){if(!proofs.has(value))fail('VERIFIED_PC_EVIDENCE_REQUIRED');}
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))fail('PROOF_FIELDS_INVALID');}
function parseJwt(token){
 if(typeof token!=='string'||Buffer.byteLength(token)>8192||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(token))fail('IDENTITY_TOKEN_INVALID');
 const parts=token.split('.');
 for(const p of parts)if(Buffer.from(p,'base64url').toString('base64url')!==p)fail('IDENTITY_TOKEN_INVALID');
 let h,p;try{h=parseOwnerJson(Buffer.from(parts[0],'base64url'));p=parseOwnerJson(Buffer.from(parts[1],'base64url'));}catch{fail('IDENTITY_TOKEN_INVALID');}
 if(h.alg!=='RS256'||typeof h.kid!=='string'||!h.kid||h.kid.length>128||h.jku!==undefined||h.x5u!==undefined||h.jwk!==undefined||h.crit!==undefined)fail('IDENTITY_TOKEN_INVALID');
 return p; // Never trusted until Google's signature verifier has succeeded.
}
export class PcOwnerIdentityProof {
 #config;#client;#clock;#last=0;#window=0;#attempts=0;#sessions=new Map();#evidence=new Map();#closed=false;#timeout;
 constructor({serverOrigin,googleWebClientId,expectedGmail,expectedSubject=null,oauthClient=new OAuth2Client(),clock=Date.now,verificationTimeoutMs=8000}){
  if(serverOrigin!==ORIGIN||!CLIENT.test(googleWebClientId||'')||typeof expectedGmail!=='string'||!/^[a-z0-9][a-z0-9.+_-]{0,63}@gmail\.com$/.test(expectedGmail))fail('PC_PROOF_CONFIGURATION_REQUIRED');
  if(expectedSubject!==null&&(typeof expectedSubject!=='string'||!/^[-A-Za-z0-9_]{1,255}$/.test(expectedSubject)))fail('PC_PROOF_CONFIGURATION_REQUIRED');
  if(!Number.isSafeInteger(verificationTimeoutMs)||verificationTimeoutMs<1||verificationTimeoutMs>8000)fail('PC_PROOF_CONFIGURATION_REQUIRED');
  this.#config=Object.freeze({serverOrigin,googleWebClientId,expectedGmail,expectedSubject});this.#client=oauthClient;this.#clock=clock;this.#timeout=verificationTimeoutMs;
 }
 get serverOrigin(){return this.#config.serverOrigin;}
 #now(){const n=this.#clock();if(this.#closed||!Number.isSafeInteger(n)||n<=0||n<this.#last)fail('PC_PROOF_UNAVAILABLE',503);this.#last=n;return n;}
 #purge(now){for(const [id,r]of this.#sessions)if(r.expiresAt<=now)this.#sessions.delete(id);for(const [id,r]of this.#evidence)if(r.expiresAt<=now)this.#evidence.delete(id);}
 begin(){
  const now=this.#now();this.#purge(now);if(now-this.#window>=60000){this.#window=now;this.#attempts=0;}
  if(++this.#attempts>16||this.#sessions.size>=64||this.#evidence.size>=16)fail('PC_PROOF_RATE_LIMIT',429);
  const session=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('hex'),expiresAt=now+120000;
  const nonce=hash('JH_PC_IDENTITY_ONLY_V1|'+this.#config.googleWebClientId+'|'+session+'|'+csrf+'|'+expiresAt);
  this.#sessions.set(hash(session),{csrf,nonce,expiresAt,state:'PENDING',createdAt:now});
  return {session,csrf,nonce,expiresAt,googleWebClientId:this.#config.googleWebClientId};
 }
 #pending(session,csrf){
  const now=this.#now();this.#purge(now);
  if(typeof session!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(session)||!HEX.test(csrf||''))fail('PC_PROOF_CSRF_REJECTED',403);
  const r=this.#sessions.get(hash(session));if(!r||!same(r.csrf,csrf))fail('PC_PROOF_CSRF_REJECTED',403);
  if(r.state!=='PENDING')fail('PC_PROOF_ALREADY_USED',409);return r;
 }
 cancel(session,input){
  exact(input,['csrf']);const now=this.#now();this.#purge(now);
  if(typeof session!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(session))fail('PC_PROOF_CSRF_REJECTED',403);
  const r=this.#sessions.get(hash(session));
  if(!r||!same(r.csrf,input.csrf))fail('PC_PROOF_CSRF_REJECTED',403);
  if(!['PENDING','VERIFYING'].includes(r.state))fail('PC_PROOF_ALREADY_USED',409);
  r.state='CANCELED';return {ok:true,code:'IDENTITY_CHECK_CANCELED',actionApproved:false};
 }
 async finish(session,input,{signal}={}){
  exact(input,['csrf','credential']);const r=this.#pending(session,input.csrf);r.state='VERIFYING';
  let timer,abort;
  try{
   if(signal?.aborted)fail('PC_PROOF_CANCELED',409);
   const claims=parseJwt(input.credential);
   const verify=this.#client.verifyIdToken({idToken:input.credential,audience:this.#config.googleWebClientId,maxExpiry:3600});
   const stop=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(new Error('PC_PROOF_VERIFY_TIMEOUT'),{code:'PC_PROOF_VERIFY_TIMEOUT',status:503})),this.#timeout);
    if(signal){abort=()=>reject(Object.assign(new Error('PC_PROOF_CANCELED'),{code:'PC_PROOF_CANCELED',status:409}));signal.addEventListener('abort',abort,{once:true});}
   });
   let ticket;try{ticket=await Promise.race([verify,stop]);}catch(e){if(['PC_PROOF_VERIFY_TIMEOUT','PC_PROOF_CANCELED'].includes(e.code))throw e;fail('GOOGLE_IDENTITY_VERIFICATION_FAILED',401);}
   const now=this.#now(),seconds=Math.floor(now/1000),p=ticket.getPayload();
   if(signal?.aborted||r.state!=='VERIFYING'||r.expiresAt<=now||!this.#sessions.has(hash(session)))fail('PC_PROOF_CANCELED_OR_EXPIRED',409);
   if(!p||JSON.stringify(p)!==JSON.stringify(claims)||!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||p.aud!==this.#config.googleWebClientId||(p.azp!==undefined&&p.azp!==this.#config.googleWebClientId))fail('IDENTITY_CLAIMS_REJECTED',401);
   if(typeof p.sub!=='string'||!/^[-A-Za-z0-9_]{1,255}$/.test(p.sub)||typeof p.email!=='string'||p.email.toLowerCase()!==this.#config.expectedGmail||p.email_verified!==true||(this.#config.expectedSubject!==null&&p.sub!==this.#config.expectedSubject))fail('IDENTITY_ACCOUNT_REJECTED',403);
   if(!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.exp<=seconds||p.iat>seconds+30||seconds-p.iat>300||p.exp<=p.iat||p.exp-p.iat>3600||(p.nbf!==undefined&&(!Number.isSafeInteger(p.nbf)||p.nbf>seconds)))fail('IDENTITY_TIME_REJECTED',401);
   if(!same(p.nonce,r.nonce))fail('IDENTITY_NONCE_REJECTED',401);
   const receiptId=randomBytes(24).toString('base64url'),expiresAt=Math.min(r.expiresAt,p.exp*1000);
   const evidence=Object.freeze({purpose:'JH_PC_IDENTITY_ONLY_V1',issuer:'https://accounts.google.com',subject:p.sub,googleWebClientId:this.#config.googleWebClientId,accountDigest:hash('JH_GOOGLE_OWNER_V1|https://accounts.google.com|'+p.sub+'|'+this.#config.googleWebClientId),accountSelectionDigest:hash('JH_PC_ACCOUNT_SELECTION_V1|'+p.email.toLowerCase()+'|'+this.#config.googleWebClientId),verifiedAt:now,expiresAt,authorityGranted:false});
   proofs.add(evidence);this.#evidence.set(receiptId,evidence);r.state='VERIFIED';
   return {ok:true,code:'IDENTITY_VERIFIED_NOT_CONFIGURED',receiptId,identityVerified:true,ownerConfigured:false,trustCreated:false,actionApproved:false};
  }finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);if(r.state==='VERIFYING')r.state='FAILED';}
 }
 // Internal in-process handoff only. There is deliberately no HTTP route for it.
 takeEvidence(receiptId){const now=this.#now();this.#purge(now);const p=this.#evidence.get(receiptId);if(!p)fail('PC_EVIDENCE_NOT_AVAILABLE',409);this.#evidence.delete(receiptId);return p;}
 close(){this.#closed=true;this.#sessions.clear();this.#evidence.clear();}
}
