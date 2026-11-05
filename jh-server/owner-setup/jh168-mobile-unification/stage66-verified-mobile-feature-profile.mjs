/**
 * Stage66 verified mobile feature profile.
 *
 * High-level JH orchestration rule:
 *   verified Android route -> verified Playwright Mobile route -> MANUAL.
 *
 * Only real-device verified automatic routes are retained here. An unverified
 * provider is never promoted merely because code exists or a lower-level
 * router knows its name. Unknown/effectful failures remain no-replay.
 */
export const STAGE66_PROFILE_VERSION='JH168_STAGE66_VERIFIED_MOBILE_FEATURE_PROFILE_V1';

const AUTOMATIC=Object.freeze({
  OPEN_RIGHT_URL:Object.freeze({
    provider:'ANDROID',
    route:'life_web_navigate',
    evidence:'RIGHT_ADDRESS_CONFIRMED'
  }),
  READ_RIGHT_SCREEN:Object.freeze({
    provider:'ANDROID',
    route:'life_web_snapshot/life_android_snapshot',
    evidence:'RIGHT_PANE_READ_VERIFIED'
  }),
  VISIBLE_SAFE_BUTTON_CLICK:Object.freeze({
    provider:'ANDROID',
    route:'guided_form.form_activate',
    evidence:'DIALOG_OPEN_CLOSE_REAL_DEVICE_VERIFIED'
  }),
  DIALOG_OPEN:Object.freeze({
    provider:'ANDROID',
    route:'guided_form.form_activate',
    evidence:'DIALOG_VISIBLE_AFTER_DISPATCH'
  }),
  DIALOG_CLOSE_BUTTON:Object.freeze({
    provider:'ANDROID',
    route:'guided_form.form_activate',
    evidence:'DIALOG_REMOVED_AFTER_DISPATCH'
  }),
  VISIBLE_TEXT_TYPE:Object.freeze({
    provider:'ANDROID',
    route:'guided_form.form15_type',
    evidence:'field_value_verified'
  }),
  PAGE_VERTICAL_SCROLL:Object.freeze({
    provider:'ANDROID',
    route:'guided_form.form_scroll',
    evidence:'scroll_viewport_movement_verified'
  })
});

const MANUAL=Object.freeze({
  NATIVE_SELECT:Object.freeze({reason:'ANDROID_FIELD_LABEL_AMBIGUOUS_AND_PLAYWRIGHT_MOBILE_UNAVAILABLE'}),
  NESTED_VERTICAL_SCROLL:Object.freeze({reason:'ANDROID_NESTED_SCROLL_TARGETS_NOT_PROVEN_AND_PLAYWRIGHT_MOBILE_UNAVAILABLE'}),
  HORIZONTAL_SCROLL:Object.freeze({reason:'ANDROID_EXECUTION_NOT_VERIFIED_AND_PLAYWRIGHT_MOBILE_UNAVAILABLE'}),
  BACK:Object.freeze({reason:'ANDROID_BACK_NAVIGATED_PAGE_IN_DIALOG_TEST'}),
  PRESS_KEY:Object.freeze({reason:'NOT_REAL_DEVICE_VERIFIED'}),
  WAIT_CONDITION:Object.freeze({reason:'NOT_REAL_DEVICE_VERIFIED'}),
  SCREENSHOT:Object.freeze({reason:'NOT_REAL_DEVICE_VERIFIED_WITH_REQUIRED_CONSENT'}),
  RETURN_TO_CHROME_FROM_OTHER_APP:Object.freeze({reason:'NOT_REAL_DEVICE_VERIFIED'})
});

export const STAGE66_PLAYWRIGHT_MOBILE=Object.freeze({
 connected:false,
 verifiedFeatures:Object.freeze([]),
 reason:'NO_PHONE_PLAYWRIGHT_MOBILE_EXECUTION_PROVIDER_CONNECTED'
});

export function stage66FeaturePlan(feature){
 const key=String(feature||'').toUpperCase();
 if(AUTOMATIC[key])return Object.freeze({
  feature:key,...AUTOMATIC[key],manualRequired:false,replayAllowed:false
 });
 if(MANUAL[key]){
  // Playwright Mobile remains the conceptual second tier, but no feature is
  // routed to it until a phone-real-device VERIFIED_PASS is recorded.
  return Object.freeze({
   feature:key,provider:'MANUAL',manualRequired:true,
   playwrightMobileTried:false,playwrightMobileAvailable:false,
   reason:MANUAL[key].reason,replayAllowed:false
  });
 }
 return Object.freeze({
  feature:key,provider:'MANUAL',manualRequired:true,
  playwrightMobileTried:false,playwrightMobileAvailable:false,
  reason:'FEATURE_NOT_VERIFIED',replayAllowed:false
 });
}

export function stage66AutomaticFeatures(){
 return Object.freeze(Object.keys(AUTOMATIC));
}
export function stage66ManualFeatures(){
 return Object.freeze(Object.keys(MANUAL));
}
