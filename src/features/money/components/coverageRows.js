// Состав счёта в форме: строки «Кого покрыл» ↔ shares записи (docs/shared-expenses.md §7.3, §8.1).
// Общие для счёта тусы (SharedEntryFormPage) и покупки Tricount (SharedPurchaseFormPage) — одно
// правило деления (splitBill), одна форма строк.
//   row: { included, heads, mode: "auto" | "fixed", value, extra, extraNote, weight } — строки ввода.
//
// Способ деления (как в Tricount) — на весь состав:
//   equal   — поровну по людям (× N, фикс-сумма и личное — через шторку участника);
//   percent — у каждого % (Σ = 100), parts — части (пропорционально), amount — точные суммы (Σ = счёт).
//   weight — ввод для percent / parts / amount. Доли — тем же splitBill: вверх, остаток плательщику.
// В shares способ хранится в mode ("percent" | "parts" | "amount") и value — форма открывается так же.

import { roundTo } from "../../../utils/format";
import { PERCENT_TOLERANCE } from "../../../utils/splitCalc";

export const SHARED_SPLIT_METHODS = [
  { id: "equal",   label: "Поровну" },
  { id: "percent", label: "Проценты", unit: "%" },
  { id: "parts",   label: "Части",    unit: "ч." },
  { id: "amount",  label: "Суммы" },
];
const WEIGHT_MODES = new Set(["percent", "parts", "amount"]);

export const SPLIT_REASON_TEXT = {
  fees_over_total: gap => `Сборы больше суммы счёта на ${gap}`,
  over_total:  gap => `Фиксированные и личные суммы больше счёта на ${gap}`,
  unallocated: gap => `Не распределено ${gap} — оставьте кого-то «поровну»`,
};

export const emptyRow = (heads = 1, included = true) => ({ included, heads, mode: "auto", value: "", extra: "", extraNote: "", weight: "" });

const rowFromShare = s => (WEIGHT_MODES.has(s.mode)
  ? { ...emptyRow(s.heads || 1), weight: s.value != null ? String(s.value) : "" }
  : { included: true, heads: s.heads || 1, mode: s.mode || "auto", value: s.value != null ? String(s.value) : "",
      extra: s.extra ? String(s.extra) : "", extraNote: s.extra_note || "", weight: "" });

// Каким способом была поделена запись (по mode её долей).
export const methodOfEntry = entry => entry?.shares?.find(s => WEIGHT_MODES.has(s.mode))?.mode || "equal";

// При правке — из shares записи, для новой — все участники группы, поровну, с их × N.
// copy — та же раскладка состава (участники и × N), но поровну: фикс-суммы и личное относились
// к исходной записи («Доплатил с другого счёта»).
export const initialRows = (members, entry = null, copy = null) => Object.fromEntries(members.map(m => {
  const s = (copy || entry)?.shares?.find(x => x.member_id === m.id);
  if (copy) return [m.id, emptyRow(s?.heads || m.heads || 1, !!s)];
  return [m.id, s ? rowFromShare(s) : emptyRow(m.heads || 1, !entry)];
}));

// Строки для splitBill по способу деления. В percent/parts вес — weight (0 — без доли).
export function splitRowsFor(method, members, rows) {
  const included = members.filter(m => rows[m.id]?.included);
  if (method === "percent" || method === "parts") {
    return included.map(m => ({ member_id: m.id, heads: Math.max(Number(rows[m.id].weight) || 0, 0), mode: "auto" }))
      .filter(r => r.heads > 0);
  }
  if (method === "amount") return included.map(m => ({ member_id: m.id, heads: 1, mode: "fixed", value: Number(rows[m.id].weight) || 0 }));
  return included.map(m => toSplitRow(m.id, rows[m.id]));
}

// Проверка ввода способа, которую splitBill сам не делает (суммы проверяет он: перебор/недобор).
// → { error, total } — total: Σ процентов / частей.
export function methodCheck(method, members, rows) {
  const total = roundTo(members.reduce((n, m) => n + (rows[m.id]?.included ? Math.max(Number(rows[m.id].weight) || 0, 0) : 0), 0), 2);
  if (method === "percent" && Math.abs(total - 100) > PERCENT_TOLERANCE) return { error: `Сумма процентов — ${total}%, нужно 100%`, total };
  if (method === "parts" && !(total > 0)) return { error: "Укажите части", total };
  return { error: null, total };
}

