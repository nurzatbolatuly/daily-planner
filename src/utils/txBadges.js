import { SHARED_ENTRY_KINDS as K, DEBT_WORDS } from "../constants/money";
import { memberLabel } from "./sharedExpenses";
import { pluralRu } from "./format";

// Бейджи строк истории (HistoryPageMon, AccDetailPage) и подписи виртуальных строк статистики
// (CatTxsPageMon). Чистые функции: { label, tone } — цвета по tone подбирает компонент TxBadge.
//   tone: "danger" | "warn" | "ok" | "info" | "shared"

// Долги людям: транзакция привязана к debt_events через transaction_id.
// "they_paid" и "lent" пишет DebtFormPage («Я должен» / «Мне должны»), "return" — ReturnModal
// (направление — по типу транзакции: income — мне вернули, expense — я вернул).
export function personDebtBadge(tx, debtEvents, debtPeople) {
  const evt = debtEvents.find(e => e.transaction_id === tx.id && (e.type === "they_paid" || e.type === "lent" || e.type === "return"));
  if (!evt) return null;
  const name = debtPeople.find(p => p.id === evt.person_id)?.name || "—";
  if (evt.type === "they_paid") return { label: `Взял в долг у ${name}`, tone: "danger" };
  if (evt.type === "lent") return { label: `Дал в долг · ${name}`, tone: "warn" };
  if (tx.type === "income") return { label: `${name} вернул(а) долг`, tone: "ok" };
  return { label: `Вернул(а) долг · ${name}`, tone: "info" };
}

// Индекс «транзакция → записи общих групп» (один на все строки списка, считается в useMoneyData).
export function buildSharedTxIndex({ sharedGroups = [], sharedMembers = [], sharedEntries = [], people = [] }) {
  const groupById = new Map(sharedGroups.map(g => [g.id, g]));
  const entriesByTx = new Map();
  sharedEntries.forEach(e => {
    if (!e.transaction_id) return;
    entriesByTx.set(e.transaction_id, [...(entriesByTx.get(e.transaction_id) || []), e]);
  });
  const entryById = new Map(sharedEntries.map(e => [e.id, e]));
  const membersOf = groupId => sharedMembers.filter(m => m.group_id === groupId);
  const memberName = (groupId, memberId) => {
    const m = sharedMembers.find(x => x.id === memberId);
    return m ? memberLabel(m, { people, members: membersOf(groupId) }) : "?";
  };
  const meOf = groupId => sharedMembers.find(m => m.group_id === groupId && m.is_me)?.id;
  return { groupById, entriesByTx, entryById, memberName, meOf, people };
}

// Транзакция на счёте, связанная с записью группы (§11.4): «Общие · Вечер 03.10»,
// «Перевод · Квартира → Дима», «Перевод · Вечер 03.10 ← Асан», «Перевод · 2 долга ← Бек».
export function sharedTxBadge(tx, index) {
  const linked = index?.entriesByTx.get(tx.id);
  if (!linked?.length) return null;
  const e = linked[0];
  const group = index.groupById.get(e.group_id);
  const groupName = group?.name || "группа";
  if (e.kind === K.bill) return { label: `Общие · ${groupName}`, tone: "shared" };
  if (e.kind === K.refund) return { label: `Возврат · ${groupName}`, tone: "shared" };
  if (e.kind !== K.transfer) return null;
  const incoming = e.to_member_id === index.meOf(e.group_id);
  const arrow = incoming ? "←" : "→";
  if (linked.length > 1) {
    const sender = (e.sender_person_id && index.people.find(p => p.id === e.sender_person_id)?.name) || e.sender_name
      || index.memberName(e.group_id, incoming ? e.from_member_id : e.to_member_id);
    return { label: `Перевод · ${linked.length} ${pluralRu(linked.length, DEBT_WORDS)} ${arrow} ${sender}`, tone: "shared" };
  }
  return { label: `Перевод · ${groupName} ${arrow} ${index.memberName(e.group_id, incoming ? e.from_member_id : e.to_member_id)}`, tone: "shared" };
}

// Подпись виртуальной строки «мою долю оплатил другой» (§11.1): «Вечер 03.10 · платил Асан».
export function virtualTxLabel(tx, index) {
  const e = index?.entryById.get(tx.shared_entry_id);
  if (!e) return "Общие расходы";
  const groupName = index.groupById.get(e.group_id)?.name || "группа";
  const payer = e.payer_member_id === index.meOf(e.group_id) ? "я" : index.memberName(e.group_id, e.payer_member_id);
  return e.kind === K.refund ? `${groupName} · возврат, получил ${payer}` : `${groupName} · платил ${payer}`;
}

// Подпись «счёта» виртуальной строки в выгрузках (§11.1): «Общие: Вечер 03.10».
export function virtualTxAccountLabel(tx, index) {
  const e = index?.entryById.get(tx.shared_entry_id);
  return `Общие: ${(e && index.groupById.get(e.group_id)?.name) || "группа"}`;
}

// Бейдж строки истории: сначала общие расходы, потом долги людям.
export const txBadge = (tx, { sharedIndex, debtEvents = [], debtPeople = [] }) =>
  sharedTxBadge(tx, sharedIndex) || personDebtBadge(tx, debtEvents, debtPeople);
