import { withPersonalAmounts } from "./debtLedger";
import { myShareOf } from "./sharedExpenses";
import { ceilTo, getPrecision } from "./format";
import { SHARED_ENTRY_KINDS as K } from "../constants/money";

// Единая сборка «моих доходов и расходов» для всей статистики: Главная, Аналитика, Бюджет,
// GoalDetail (docs/shared-expenses.md §11.1). Считается один раз в useMoneyData
// (personalTransactions). Балансы и история счёта по-прежнему работают с сырыми transactions.
//
// 1. Сплит «Оплатил за других» — расход уменьшается до моей доли (withPersonalAmounts).
// 2. Счёт общей группы, который я оплатил, — его транзакция «затеняется» до моей доли
//    (с корректировками) и переносится на дату счёта.
// 3. Счёт, который оплатил не я (или моя оплата без транзакции), — виртуальная строка
//    { id: "shared:<id>", virtual: true, account_id: null } на мою долю, в валюте группы.
// 4. Возврат в группу (refund) — виртуальная строка расхода с отрицательной моей долей.
// 5. Транзакции без категории отбрасываются: это движение денег, а не доход или расход —
//    переводы групп, возвраты и займы «Долгов» (§6.1).

const VIRTUAL_TX_PREFIX = "shared:";

export function buildPersonalTransactions({
  transactions = [], debtEvents = [], sharedGroups = [], sharedMembers = [], sharedEntries = [],
}) {
  const personal = withPersonalAmounts(transactions, debtEvents);
  if (!sharedEntries.length) return personal.filter(t => t.category_id);

  const rawById = new Map(transactions.map(t => [t.id, t]));
  const groupById = new Map(sharedGroups.map(g => [g.id, g]));
  const meByGroup = new Map();
  sharedMembers.forEach(m => { if (m.is_me) meByGroup.set(m.group_id, m.id); });
  const adjustments = sharedEntries.filter(e => e.kind === K.adjust && e.bill_id);

  const shadowed = new Map();   // transaction_id → затенённая транзакция
  const virtual = [];

  sharedEntries.forEach(e => {
    if (e.kind !== K.bill && e.kind !== K.refund) return;
    const meId = meByGroup.get(e.group_id);
    if (!meId) return;
    const myShare = myShareOf(e, meId, adjustments, { precision: 9 });
    const tx = e.kind === K.bill && e.payer_member_id === meId && rawById.get(e.transaction_id);

    if (tx) {
      // Полная сумма транзакции (в валюте счёта) ↔ amount_group счёта; моя доля — та же пропорция.
      const groupTotal = Number(e.amount_group) || 0;
      const amount = groupTotal ? ceilTo(myShare * tx.amount / groupTotal, getPrecision(tx.currency)) : 0;
      shadowed.set(tx.id, { ...tx, amount, date: e.date, category_id: e.category_id ?? tx.category_id });
      return;
    }

    if (!myShare || !e.category_id) return;
    const currency = groupById.get(e.group_id)?.currency || e.currency;
    virtual.push({
      id: VIRTUAL_TX_PREFIX + e.id,
      type: "expense",
      amount: ceilTo(myShare, getPrecision(currency)),
      currency,
      category_id: e.category_id,
      account_id: null,
      date: e.date,
      note: e.title || "",
      virtual: true,
      shared_entry_id: e.id,
      group_id: e.group_id,
    });
  });

  return [
    ...personal.map(t => shadowed.get(t.id) || t),
    ...virtual,
  ].filter(t => t.category_id);
}

