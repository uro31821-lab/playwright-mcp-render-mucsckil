/**
 * Unreleased, opt-in device trust verifier. This is NOT an HTTP/MCP endpoint and
 * cannot itself activate a SecureBridge56 session or authorize a screen action.
 * The host must verify enrollment/revocation using its existing authenticated
 * account + phone-local consent path, not a request-body boolean.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { lstatSync, realpathSync, chmodSync, existsSync } from 'node:fs';
import { isAbsolute, dirname, resolve } from 'node:path';

export const PURPOSE = 'SESSION_RECONNECT_ONLY';
export const MAX_TRUST_MS = 30 * 24 * 60 * 60 * 1000;
export const CHALLENGE_MS = 60_000;
export const MAX_SESSION_MS = 30 * 60 * 1000;
export class TrustError extends Error {
  constructor(code) { super(code); this.name = 'TrustError'; this.code = code; }
}
const fail = code => { throw new TrustError(code); };
const hex = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const token = v => typeof v === 'string' && /^[A-Za-z0-9_-]{24,128}$/.test(v);
const number = v => Number.isSafeInteger(v) && v >= 0;
export const sha256 = v => createHash('sha256').update(v).digest('hex');
const random = () => randomBytes(24).toString('base64url');
function exactKeys(x, required) {
  if (!x || typeof x !== 'object' || Array.isArray(x) ||
      Object.keys(x).length !== required.length || required.some(k => !Object.hasOwn(x, k))) fail('INVALID_FIELDS');
}
function decode64(text, min, max) {
  if (typeof text !== 'string' || text.length > Math.ceil(max * 4 / 3) + 2 ||
      !/^[A-Za-z0-9_-]+$/.test(text)) fail('INVALID_ENCODING');
  const b = Buffer.from(text, 'base64url');
  if (b.length < min || b.length > max || b.toString('base64url') !== text) fail('INVALID_ENCODING');
  return b;
}
function publicIdentity(spki) {
  const bytes = decode64(spki, 70, 140);
  let key;
  try { key = createPublicKey({key: bytes, format: 'der', type: 'spki'}); } catch { fail('INVALID_PUBLIC_KEY'); }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') fail('P256_REQUIRED');
  if (!key.export({format:'der',type:'spki'}).equals(bytes)) fail('NON_CANONICAL_KEY');
  return { key, digest: sha256(bytes) };
}
const challengeFields = ['version','purpose','trustId','challengeId','clientNonce','serverNonce',
  'ownerDigest','deviceDigest','serverDigest','catalogDigest','keyDigest','issuedAt','expiresAt'];
export function canonicalChallenge(c) {
  exactKeys(c, challengeFields);
  if (c.version !== 1 || c.purpose !== PURPOSE) fail('PURPOSE_MISMATCH');
  for (const k of ['trustId','challengeId','clientNonce','serverNonce']) if (!token(c[k])) fail('INVALID_TOKEN');
  for (const k of ['ownerDigest','deviceDigest','serverDigest','catalogDigest','keyDigest']) if (!hex(c[k])) fail('INVALID_BINDING');
  if (!number(c.issuedAt) || !number(c.expiresAt) || c.expiresAt <= c.issuedAt || c.expiresAt-c.issuedAt > CHALLENGE_MS) fail('INVALID_DEADLINE');
  // All dynamic components are validated ASCII tokens/hex/integers. No delimiter injection.
  return Buffer.from(['JH_TRUST_CHALLENGE_V1', c.purpose, c.trustId, c.challengeId,
    c.clientNonce,c.serverNonce,c.ownerDigest,c.deviceDigest,c.serverDigest,c.catalogDigest,
    c.keyDigest,String(c.issuedAt),String(c.expiresAt)].join('\n'), 'utf8');
}

export class TrustedDeviceRegistry {
  #db; #now; #authEnroll; #authRevoke; #server; #catalog;
  #ownerFence=null; #ownerBinding=false;
  constructor({databasePath, serverDigest, catalogDigest, authorizeEnrollment, authorizeRevocation, now = Date.now}) {
    if (!hex(serverDigest) || !hex(catalogDigest) || typeof authorizeEnrollment !== 'function' ||
        typeof authorizeRevocation !== 'function' || typeof now !== 'function') fail('HOST_CONFIGURATION_REQUIRED');
    if (!isAbsolute(databasePath) || databasePath === ':memory:' || realpathSync(dirname(databasePath)) !== resolve(dirname(databasePath))) fail('PERSISTENT_PRIVATE_PATH_REQUIRED');
    const parent = lstatSync(dirname(databasePath));
    if (!parent.isDirectory() || (parent.mode & 0o077) !== 0) fail('PRIVATE_DIRECTORY_REQUIRED');
    if (existsSync(databasePath)) {
      const st=lstatSync(databasePath);
      if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) fail('PRIVATE_DATABASE_REQUIRED');
    }
    this.#db = new DatabaseSync(databasePath, {timeout:5000}); chmodSync(databasePath,0o600);
    this.#db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trusts(
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, device TEXT NOT NULL, server TEXT NOT NULL,
        catalog TEXT NOT NULL, spki TEXT NOT NULL, key_digest TEXT NOT NULL,
        created INTEGER NOT NULL, expires INTEGER NOT NULL, revoked INTEGER,
        enrollment TEXT NOT NULL UNIQUE, CHECK(expires>created));
      CREATE TABLE IF NOT EXISTS challenges(
        id TEXT PRIMARY KEY, trust_id TEXT NOT NULL REFERENCES trusts(id),
        json TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER, client_nonce TEXT NOT NULL,
        UNIQUE(trust_id,client_nonce));
      CREATE TABLE IF NOT EXISTS trusted_dispatches(
        job_digest TEXT PRIMARY KEY, trust_id TEXT NOT NULL REFERENCES trusts(id), created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS redemptions(
        id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL UNIQUE REFERENCES challenges(id),
        trust_id TEXT NOT NULL REFERENCES trusts(id), issued INTEGER NOT NULL,
        max_session_expires INTEGER NOT NULL, state TEXT NOT NULL);`);
    const version=this.#db.prepare('SELECT v FROM meta WHERE k=?').get('schema');
    if (version && version.v!=='1') {this.#db.close();fail('SCHEMA_MISMATCH');}
    this.#db.prepare('INSERT OR IGNORE INTO meta(k,v) VALUES(?,?)').run('schema','1');
    this.#server=serverDigest;this.#catalog=catalogDigest;this.#now=now;
    this.#authEnroll=authorizeEnrollment;this.#authRevoke=authorizeRevocation;
    this.#ownerBinding=!!this.#db.prepare('SELECT v FROM meta WHERE k=?').get('owner_journal_binding');
  }
  /** Internal reconciliation read. An outcome is not a new enrollment grant.
   * Intentionally retains revoked/expired rows for lost-response reconciliation. */
  enrollmentInspectorContext = Object.freeze({purpose:'OWNER_ENROLLMENT_RECONCILIATION_ONLY'});
  inspectEnrollment(enrollmentId, ctx) {
    if(ctx!==this.enrollmentInspectorContext)fail('ENROLLMENT_INSPECTOR_REQUIRED');
    if(!token(enrollmentId))fail('INVALID_TOKEN');
    const t=this.#db.prepare('SELECT * FROM trusts WHERE enrollment=?').get(enrollmentId);
    if(!t)return null;
    const n=this.#time();
    return Object.freeze({version:1,purpose:PURPOSE,trustId:t.id,ownerDigest:t.owner,
      deviceDigest:t.device,serverDigest:t.server,catalogDigest:t.catalog,keyDigest:t.key_digest,
      createdAt:t.created,expiresAt:t.expires,enrollmentId:t.enrollment,revokedAt:t.revoked,
      status:t.revoked!==null?'REVOKED':n<t.created?'CLOCK_ROLLBACK':n>=t.expires?'EXPIRED':'REGISTERED'});
  }
  installOwnerEnrollmentFence(fn){
    if(!this.#ownerBinding||this.#ownerFence||typeof fn!=='function')fail('OWNER_FENCE_CONFIGURATION_INVALID');
    this.#ownerFence=fn;
  }
  bindEnrollmentJournal(bindingDigest, initialize=false) {
    if(!hex(bindingDigest)||typeof initialize!=='boolean')fail('REGISTRY_BINDING_INVALID');
    return this.#transaction(()=>{
      const row=this.#db.prepare('SELECT v FROM meta WHERE k=?').get('owner_journal_binding');
      if(row){if(initialize||row.v!==bindingDigest)fail('REGISTRY_JOURNAL_MISMATCH');this.#ownerBinding=true;return true;}
      if(!initialize||this.#db.prepare('SELECT COUNT(*) n FROM trusts').get().n!==0)fail('REGISTRY_BINDING_INITIALIZATION_REQUIRED');
      this.#db.prepare('INSERT INTO meta VALUES (?,?)').run('owner_journal_binding',bindingDigest);this.#ownerBinding=true;return true;
    });
  }
  close(){this.#db.close();}
  #transaction(fn){this.#db.exec('BEGIN IMMEDIATE');try{const result=fn();this.#db.exec('COMMIT');return result;}catch(e){this.#db.exec('ROLLBACK');throw e;}}
  #time(){const n=this.#now();if(!number(n))fail('INVALID_CLOCK');return n;}
  #trust(id,n){
    if(!token(id))fail('INVALID_TOKEN');
    const r=this.#db.prepare('SELECT * FROM trusts WHERE id=?').get(id);
    if(!r)fail('TRUST_NOT_FOUND');if(r.revoked!==null)fail('TRUST_REVOKED');
    if(n<r.created)fail('CLOCK_ROLLBACK');if(n>=r.expires)fail('TRUST_EXPIRED');
    if(r.server!==this.#server || r.catalog!==this.#catalog)fail('TRUST_SCOPE_CHANGED');
    if(this.#ownerBinding){let ok=false;try{ok=this.#ownerFence?.(Object.freeze({...r}))===true;}catch{}if(!ok)fail('OWNER_ENROLLMENT_FENCED');}
    return r;
  }
  enroll(input, authenticatedContext){
    exactKeys(input,['publicKeySpki','deviceDigest','requestedTrustMs','consentRequestId']);
    if(!hex(input.deviceDigest)||!token(input.consentRequestId)||!number(input.requestedTrustMs)||
      input.requestedTrustMs<300_000||input.requestedTrustMs>MAX_TRUST_MS)fail('INVALID_ENROLLMENT');
    const identity=publicIdentity(input.publicKeySpki);
    const expected=Object.freeze({deviceDigest:input.deviceDigest,serverDigest:this.#server,catalogDigest:this.#catalog,
      keyDigest:identity.digest,purpose:PURPOSE,requestedTrustMs:input.requestedTrustMs,consentRequestId:input.consentRequestId});
    // Trusted host callback must consume the exact phone-local grant and authenticate the owner.
    // There is deliberately no "confirmed:true" request field or permissive default.
    const grant=this.#authEnroll(authenticatedContext,expected);
    if(!grant||grant instanceof Promise||!hex(grant.ownerDigest)||!token(grant.enrollmentId)||
      grant.exactConsentDigest!==sha256(JSON.stringify(expected)))fail('ENROLLMENT_AUTH_REQUIRED');
    return this.#transaction(()=>{
      const n=this.#time();if(!number(grant.expiresAt)||grant.expiresAt<=n||grant.expiresAt-n>CHALLENGE_MS)fail('ENROLLMENT_AUTH_EXPIRED');
      if(this.#db.prepare('SELECT id FROM trusts WHERE enrollment=?').get(grant.enrollmentId))fail('ENROLLMENT_REPLAY');
      const id=random();const expires=n+input.requestedTrustMs;
      this.#db.prepare('INSERT INTO trusts(id,owner,device,server,catalog,spki,key_digest,created,expires,revoked,enrollment) VALUES(?,?,?,?,?,?,?,?,?,NULL,?)')
        .run(id,grant.ownerDigest,input.deviceDigest,this.#server,this.#catalog,input.publicKeySpki,identity.digest,n,expires,grant.enrollmentId);
      return Object.freeze({version:1,purpose:PURPOSE,trustId:id,ownerDigest:grant.ownerDigest,
        deviceDigest:input.deviceDigest,serverDigest:this.#server,catalogDigest:this.#catalog,
        keyDigest:identity.digest,createdAt:n,expiresAt:expires});
    });
  }
  challenge(trustId,clientNonce){
    if(!token(clientNonce))fail('INVALID_TOKEN');
    return this.#transaction(()=>{
      const n=this.#time(),t=this.#trust(trustId,n);
      // Expired/used challenge records may be retained for audit; bound outstanding work.
      if(this.#db.prepare('SELECT id FROM challenges WHERE trust_id=? AND client_nonce=?').get(trustId,clientNonce))fail('CLIENT_NONCE_REUSED');
      if(this.#db.prepare('SELECT count(*) AS n FROM challenges WHERE trust_id=? AND used IS NULL AND expires>?').get(trustId,n).n>=4)fail('CHALLENGE_LIMIT');
      const c=Object.freeze({version:1,purpose:PURPOSE,trustId,challengeId:random(),clientNonce,serverNonce:random(),
        ownerDigest:t.owner,deviceDigest:t.device,serverDigest:t.server,catalogDigest:t.catalog,keyDigest:t.key_digest,
        issuedAt:n,expiresAt:Math.min(t.expires,n+CHALLENGE_MS)});
      canonicalChallenge(c);
      this.#db.prepare('INSERT INTO challenges(id,trust_id,json,expires,used,client_nonce) VALUES(?,?,?,?,NULL,?)')
        .run(c.challengeId,trustId,JSON.stringify(c),c.expiresAt,clientNonce);
      return c;
    });
  }
  verifyReconnectProof(proof){
    exactKeys(proof,['challenge','signature']);
    const material=canonicalChallenge(proof.challenge), signature=decode64(proof.signature,8,80);
    return this.#transaction(()=>{
      const n=this.#time(),c=proof.challenge,t=this.#trust(c.trustId,n);
      const row=this.#db.prepare('SELECT * FROM challenges WHERE id=?').get(c.challengeId);
      if(!row||row.trust_id!==t.id)fail('CHALLENGE_NOT_FOUND');
      if(row.used!==null)fail('PROOF_REPLAY');if(n<c.issuedAt)fail('CLOCK_ROLLBACK');if(n>=row.expires)fail('CHALLENGE_EXPIRED');
      const issued=JSON.parse(row.json);
      if(!canonicalChallenge(issued).equals(material))fail('CHALLENGE_TAMPERED');
      if(c.ownerDigest!==t.owner||c.deviceDigest!==t.device||c.keyDigest!==t.key_digest||
        c.serverDigest!==this.#server||c.catalogDigest!==this.#catalog)fail('BINDING_MISMATCH');
      const identity=publicIdentity(t.spki);
      let valid=false;try{valid=verify('sha256',material,identity.key,signature);}catch{}
      if(!valid)fail('INVALID_SIGNATURE');
      const changed=this.#db.prepare('UPDATE challenges SET used=? WHERE id=? AND used IS NULL').run(n,c.challengeId);
      if(changed.changes!==1)fail('PROOF_REPLAY');
      const id=random(),expires=Math.min(t.expires,n+MAX_SESSION_MS);
      this.#db.prepare('INSERT INTO redemptions VALUES(?,?,?,?,?,?)').run(id,c.challengeId,t.id,n,expires,'VERIFIED_NOT_ISSUED');
      // This receipt is NOT a session, bearer token, screen grant or successful reconnection.
      return Object.freeze({version:1,status:'PROOF_VERIFIED_SESSION_NOT_ISSUED',redemptionId:id,
        purpose:PURPOSE,trustId:t.id,ownerDigest:t.owner,deviceDigest:t.device,serverDigest:t.server,
        catalogDigest:t.catalog,maxSessionExpiresAt:expires,actionApprovalGranted:false,screenConsentGranted:false});
    });
  }
  claimForSessionIssuer(redemptionId, trustedContext){
    if(!token(redemptionId))fail('INVALID_TOKEN');
    // Only a host-internal issuer may consume. Not an endpoint and not a client claim.
    if(!trustedContext||trustedContext!==this.issuerContext)fail('ISSUER_CONTEXT_REQUIRED');
    return this.#transaction(()=>{
      const n=this.#time(),r=this.#db.prepare('SELECT * FROM redemptions WHERE id=?').get(redemptionId);
      if(!r||r.state!=='VERIFIED_NOT_ISSUED')fail('REDEMPTION_UNAVAILABLE');
      const t=this.#trust(r.trust_id,n);if(n>=r.max_session_expires||n-r.issued>=CHALLENGE_MS)fail('REDEMPTION_EXPIRED');
      this.#db.prepare('UPDATE redemptions SET state=? WHERE id=?').run('CLAIMED_RECONCILE_ON_FAILURE',redemptionId);
      return Object.freeze({ownerDigest:t.owner,deviceDigest:t.device,serverDigest:t.server,catalogDigest:t.catalog,
        trustId:t.id,redemptionId,maxSessionExpiresAt:r.max_session_expires,purpose:PURPOSE});
    });
  }
  /** Domain-separated, signed READ of reconnect blockers. Never issues a session,
   * releases a redemption or clears uncertain dispatched effects. Consumes only
   * this recovery challenge, durably, so its proof cannot authorize a reconnect.
   */
  inspectRecovery(proof){
    exactKeys(proof,['challenge','attemptDigest','signature']);
    if(!hex(proof.attemptDigest))fail('INVALID_ATTEMPT_DIGEST');
    const canonical=canonicalChallenge(proof.challenge),signature=decode64(proof.signature,8,80);
    const material=Buffer.concat([Buffer.from('JH_TRUST_RECOVERY_V1\n'+proof.attemptDigest+'\n'),canonical]);
    return this.#transaction(()=>{
      const n=this.#time(),c=proof.challenge,t=this.#trust(c.trustId,n);
      const row=this.#db.prepare('SELECT * FROM challenges WHERE id=?').get(c.challengeId);
      if(!row||row.trust_id!==t.id)fail('CHALLENGE_NOT_FOUND');
      if(row.used!==null)fail('PROOF_REPLAY');
      if(n<c.issuedAt)fail('CLOCK_ROLLBACK');if(n>=row.expires)fail('CHALLENGE_EXPIRED');
      if(!canonicalChallenge(JSON.parse(row.json)).equals(canonical))fail('CHALLENGE_TAMPERED');
      if(c.ownerDigest!==t.owner||c.deviceDigest!==t.device||c.keyDigest!==t.key_digest||
          c.serverDigest!==this.#server||c.catalogDigest!==this.#catalog)fail('BINDING_MISMATCH');
      let valid=false;try{valid=verify('sha256',material,publicIdentity(t.spki).key,signature);}catch{}
      if(!valid)fail('INVALID_SIGNATURE');
      const changed=this.#db.prepare('UPDATE challenges SET used=? WHERE id=? AND used IS NULL').run(n,c.challengeId);
      if(changed.changes!==1)fail('PROOF_REPLAY');
      const unused=this.#db.prepare('SELECT COUNT(*) n FROM challenges WHERE trust_id=? AND used IS NULL AND expires>?').get(t.id,n).n;
      const redeemable=this.#db.prepare("SELECT COUNT(*) n FROM redemptions WHERE trust_id=? AND state='VERIFIED_NOT_ISSUED' AND issued>? AND max_session_expires>?").get(t.id,n-CHALLENGE_MS,n).n;
      const uncertain=this.#db.prepare('SELECT COUNT(*) n FROM trusted_dispatches WHERE trust_id=?').get(t.id).n;
      return {trustId:t.id,ownerDigest:t.owner,deviceDigest:t.device,serverDigest:t.server,catalogDigest:t.catalog,
        challengeId:c.challengeId,clientNonce:c.clientNonce,attemptDigest:proof.attemptDigest,
        unusedChallenges:unused,redeemableProofs:redeemable,dispatchedJobsUncertain:uncertain,
        serverTime:n,validUntil:Math.min(n+5000,t.expires)};
    });
  }
  noteUncertainDispatch(trustId,jobDigest,trustedContext){
    if(trustedContext!==this.issuerContext||!hex(jobDigest))fail('ISSUER_CONTEXT_REQUIRED');
    return this.#transaction(()=>{const n=this.#time();this.#trust(trustId,n);
      if(this.#db.prepare('SELECT COUNT(*) n FROM trusted_dispatches WHERE trust_id=?').get(trustId).n>=512)fail('UNRESOLVED_DISPATCH_LIMIT');
      this.#db.prepare('INSERT INTO trusted_dispatches VALUES(?,?,?)').run(jobDigest,trustId,n);});
  }
  uncertainDispatchCount(trustId,trustedContext){
    if(trustedContext!==this.issuerContext||!token(trustId))fail('ISSUER_CONTEXT_REQUIRED');
    return this.#db.prepare('SELECT COUNT(*) n FROM trusted_dispatches WHERE trust_id=?').get(trustId).n;
  }
  /** Host-only live fence for both issuance and existing Bridge sessions.
   * Reads the durable registry on every use; no cached "trusted" boolean. */
  trustForSessionIssuer(trustId, trustedContext){
    if(!trustedContext||trustedContext!==this.issuerContext)fail('ISSUER_CONTEXT_REQUIRED');
    const t=this.#trust(trustId,this.#time());
    return Object.freeze({trustId:t.id,ownerDigest:t.owner,deviceDigest:t.device,
      serverDigest:t.server,catalogDigest:t.catalog,keyDigest:t.key_digest,expiresAt:t.expires});
  }
  // Unique process-local capability; the HTTP layer must never expose it.
  issuerContext=Object.freeze({});
  revoke(trustId, authenticatedContext){
    if(!token(trustId))fail('INVALID_TOKEN');
    const grant=this.#authRevoke(authenticatedContext,trustId);
    if(!grant||grant instanceof Promise||!hex(grant.ownerDigest))fail('REVOCATION_AUTH_REQUIRED');
    return this.#transaction(()=>{
      const n=this.#time(),t=this.#db.prepare('SELECT * FROM trusts WHERE id=?').get(trustId);
      if(!t||t.owner!==grant.ownerDigest)fail('REVOCATION_AUTH_REQUIRED');
      this.#db.prepare('UPDATE trusts SET revoked=COALESCE(revoked,?) WHERE id=?').run(n,trustId);
      this.#db.prepare('UPDATE redemptions SET state=? WHERE trust_id=?').run('REVOKED',trustId);
      return {status:'TRUST_REVOKED',activeSessionsRevoked:false};
    });
  }
}
