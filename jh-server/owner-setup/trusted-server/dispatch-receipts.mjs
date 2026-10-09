/** Additive delivery accounting. Original dispatches remain immutable evidence.
 * A device reply is NOT proof of task success. Nothing here issues a session,
 * grants an action, dispatches a task, or retries an old job.
 */
import {createHash} from 'node:crypto';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const tok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{24,128}$/.test(x);
const fail=code=>{throw Object.assign(Error(code),{code});};
export const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function installReceiptSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS trusted_dispatch_receipts(
  job_digest TEXT PRIMARY KEY REFERENCES trusted_dispatches(job_digest),
  trust_id TEXT NOT NULL REFERENCES trusts(id),kind TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,recorded INTEGER NOT NULL,
  CHECK(kind='DEVICE_RESULT_RECEIVED'),
  CHECK(length(evidence_digest)=64));
 CREATE TRIGGER IF NOT EXISTS jh_receipt_no_update BEFORE UPDATE ON trusted_dispatch_receipts
 BEGIN SELECT RAISE(ABORT,'RECEIPT_IMMUTABLE'); END;
 CREATE TRIGGER IF NOT EXISTS jh_receipt_no_delete BEFORE DELETE ON trusted_dispatch_receipts
 BEGIN SELECT RAISE(ABORT,'RECEIPT_IMMUTABLE'); END;
`);
}
export function pendingReceiptCount(db,trustId){
 if(!tok(trustId))fail('RECEIPT_TRUST_INVALID');
 return db.prepare(`SELECT COUNT(*) n FROM trusted_dispatches d WHERE d.trust_id=?
 AND NOT EXISTS(SELECT 1 FROM trusted_dispatch_receipts r
 WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)`).get(trustId).n;
}
/** Called only by the registry with its host-only capability, inside a transaction. */
export function insertDeviceReceipt(db,trustId,jobDigest,evidenceDigest,now){
 if(!tok(trustId)||!hex(jobDigest)||!hex(evidenceDigest)||!Number.isSafeInteger(now)||now<=0)fail('RECEIPT_INPUT_INVALID');
 const original=db.prepare('SELECT * FROM trusted_dispatches WHERE job_digest=?').get(jobDigest);
 if(!original)return {recorded:false,reason:'NOT_TRACKED'};
 if(original.trust_id!==trustId||original.created>now)fail('RECEIPT_SCOPE_MISMATCH');
 const prior=db.prepare('SELECT * FROM trusted_dispatch_receipts WHERE job_digest=?').get(jobDigest);
 if(prior){
  if(prior.trust_id!==trustId)fail('RECEIPT_SCOPE_MISMATCH');
  if(prior.evidence_digest!==evidenceDigest)fail('RECEIPT_CONFLICT');
  return {recorded:false,reason:'ALREADY_RECORDED'};
 }
 db.prepare('INSERT INTO trusted_dispatch_receipts VALUES(?,?,?,?,?)')
   .run(jobDigest,trustId,'DEVICE_RESULT_RECEIVED',evidenceDigest,now);
 return {recorded:true,taskSuccessVerified:false,replayAllowed:false};
}
