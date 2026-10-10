import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeQueueTruthCandidate} from '../owner-setup/deployment/native-queue-truth-candidate.mjs';
import {reverseNativeQueueTruthPatch} from '../owner-setup/deployment/native-queue-truth.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
test('full pinned durable candidate accepts queue truth change without altering production',()=>{
  const root=path.resolve(import.meta.dirname,'../owner-setup');
  const original=path.resolve(import.meta.dirname,'../server.mjs');
  const unchanged=sha(readFileSync(original));
  const result=buildNativeQueueTruthCandidate(root);
  assert.equal(result.productionEnabled,false);
  const parent=readFileSync(path.join(root,'server-integration/server-durable-native-candidate.mjs'),'utf8');
  const candidate=readFileSync(result.file,'utf8');
  assert.equal(sha(parent),result.parentSha256);
  assert.equal(sha(candidate),result.candidateSha256);
  assert.equal(reverseNativeQueueTruthPatch(candidate),parent);
  assert.match(candidate,/queued:j\.status==="queued",jobId:j\.id/);
  assert.equal(sha(readFileSync(original)),unchanged);
  assert.notEqual(result.parentSha256,result.candidateSha256);
});
