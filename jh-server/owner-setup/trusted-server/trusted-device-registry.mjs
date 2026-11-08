/**
 * Permanent-trust compatibility layer over the reviewed device registry.
 * Existing finite trusts retain their original expiry. A duration of zero is an
 * explicit owner-approved, non-expiring device trust; reconnect sessions remain
 * short lived and must still be renewed with the enrolled device key.
 */
import {DatabaseSync} from 'node:sqlite';
import {
  TrustedDeviceRegistry as FiniteTrustedDeviceRegistry,
  PURPOSE,MAX_TRUST_MS,CHALLENGE_MS,MAX_SESSION_MS,TrustError,sha256,canonicalChallenge
} from './trusted-device-registry-base.mjs';

export {PURPOSE,MAX_TRUST_MS,CHALLENGE_MS,MAX_SESSION_MS,TrustError,sha256,canonicalChallenge};
export const PERMANENT_TRUST_EXPIRES_AT=253_402_300_799_000;

const fail=code=>{throw new TrustError(code);};

export class TrustedDeviceRegistry {
  #base;#databasePath;#permanentEnrollment=false;
  constructor(options){
    if(!options||typeof options.authorizeEnrollment!=='function')fail('HOST_CONFIGURATION_REQUIRED');
    this.#databasePath=options.databasePath;
    const authorizeEnrollment=options.authorizeEnrollment;
    this.#base=new FiniteTrustedDeviceRegistry({...options,authorizeEnrollment:(context,expected)=>{
      const permanent=this.#permanentEnrollment&&expected?.requestedTrustMs===MAX_TRUST_MS;
      const normalized=permanent?Object.freeze({...expected,requestedTrustMs:0}):expected;
      const grant=authorizeEnrollment(context,normalized);
      return permanent&&grant?Object.freeze({...grant,exactConsentDigest:sha256(JSON.stringify(expected))}):grant;
    }});
  }
  get enrollmentInspectorContext(){return this.#base.enrollmentInspectorContext;}
  get issuerContext(){return this.#base.issuerContext;}
  inspectEnrollment(...a){return this.#base.inspectEnrollment(...a);}
  installOwnerEnrollmentFence(...a){return this.#base.installOwnerEnrollmentFence(...a);}
  bindEnrollmentJournal(...a){return this.#base.bindEnrollmentJournal(...a);}
  close(){return this.#base.close();}
  enroll(input,authenticatedContext){
    if(input?.requestedTrustMs!==0)return this.#base.enroll(input,authenticatedContext);
    this.#permanentEnrollment=true;
    let receipt;
    try{receipt=this.#base.enroll({...input,requestedTrustMs:MAX_TRUST_MS},authenticatedContext);}
    finally{this.#permanentEnrollment=false;}
    const db=new DatabaseSync(this.#databasePath,{timeout:5000});
    try{
      db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
      const changed=db.prepare('UPDATE trusts SET expires=? WHERE id=? AND revoked IS NULL').run(PERMANENT_TRUST_EXPIRES_AT,receipt.trustId);
      if(changed.changes!==1)fail('PERMANENT_TRUST_COMMIT_FAILED');
      db.exec('COMMIT');
    }catch(error){
      try{db.exec('ROLLBACK');}catch{}
      try{db.prepare('UPDATE trusts SET revoked=COALESCE(revoked,?) WHERE id=?').run(Date.now(),receipt.trustId);}catch{}
      if(error instanceof TrustError)throw error;
      fail('PERMANENT_TRUST_COMMIT_FAILED');
    }finally{db.close();}
    return Object.freeze({...receipt,expiresAt:PERMANENT_TRUST_EXPIRES_AT});
  }
  challenge(...a){return this.#base.challenge(...a);}
  verifyReconnectProof(...a){return this.#base.verifyReconnectProof(...a);}
  claimForSessionIssuer(...a){return this.#base.claimForSessionIssuer(...a);}
  inspectRecovery(...a){return this.#base.inspectRecovery(...a);}
  noteUncertainDispatch(...a){return this.#base.noteUncertainDispatch(...a);}
  recordDeviceResult(...a){return this.#base.recordDeviceResult(...a);}
  uncertainDispatchCount(...a){return this.#base.uncertainDispatchCount(...a);}
  trustForSessionIssuer(...a){return this.#base.trustForSessionIssuer(...a);}
  revoke(...a){return this.#base.revoke(...a);}
}
