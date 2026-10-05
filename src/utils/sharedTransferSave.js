import { roundTo, getPrecision, convertAmount, pluralRu } from "./format";
import { SHARED_ENTRY_KINDS as K, SHARED_ADJUST_REASONS as R, SHARED_TRANSFER_NOTE_PREFIX, DEBT_WORDS } from "../constants/money";
import { memberDebtLines, closingOptions, splitAdjustmentByBills, memberBalances, allocateTransfer } from "./sharedExpenses";
import { normName } from "./people";
import { computeNetByPerson } from "./debtLedger";
import { BASE_CUR } from "../constants/currencies";
import { EMPTY_ENTRY, adjustEntry, balanceUpdates, balancesAfter, txRow, txSnapshot } from "./sharedSave";

// Общие расходы — переводы в группе: закрытие долга (§9), зачёт (§10), привязка уже записанной
// операции (§5.13), один платёж на несколько долгов (§5.14), «угощаю». Чистые функции — данные
// для RPC save_shared_entry; общие поля записи и балансы счетов — sharedSave.js.

// ─── Переводы и закрытие долга (этап 6, §9) ────────────────────────────────────────────────

// Долг участника передо мной без учёта правимого перевода и его корректировок (+ должен мне).
export function debtWithout(entries, memberId, meId, edit = null, precision = 2) {
  const base = edit ? entries.filter(e => e.id !== edit.id && e.transfer_id !== edit.id) : entries;
  return { base, debt: roundTo(memberDebtLines(base, memberId, meId).reduce((s, l) => s + l.amount, 0), precision) };
}

// Что показать в форме перевода: долг до перевода и варианты закрытия (closingOptions).
export function transferClosing({ entries, memberId, meId, edit = null, amount, direction, precision }) {
  const { debt } = debtWithout(entries, memberId, meId, edit, precision);
  return { debt, ...closingOptions(debt, Number(amount) || 0, direction, { precision }) };
}

// Контакт участника (§3): человек из «Люди» или имя гостя; оба пусты — «без имени».
export const contactOf = member => ({ personId: member?.person_id || null, name: member?.guest_name || null });

export const transferTxNote = (groupName, memberName, direction) =>
  `${SHARED_TRANSFER_NOTE_PREFIX} · ${groupName} ${direction === "in" ? "←" : "→"} ${memberName}`;

// Перевод участник ↔ я + (по выбранному варианту) корректировка, разложенная по счетам.
//   form: { direction: "in" | "out", amount, accountId, date, optionId, headsCovered, sender, linkTx, noClosing, offset }
//   offset — { personId, sign } — зачёт с личным долгом (§10): деньги не двигаются, перевод
//   method 'offset' + событие debt_events (type offset, без транзакции) одним вызовом.
//   sender — кто реально прислал / кому отдал ({ personId, name }, §5.10); не передан — как было
//   у правимого перевода, иначе контакт участника.
//   member — участник; memberName — подпись для заметки транзакции.
//   Транзакция — БЕЗ категории: это движение денег, в статистику не идёт (§6).
export function buildTransferSave({ form, group, meId, member, memberName, entries, edit = null, accounts, transactions, newId, precision = 2 }) {
  const { base, debt } = debtWithout(entries, member.id, meId, edit, precision);
  const amount = Number(form.amount);
  const closing = closingOptions(debt, amount, form.direction, { precision });
  // noClosing — квартира (§9): долг с группой целиком, переплаты/недоплаты конкретного человека нет.
  const option = form.noClosing ? null : closing.options.find(o => o.id === form.optionId) || closing.options[0] || null;

  const sender = form.sender ?? (edit ? { personId: edit.sender_person_id, name: edit.sender_name } : contactOf(member));

  const money = form.offset
    ? offsetMoney({ form, edit, group, amount, accounts, transactions, newId })
    : transferMoney({ form, edit, accounts, transactions, amount, note: transferTxNote(group.name, memberName, form.direction), newId });

  const transfer = {
    ...EMPTY_ENTRY,
    ...edit,
    id: edit?.id || newId(),
    group_id: group.id,
    kind: K.transfer,
    date: form.date,
    currency: group.currency,
    amount,
    amount_group: amount,
    from_member_id: form.direction === "in" ? member.id : meId,
    to_member_id: form.direction === "in" ? meId : member.id,
    ...senderFields(sender),
    heads_covered: form.headsCovered || null,
    ...money.entryFields,
  };

  const adjusts = option?.reason
    ? splitAdjustmentByBills(option.adjustAmount, option.reason, base, member.id, meId, { precision })
      .map(part => adjustEntry(newId, { group, memberId: member.id, reason: option.reason, date: form.date, part, transferId: transfer.id }))
    : [];

  return {
    entries: [transfer, ...adjusts],
    delete_entry_ids: edit ? entries.filter(e => e.transfer_id === edit.id).map(e => e.id) : [],
    ...money.payload,
  };
}

