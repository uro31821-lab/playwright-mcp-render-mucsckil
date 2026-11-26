// Compare only the lines supplied from the two menus in this conversation.
import {z} from 'zod';

const operation = 'compare_supplied_menu_terms';
const labels = {
  included: '기본 포함',
  excluded: '제외 명시',
  optional: '선택 가능',
  extra: '별도 비용',
  conditional: '조건부',
  unclear: '확인 필요'
};

export function menuComparisonSchema(zod) {
  const text = max => zod.string().min(1).max(max).refine(value =>
    value.trim() === value && !/[\p{C}\p{Zl}\p{Zp}〔〕]/u.test(value));
  const entry = zod.object({
    item: text(48),
    status: zod.enum(['included', 'excluded', 'optional', 'extra', 'conditional', 'unclear']),
    quote: text(120)
  }).strict();
  const menu = zod.object({ref: text(48), entries: zod.array(entry).max(24)}).strict();
  return zod.object({
    menuItems: zod.array(text(48)).min(1).max(12),
    menus: zod.array(menu).length(2)
  }).strict();
}

const schema = menuComparisonSchema(z);
const key = value => value.normalize('NFC');

function readMenuItem(menu, item) {
  const unique = new Map();
  for (const entry of menu.entries) {
    if (key(entry.item) !== key(item)) continue;
    const signature = JSON.stringify([entry.status, key(entry.quote)]);
    if (!unique.has(signature)) unique.set(signature, entry);
  }
  if (!unique.size) return {confirmed: false, text: '제공된 메뉴에 기재 없음'};

  const entries = [...unique.values()];
  const terms = entries.map(row => labels[row.status] + ' ' + JSON.stringify(row.quote));
  if (entries.length === 1) return {confirmed: entries[0].status !== 'unclear', text: terms[0]};

  // A selectable add-on may explicitly carry a charge. More than one statement of
  // either kind can differ in quantity or terms, so keep them unresolved.
  const categories = new Set(entries.map(row => row.status));
  if (entries.length === 2 && categories.has('optional') && categories.has('extra')) {
    return {confirmed: true, text: terms.join(' · ')};
  }
  return {confirmed: false, text: '서로 다른 표기 · 적용 조건 확인 필요(' + terms.join(' / ') + ')'};
}

export function compareSuppliedMenus(input) {
  const {menus, menuItems} = schema.parse(input);
  if (key(menus[0].ref) === key(menus[1].ref)) throw Error('SAME_MENU_REFERENCE');
  if (new Set(menuItems.map(key)).size !== menuItems.length) throw Error('DUPLICATE_MENU_ITEM');

  const lines = [];
  let anyConfirmed = false;
  for (const item of menuItems) {
    const columns = menus.map(menu => {
      const cell = readMenuItem(menu, item);
      if (cell.confirmed) anyConfirmed = true;
      return menu.ref + ' ' + cell.text;
    });
    lines.push(item + '〔' + columns.join(' / ') + '〕.');
  }
  const result = {operation, text: '제공된 메뉴 두 건의 표기입니다. ' + lines.join(' ')};
  if (!anyConfirmed) result.availability = 'unavailable';
  return result;
}
