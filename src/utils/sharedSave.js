import { round2, ceilTo, getPrecision, convertAmount } from "./format";
import { RU_MON_GEN } from "../constants/locale";
import { SHARED_ENTRY_KINDS as K, SHARED_ADJUST_REASONS as R, SHARED_MODES, SHARED_TRANSFER_METHODS as M } from "../constants/money";

// Общие расходы — сборка данных для RPC save_shared_entry / delete_shared_entry (tables.sql v23).
// Чистые функции: вся денежная математика (новые балансы счетов) — здесь и покрыта тестами,
// RPC только записывает готовое одной транзакцией БД.
// Здесь — общее для всех записей (поля, балансы, транзакции) и счёт тусы; по доменам рядом:
// sharedTransferSave (переводы), sharedGroupSave (группа), sharedMirrorSave (Tricount).
// EMPTY_ENTRY, adjustEntry, txRow, txSnapshot экспортируются только для этих модулей.

// Все колонки shared_entries: RPC перезаписывает строку целиком, поэтому запись собирается
// поверх полного «пустого» набора (+ старая запись при правке) — поля, которые форма не
// трогает, сохраняются как были.
export const EMPTY_ENTRY = {
  kind: null, date: null, currency: null, amount_group: null, note: "", title: "", amount: null,
  account_amount: null, venue_total: null, category_id: null, payer_member_id: null, shares: [],
  split_people: null, from_member_id: null, to_member_id: null, method: null, sender_person_id: null,
  sender_name: null, heads_covered: null, batch_id: null, member_id: null, reason: null, bill_id: null,
  transfer_id: null, account_id: null, transaction_id: null, debt_event_id: null, linked_tx_snapshot: null,
  fees: [],
};

const txEffect = tx => (tx.type === "income" ? 1 : -1) * Number(tx.amount);

// Изменения балансов счетов после замены oldTx на newTx (любой из них может быть null).
// Удалённый счёт пропускается (его баланс не трогаем), нулевые изменения не пишем.
// → [{ account_id, balance, delta }] — RPC v32+ применяет delta к текущему балансу в БД
//   (данные в сторе могли устареть — вторая вкладка, авто-списание); balance — итог по стору,
//   его пишут только RPC до v32.
export function balanceUpdates(accounts, { oldTx = null, newTx = null }) {
  return balancesAfter(accounts, { removed: oldTx ? [oldTx] : [], added: newTx ? [newTx] : [] });
}

// То же для нескольких транзакций сразу (удаление группы вместе с операциями, §7.6).
export function balancesAfter(accounts, { removed = [], added = [] }) {
  const delta = {};
  const add = (accId, x) => { if (accId) delta[accId] = (delta[accId] || 0) + x; };
  removed.forEach(tx => add(tx.account_id, -txEffect(tx)));
  added.forEach(tx => add(tx.account_id, txEffect(tx)));
  return Object.entries(delta)
    .map(([account_id, d]) => ({ acc: accounts.find(a => a.id === account_id), d: round2(d) }))
    .filter(({ acc, d }) => acc && d !== 0)
    .map(({ acc, d }) => ({ account_id: acc.id, balance: round2(Number(acc.balance) + d), delta: d }));
}

// Подпись даты вечера для списков: «3 октября».
export const fmtEventDate = date => `${Number(date.slice(8, 10))} ${RU_MON_GEN[Number(date.slice(5, 7)) - 1]}`;

export const sharedTxNote = (title, groupName) => (title ? `${title} · ${groupName}` : groupName);
const REFUND_NOTE_PREFIX = "Возврат";

// Цвет новой группы — тот же, что DEFAULT в shared_groups.color (это данные, не цвет темы).
const DEFAULT_GROUP_COLOR = "#4caf50";

export const newEventGroup = (id, { name, date, currency }) =>
  ({ id, name, mode: SHARED_MODES.event, currency, date, icon: "other", color: DEFAULT_GROUP_COLOR, minor_category_id: null, archived: false });

// Новые участники для выбранных людей из «Люди» (множественный выбор в PersonPicker): тех, кто
// уже участник, не дублируем — их id возвращаются в existingIds (форма включает их в состав).
// sort_order — подряд после последнего. → { added, existingIds }
export function membersForPeople(personIds, members, groupId, newId) {
  let order = Math.max(0, ...members.map(m => m.sort_order ?? 0));
  const existingIds = [];
  const added = [];
  personIds.forEach(personId => {
    const existing = members.find(m => m.person_id === personId);
    if (existing) { existingIds.push(existing.id); return; }
    order += 1;
    added.push({ id: newId(), group_id: groupId, is_me: false, label: null, heads: 1, person_id: personId, guest_name: null, sort_order: order });
  });
  return { added, existingIds };
}

