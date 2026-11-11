/** Interpret a trusted host provider's current status; never calls a provider.
 * A test fixture or a page/user assertion is not runtime availability evidence.
 * liveExecutionVerified must describe the selected execution route. Opening a
 * page, installing a skill or passing code tests cannot establish that flag.
 */
export function resolveGeminiAvailability(status, {visibility = 'VISIBLE'} = {}) {
  const unavailable = reason => ({
    provider: 'gemini', available: false, capabilities: [], reason,
    authorizesExecution: false, dispatchesTools: false, changesPersistentState: false
  });
  if (!status || typeof status !== 'object' || Array.isArray(status) ||
      status.schema !== 'jh.jebiseo-capabilities.v1' || status.provider !== 'gemini')
    return unavailable('GEMINI_PROVIDER_STATUS_REQUIRED');
  if (!['VISIBLE', 'INTERNAL'].includes(visibility))
    return unavailable('GEMINI_VISIBILITY_INVALID');
  if (status.productionRegistered !== true || status.codeCandidate === true)
    return unavailable('GEMINI_PRODUCTION_PROVIDER_UNAVAILABLE');
  if (visibility === 'INTERNAL') {
    if (status.internalExecutionSupported !== true)
      return unavailable('HIDDEN_EXECUTION_UNAVAILABLE');
  } else {
    if (status.runtimeMode !== 'PHONE_RIGHT' || status.mobileRoute !== 'android_right')
      return unavailable('GEMINI_PHONE_RIGHT_PROVIDER_REQUIRED');
    if (status.visibleExecutionSupported !== true)
      return unavailable('GEMINI_VISIBLE_EXECUTION_UNAVAILABLE');
  }
  if (status.geminiAssistanceAvailable !== true)
    return unavailable('GEMINI_ASSISTANCE_UNAVAILABLE');
  if (status.liveExecutionVerified !== true)
    return unavailable('GEMINI_LIVE_EXECUTION_UNVERIFIED');
  // Existing hub planning capability only. It does not verify any YOUTUBE,
  // VIDEO or ANDROID feature, included video allowance, export or delivery.
  // Each requested feature still needs its own original result evidence.
  return {
    provider: 'gemini', available: true, capabilities: ['gemini-assistance'], reason: null,
    authorizesExecution: false, dispatchesTools: false, changesPersistentState: false
  };
}
