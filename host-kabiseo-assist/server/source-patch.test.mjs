import test from 'node:test';
import assert from 'node:assert/strict';
import {applyKabiseoMetadataPatch,reverseKabiseoMetadataPatch} from './source-patch.mjs';
// Source transformation fixture only. Real server composition is a separate CI step.
const base=`// jhWorkflowRuntimeDigest56 commandId:jhRequireCommand56( jhCommandTool56(name,config,handler)
function exactEnvelope56(){}
function jhRequireCommand56(){}
function createMcp(){
  registerOAuthTool("life_status",{});
}
// exact-original-tail
`;
test('source insertion treats dollar quote regex as literal and reverses exactly',()=>{
 const patched=applyKabiseoMetadataPatch(base);
 assert.equal(reverseKabiseoMetadataPatch(patched),base);
 assert.equal(patched.split('// exact-original-tail').length,2);
 assert.ok(patched.includes("new RegExp('^[a-f0-9]{'+n+'}$')"));
});
test('cannot apply twice',()=>{
 const patched=applyKabiseoMetadataPatch(base);
 assert.throws(()=>applyKabiseoMetadataPatch(patched));
});
test('missing command guard rejects',()=>{
 const missing=base.replace('commandId:jhRequireCommand56(','removed');
 assert.throws(()=>applyKabiseoMetadataPatch(missing));
});
test('ambiguous registration anchor rejects',()=>{
 const repeated=base+'  registerOAuthTool("life_status",{';
 assert.throws(()=>applyKabiseoMetadataPatch(repeated));
});
test('tampered added code cannot reverse',()=>{
 const patched=applyKabiseoMetadataPatch(base).replace('EXPLICIT_READ_ONLY_CAMERA_V1','TAMPERED');
 assert.throws(()=>reverseKabiseoMetadataPatch(patched));
});
