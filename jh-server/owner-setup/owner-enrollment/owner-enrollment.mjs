/** Permanent-duration extension for the reviewed owner enrollment gate. */
import {createHash,createPublicKey,randomBytes} from 'node:crypto';
import {deny} from './enrollment-store.mjs';
import {
  GoogleOwnerVerifier,enrollmentMessage,OwnerEnrollmentGate as FiniteOwnerEnrollmentGate,
  assessEnrollmentDeployment
} from './owner-enrollment-base.mjs';
export {GoogleOwnerVerifier,enrollmentMessage,assessEnrollmentDeployment};
const HEX=/^[a-f0-9]{64}$/;
const hash=x=>createHash('sha256').update(x).digest('hex');
const exact=(value,names)=>{if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==[...names].sort().join('|'))deny('unexpected_fields');};
const nowValue=clock=>{const n=clock();if(!Number.isSafeInteger(n)||n<=0)deny('clock_invalid');return n;};
function publicKey(spki){
  if(typeof spki!=='string'||spki.length>1024||!/^[a-zA-Z0-9_-]+$/.test(spki))deny('public_key_invalid');
  try{const bytes=Buffer.from(spki,'base64url');if(bytes.toString('base64url')!==spki)deny('public_key_invalid');
    const key=createPublicKey({key:bytes,format:'der',type:'spki'});
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||!key.export({format:'der',type:'spki'}).equals(bytes))deny('public_key_invalid');
    return {keyDigest:hash(bytes)};
  }catch{deny('public_key_invalid');}
}
function checkedOrigin(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.origin!==value)deny('server_origin_invalid');return value;}catch{deny('server_origin_invalid');}}
export class OwnerEnrollmentGate{
  #base;#store;#origin;#catalog;#clock;
  constructor(options){
    this.#base=new FiniteOwnerEnrollmentGate(options);this.#store=options.store;
    this.#origin=checkedOrigin(options.serverOrigin);if(!HEX.test(options.catalogDigest))deny('catalog_invalid');
    this.#catalog=options.catalogDigest;this.#clock=options.clock||Date.now;
  }
  begin(input){
    if(input?.durationDays!==0)return this.#base.begin(input);
    exact(input,['publicKeySpki','deviceDigest','durationDays']);if(!HEX.test(input.deviceDigest))deny('enrollment_scope_invalid');
    const {keyDigest}=publicKey(input.publicKeySpki),now=nowValue(this.#clock),id=randomBytes(24).toString('base64url');
    const manifest={version:1,purpose:'SESSION_RECONNECT_ONLY',requestId:id,serverOrigin:this.#origin,catalogDigest:this.#catalog,deviceDigest:input.deviceDigest,keyDigest,durationDays:0,issuedAtMs:now,expiresAtMs:now+120000};
    const manifestDigest=hash(JSON.stringify(manifest));
    this.#store.create({id,expires:manifest.expiresAtMs,manifest,manifestDigest,publicKeySpki:input.publicKeySpki},now);
    return Object.freeze({requestId:id,manifest:Object.freeze(manifest),manifestDigest,googleNonce:manifestDigest,trustCreated:false});
  }
  authorize(input){return this.#base.authorize(input);}
}
