/**
 * Stage66 verified Android/manual mobile feature profile.
 *
 * High-level JH orchestration rule:
 *   real-phone verified Android route -> MANUAL.
 *
 * Only real-device verified automatic routes are retained here.
 * Unknown/effectful failures remain no-replay.
 */
export const STAGE66_PROFILE_VERSION='JH168_STAGE66_VERIFIED_ANDROID_MANUAL_PROFILE_V2';

const AUTOMATIC=Object.freeze({
  OPEN_RIGHT_URL:Object.freeze({provider:'ANDROID',route:'life_web_navigate',evidence:'RIGHT_ADDRESS_CONFIRMED'}),
  READ_RIGHT_SCREEN:Object.freeze({provider:'ANDROID',route:'life_web_snapshot/life_android_snapshot',evidence:'RIGHT_PANE_READ_VERIFIED'}),
  VISIBLE_SAFE_BUTTON_CLICK:Object.freeze({provider:'ANDROID',route:'guided_form.form_activate',evidence:'REAL_DEVICE_PAGE_STATE_READBACK'}),
  DIALOG_OPEN:Object.freeze({provider:'ANDROID',route:'guided_form.form_activate',evidence:'DIALOG_VISIBLE_AFTER_DISPATCH'}),
  DIALOG_CLOSE_BUTTON:Object.freeze({provider:'ANDROID',route:'guided_form.form_activate',evidence:'DIALOG_REMOVED_AFTER_DISPATCH'}),
  VISIBLE_TEXT_TYPE:Object.freeze({provider:'ANDROID',route:'guided_form.form15_type',evidence:'field_value_verified'}),
  PAGE_VERTICAL_SCROLL:Object.freeze({provider:'ANDROID',route:'guided_form.form_scroll',evidence:'scroll_viewport_movement_verified'}),
  BACK:Object.freeze({provider:'ANDROID',route:'native_android_back',evidence:'DESTINATION_TO_INDEX_REAL_DEVICE_VERIFIED'}),
  WAIT_CONDITION:Object.freeze({provider:'ANDROID',route:'life_web_wait',evidence:'MOBILE_WAIT_CONDITION_CONFIRMED'}),
  SCREENSHOT:Object.freeze({provider:'ANDROID',route:'phone_consent_then_life_web_screenshot',evidence:'frame_delivered_ephemeral'})
});

const MANUAL=Object.freeze({
  NATIVE_SELECT:Object.freeze({reason:'THREE_ROUND_REAL_PHONE_AUTOMATION_NOT_VERIFIED'}),
  NESTED_VERTICAL_SCROLL:Object.freeze({reason:'EXACT_INNER_TARGET_NOT_PROVEN'}),
  HORIZONTAL_SCROLL:Object.freeze({reason:'REAL_PHONE_AUTOMATION_NOT_VERIFIED'}),
  PRESS_KEY:Object.freeze({reason:'LOCAL_APPROVAL_UI_NOT_RELIABLY_AVAILABLE'}),
  RETURN_TO_CHROME_FROM_OTHER_APP:Object.freeze({reason:'FOREGROUND_TRANSITION_NOT_VERIFIED'})
});

export function stage66FeaturePlan(feature){
 const key=String(feature||'').toUpperCase();
 if(AUTOMATIC[key])return Object.freeze({
  feature:key,...AUTOMATIC[key],manualRequired:false,replayAllowed:false
 });
 if(MANUAL[key])return Object.freeze({
  feature:key,provider:'MANUAL',manualRequired:true,
  reason:MANUAL[key].reason,replayAllowed:false
 });
 return Object.freeze({
  feature:key,provider:'MANUAL',manualRequired:true,
  reason:'FEATURE_NOT_VERIFIED',replayAllowed:false
 });
}

export function stage66AutomaticFeatures(){
 return Object.freeze(Object.keys(AUTOMATIC));
}
export function stage66ManualFeatures(){
 return Object.freeze(Object.keys(MANUAL));
}