export const newMirrorGroup = (id, { name, currency }) =>
  ({ id, name, mode: SHARED_MODES.mirror, currency, date: null, icon: "home", color: DEFAULT_GROUP_COLOR, minor_category_id: null, archived: false });

export const newMeMember = (id, groupId) =>
  ({ id, group_id: groupId, is_me: true, label: null, heads: 1, person_id: null, guest_name: null, sort_order: 0 });

export const adjustEntry = (newId, { group, memberId, reason, date, part, transferId = null, batchId = null }) => ({
  ...EMPTY_ENTRY,
  id: newId(), group_id: group.id, kind: K.adjust, date, currency: group.currency,
  amount_group: part.amount, member_id: memberId, reason, bill_id: part.bill_id,
  transfer_id: transferId, batch_id: batchId,
});

// «Угостили меня» на счёте, который оплатил участник (§5.12): корректировка treated_me без
// перевода, привязанная к счёту. Правится вместе со счётом (галка в форме), а не отдельно.
export const treatedMeAdjustments = (entries, billId) =>
  entries.filter(e => e.kind === K.adjust && e.bill_id === billId && e.reason === R.treated_me && !e.transfer_id);

// Суммы счёта в трёх валютах (§5.18): чека (amount), реально списанная со счёта (accountAmount,
// в валюте счёта) и группы (amountGroup — по ней считаются все долги, курс фиксируется здесь).
//   accountAmount — ввод пользователя, нужен, только когда валюта счёта ≠ валюте чека
//   (курс банка отличается от avg_rate); estimate — подсказка «≈» по текущим курсам.
// → { amount, accountAmount, amountGroup, needsAccountAmount, estimate }
export function billAmounts({ amount, currency, accountAmount, account = null, groupCurrency, rates = {} }) {
  const amt = Number(amount) || 0;
  const accCur = account?.currency;
  const needsAccountAmount = !!account && accCur !== currency;
  const estimate = needsAccountAmount ? ceilTo(convertAmount(amt, currency, accCur, rates), getPrecision(accCur)) : null;
  const accAmt = !account ? null : needsAccountAmount ? Number(accountAmount) || 0 : amt;
  const amountGroup = groupCurrency === currency ? amt
    : account && accCur === groupCurrency ? accAmt
    : ceilTo(convertAmount(amt, currency, groupCurrency, rates), getPrecision(groupCurrency));
  return { amount: amt, accountAmount: accAmt, amountGroup, needsAccountAmount, estimate };
}

// Что было у транзакции до привязки к записи группы (§5.13) — чтобы «отвязать» при удалении.
export const txSnapshot = tx => ({ category_id: tx.category_id ?? null, note: tx.note || "" });
// Только колонки transactions — RPC пишет их и ничего больше.
export const txRow = t => ({ id: t.id, type: t.type, amount: Number(t.amount), currency: t.currency, category_id: t.category_id ?? null,
                      account_id: t.account_id, date: t.date, note: t.note || "" });

