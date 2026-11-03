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
 '    description:"Read the existing Android job only. For an OPEN_COMPLETION_PENDING result, reuse the same job_id and command_id here; never BEGIN_COMMAND or reopen the app. Waits up to 10 seconds for that open job receipt. Missing receipt is not execution failure.",',
 '    inputSchema:{job_id:z.string()}',
 '  },async({job_id})=>{',
 '    cleanupJobs();const job=jobs.get(job_id);',
 '    if(job?.type!=="open_url")return jobResult(job);',
 '    const completion=await jhOpenCompletion56(job,jhOpenStatusWait56);',
 '    return textResult({jobId:job_id,...completion});',
 '  });'
].join('\n');
test('snapshot source patch is exact and reversible',()=>{
 const out=applySnapshotDigestReadbackPatch56(raw);
 assert.match(out,/mcpToolName:"life_android_snapshot"/);
 assert.match(out,/secureRequestedEffect:"READ_ONLY"/);
 assert.match(out,/resolveSnapshotDigestReadback56/);
 assert.match(out,/jobs\.values\(\)/);
 assert.match(out,/jhOpenCompletion56\(job,jhOpenStatusWait56\)/);
 assert.equal(reverseSnapshotDigestReadbackPatch56(out),raw);
});
test('duplicate patch is rejected',()=>{
 const out=applySnapshotDigestReadbackPatch56(raw);
 assert.throws(()=>applySnapshotDigestReadbackPatch56(out));
});
