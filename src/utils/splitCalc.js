import { round2 } from "./format";

// Калькулятор сплита расхода на несколько человек (тугл «Оплатил за других» в TxPage).
// entries — доли ОСТАЛЬНЫХ участников; meValue — моя доля (используется только в "shares"/
// "percent", где у меня тоже есть редактируемое поле — см. SplitToggle.jsx). Моя итоговая
// сумма всё равно всегда производная (totalAmount минус чужие доли), т.к. только чужие доли
// пишутся в debt_events; meValue лишь участвует в НОРМИРОВКЕ (вес/процент), а не является
// хранимым значением. Поэтому остаток от округления копеек естественным образом уходит в мою
// долю — баланс всегда сходится ровно.
//
// Если я НЕ участвую (meIncluded=false, «оплатил целиком за других») — моя доля 0, и чужие
// доли обязаны покрыть всю сумму целиком: для «поровну»/«долей» остаток округления уходит
// последнему участнику; для «процентов»/«точных сумм» — это ошибка ввода, а не округление
// (см. valid/reason/gap).

export const SPLIT_METHODS = ["equal", "shares", "percent", "exact"];

// entries: [{ id, value }] — по одному на каждого выбранного человека (без меня).
// value: для "shares" — вес (>0), для "percent" — число 0..100, для "exact" — сумма;
// для "equal" не используется. meValue — мой вес/процент для "shares"/"percent".
export function computeSplit(totalAmount, entries, method, meIncluded = true, meValue = null) {
  const total = round2(totalAmount) || 0;

  if (total <= 0 || entries.length === 0) {
    return { others: entries.map(e => ({ id: e.id, amount: 0 })), me: meIncluded ? total : 0, valid: false, reason: "no_participants", gap: 0 };
  }

  switch (method) {
    // "Поровну"/"доли" полностью расписывают 100% суммы уже самой формулой — несовпадение
    // с итогом бывает только от округления копеек, поэтому остаток (если я не участвую)
    // безопасно доливать последнему участнику (strict=false).
    case "equal":  return finalize(total, splitEqualRaw(total, entries, meIncluded), entries, meIncluded, false);
    case "shares": return finalize(total, splitSharesRaw(total, entries, meIncluded, meValue), entries, meIncluded, false);
    case "percent": return finalizePercent(total, entries, meIncluded, meValue);
    // "Суммы" — введены пользователем вручную, поэтому несовпадение с итогом — это
    // незавершённый/ошибочный ввод, а не округление: строгая проверка (strict=true).
    case "exact":  return finalize(total, entries.map(e => round2(e.value) || 0), entries, meIncluded, true);
    default:       return finalize(total, splitEqualRaw(total, entries, meIncluded), entries, meIncluded, false);
  }
}

// "Поровну": totalAmount делится на (entries.length + я, если участвую) равных частей.
function splitEqualRaw(total, entries, meIncluded) {
  const parts = entries.length + (meIncluded ? 1 : 0);
  const unit = round2(total / parts);
  return entries.map(() => unit);
}

// "Долями": вес каждого — value (>0, иначе 0); мой вес — meValue (тоже редактируется в UI,
// по умолчанию считается 1, если поле ещё не тронуто).
function splitSharesRaw(total, entries, meIncluded, meValue) {
  const weights = entries.map(e => Math.max(parseFloat(e.value) || 0, 0));
  const myWeight = meIncluded ? Math.max(parseFloat(meValue) || 0, 0) : 0;
  const totalWeight = weights.reduce((s, w) => s + w, 0) + myWeight;
  if (totalWeight <= 0) return entries.map(() => 0);
  const unit = total / totalWeight;
  return weights.map(w => round2(w * unit));
}

// "Проценты": value каждого участника — процент (0..100) от totalAmount напрямую.
function splitPercentRaw(total, entries) {
  return entries.map(e => round2(total * (Math.max(parseFloat(e.value) || 0, 0) / 100)));
}

// У процентов, в отличие от долей, есть однозначно "правильная" сумма — 100%. Раз у меня
// тоже есть редактируемое поле процента, сверяем его вместе с чужими: если все проценты
// (включая мой, если я участвую) не сходятся к 100 — это ошибка ввода, а не округление.
function finalizePercent(total, entries, meIncluded, meValue) {
  const result = finalize(total, splitPercentRaw(total, entries), entries, meIncluded, true);
  if (!meIncluded || !result.valid) return result;

  const othersPercent = entries.reduce((s, e) => s + Math.max(parseFloat(e.value) || 0, 0), 0);
  const myPercent = Math.max(parseFloat(meValue) || 0, 0);
  const overshoot = round2(othersPercent + myPercent - 100);
  if (Math.abs(overshoot) <= 0.05) return result;

  return {
    ...result,
    valid: false,
    reason: overshoot > 0 ? "negative_share" : "unallocated",
    gap: round2(Math.abs(overshoot) / 100 * total),
  };
}

// Собирает итог: считает мою долю (если участвую), либо (если не участвую) доливает остаток
// округления последнему участнику для "нестрогих" методов или строго проверяет сверку для
// методов с ручным вводом ("проценты"/"суммы") — см. комментарии у вызовов в computeSplit.
function finalize(total, rawAmounts, entries, meIncluded, strict) {
  let amounts = rawAmounts.slice();
  const sumOthers = () => round2(amounts.reduce((s, a) => s + a, 0));

  let me = 0;
  let valid = true;
  let reason = null;
  let gap = 0;

  if (meIncluded) {
    me = round2(total - sumOthers());
    if (me < -0.005) { valid = false; reason = "negative_share"; gap = round2(-me); }
  } else if (!strict) {
    const diff = round2(total - sumOthers());
    if (diff !== 0 && amounts.length > 0) amounts[amounts.length - 1] = round2(amounts[amounts.length - 1] + diff);
    me = 0;
  } else {
    me = 0;
    const diff = round2(total - sumOthers());
    if (Math.abs(diff) > 0.005) { valid = false; reason = diff > 0 ? "unallocated" : "over_total"; gap = round2(Math.abs(diff)); }
  }

  return {
    others: entries.map((e, i) => ({ id: e.id, amount: amounts[i] ?? 0 })),
    me,
    valid,
    reason,
    gap,
  };
}
