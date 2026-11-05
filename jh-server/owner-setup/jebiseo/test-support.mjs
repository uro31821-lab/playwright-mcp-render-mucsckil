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