// Зачёт (§10): транзакции нет; если перевод раньше был со счёта — его транзакция удаляется с
// откатом баланса. Событие offset в debt_events правится по тому же id.
function offsetMoney({ form, edit, group, amount, accounts, transactions, newId }) {
  const oldTx = edit?.transaction_id && !edit.linked_tx_snapshot ? transactions.find(t => t.id === edit.transaction_id) || null : null;
  const event = {
    id: edit?.debt_event_id || newId(), person_id: form.offset.personId, type: "offset",
    amount: form.offset.sign * amount, currency: group.currency, date: form.date,
    note: `Зачёт · ${group.name}`, transaction_id: null, account_id: null,
  };
  return {
    entryFields: { method: "offset", account_id: null, transaction_id: null, linked_tx_snapshot: null, debt_event_id: event.id },
    payload: { tx: null, tx_delete_id: oldTx?.id || null, balances: balancesAfter(accounts, { removed: oldTx ? [oldTx] : [] }), debt_event: event },
  };
}

const senderFields = sender => ({
  sender_person_id: sender.personId || null,
  sender_name: sender.personId ? null : sender.name?.trim() || null,
});

// Префикс заметки привязанной транзакции: «Перевод · Вечер 03.10 ← Асан · <старая заметка>».
const linkedNote = (prefix, oldNote) => (oldNote ? `${prefix} · ${oldNote}` : prefix);

// Деньги перевода: транзакция на счёте (новая / обновлённая / привязанная уже записанная, §5.13)
// и итоговые балансы. Привязанная транзакция остаётся как есть по сумме и счёту — снимается
// только категория (это движение денег, не доход), заметка получает префикс; баланс не меняется.
// Заменила собственную транзакцию перевода — та удаляется с откатом баланса.
//   edit — правимая запись (у пачки — любая из частей: транзакция у них общая).
// → { entryFields: { method, account_id, transaction_id, linked_tx_snapshot }, payload: { tx, tx_delete_id, balances } }
function transferMoney({ form, edit, accounts, transactions, amount, note, newId }) {
  // Был зачётом, стал переводом — событие offset в «Долгах» удаляется (личный долг вернётся).
  const offsetGone = edit?.method === "offset" && edit.debt_event_id ? { debt_event_delete_id: edit.debt_event_id } : {};
  const result = transferMoneyBase({ form, edit, accounts, transactions, amount, note, newId });
  return { entryFields: { ...result.entryFields, debt_event_id: null }, payload: { ...result.payload, ...offsetGone } };
}

