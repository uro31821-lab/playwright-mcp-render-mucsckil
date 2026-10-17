/**
 * SOURCE-ONLY JH167 candidate tool registrar. Protects signed runtime by generating a *separate*
 * candidate source. Never edits the operational server.mjs, startup script, app, or credentials.
 * Runs existing reservation-link patch first, then registers 13-guide read-only tools.
 */
import {patchReservationLinkAssistant} from './reservation-link-assistant-patch.mjs';
const importGuide="import {registerJHGuide13Tools as jhRegisterGuide13Tools} from '../guide-13/host-tools.mjs';\n";
const anchor="  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});";
const call=`\n  // JH167 manual-first 13-guide only; inherits current JH command fence.\n  jhRegisterGuide13Tools({registerOAuthTool,z,textResult,\n    getHostContext:()=>{const device=chooseDevice();return {command_id:jhRequireCommand56(device),\n      generation:null,plan_revision:null};}\n  });`;
export function patchJH167GuideAndReservation(original){
 if(typeof original!=='string'||original.includes('jhRegisterGuide13Tools('))throw Error('GUIDE13_BASE_ALREADY_PATCHED_OR_INVALID');
 if(original.split(anchor).length!==2)throw Error('GUIDE13_HOST_ANCHOR_NOT_UNIQUE');
 const booking=patchReservationLinkAssistant(original);
 const complete=importGuide+booking.replace(anchor,anchor+call);
 if(complete.split('jhRegisterGuide13Tools(').length!==2 || !complete.includes('jhRegisterReservationLinkTools('))
   throw Error('JH167_TOOL_COMPOSITION_MISSING');
 return complete;
}
