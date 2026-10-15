import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOnlyAuthenticatedCutoffAdded} from './registry-preservation-assertions.mjs';
const cutoff=1800000000000;
const row=x=>JSON.stringify(x);
function fixture(){
 const before={schema:[{type:'table',name:'trusts',tbl_name:'trusts',sql:'synthetic schema'}],tables:{
  meta:[row({k:'owner',v:'original-owner'})],trusts:[row({id:'t1',owner:'original-owner'})],
  trusted_dispatches:[row({job:'old-unknown-job'})],trusted_dispatch_receipts:[]}};
 const after=structuredClone(before);after.tables.meta.push(row({k:'legacy_dispatch_cutoff_ms',v:String(cutoff)}));
 return {before,after};
}
test('preservation assertion accepts only the authenticated cutoff addition',()=>{
 const {before,after}=fixture();assert.doesNotThrow(()=>assertOnlyAuthenticatedCutoffAdded(before,after,cutoff));
});
test('preservation assertion rejects deletion, owner changes, new receipts, metadata or schema changes',()=>{
 const changes=[
  s=>{s.tables.trusted_dispatches=[]},
  s=>{s.tables.trusts=[row({id:'t1',owner:'changed-owner'})]},
  s=>{s.tables.trusted_dispatch_receipts.push(row({job:'old-unknown-job',success:true}))},
  s=>{s.tables.meta.push(row({k:'unexpected',v:'added'}))},
  s=>{s.schema[0].sql='changed schema'},
  s=>{s.tables.meta=s.tables.meta.filter(x=>JSON.parse(x).k!=='legacy_dispatch_cutoff_ms')},
  s=>{s.tables.meta[1]=row({k:'legacy_dispatch_cutoff_ms',v:String(cutoff+1)})},
  s=>{delete s.tables.trusted_dispatch_receipts}
 ];
 for(const mutate of changes){const {before,after}=fixture();mutate(after);assert.throws(()=>assertOnlyAuthenticatedCutoffAdded(before,after,cutoff),assert.AssertionError)}
});
