import { SAVINGS_PURPOSES } from "../constants/money";
import { toBase } from "./format";

// Хронологически обрабатывает все переводы и возвращает:
//   totalDebt        — суммарный непогашенный долг, ПЕРЕСЧИТАННЫЙ в базовую валюту (только для
//                      сводной цифры — объединить граммы/доллары/тенге в одно число иначе нельзя)
//   byAcc            — долг и переводы по каждому savings-счёту, total/items — В РОДНОЙ ВАЛЮТЕ
//                      счёта (граммы для металла, исходные единицы для остальных) — сколько взяли,
//                      столько и нужно вернуть, а не KZT-эквивалент на момент снятия
//   repaymentSavings — { [transferId]: savings_amount } для is_debt_repayment переводов:
//                      сколько из перевода является накоплением (излишек сверх долга), в базовой валюте
//
// Правило:
//   savings → * (любой исход)           → создаёт долг для from_id
//   * → savings, is_debt_repayment=true → гасит долг; излишек сверх долга = накопление
//   * → savings, is_debt_repayment=false → 100% накопление, долг не меняется
export function computeDebtState(transfers, accounts, rates) {
  const savingsIds = new Set(
    accounts.filter(a => SAVINGS_PURPOSES.includes(a.purpose)).map(a => a.id)
  );

  const sorted = [...transfers]
    .filter(t => !t.is_adjustment)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const runningDebt = {};      // accId → текущий остаток долга, в родной валюте счёта
  const debtItems   = {};      // accId → переводы, создавшие долг
  const repaymentSavings = {}; // transferId → сумма накоплений из этого перевода, в базовой валюте

  sorted.forEach(t => {
    // Исходящий с savings-счёта → создаёт долг (в валюте самого счёта, без конвертации)
    if (savingsIds.has(t.from_id)) {
      runningDebt[t.from_id] = (runningDebt[t.from_id] || 0) + t.amount;
      if (!debtItems[t.from_id]) debtItems[t.from_id] = [];
      debtItems[t.from_id].push(t);
    }

    // Входящий на savings-счёт С флагом → гасит долг; излишек = накопление
    if (savingsIds.has(t.to_id) && t.is_debt_repayment) {
      const amt         = t.to_amt ?? t.amount; // родная валюта счёта-получателя = валюта долга
      const currency     = t.to_currency || t.from_currency;
      const currentDebt = runningDebt[t.to_id] || 0;
      const extra       = Math.max(0, amt - currentDebt);

      runningDebt[t.to_id] = Math.max(0, currentDebt - amt);

      if (extra > 0) repaymentSavings[t.id] = toBase(extra, currency, rates);
    }
    // Входящий на savings-счёт БЕЗ флага → долг не меняется, весь = накопление (обрабатывается в аналитике)
  });

  let totalDebt = 0;
  const byAcc   = {};

  Object.keys(runningDebt).forEach(accId => {
    const debt = runningDebt[accId];
    if (debt > 0) {
      const currency = debtItems[accId]?.[0]?.from_currency;
      byAcc[accId] = {
        total: debt,
        currency,
        items: [...(debtItems[accId] || [])].reverse(),
      };
      totalDebt += toBase(debt, currency, rates);
    }
  });

  return { totalDebt, byAcc, repaymentSavings };
}
