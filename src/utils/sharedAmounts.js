import { SHARED_ENTRY_KINDS as K } from "../constants/money";

// Общие расходы — примитивы сумм записей группы. Отдельный модуль, чтобы им пользовались и
// sharedExpenses (долги со мной), и sharedSettlement (итог группы) без циклического импорта.

export const isBill = e => e.kind === K.bill || e.kind === K.refund;

// Сумма записи в валюте группы. У переводов и корректировок amount_group — сама сумма.
export const groupAmount = e => Number(e.amount_group ?? e.amount) || 0;

// Пересчёт части счёта (доли, extra) из валюты чека в валюту группы — по той же пропорции,
// что и весь счёт, поэтому Σ долей в валюте группы = amount_group.
export const toGroup = (bill, x) => {
  const amt = Number(bill.amount) || 0;
  return bill.amount_group != null && amt !== 0 ? x * Number(bill.amount_group) / amt : x;
};

export const shareRow = (bill, memberId) => (bill.shares || []).find(s => s.member_id === memberId);

// Доля участника в одном счёте, в валюте группы. 0 — если он в счёте не участвует.
export function billMemberDebt(bill, memberId) {
  const s = shareRow(bill, memberId);
  return s ? toGroup(bill, Number(s.amount) || 0) : 0;
}
