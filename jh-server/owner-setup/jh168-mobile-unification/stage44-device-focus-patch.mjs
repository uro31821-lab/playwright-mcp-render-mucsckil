/** Source-only reversible generated Stage25+41 focus add-on. The original
 * authenticated BEGIN command and HMAC phone discard are never modified.
 */
const IMP="import {createStage44DeviceFocus} from '../jh168-mobile-unification/stage44-device-focus.mjs';\n";
const pairs=[
 ["const jhCommandCauses41=new Map();",
  "const jhCommandCauses41=new Map();\nconst jhFocus44=createStage44DeviceFocus({maxMs:120000});"],
 ["  const jhPreviousBegin41=jhCommandVersion56(device);",
  "  if(!jhFocus44.mayBegin({device,eventId,currentCommand:jhCommandVersion56(device)}).allowed)\n    throw Error('DEVICE_FOCUS_PROTECTED_OTHER_BEGIN');\n  const jhPreviousBegin41=jhCommandVersion56(device);"],
 ["      const commandId=jhStartCommand56(device,request_id||randomBytes(16).toString('hex'));",
  "      const commandId=jhStartCommand56(device,request_id||randomBytes(16).toString('hex'));\n"+
  "      if(mode==='BEGIN'&&request_id){\n"+
  "        const focus=jhFocus44.start({device,commandId,currentCommand:jhCommandVersion56(device)});\n"+
  "        if(!focus.ok)return textResult({ok:false,code:focus.code,replayAllowed:false});\n"+
  "      }"],
 ["      if(jhMcpWorkflows56.size>=8)return textResult({ok:false,code:'workflow_capacity_no_replay'});",
  "      if(jhMcpWorkflows56.size>=8){\n"+
  "        if(mode==='BEGIN'&&request_id)jhFocus44.release({device,commandId});\n"+
  "        return textResult({ok:false,code:'workflow_capacity_no_replay'});\n"+
  "      }"],
 ["      }catch(e){if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});",
  "      }catch(e){if(mode==='BEGIN'&&request_id)jhFocus44.release({device,commandId});\n"+
  "        if(jhMcpWorkflows56.get(w.id)!==w)return textResult({ok:false,code:'site_switch_discarded'});"]
];
function one(s,needle,key){if(s.split(needle).length!==2)throw Error('STAGE44_ANCHOR_'+key+'_'+(s.split(needle).length-1));}
export function applyStage44DeviceFocusPatch(source){
 if(typeof source!=='string'||source.startsWith(IMP)||!source.includes('jhRequireCommand56(device)')||
  !source.includes('jhRecordCommandCause41(device,')||!source.includes('jhDiscardDeviceWork56(body.deviceId,body.eventId,body.previousCommandId)')||
  !source.includes("const SECURE56_TOOL_CATALOG_DIGEST"))throw Error('STAGE44_ORIGINAL_SECURE56_STAGE41_REQUIRED');
 let s=source;
 for(let i=0;i<pairs.length;i++){const [a,b]=pairs[i];one(s,a,i);s=s.replace(a,b);}
 s=IMP+s;
 if(reverseStage44DeviceFocusPatch(s)!==source)throw Error('STAGE44_REVERSE_FAIL');
 return s;
}
export function reverseStage44DeviceFocusPatch(source){
 if(typeof source!=='string'||!source.startsWith(IMP))throw Error('STAGE44_IMPORT_NOT_FOUND');
 let s=source.slice(IMP.length);
 for(let i=pairs.length-1;i>=0;i--){const [a,b]=pairs[i];one(s,b,'R'+i);s=s.replace(b,a);}
 return s;
}
