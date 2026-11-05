import {ok,fail,exactText} from '../shared.mjs';
export async function runAndroidNativeSelect({label,optionLabel},bridge){
 const feature='NATIVE_SELECT';
 if(!exactText(label)||!exactText(optionLabel))return fail(feature,'ANDROID','INPUT_INVALID');
 const snap=await bridge.snapshot();
 const field=await bridge.findChoiceByLabel(snap,label);
 if(!field)return fail(feature,'ANDROID','CHOICE_LABEL_NOT_RESOLVED');
 const opened=await bridge.openChoice(field);
 if(opened?.ok!==true)return fail(feature,'ANDROID',opened?.code||'CHOICE_OPEN_FAILED');
 const options=await bridge.choiceOptions(field);
 const option=Array.isArray(options)?options.find(x=>x?.label===optionLabel):null;
 if(!option)return fail(feature,'ANDROID','CHOICE_OPTION_NOT_FOUND');
 const picked=await bridge.pickChoice(field,option);
 if(picked?.valueVerified!==true)return fail(feature,'ANDROID',picked?.code||'CHOICE_PICK_UNVERIFIED');
 return ok(feature,'ANDROID',{label,optionLabel});
}