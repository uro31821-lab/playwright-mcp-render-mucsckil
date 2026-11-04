/** Interpret a trusted host provider's current status; never calls a provider.
 * A test fixture or a page/user assertion is not runtime availability evidence. */
export function resolveGeminiAvailability(status) {
  const unavailable = reason => ({
    provider: 'gemini', available: false, capabilities: [], reason,
    authorizesExecution: false, dispatchesTools: false, changesPersistentState: false
  });
  if (!status || typeof status !== 'object' || Array.isArray(status) ||
      status.schema !== 'jh.jebiseo-capabilities.v1' || status.provider !== 'gemini')
    return unavailable('GEMINI_PROVIDER_STATUS_REQUIRED');
  if (status.internalExecutionSupported !== true)
    return unavailable('HIDDEN_EXECUTION_UNAVAILABLE');
  if (status.geminiAssistanceAvailable !== true)
    return unavailable('GEMINI_ASSISTANCE_UNAVAILABLE');
  if (status.liveExecutionVerified !== true)
    return unavailable('GEMINI_LIVE_EXECUTION_UNVERIFIED');
  return {
    provider: 'gemini', available: true, capabilities: ['gemini-assistance'], reason: null,
    authorizesExecution: false, dispatchesTools: false, changesPersistentState: false
  };
}
