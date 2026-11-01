/** Original owner-volume SQLite preflight: aggregate-only, read-only, no write or replay.
 * Diagnostic to run on the authorized original host, not a production route.
 */
import {DatabaseSync} from 'node:sqlite';
import {lstatSync, statfsSync} from 'node:fs';
import {dirname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_UNKNOWN=512;
const MAX_ROWS=10000;
const fail=(code)=>{throw Object.assign(new Error(code),{code});};

export function inspectOriginalJournalReadOnly(file){
  if(typeof file!=='string'||!isAbsolute(file)||resolve(file)!==file||file.includes('\0')){
    fail('OWNER_JOURNAL_ABSOLUTE_PATH_REQUIRED');
  }
  const st=lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1){
    fail('OWNER_JOURNAL_FILE_NOT_REGULAR');
  }
  const db=new DatabaseSync(file,{readOnly:true,timeout:4000});
  let counts;
  try{
    db.exec('PRAGMA query_only=ON;');
    const schema=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='circuit_actions'").get();
    if(!schema)fail('OWNER_JOURNAL_SCHEMA_NOT_FOUND');
    const rows=db.prepare('SELECT status, COUNT(*) AS count FROM circuit_actions GROUP BY status').all();
    if(rows.some(r=>!['OUTCOME_UNKNOWN','DEVICE_RESULT_RECEIVED'].includes(r.status))){
      fail('OWNER_JOURNAL_UNEXPECTED_STATUS');
    }
    const map=Object.fromEntries(rows.map(r=>[r.status,r.count]));
    counts={uncertain:map.OUTCOME_UNKNOWN||0,received:map.DEVICE_RESULT_RECEIVED||0};
  }finally{
    db.close();
  }
  const total=counts.uncertain+counts.received;
  const fs=statfsSync(dirname(file));
  const freeBytes=fs.bavail*fs.bsize;
  const walFile=file+'-wal';
  let walBytes=null;
  try{
    const wal=lstatSync(walFile);
    if(wal.isFile()&&!wal.isSymbolicLink())walBytes=wal.size;
  }catch(e){if(e?.code!=='ENOENT')throw e;walBytes=0;}
  return Object.freeze({
    source:'original_owner_circuit_actions_readonly',
    journalFileBytes:st.size,
    journalWalBytes:walBytes,
    filesystemAvailableBytes:freeBytes,
    uncertain:counts.uncertain,
    received:counts.received,
    total,
    limits:{maxUncertain:MAX_UNKNOWN,maxRows:MAX_ROWS},
    capacity:{uncertainCapReached:counts.uncertain>=MAX_UNKNOWN,rowsCapReached:total>=MAX_ROWS},
    reasonIfBlocked:'exact_same_operation_pending_or_policy_or_storage_must_be_diagnosed_separately',
    historicalUnknownMayReplay:false,
    receiptEvidenceVerified:false,
    backupAndRollbackVerified:false,
    modifiedOriginalJournal:false
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)fail('OWNER_JOURNAL_FILE_ARGUMENT_REQUIRED');
    process.stdout.write(JSON.stringify(inspectOriginalJournalReadOnly(process.argv[2]))+'\n');
  }catch(e){
    process.stderr.write(JSON.stringify({ok:false,code:e?.code||'OWNER_READONLY_INSPECTION_FAILED'})+'\n');
    process.exitCode=1;
  }
}
