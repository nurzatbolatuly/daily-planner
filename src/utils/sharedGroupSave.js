import { roundTo, ceilTo, getPrecision, convertAmount } from "./format";
import { SHARED_ENTRY_KINDS as K, SHARED_MODES } from "../constants/money";
import { memberBalances, mirrorBalance } from "./sharedExpenses";
import { buildPersonalTransactions } from "./personalTransactions";
import { balancesAfter } from "./sharedSave";
import { buildTreatSave } from "./sharedTransferSave";

// Общие расходы — управление группой: гости → «Люди» (§7.2), настройки и участники, архив и
// удаление (§7.5–§7.6), смена валюты. Чистые функции — данные для RPC save_shared_members,
// save_shared_entry, delete_shared_group.

// ─── Гость → «Люди» (этап 7, §7.2) ──────────────────────────────────────────────────────────

// Создаём человека (или берём существующего — person: null) и проставляем его выбранным
// участникам-гостям. Записи групп ссылаются на shared_members.id, их трогать не нужно.
// Одним вызовом save_shared_entry (p.people, v25): человек и участники — атомарно.
export const buildGuestToPersonSave = ({ person = null, personId, members }) => ({
  people: person ? [person] : [],
  members: members.map(m => ({ ...m, person_id: personId, guest_name: null })),
  entries: [],
});

// ─── Управление группой (этап 8, §7.5–§7.6) ────────────────────────────────────────────────

// Настройки группы и участники одним вызовом save_shared_members (v26).
//   group — группа с правками (null — настройки не менялись); members — новые и изменённые;
//   deleteIds — удаляемые участники (RPC откажет, если участник встречается в записях).
//   currency/amounts — смена валюты группы (этап 9): новая валюта и regroupAmounts всех записей.
//   entries/deleteEntryIds — начальный баланс квартиры (этап 10): запись opening правится вместе с настройками.
export const buildGroupSettingsSave = ({ group, groupId, members = [], deleteIds = [], currency = null, amounts = [], entries = [], deleteEntryIds = [] }) =>
  ({ group_id: groupId, group, members, delete_member_ids: deleteIds, entries, delete_entry_ids: deleteEntryIds, ...(currency ? { currency, amounts } : {}) });

// «Закрыть группу» / «В архив» (§7.6, §12.3): archived = true, при forgive — «угощаю» на весь
// остаток каждого, кто должен мне (одной пачкой на участника). Мои долги участникам не
// прощаются — это не моё решение, они остаются видны в архиве. Один вызов save_shared_entry.
export function buildArchiveSave({ group, members, entries, archived = true, forgive = false, date, newId, precision = 2 }) {
  const meId = members.find(m => m.is_me)?.id;
  const treats = forgive && archived
    ? members.filter(m => m.id !== meId)
      .flatMap(m => buildTreatSave({ group, memberId: m.id, meId, entries, date, newId, precision })?.entries || [])
    : [];
  return { group: { ...group, archived }, members: [], entries: treats };
}

