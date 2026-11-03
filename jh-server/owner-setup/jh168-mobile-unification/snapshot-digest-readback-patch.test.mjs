import test from 'node:test';
import assert from 'node:assert/strict';
import {applySnapshotDigestReadbackPatch56,reverseSnapshotDigestReadbackPatch56}
 from './snapshot-digest-readback-patch.mjs';
const raw=[
 'function signJob56(){}',
 'function safeJobView56(){}',
 'function jhRequireCommand56(){}',
 '  registerOAuthTool("life_android_snapshot",{',
 '    title:"Read Android UI",',
 '    description:"Read Android accessibility UI for native-app-only workflows.",',
 '    inputSchema:{}',
 '  },async()=>{',
 '    const j=mk("agent_snapshot");',
 '    return jobResult(await waitJob(j));',
 '  });',
 '  registerOAuthTool("life_job_status",{',
 '    title:"Android job status",',
 '    description:"Read a queued Android job result.",',
 '    inputSchema:{job_id:z.string()}',
 '  },async({job_id})=>jobResult(jobs.get(job_id)));'
].join('\n');
test('snapshot source patch is exact and reversible',()=>{
 const out=applySnapshotDigestReadbackPatch56(raw);
 assert.match(out,/mcpToolName:"life_android_snapshot"/);
 assert.match(out,/secureRequestedEffect:"READ_ONLY"/);
 assert.match(out,/resolveSnapshotDigestReadback56/);
 assert.match(out,/jobs\.values\(\)/);
 assert.equal(reverseSnapshotDigestReadbackPatch56(out),raw);
});
test('duplicate patch is rejected',()=>{
 const out=applySnapshotDigestReadbackPatch56(raw);
 assert.throws(()=>applySnapshotDigestReadbackPatch56(out));
});
