import { round2 } from "./format";

// Состав ежемесячного платежа и «где платить» (v42, instruction.md §20.1).
// Позиция в БД: { id, name, amount: number | null } (recurring.items, jsonb-массив).
// В форме сумма — строка ввода NumInput, поэтому хелперы принимают и строку, и число.

export const PAY_PLACE_MAX = 60;           // = CHECK в миграции v42
export const PAY_PLACE_SUGGESTIONS = 6;    // сколько подсказок «Где платить» показывать

const toAmount = v => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
};

// Для записи в БД: без пустых строк, сумма — число или null.
export function cleanBillItems(rows = []) {
  return rows
    .map(r => ({ id: r.id, name: (r.name || "").trim(), amount: toAmount(r.amount) }))
    .filter(r => r.name);
}

// Итог по позициям — только если сумма есть у каждой. Иначе null: итог вводится вручную.
export function billItemsTotal(rows = []) {
  const items = cleanBillItems(rows);
  if (items.length === 0 || items.some(i => i.amount == null)) return null;
  return round2(items.reduce((s, i) => s + i.amount, 0));
}

// Σ указанных сумм и сколько позиций без суммы — для подсказки при частичном составе.
export function billItemsProgress(rows = []) {
  const items = cleanBillItems(rows);
  const priced = items.filter(i => i.amount != null);
  return { sum: round2(priced.reduce((s, i) => s + i.amount, 0)), missing: items.length - priced.length };
}

// Подпись в списке платежей: «Spotify · iCloud · ChatGPT».
export const billItemsSummary = (items = []) => cleanBillItems(items).map(i => i.name).join(" · ");

// Заметка транзакции при оплате — чтобы в истории и поиске было видно, за что списано.
export function billTxNote(name, items = []) {
  const names = cleanBillItems(items).map(i => i.name);
  return names.length ? `${name}: ${names.join(", ")}` : name;
}

export const cleanPayPlace = v => (v || "").trim().slice(0, PAY_PLACE_MAX);

// Подсказки «Где платить» — из уже введённых значений (платежи + кредиты), самые частые
// первыми. Регистр не различается, показывается первое встреченное написание.
export function payPlaceSuggestions(lists = [], limit = PAY_PLACE_SUGGESTIONS) {
  const byKey = new Map();
  for (const row of lists.flat()) {
    const label = cleanPayPlace(row?.pay_place);
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    const cur = byKey.get(key);
    byKey.set(key, { label: cur?.label || label, count: (cur?.count || 0) + 1 });
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(v => v.label);
}