function transferMoneyBase({ form, edit, accounts, transactions, amount, note, newId }) {
  const oldTx = edit?.transaction_id ? transactions.find(t => t.id === edit.transaction_id) || null : null;
  const wasLinked = !!edit?.linked_tx_snapshot;
  const link = form.linkTx || (wasLinked ? oldTx : null);

  if (link) {
    const snapshot = wasLinked && oldTx?.id === link.id ? edit.linked_tx_snapshot : txSnapshot(link);
    const tx = wasLinked && oldTx?.id === link.id ? txRow(link) : { ...txRow(link), category_id: null, note: linkedNote(note, snapshot.note) };
    const ownOld = oldTx && oldTx.id !== link.id && !wasLinked ? oldTx : null;
    return {
      entryFields: { method: "account", account_id: link.account_id, transaction_id: link.id, linked_tx_snapshot: snapshot },
      payload: { tx, tx_delete_id: ownOld?.id || null, balances: balancesAfter(accounts, { removed: ownOld ? [ownOld] : [] }) },
    };
  }

  const account = form.accountId ? accounts.find(a => a.id === form.accountId) : null;
  const tx = account ? {
    id: oldTx?.id || newId(),
    type: form.direction === "in" ? "income" : "expense",
    amount,
    currency: account.currency,
    category_id: null,
    account_id: account.id,
    date: form.date,
    note,
  } : null;
  return {
    entryFields: { method: account ? "account" : "cash", account_id: account?.id || null, transaction_id: tx?.id || null, linked_tx_snapshot: null },
    payload: { tx, tx_delete_id: oldTx && !tx ? oldTx.id : null, balances: balanceUpdates(accounts, { oldTx, newTx: tx }) },
  };
}

// «Угощаю» (§9): весь долг участника — в мою долю, по счетам пропорционально, одной пачкой.
export function buildTreatSave({ group, memberId, meId, entries, date, newId, precision = 2 }) {
  const { debt } = debtWithout(entries, memberId, meId, null, precision);
  if (!(debt > 0)) return null;
  const batchId = newId();
  return {
    entries: splitAdjustmentByBills(debt, R.treat, entries, memberId, meId, { precision })
      .map(part => adjustEntry(newId, { group, memberId, reason: R.treat, date, part, batchId })),
  };
}

// Корректировки одной пачки (угощаю) удаляются вместе; корректировки перевода — каскадом с ним.
export const buildAdjustmentsDelete = adjustments => ({ ids: adjustments.map(a => a.id) });

// ─── Привязка, пачки, валюта (этап 9) ───────────────────────────────────────────────────────

const LINK_WINDOW_DAYS = 7;
const daysApart = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

// Транзакции, которые можно привязать к переводу («Уже записан? Выбрать транзакцию», §5.13):
// тот же счёт, тип и сумма, ±7 дней от даты, ещё не связанные ни с группой, ни с «Долгами»,
// не FX-часть перевода между счетами и не корректировка баланса. Ближайшие по дате — сверху.
export function linkableTransactions({ transactions, accountId, type, amount, date, sharedEntries = [], debtEvents = [], excludeNote, days = LINK_WINDOW_DAYS }) {
  const used = new Set([...sharedEntries.map(e => e.transaction_id), ...debtEvents.map(e => e.transaction_id)].filter(Boolean));
  const amt = Number(amount);
  return transactions
    .filter(t => t.account_id === accountId && t.type === type && Number(t.amount) === amt && !used.has(t.id)
      && !t.transfer_id && t.note !== excludeNote && daysApart(t.date, date) <= days)
    .sort((a, b) => daysApart(a.date, date) - daysApart(b.date, date));
}

// Кого ещё можно закрыть тем же переводом (§5.14): долги в ту же сторону в этой группе и в других
// группах, где участник — тот же человек (контакт или отправитель совпадает). Старые первыми.
//   direction "in" — мне должны (balance > 0), "out" — я должен.
// → [{ member, group, debt }] — debt > 0, со стороны направления
export function transferCandidates({ groups, members, entries, group, sender, direction }) {
  const sign = direction === "in" ? 1 : -1;
  const senderName = normName(sender?.name);
  const sameContact = m => (sender?.personId && m.person_id === sender.personId)
    || (!sender?.personId && senderName && normName(m.guest_name) === senderName);
  return groups
    .filter(g => g.mode === "event" && g.currency === group.currency)
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || ""))
    .flatMap(g => {
      const gm = members.filter(m => m.group_id === g.id);
      const balances = memberBalances(entries.filter(e => e.group_id === g.id), gm, { precision: getPrecision(g.currency) });
      return gm
        .filter(m => !m.is_me && (g.id === group.id || sameContact(m)) && sign * (balances[m.id]?.balance || 0) > 0)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(m => ({ member: m, group: g, debt: sign * balances[m.id].balance }));
    });
}