// Счёт в группе (§12.2). Платил я — транзакция со счёта (или «без счёта»); платил участник
// (§5.7) — транзакции нет, моя доля попадёт в статистику виртуальной строкой (§11.1).
//   form: { title, date, currency, amount, accountAmount, amountGroup, accountId, venueTotal,
//     categoryId, shares, payerId, treatedMe, linkTx } — суммы из billAmounts, shares из splitBill
//     (в валюте чека); payerId — участник-плательщик (по умолчанию я); treatedMe — меня угостили;
//     linkTx — уже записанная транзакция («Сделать общим», §5.13): привязывается как есть, новая
//     не создаётся, баланс не меняется. Привязанный счёт и при правке сохраняет свою транзакцию.
//   group — группа (новая или существующая), isNewGroup — тогда она пишется в p.group;
//   members — участники для upsert: новые (включая «я» новой группы) и изменённые;
//   edit — существующая запись счёта при правке, entries — записи группы (её корректировки).
// → payload для save_shared_entry
export function buildBillSave({ form, group, isNewGroup, members = [], meId, edit = null, entries = [], accounts, transactions, newId }) {
  const payerId = form.payerId || meId;
  const iPaid = payerId === meId;
  const oldTx = edit?.transaction_id ? transactions.find(t => t.id === edit.transaction_id) || null : null;
  const linked = form.linkTx || (edit?.linked_tx_snapshot ? oldTx : null);
  const account = iPaid && !linked && form.accountId ? accounts.find(a => a.id === form.accountId) : null;
  const amount = Number(form.amount);
  const currency = form.currency || group.currency;
  const accountAmount = form.accountAmount ?? amount;

  // Возврат в группу, полученный мной (§5.16), — доход БЕЗ категории: деньги пришли, но это не мой
  // доход; моя доля возврата уменьшит расход в категории виртуальной строкой (§11.1).
  const isRefund = form.kind === K.refund;
  const tx = account ? {
    id: oldTx?.id || newId(),
    type: isRefund ? "income" : "expense",
    amount: Number(accountAmount),
    currency: account.currency,
    category_id: isRefund ? null : form.categoryId,
    account_id: account.id,
    date: form.date,
    note: isRefund ? `${REFUND_NOTE_PREFIX} · ${sharedTxNote(form.title, group.name)}` : sharedTxNote(form.title, group.name),
  } : null;

  const entry = {
    ...EMPTY_ENTRY,
    ...edit,
    id: edit?.id || newId(),
    group_id: group.id,
    kind: isRefund ? K.refund : K.bill,
    split_people: form.splitPeople ?? edit?.split_people ?? null,
    // Общие сборы (доставка, сервис): нужны, чтобы форма открылась на правку в том же виде.
    fees: (form.fees ?? edit?.fees ?? []).filter(f => Number(f.amount) > 0)
      .map(f => ({ id: f.id, title: (f.title || "").trim(), amount: Number(f.amount), split: f.split === "proportional" ? "proportional" : "equal" })),
    date: form.date,
    currency,
    amount_group: Number(form.amountGroup ?? amount),
    amount,
    account_amount: linked ? Number(linked.amount) : account ? Number(accountAmount) : null,
    venue_total: Number(form.venueTotal) > 0 ? Number(form.venueTotal) : null,
    title: form.title || "",
    category_id: form.categoryId,
    payer_member_id: payerId,
    shares: form.shares,
    account_id: linked ? linked.account_id : account?.id || null,
    transaction_id: linked ? linked.id : tx?.id || null,
    linked_tx_snapshot: linked ? edit?.linked_tx_snapshot || txSnapshot(linked) : null,
  };

  // Галка «Угостили меня» пересобирается при каждом сохранении: старая корректировка заменяется
  // новой на текущую долю (сумма или плательщик могли измениться). Сумма — в валюте группы.
  const myShare = Number(form.shares.find(s => s.member_id === meId)?.amount) || 0;
  const myShareGroup = amount ? ceilTo(myShare * entry.amount_group / amount, getPrecision(group.currency)) : 0;
  const treat = !iPaid && form.treatedMe && myShareGroup > 0
    ? [adjustEntry(newId, { group, memberId: payerId, reason: R.treated_me, date: form.date, part: { bill_id: entry.id, amount: -myShareGroup } })]
    : [];

  return {
    group: isNewGroup ? group : null,
    members,
    tx,
    entries: [entry, ...treat],
    delete_entry_ids: edit ? treatedMeAdjustments(entries, edit.id).map(a => a.id) : [],
    tx_delete_id: oldTx && !tx && !linked ? oldTx.id : null,
    balances: linked ? [] : balanceUpdates(accounts, { oldTx, newTx: tx }),
  };
}

// Удаление записи (или всей пачки перевода, §5.14): её транзакция удаляется, деньги возвращаются
// на счёт. Привязанная ранее существовавшая транзакция (§5.13) не удаляется — ей возвращаются
// категория и заметка (tx_restore), баланс не меняется.
//   entries — записи (для пачки); без них удаляется только сама запись.
export function buildEntryDelete({ entry, accounts, transactions, entries = [] }) {
  const sameBatch = entry.batch_id ? entries.filter(e => e.batch_id === entry.batch_id) : [];
  // «Записано в Tricount»: закрытие в тусе и покупка в Tricount — одна пара, удаляется целиком.
  const movedPair = sameBatch.some(e => e.method === M.group);
  const batch = movedPair ? sameBatch
    : entry.kind === K.transfer && entry.batch_id ? sameBatch.filter(e => e.kind === K.transfer)
    : [entry];
  const oldTx = entry.transaction_id ? transactions.find(t => t.id === entry.transaction_id) || null : null;
  const snapshot = entry.linked_tx_snapshot;
  return {
    id: entry.id,
    ids: batch.length > 1 ? batch.map(e => e.id) : [],
    tx_delete_id: oldTx && !snapshot ? oldTx.id : null,
    tx_restore: oldTx && snapshot ? { id: oldTx.id, category_id: snapshot.category_id ?? null, note: snapshot.note || "" } : null,
    balances: snapshot ? [] : balanceUpdates(accounts, { oldTx }),
  };
}