// Что сломается или изменится при удалении группы (§7.6) — для DeleteGroupSheet.
//   data: всё из стора (groups, members, entries, transactions, debtEvents, accounts).
// → { counts, txIds, txRestore, accountMoves, balancesIfDelete, offsets, openDebts, analytics: { keep, remove }, hasLinked }
//   txIds — транзакции, созданные группой (удаляются при «удалить вместе»). Привязанные ранее
//   существовавшие (§5.13) не удаляются ни в одном варианте — им возвращаются категория и
//   заметка (txRestore), как при удалении одной записи (buildEntryDelete).
//   analytics.keep — как изменится статистика, если операции оставить (транзакции перестают
//   затеняться до моей доли, виртуальные строки пропадают); remove — если удалить вместе с ними.
//   Считается через ту же buildPersonalTransactions, что и вся статистика — без второй формулы.
export function groupDeletionImpact(group, { groups = [], members = [], entries = [], transactions = [], debtEvents = [], accounts = [] }) {
  const own = entries.filter(e => e.group_id === group.id);
  const ownMembers = members.filter(m => m.group_id === group.id);
  const restoreById = new Map(own.filter(e => e.transaction_id && e.linked_tx_snapshot)
    .map(e => [e.transaction_id, { id: e.transaction_id, category_id: e.linked_tx_snapshot.category_id ?? null, note: e.linked_tx_snapshot.note || "" }]));
  const txIds = [...new Set(own.map(e => e.transaction_id).filter(id => id && !restoreById.has(id)))];
  const txs = transactions.filter(t => txIds.includes(t.id));
  const txRestore = transactions.filter(t => restoreById.has(t.id)).map(t => restoreById.get(t.id));

  const moves = {};
  txs.forEach(t => {
    if (!t.account_id) return;
    if (!moves[t.account_id]) moves[t.account_id] = { account_id: t.account_id, currency: t.currency, out: 0, in: 0 };
    const m = moves[t.account_id];
    m[t.type === "income" ? "in" : "out"] += Number(t.amount) || 0;
  });

  const precision = getPrecision(group.currency);
  const balances = memberBalances(own, ownMembers, { precision });
  const isMirror = group.mode === SHARED_MODES.mirror;
  // В квартире долг — с группой целиком (§4), а не с участниками.
  const openDebts = isMirror ? [] : ownMembers
    .filter(m => balances[m.id]?.balance)
    .map(m => ({ member: m, balance: balances[m.id].balance }));
  const meId = ownMembers.find(m => m.is_me)?.id;

  const otherEntries = entries.filter(e => e.group_id !== group.id);
  const build = (txList, entryList) => buildPersonalTransactions({
    transactions: txList, debtEvents, sharedGroups: groups, sharedMembers: members, sharedEntries: entryList });
  const before = build(transactions, entries);
  const restored = transactions.map(t => (restoreById.has(t.id) ? { ...t, ...restoreById.get(t.id) } : t));

  return {
    counts: {
      bills: own.filter(e => e.kind === K.bill || e.kind === K.refund).length,
      transfers: own.filter(e => e.kind === K.transfer).length,
      adjusts: own.filter(e => e.kind === K.adjust).length,
    },
    txIds: txs.map(t => t.id),
    txRestore,
    accountMoves: Object.values(moves),
    balancesIfDelete: balancesAfter(accounts, { removed: txs }),
    offsets: own.filter(e => e.debt_event_id).length,
    openDebts,
    mirrorBalance: isMirror ? mirrorBalance(own, meId, { precision }) : null,
    analytics: {
      keep: personalDiff(before, build(restored, otherEntries)),
      remove: personalDiff(before, build(restored.filter(t => !txIds.includes(t.id)), otherEntries)),
    },
    // Выбор «оставить / удалить операции» нужен, только если есть что удалять со счетов или зачёты.
    hasLinked: txs.length > 0 || own.some(e => e.debt_event_id),
  };
}

// Разница «моих» доходов/расходов по категориям: after − before, ненулевые.
// → [{ type, category_id, currency, delta }]
function personalDiff(before, after) {
  const sums = {};
  const add = (list, sign) => list.forEach(t => {
    const key = `${t.type}|${t.category_id}|${t.currency}`;
    sums[key] = (sums[key] || 0) + sign * (Number(t.amount) || 0);
  });
  add(after, 1);
  add(before, -1);
  return Object.entries(sums)
    .map(([key, d]) => {
      const [type, category_id, currency] = key.split("|");
      return { type, category_id, currency, delta: roundTo(d, getPrecision(currency)) };
    })
    .filter(x => x.delta !== 0);
}

// Удаление группы (delete_shared_group, v26; tx_restore — v32). keepTransactions — операции
// остаются обычными транзакциями (балансы не меняются); иначе удаляются с откатом балансов.
// Привязанным транзакциям в обоих вариантах возвращаются категория и заметка.
export const buildGroupDelete = ({ group, impact, keepTransactions }) => ({
  group_id: group.id,
  tx_delete_ids: keepTransactions ? [] : impact.txIds,
  tx_restore: impact.txRestore,
  balances: keepTransactions ? [] : impact.balancesIfDelete,
});

// ─── Смена валюты группы (этап 9, §7.6) ─────────────────────────────────────────────────────

// Смена валюты группы (§7.6): amount_group всех записей пересчитывается один раз по текущим
// курсам. Где есть точная сумма в новой валюте — берём её: списанное со счёта в этой валюте
// (account_amount), сумма записи в этой валюте (amount). Иначе — пересчёт старой amount_group.
// → [{ id, amount_group }]
export function regroupAmounts(entries, { from, to, rates = {}, accounts = [] }) {
  const precision = getPrecision(to);
  return entries.map(e => {
    const accCur = accounts.find(a => a.id === e.account_id)?.currency;
    const exact = e.kind === K.bill || e.kind === K.refund
      ? (accCur === to && e.account_amount != null ? Number(e.account_amount) : e.currency === to && e.amount != null ? Number(e.amount) : null)
      : (e.currency === to && e.amount != null ? Number(e.amount) : null);
    return { id: e.id, amount_group: exact ?? ceilTo(convertAmount(e.amount_group, from, to, rates), precision) };
  });
}
