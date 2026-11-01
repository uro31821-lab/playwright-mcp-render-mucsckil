/**
 * Stage33 exact-source byte check: preserve 17 already audited stage source
 * blobs on top of a newer original main; never edit existing Secure56,
 * Android, owner storage or operational-learning code as part of this replay.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const manifest=JSON.parse(readFileSync(new URL('./stage33-source-manifest.json',import.meta.url),'utf8'));
const run=(...args)=>{
 const r=spawnSync('git',args,{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,args.join(' ')+': '+r.stderr);
 return r.stdout.trim();
};
const blobHash=bytes=>createHash('sha1')
  .update(Buffer.from('blob '+bytes.length+'\0'))
  .update(bytes).digest('hex');

test('replayed 17 original stage source blobs are byte-identical',()=>{
 assert.equal(manifest.schema,'JH168_STAGE33_CURRENT_MAIN_SOURCE_REPLAY_V1');
 assert.equal(manifest.sources.length,17);
 const seen=new Set();
 for(const src of manifest.sources){
  assert.ok(!seen.has(src.path));seen.add(src.path);
  const raw=readFileSync(src.path);
  assert.equal(raw.length,src.size,src.path);
  assert.equal(blobHash(raw),src.gitBlobSha1,src.path);
 }
});
test('actual current-main upstream commit is an ancestor, and only new review files are touched',()=>{
 const current=manifest.upstreamMainCommit;
 run('merge-base','--is-ancestor',current,'HEAD');
 const changed=run('diff','--name-only',current,'HEAD').split('\n').filter(Boolean);
 assert.ok(changed.length>=19,'all reviewed sources present');
 for(const p of changed){
  assert.ok(p.startsWith('jh-server/owner-setup/jh168-mobile-unification/stage2')||
            p.startsWith('jh-server/owner-setup/jh168-mobile-unification/stage3')||
            p.startsWith('jh-server/owner-setup/jh168-mobile-unification/STAGE')||
            p==='.github/workflows/jh168-stage33-current-main-integration.yml',
    'unexpected protected main path changed: '+p);
 }
 assert.ok(!changed.some(p=>p.includes('android-direct')||p.includes('server-integration')||
  p.includes('deployment/')||p.includes('operational-learning/')));
});
test('review snapshot stays non-executable and preserves unknown owner journal count',()=>{
 const x=JSON.parse(readFileSync('./jh-server/owner-setup/jh168-mobile-unification/stage32-inspection-evidence.json','utf8'));
 assert.equal(x.render.disk.liveOwnerJournalUncertainCount,null);
 assert.equal(x.render.disk.availableBytes,null);
 assert.equal(x.github.prStack.some(p=>p.draft||!p.merged),true);
 const s=readFileSync('./jh-server/owner-setup/jh168-mobile-unification/stage32-release-gates.mjs','utf8');
 assert.ok(s.includes('liveMigrationPermitted:false'));
 assert.ok(s.includes('deploymentPermitted:false'));
});
test('original runtime and owner journal files on current main are untouched',()=>{
 const upstream=manifest.upstreamMainCommit;
 const paths=[
  'jh-server/server.mjs',
  'jh-server/owner-setup/deployment/durable-manual-circuit-fence.mjs',
  'jh-server/owner-setup/deployment/durable-native-host.mjs',
  'jh-server/owner-setup/deployment/published-host-router.mjs',
  'jh-server/owner-setup/jh168-mobile-unification/stage26-completion-delivery-policy.mjs',
  'jh-server/owner-setup/jh168-mobile-unification/stage25-live-operator-followup-entry.mjs'
 ];
 for(const file of paths){
  const diff=run('diff','--name-only',upstream,'HEAD','--',file);
  assert.equal(diff,'','previous original source changed: '+file);
 }
});
