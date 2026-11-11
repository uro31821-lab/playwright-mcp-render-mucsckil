// Synthetic native-issued argument shapes for no-device regressions only.
// Production must reuse arguments from the authenticated current phone result.
const session = '11111111-2222-4333-8444-555555555555';
const request = '66666666-7777-4888-9999-aaaaaaaaaaaa';
export const fixtureFieldId = 'f_' + 'b'.repeat(24);
export function fixtureGuidedArguments(operation = 'TYPE') {
  const op = {TYPE: 'form15_type', DISCOVER_INPUT: 'form15_discover', DISMISS_NOTICE: 'form_activate'}[operation];
  if (!op) throw new Error('unknown fixture operation');
  return {action: 'set_text',
    text: ['__JH_FORM_V1__', session, request, op,
      operation === 'DISCOVER_INPUT' ? '' : fixtureFieldId,
      operation === 'DISMISS_NOTICE' ? 'visible-only' : ''].join('|'),
    value: operation === 'TYPE' ? '<값>' : ''};
}

export function fixtureGuidedJob(operation = 'TYPE', override) {
  const value = override ?? {
    DISCOVER_INPUT: {ok: true, code: 'form_scanned', feature: 'input_selection_15',
      coverage: 'VISIBLE_ONLY', fields: [], form15ToolArguments: {fields: []}},
    TYPE: {ok: true, code: 'field_value_verified', operation: 'type', actionAccepted: true,
      valueVerified: true, fieldId: fixtureFieldId, effectConfirmed: false, autoRetryAllowed: false},
    DISMISS_NOTICE: {ok: true, code: 'low_risk_action_dispatched', actionAccepted: true,
      transactionSuccessVerified: false, autoRetryAllowed: false, rescanRequired: true}
  }[operation];
  return {type: 'agent_step', status: 'complete', error: null,
    result: {ok: value.ok, url: JSON.stringify(value)}};
}

export function fixtureMobileReply(name, args) {
  if (name !== 'life_android_step') return {ok: true};
  const operation = {form15_type: 'TYPE', form15_discover: 'DISCOVER_INPUT',
    form_activate: 'DISMISS_NOTICE'}[args.text.split('|')[3]];
  return fixtureGuidedJob(operation);
}

// Original CU WAIT + Stage61 producer shape. Synthetic data, never a phone receipt.
export function fixtureAndroidAppInspection(packageName = 'com.google.android.youtube') {
  return {ok: true, code: 'screen_ready',
    screen: {packageName, windowId: 12, left: 700, top: 0, right: 1400, bottom: 1000,
      viewportWidth: 700, viewportHeight: 1000, structuralDigest: 'b'.repeat(64), screenshotDigest: null,
      locked: false, secureContext: false, routingBusy: false},
    target: {trust: 'NONE', risk: 'NONE', ambiguous: false, targetDigest: 'c'.repeat(64)},
    stage61Router: {routerVersion: 'JH168_STAGE61_RIGHT_PANE_ROUTER_V3',
      routeSchema: 'JH168_STAGE61_ROUTE_REQUEST_V1', schema: 'JH168_STAGE61_UNIFIED_RECEIPT_V1',
      provider: 'ANDROID_COMPUTER_USE', action: 'READ_ONLY_INSPECT', phase: 'INSPECT',
      routeCode: 'READ_ONLY_COMPUTER_USE_INSPECTION', allowed: true,
      fallbackEligible: false, compatibilityDirectProvider: false, replayAllowed: false,
      leftGptProtected: true, rightWorkVerified: true, sameDisplay: true,
      fixedLayout: 'LEFT_GPT_RIGHT_WORK', chatPackage: 'com.openai.chatgpt',
      chatWindowId: 11, workPackage: packageName, workWindowId: 12,
      chatBounds: '0,0,700,1000', workBounds: '700,0,1400,1000',
      chatDisplayId: 0, workDisplayId: 0, outcome: 'READ_ONLY_VERIFIED', originalCode: 'screen_ready',
      actionDispatched: false, resultVerified: false, successReceipt: false,
      verifiedUnsupportedNoEffect: false, automaticReplay: false, unifiedReceiptDigest: 'd'.repeat(64)}};
}
