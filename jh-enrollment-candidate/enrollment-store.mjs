import {DatabaseSync} from 'node:sqlite';
import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {lstatSync, openSync, closeSync, fsyncSync, chmodSync} from 'node:fs';
import path from 'node:path';

export class EnrollmentError extends Error {
  constructor(code) { super(code); this.name='EnrollmentError'; this.code=code; }
}
export const deny = code => { throw new EnrollmentError(code); };
const eq = (a,b) => typeof a==='string' && typeof b==='string' && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));

/** Internal-only journal. It neither creates Bridge trust nor publishes an HTTP route.
 * A durable directory must be provisioned separately. A local SQLite file is NOT
 * proof that a cloud host will preserve it across deploys. Never auto-initialize
 * a missing production journal or silently accept a restored epoch.
 */
export class EnrollmentStore {
  #db; #key; #epoch; #closed=false;
  constructor({filename, key, epoch, initialize=false}) {
    if (!path.isAbsolute(filename) || filename.includes('\0') || !Buffer.isBuffer(key) || key.length!==32 || !/^[a-zA-Z0-9_-]{16,128}$/.test(epoch)) deny('storage_configuration_invalid');
    const parent=path.dirname(filename);
    let current=path.parse(parent).root;
    for(const part of parent.slice(current.length).split(path.sep).filter(Boolean)) {
      current=path.join(current,part); const s=lstatSync(current);
      if(s.isSymbolicLink() || !s.isDirectory()) deny('storage_parent_invalid');
    }
    // Require a dedicated private directory, not /tmp itself or a world-readable folder.
    if((lstatSync(parent).mode & 0o077)!==0) deny('storage_directory_not_private');
    let exists=false;
    try { const s=lstatSync(filename); exists=true; if(!s.isFile() || s.isSymbolicLink() || (s.mode & 0o077)!==0) deny('storage_file_invalid'); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    if(!exists && !initialize) deny('storage_missing_recovery_required');
    if(exists && initialize) deny('storage_already_exists');
    if(!exists) { const fd=openSync(filename,'wx',0o600); fsyncSync(fd); closeSync(fd); }
    this.#key=Buffer.from(key); this.#epoch=epoch;
    try {
      this.#db=new DatabaseSync(filename,{timeout:5000});
      this.#db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      if(initialize) {
        this.#db.exec('BEGIN IMMEDIATE; CREATE TABLE meta(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE intents(id TEXT PRIMARY KEY,expires INTEGER NOT NULL,body TEXT NOT NULL); CREATE INDEX intents_expiry ON intents(expires);');
        this.#db.prepare('INSERT INTO meta VALUES (?,?)').run('identity',this.#identity());
        this.#db.exec('COMMIT');
        chmodSync(filename,0o600);
        const fd=openSync(parent,'r'); try {fsyncSync(fd);} finally {closeSync(fd);}
      }
      const saved=this.#db.prepare('SELECT v FROM meta WHERE k=?').get('identity');
      if(!eq(saved?.v,this.#identity())) deny('storage_key_or_epoch_mismatch');
      if(this.#db.prepare('PRAGMA quick_check').get().quick_check!=='ok') deny('storage_integrity_failed');
    } catch(e) { try{this.#db?.close();}catch{} this.#key.fill(0); throw e; }
  }
  #identity() { return createHmac('sha256',this.#key).update('JH_OWNER_INTENTS_V1|'+this.#epoch).digest('hex'); }
  #check() { if(this.#closed) deny('storage_closed'); }
  #seal(id,expires,value) {
    const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.#key,iv);
    c.setAAD(Buffer.from(`JH_OWNER_INTENT_V1|${this.#epoch}|${id}|${expires}`));
    return Buffer.concat([iv,c.update(JSON.stringify(value),'utf8'),c.final(),c.getAuthTag()]).toString('base64');
  }
  #open(row) {
    if(!row) return null;
    try {
      const b=Buffer.from(row.body,'base64'); if(b.length<29 || b.length>16384) deny('record_invalid');
      const d=createDecipheriv('aes-256-gcm',this.#key,b.subarray(0,12));
      d.setAAD(Buffer.from(`JH_OWNER_INTENT_V1|${this.#epoch}|${row.id}|${row.expires}`)); d.setAuthTag(b.subarray(-16));
      const value=JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString('utf8'));
      if(value.id!==row.id || value.expires!==row.expires) deny('record_invalid');
      return value;
    } catch { deny('record_integrity_failed'); }
  }
  #tx(fn) {
    this.#check(); this.#db.exec('BEGIN IMMEDIATE');
    try {const r=fn();this.#db.exec('COMMIT');return r;}
    catch(e){try{this.#db.exec('ROLLBACK');}catch{}throw e;}
  }
  create(intent, now) {
    if(!Number.isSafeInteger(now) || intent.expires<=now || intent.expires-now>120000 || !/^[a-zA-Z0-9_-]{32,64}$/.test(intent.id)) deny('intent_invalid');
    return this.#tx(()=>{
      const count=this.#db.prepare('SELECT COUNT(*) AS n FROM intents WHERE expires>?').get(now).n;
      if(count>=128) deny('pending_intent_limit');
      const v={...intent,state:'PENDING',attempts:0};
      this.#db.prepare('INSERT INTO intents VALUES (?,?,?)').run(v.id,v.expires,this.#seal(v.id,v.expires,v));
      return structuredClone(v);
    });
  }
  read(id) { this.#check(); return this.#open(this.#db.prepare('SELECT * FROM intents WHERE id=?').get(id)); }
  beginVerification(id,now) {
    return this.#tx(()=>{
      const v=this.read(id); if(!v || v.state!=='PENDING') deny('intent_not_pending');
      if(now>=v.expires || now<v.manifest.issuedAtMs) deny('intent_expired');
      if(v.attempts>=5) deny('intent_attempt_limit'); v.attempts++;
      this.#db.prepare('UPDATE intents SET body=? WHERE id=?').run(this.#seal(v.id,v.expires,v),v.id);
      return v;
    });
  }
  authorize(id,manifestDigest,accountDigest,now) {
    return this.#tx(()=>{
      const v=this.read(id); if(!v || v.state!=='PENDING') deny('intent_not_pending');
      if(now>=v.expires || now<v.manifest.issuedAtMs) deny('intent_expired');
      if(!eq(v.manifestDigest,manifestDigest) || !/^[a-f0-9]{64}$/.test(accountDigest)) deny('intent_binding_changed');
      v.state='AUTHORIZED_NOT_APPLIED';v.accountDigest=accountDigest;v.authorizedAtMs=now;
      this.#db.prepare('UPDATE intents SET body=? WHERE id=?').run(this.#seal(v.id,v.expires,v),v.id);
      return structuredClone(v);
    });
  }
  // Host-internal cancellation only. Public callers need authenticated intent ownership.
  cancel(id) {
    return this.#tx(()=>{const v=this.read(id);if(!v || v.state!=='PENDING') return false;v.state='CANCELED';
      this.#db.prepare('UPDATE intents SET body=? WHERE id=?').run(this.#seal(v.id,v.expires,v),v.id);return true;});
  }
  close(){if(this.#closed)return;this.#db.close();this.#closed=true;this.#key.fill(0);}
}
