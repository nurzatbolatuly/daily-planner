import { toBase, round2 } from "./format";

// Долги людям — единый event-sourced ledger (debt_events). Не путать с
// transfers.is_debt_repayment (долг самому себе при снятии с накопительного счёта).
//
// amount в каждом событии ЗНАКОВЫЙ:
//   + увеличивает "человек должен мне"
//   − увеличивает "я должен человеку"
// NET = Σ amount (в базовой валюте). Пересчитывается целиком из событий —
// точечных мутаций баланса долга нет, поэтому ничего не может разъехаться.

// { [person_id]: { net, events: [...] } }, net уже переведён в базовую валюту.
export function computeNetByPerson(events, rates = {}) {
  const byPerson = {};
  events.forEach(e => {
    if (!byPerson[e.person_id]) byPerson[e.person_id] = { net: 0, events: [] };
    byPerson[e.person_id].net += toBase(e.amount, e.currency, rates);
    byPerson[e.person_id].events.push(e);
  });
  Object.values(byPerson).forEach(p => { p.net = round2(p.net); });
  return byPerson;
}

// Хронологическая история одного человека, новые события сверху.
export function personHistory(events, personId) {
  return events
    .filter(e => e.person_id === personId)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

// Сумма чужих долей по каждой транзакции, привязанной через transaction_id: paid_for_them
// добавляет долю (+), а прощение этой же доли (forgive с тем же transaction_id) её гасит (−).
// Итог 0 для транзакции = никто больше не должен за неё → personalTxAmount вернёт полную сумму.
// ⚠️ type:"return" тоже носит свой transaction_id, но это id СОБСТВЕННОЙ транзакции возврата,
// а не исходного расхода — намеренно не участвует в этой сумме.
export function receivableByTransaction(debtEvents = []) {
  const map = {};
  debtEvents.forEach(e => {
    if (!e.transaction_id) return;
    if (e.type === "paid_for_them" || e.type === "forgive") {
      map[e.transaction_id] = (map[e.transaction_id] || 0) + e.amount;
    }
  });
  return map;
}

// Личная доля транзакции = полная сумма минус доли остальных участников сплита.
export function personalTxAmount(tx, receivableMap) {
  const receivable = receivableMap[tx.id] || 0;
  return receivable ? round2(tx.amount - receivable) : tx.amount;
}

// Транзакции с "личной" суммой вместо полной — для агрегаций категорий/аналитики/бюджета,
// чтобы чужие доли (сплит расхода в TxPage) не завышали статистику. Для отдельной транзакции
// в истории всё ещё нужна и полная сумма (см. CatTxsPageMon) — там используй helpers выше напрямую.
export function withPersonalAmounts(transactions, debtEvents) {
  const receivable = receivableByTransaction(debtEvents);
  if (!Object.keys(receivable).length) return transactions;
  return transactions.map(t => receivable[t.id] ? { ...t, amount: round2(t.amount - receivable[t.id]) } : t);
}
