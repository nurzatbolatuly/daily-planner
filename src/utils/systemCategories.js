import { SYSTEM_CATEGORIES } from "../constants/money";
import { newId } from "./id";

// Системные категории (constants/money.js SYSTEM_CATEGORIES) — по роли system_key, а не по id:
// id у каждого пользователя свой (tables.sql v38).

const ENTRIES = Object.entries(SYSTEM_CATEGORIES);
const findByKey = (cats, key) => cats?.find(c => c.system_key === key);

// Роль → id категории пользователя: { bills, fxLoss, fxGain }. Нет категории — null.
export function systemCategoryIds(expCats, incCats) {
  return Object.fromEntries(ENTRIES.map(([role, def]) =>
    [role, findByKey(def.table === "exp" ? expCats : incCats, def.system_key)?.id ?? null]));
}

// Курсовая прибыль — доход, убыток — расход.
export const fxCategoryId = (pnl, systemCats) => (pnl > 0 ? systemCats.fxGain : systemCats.fxLoss);

// Системные категории таблицы ("exp" | "inc"), которых у пользователя ещё нет, — готовые строки
// для вставки (порядок — после существующих).
export function missingSystemCategories(table, cats) {
  return ENTRIES
    .filter(([, def]) => def.table === table && !findByKey(cats, def.system_key))
    .map(([, { table: _t, ...row }], i) => ({ ...row, id: newId(), sort_order: cats.length + i + 1 }));
}
