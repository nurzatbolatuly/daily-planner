import { toBase, round2 } from "./format";
import { BASE_CUR } from "../constants/currencies";

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

// Непогашенные доли по каждому расходу (paid_for_them минус уже прощённое по тому же
// transaction_id), старые сверху — в валюте самих событий. Остаток считается суммой,
// а не "есть ли forgive по этой транзакции", т.к. прощение может быть частичным.
function outstandingByTransaction(history) {
  const byTx = {};
  history.forEach(e => {
    if (!e.transaction_id || (e.type !== "paid_for_them" && e.type !== "forgive")) return;
    const t = byTx[e.transaction_id] || (byTx[e.transaction_id] = { transaction_id: e.transaction_id, remaining: 0, currency: e.currency, date: null });
    t.remaining += e.amount;
    if (e.type === "paid_for_them" && (!t.date || e.date < t.date)) { t.date = e.date; t.currency = e.currency; }
  });
  return Object.values(byTx)
    .map(t => ({ ...t, remaining: round2(t.remaining) }))
    .filter(t => t.date && t.remaining > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Строки debt_events для прощения `amount` (в базовой валюте, 0 < amount ≤ |net|).
// Прощение идёт по расходам (forgive с тем же transaction_id) — это возвращает связанный
// расход к полной сумме в Истории/Аналитике/Бюджете (receivableByTransaction).
// - Полное прощение: гасятся ВСЕ непогашенные доли + балансирующая запись без
//   transaction_id, чтобы NET стал ровно 0 (в т.ч. если доли перекрыты they_paid и т.п.).
// - Частичное (должны мне): гасятся доли от старых расходов к новым, последняя — частично;
//   то, что не покрыто долями (ручные долги без транзакции) — записью без transaction_id.
// - Частичное (должен я): расходов, которые можно "вернуть", нет — одна запись без transaction_id.
export function buildForgiveEvents({ history, net, amount, rates = {}, personId, date, newId }) {
  const row = (amt, currency, transaction_id = null) => ({
    id: newId(), person_id: personId, type: "forgive", amount: round2(amt), currency, date,
    note: "", transaction_id, account_id: null,
  });
  const rows = [];
  const isFull = round2(amount) >= round2(Math.abs(net));

  if (isFull) {
    const outstanding = outstandingByTransaction(history);
    outstanding.forEach(t => rows.push(row(-t.remaining, t.currency, t.transaction_id)));
    const covered = outstanding.reduce((s, t) => s + toBase(t.remaining, t.currency, rates), 0);
    const remainder = round2(net - covered);
    if (remainder !== 0) rows.push(row(-remainder, BASE_CUR));
    return rows;
  }

  if (net < 0) return [row(amount, BASE_CUR)];

  let left = round2(amount);
  for (const t of outstandingByTransaction(history)) {
    if (left <= 0) break;
    const baseRemaining = round2(toBase(t.remaining, t.currency, rates));
    if (baseRemaining <= left) {
      rows.push(row(-t.remaining, t.currency, t.transaction_id));
      left = round2(left - baseRemaining);
    } else {
      const rate = toBase(1, t.currency, rates) || 1;
      rows.push(row(-(left / rate), t.currency, t.transaction_id));
      left = 0;
    }
  }
  if (left > 0) rows.push(row(-left, BASE_CUR));
  return rows;
}
