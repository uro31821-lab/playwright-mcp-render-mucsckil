export const PASS='VERIFIED_PASS',NO_EFFECT='FAILED_NO_EFFECT',UNAVAILABLE='PROVIDER_UNAVAILABLE',AFTER_EFFECT='FAILED_AFTER_EFFECT',EFFECT_UNKNOWN='EFFECT_UNKNOWN';
export const ok=(feature,provider,evidence={})=>Object.freeze({ok:true,feature,provider,outcome:PASS,evidence,replayAllowed:false});
export const fail=(feature,provider,code,evidence={})=>Object.freeze({ok:false,feature,provider,outcome:NO_EFFECT,code,evidence,replayAllowed:false});
export const afterEffect=(feature,provider,code,evidence={})=>Object.freeze({ok:false,feature,provider,outcome:AFTER_EFFECT,code,evidence,replayAllowed:false});
export const effectUnknown=(feature,provider,code,evidence={})=>Object.freeze({ok:false,feature,provider,outcome:EFFECT_UNKNOWN,code,evidence,replayAllowed:false});
export const unavailable=(feature,provider,code)=>Object.freeze({ok:false,feature,provider,outcome:UNAVAILABLE,code,replayAllowed:false});
export const exactText=(v)=>typeof v==='string'&&v.length>0&&v.length<=260&&!/[\u0000-\u001f\u007f]/.test(v);
