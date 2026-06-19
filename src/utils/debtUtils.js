import { SAVINGS_PURPOSES } from "../constants/money";
import { toBase } from "./format";

// Хронологически обрабатывает все переводы и возвращает:
//   totalDebt        — суммарный непогашенный долг
//   byAcc            — долг и переводы по каждому savings-счёту
//   repaymentSavings — { [transferId]: savings_amount } для is_debt_repayment переводов:
//                      сколько из перевода является накоплением (излишек сверх долга)
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

  const runningDebt = {};      // accId → текущий остаток долга
  const debtItems   = {};      // accId → переводы, создавшие долг
  const repaymentSavings = {}; // transferId → сумма накоплений из этого перевода

  sorted.forEach(t => {
    // Исходящий с savings-счёта → создаёт долг
    if (savingsIds.has(t.from_id)) {
      const amt = toBase(t.amount, t.from_currency, rates);
      runningDebt[t.from_id] = (runningDebt[t.from_id] || 0) + amt;
      if (!debtItems[t.from_id]) debtItems[t.from_id] = [];
      debtItems[t.from_id].push(t);
    }

    // Входящий на savings-счёт С флагом → гасит долг; излишек = накопление
    if (savingsIds.has(t.to_id) && t.is_debt_repayment) {
      const amt         = toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates);
      const currentDebt = runningDebt[t.to_id] || 0;
      const extra       = Math.max(0, amt - currentDebt);

      runningDebt[t.to_id] = Math.max(0, currentDebt - amt);

      if (extra > 0) repaymentSavings[t.id] = extra;
    }
    // Входящий на savings-счёт БЕЗ флага → долг не меняется, весь = накопление (обрабатывается в аналитике)
  });

  let totalDebt = 0;
  const byAcc   = {};

  Object.keys(runningDebt).forEach(accId => {
    const debt = runningDebt[accId];
    if (debt > 0) {
      byAcc[accId] = {
        total: debt,
        items: [...(debtItems[accId] || [])].reverse(),
      };
      totalDebt += debt;
    }
  });

  return { totalDebt, byAcc, repaymentSavings };
}