// Значения по умолчанию при смене способа: проценты — поровну до 100 (остаток — последнему),
// части — по 1 (компашка × 3 — 3 части), суммы — текущее деление поровну.
export function defaultWeights(method, members, rows, equalAmounts = {}) {
  const included = members.filter(m => rows[m.id]?.included);
  const next = { ...rows };
  const set = (id, weight) => { next[id] = { ...rows[id], weight: String(weight) }; };
  if (method === "percent" && included.length) {
    const each = Math.floor(10000 / included.length) / 100;
    included.forEach((m, i) => set(m.id, i === included.length - 1 ? roundTo(100 - each * (included.length - 1), 2) : each));
  } else if (method === "parts") {
    included.forEach(m => set(m.id, Number(rows[m.id].heads) || 1));
  } else if (method === "amount") {
    included.forEach(m => set(m.id, equalAmounts[m.id] ?? ""));
  }
  return next;
}

export const toSplitRow = (memberId, r) => ({
  member_id: memberId, heads: r.heads, mode: r.mode,
  ...(r.mode === "fixed" ? { value: Number(r.value) || 0 } : {}),
  ...(Number(r.extra) > 0 ? { extra: Number(r.extra) } : {}),
});

// В БД — только то, что нужно для пересчёта и повторного открытия формы (§7.3).
// heads — всегда сколько людей за участником (компашка × 3), и в процентах/частях/суммах тоже:
// по нему считаются «за 1» в переводе (perHeadOf) и число людей в группе (groupHeadcount).
// Вес деления в этих способах — value, а не heads.
export const toShare = (s, rows, method = "equal") => (WEIGHT_MODES.has(method)
  ? { member_id: s.member_id, heads: Number(rows[s.member_id]?.heads) || 1, mode: method, value: Number(rows[s.member_id]?.weight) || 0, ...feePart(s), amount: s.amount }
  : {
      member_id: s.member_id, heads: s.heads, mode: s.mode,
      ...(s.mode === "fixed" ? { value: s.value } : {}),
      ...(s.extra > 0 ? { extra: s.extra, extra_note: rows[s.member_id]?.extraNote?.trim() || "" } : {}),
      ...feePart(s),
      amount: s.amount,
    });
// Часть доли от общих сборов (доставка, сервис) — для подписи в истории и «Поделиться».
const feePart = s => (s.fee > 0 ? { fee: s.fee } : {});

// Людей у каждого — для сборов «поровну по людям» (компашка × 3 — трое).
export const feeHeadsOf = (members, rows) => Object.fromEntries(members.map(m => [m.id, Number(rows[m.id]?.heads) || 1]));

// TODO: ветку восстановления из долей удалить после применения v30 (вместе с проверкой в useMoneyData).
// Сборы записи → строки ввода. Если в записи сборов нет, а в долях есть fee (запись сохранена,
// пока в БД не было колонки fees — миграция v30), сборы восстанавливаются из долей одной строкой:
// поровну, если на человека у всех одинаково (±1 единица), иначе — по заказу. Без этого форма при
// правке разделила бы всю сумму заново без сборов.
export function feesFromEntry(entry) {
  if (entry?.fees?.length) return entry.fees.map(f => ({ id: f.id, title: f.title || "", amount: String(f.amount), split: f.split || "equal" }));
  const parts = (entry?.shares || []).filter(s => Number(s.fee) > 0);
  if (!parts.length) return [];
  const perHead = parts.map(s => Number(s.fee) / (Number(s.heads) || 1));
  const equal = Math.max(...perHead) - Math.min(...perHead) <= 1;
  const total = roundTo(parts.reduce((n, s) => n + Number(s.fee), 0), 2);
  return [{ id: `restored-${entry.id}`, title: "Сборы", amount: String(total), split: equal ? "equal" : "proportional" }];
}
export const feesTotalOf = fees => fees.reduce((s, f) => s + (Number(f.amount) || 0), 0);

// Сколько человек в составе: компашка × 3 — трое.
export const includedHeads = (members, rows) =>
  members.reduce((n, m) => n + (rows[m.id]?.included ? Number(rows[m.id].heads) || 1 : 0), 0);
