/** Inserts ONE read-only MCP adapter into the EXISTING JH server generated runtime.
 * Applied downstream from JH payment + clean restart + result verification patches.
 * DOES NOT change payment, Bridge, approvals, Secure56 signing, device job envelopes, or Android permission state.
 */
export function patchScreenUnderstandMcp56(source){
  if(typeof source!=='string')throw Error('screen_ai_source_required');
  const importAnchor='import {createServer}'; // only used as a harmless validation hint
  const registerAnchor='  registerOAuthTool("life_android_snapshot",{';
  const scopeAnchor='function createMcp(){';
  const importStatement="import {ScreenUnderstandingEngine as JhScreenUnderstandingEngine56} from '../deployment/jh-screen-understanding/engine.mjs';\nimport {readVerifiedOcrStatusJob as jhReadVerifiedOcrStatus56} from '../deployment/jh-screen-understanding/ocr-port.mjs';\n";
  const shared='const jhScreenUnderstanding56=new JhScreenUnderstandingEngine56();\nconst jhConsumedOcrJobs56=new Set();\n';
  const tool=String.raw`  registerOAuthTool("life_android_screen_understand",{
    title:'JH right split-screen understanding (read-only)',
    description:'Using the existing signed JH AndroidAgent.snapshot, inspect only the verified RIGHT work pane. Modes: SUMMARY/EXPLAIN/SIMPLIFY/TRANSLATE/TABLE/COMPARE/ERROR/REQUIRED/CONTINUE/EVIDENCE/UNCERTAINTY/OCR. Presents raw evidence separate from GPT interpretation; cannot click, initiate OCR, pay or approve. Previously approved JH OCR status may be read back. Begin each new command using the EXISTING BEGIN_COMMAND flow.',
    inputSchema:{mode:z.enum(['SUMMARY','EXPLAIN','SIMPLIFY','TRANSLATE','TABLE','COMPARE','ERROR','REQUIRED','CONTINUE','EVIDENCE','UNCERTAINTY','OCR']),query:z.string().max(200).optional(),ocr_status_job_id:z.string().max(80).optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async(args)=>{
    const device=chooseDevice();
    if(!device||!active56(device))return textResult({ok:false,code:'trusted_secure_device_required'});
    // Existing ALS command fence. A different command or direct site switch discards old evidence.
    const commandId=jhRequireCommand56(device);
    const trust=active56(device);
    if(!trust||!trust.trustId||!trust.sessionId)return textResult({ok:false,code:'active_trust_binding_required'});
    const job=mk('agent_snapshot',{},device);
    const done=await waitJob(job,30000);
    jhRequireCommand56(device);
    if(!done||done.status!=='complete'||done.result?.ok!==true||!done.secureSessionId||done.secureSessionId!==trust.sessionId)
      return textResult({ok:false,code:'signed_screen_readback_unconfirmed',state:done?.status||'unavailable'});
    let rows;
    try{rows=JSON.parse(done.result.url);if(!Array.isArray(rows))throw Error('invalid');}
    catch{return textResult({ok:false,code:'screen_snapshot_parse_invalid'});}
    // Another page / new site is visible only through the current signed job.
    const before=jhScreenUnderstanding56.snapshot();
    const reply=jhScreenUnderstanding56.analyze({mode:args.mode,query:args.query||'',rows,
      commandId,deviceKey:sha56(device),trustKey:sha56(trust.trustId+'|'+trust.sessionId),observedAt:Date.now()});
    if(args.mode==='OCR'&&args.ocr_status_job_id){
      if(!reply.ok)return textResult(reply);
      if(!before||jhConsumedOcrJobs56.has(args.ocr_status_job_id))return textResult({ok:false,code:'OCR_FIRST_READ_REQUIRED_OR_REPLAY_BLOCKED'});
      const signedJob=jobs.get(args.ocr_status_job_id);
      const verified=jhReadVerifiedOcrStatus56({job:signedJob,commandId,deviceId:device,sessionId:trust.sessionId,
        before,after:jhScreenUnderstanding56.snapshot()});
      if(!verified.ok)return textResult(verified);
      jhRequireCommand56(device);
      jhConsumedOcrJobs56.add(args.ocr_status_job_id);
      if(jhConsumedOcrJobs56.size>512)jhConsumedOcrJobs56.delete(jhConsumedOcrJobs56.values().next().value);
      return textResult({...reply,observed:verified.observed,interpretation:verified.interpretation,
        uncertainty:[...reply.uncertainty,...verified.uncertainty],modelTask:verified.modelTask,
        ocr:{capturePerformedByExistingJH:true,consentAutoGranted:false,verifiedJobDigest:verified.sourceJobDigest}});
    }
    return textResult(reply);
  });

`;
  if(source.includes('life_android_screen_understand'))throw Error('screen_ai_already_patched');
  if(source.split(registerAnchor).length!==2||source.split(scopeAnchor).length!==2||!source.includes('jhRequireCommand56')||!source.includes('function mk('))
    throw Error('screen_ai_JH_runtime_anchor_changed');
  let output=importStatement+source.replace(scopeAnchor,shared+scopeAnchor).replace(registerAnchor,tool+registerAnchor);
  const restored=output.slice(importStatement.length).replace(shared+scopeAnchor,scopeAnchor).replace(tool+registerAnchor,registerAnchor);
  if(restored!==source)throw Error('screen_ai_patch_scope_changed');
  return output;
}