// Один платёж на несколько долгов (§5.14): одна транзакция, по записи на каждый долг с общим
// batch_id и transaction_id, Σ частей = сумме платежа. Варианты закрытия (§9) для пачки не
// предлагаются: недоплата остаётся долгом, переплата — у последней части.
//   form: { direction, accountId, date, sender, linkTx, parts: [{ member, group, amount }], meIds }
//   meIds — { [group_id]: id моего участника } (у каждой группы свой «я»).
//   edit — части правимой пачки (пусто для новой); entries — все записи (корректировки частей).
export function buildBatchTransferSave({ form, edit = [], entries, accounts, transactions, newId, senderLabel }) {
  const total = roundTo(form.parts.reduce((s, p) => s + Number(p.amount), 0), getPrecision(form.parts[0].group.currency));
  const batchId = edit[0]?.batch_id || newId();
  const note = `${SHARED_TRANSFER_NOTE_PREFIX} · ${form.parts.length} ${pluralRu(form.parts.length, DEBT_WORDS)} ${form.direction === "in" ? "←" : "→"} ${senderLabel}`;
  const money = transferMoney({ form, edit: edit[0] || null, accounts, transactions, amount: total, note, newId });

  const transfers = form.parts.filter(p => Number(p.amount) > 0).map(p => {
    const prev = edit.find(e => e.group_id === p.group.id && (e.from_member_id === p.member.id || e.to_member_id === p.member.id));
    const me = form.meIds[p.group.id];
    return {
      ...EMPTY_ENTRY,
      ...prev,
      id: prev?.id || newId(),
      group_id: p.group.id,
      kind: K.transfer,
      date: form.date,
      currency: p.group.currency,
      amount: Number(p.amount),
      amount_group: Number(p.amount),
      from_member_id: form.direction === "in" ? p.member.id : me,
      to_member_id: form.direction === "in" ? me : p.member.id,
      ...senderFields(form.sender),
      heads_covered: null,
      batch_id: batchId,
      ...money.entryFields,
    };
  });
  const keptIds = new Set(transfers.map(t => t.id));
  const dropped = edit.filter(e => !keptIds.has(e.id)).map(e => e.id);
  const editIds = new Set(edit.map(e => e.id));

  return {
    entries: transfers,
    delete_entry_ids: [...dropped, ...entries.filter(e => editIds.has(e.transfer_id)).map(e => e.id)],
    ...money.payload,
  };
}

// Распределение по умолчанию для пачки — allocateTransfer по долгам кандидатов.
export const defaultBatchParts = (amount, picked, precision = 2) =>
  allocateTransfer(amount, picked.map(c => c.debt), { precision }).map((a, i) => ({ ...picked[i], amount: a }));

// ─── Зачёт с личными долгами (этап 12, §10) ────────────────────────────────────────────────

// Личный NET человека в валюте группы (+ он должен мне). Событие правимого зачёта не учитывается —
// иначе при правке зачёт «съедал» бы сам себя.
export function personalNetFor(personId, debtEvents, { rates = {}, currency, excludeEventId = null }) {
  if (!personId) return 0;
  const events = excludeEventId ? debtEvents.filter(e => e.id !== excludeEventId) : debtEvents;
  const base = computeNetByPerson(events.filter(e => e.person_id === personId), rates)[personId]?.net || 0;
  return roundTo(convertAmount(base, BASE_CUR, currency, rates), getPrecision(currency));
}
