/** Test-only logical snapshot: retain every row and schema object while allowing
 * exactly the timestamp authenticated by verifyDurableCutover(). SQLite file
 * bytes also contain journal/page bookkeeping and the intentional new meta row.
 */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
export function snapshotRegistry(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON; BEGIN;');
  const schema=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
  const tables={};
  for(const {name} of schema.filter(x=>x.type==='table')){
   const identifier='"'+name.replaceAll('"','""')+'"';
   tables[name]=db.prepare('SELECT * FROM '+identifier).all().map(row=>JSON.stringify(row)).sort();
  }
  db.exec('ROLLBACK');return {schema,tables};
 }finally{db.close()}
}
export function assertOnlyAuthenticatedCutoffAdded(before,after,verifiedCutoffMs){
 assert.ok(Number.isSafeInteger(verifiedCutoffMs)&&verifiedCutoffMs>0,'verified cutoff required');
 assert.ok(Array.isArray(before.tables.meta)&&Array.isArray(after.tables.meta),'real registry meta schema required');
 const isCutoff=s=>JSON.parse(s).k==='legacy_dispatch_cutoff_ms';
 assert.equal(before.tables.meta.filter(isCutoff).length,0,'initial fixture must have no cutoff');
 const added=after.tables.meta.filter(isCutoff);
 assert.equal(added.length,1,'exactly one cutoff required');
 assert.deepEqual(JSON.parse(added[0]),{k:'legacy_dispatch_cutoff_ms',v:String(verifiedCutoffMs)},'cutoff must match authenticated receipt');
 const preserved={schema:after.schema,tables:{...after.tables,meta:after.tables.meta.filter(s=>!isCutoff(s))}};
 assert.deepEqual(preserved,before,'all existing schema and rows must remain unchanged');
}
