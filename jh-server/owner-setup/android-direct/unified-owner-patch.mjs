/** CI-ONLY exact source patch for generated JH167 Secure56 owner. */
const IMPORT="import {createUnifiedAndroidRoute as jhMakeUnifiedAndroidRoute56} from '../android-direct/unified-route.mjs';\n";
const SHARED="\nlet jhUnifiedAndroidReview56=null;\nfunction jhUnifiedAndroidReviewAllowed56(){\n return process.env.CI==='true' &&\n   process.env.NODE_ENV==='test' &&\n   process.env.JH_OWNER_DEFER_LISTEN==='1' &&\n   process.env.JH_ANDROID_DIRECT_CANDIDATE==='CI_SYNTHETIC_ONLY' &&\n   process.env.JH_ANDROID_UNIFIED_CI_ONLY==='1' &&\n   process.env.RENDER_SERVICE_ID===undefined &&\n   !httpServer.listening;\n}\nexport function jhCreateUnifiedAndroidReviewCandidate56(){\n if(!jhUnifiedAndroidReviewAllowed56())\n   throw Error('JH_UNIFIED_CI_ONLY_REQUIRED');\n if(jhUnifiedAndroidReview56)return jhUnifiedAndroidReview56;\n const android=jhCreateAndroidDirectReviewCandidate56();\n jhUnifiedAndroidReview56=jhMakeUnifiedAndroidRoute56({\n   enabled:true,\n   controller:android,\n   readOwner:()=>{\n     const d=chooseDevice(),a=d?active56(d):null;\n     return {\n       current:!!(d&&a&&devices.get(d)?.secureBridgeVersion===56),\n       sameProcess:true,secure56:true,deviceId:d??'',\n       sessionId:a?.sessionId??'',commandId:d?jhRequireCommand56(d):''\n     };\n   },\n   // Do NOT trust an invented device capability. The actual latest signed\n   // Android APK must implement this before OPEN_WEB becomes possible.\n   readSignedCapability:async()=>null,\n   openLeftWeb:async()=>{throw Error('PHONE_LEFT_WEB_LINK_V1_NOT_IMPLEMENTED')},\n   readOpenJob:async()=>null,\n   readSignedAddress:async()=>null\n });\n return jhUnifiedAndroidReview56;\n}\n";
const TOOL="\n  // CI-only candidate. The original owner MCP catalog remains unchanged.\n  if(jhUnifiedAndroidReviewAllowed56()){\n    registerOAuthTool('life_android_unified_ci_only',{\n      title:'JH Android unified LEFT web / RIGHT ChatGPT (CI only)',\n      description:'Test-only, no phone-native URL capability yet. Existing secure56 command and phone approval still required. No Playwright fallback.',\n      inputSchema:{\n        mode:z.enum(['OBSERVE','OPEN_WEB','OPEN_APP','PREPARE_UI','EXECUTE_UI','STATUS_UI','STATUS_OPEN','CANCEL_UI']),\n        command_id:z.string(),\n        operation_id:z.string().optional(),\n        target:z.string().optional(),\n        preparation_id:z.string().optional(),\n        args:z.object({\n          task_digest:z.string(),action:z.enum(['CLICK','TYPE','SCROLL','KEYPRESS']),\n          effect:z.enum(['REVERSIBLE_WRITE']),data_class:z.enum(['NON_SENSITIVE']),\n          x:z.number().optional(),y:z.number().optional(),\n          viewport_width:z.number().optional(),viewport_height:z.number().optional(),\n          scroll_y:z.number().optional(),text_value:z.string().optional(),\n          text_digest:z.string().optional(),keys:z.array(z.string()).optional()\n        }).optional()\n      },\n      annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}\n    },async a=>textResult(await jhCreateUnifiedAndroidReviewCandidate56().run({\n      mode:a.mode,commandId:a.command_id,operationId:a.operation_id,\n      target:a.target,preparationId:a.preparation_id,args:a.args\n    })));\n  }\n";
const SHARED_ANCHOR='function createMcp(){';
const TOOL_ANCHOR='  registerOAuthTool("life_status",{';
function once(input,needle,code){if(input.split(needle).length!==2)throw Error(code);}
export function patchJH167UnifiedOwnerReview56(source){
  if(typeof source!=='string'||source.includes('jhUnifiedAndroidReview56')||source.startsWith(IMPORT))
    throw Error('JH_UNIFIED_ALREADY_PATCHED_OR_INVALID');
  for(const tag of [SHARED_ANCHOR,TOOL_ANCHOR,'jhCreateAndroidDirectReviewCandidate56',
    'function jhRequireCommand56(device,workflowId=null){',
    'durableNativeHooks56?.beforeDispatch(', 'durableNativeHooks56?.acceptedCompletion(',
    'const SECURE56_TOOL_CATALOG_DIGEST='])
    once(source,tag,'JH_UNIFIED_SOURCE_GUARD_CHANGED');
  if(!source.startsWith('import '))throw Error('JH_UNIFIED_IMPORT_SCOPE');
  let output=IMPORT+source.replace(SHARED_ANCHOR,SHARED+'\n'+SHARED_ANCHOR)
    .replace(TOOL_ANCHOR,TOOL+'\n'+TOOL_ANCHOR);
  if(!output.startsWith(IMPORT)||output.slice(IMPORT.length)
    .replace(SHARED+'\n'+SHARED_ANCHOR,SHARED_ANCHOR)
    .replace(TOOL+'\n'+TOOL_ANCHOR,TOOL_ANCHOR)!==source)
    throw Error('JH_UNIFIED_REVERSE_PATCH_FAILED');
  return output;
}
