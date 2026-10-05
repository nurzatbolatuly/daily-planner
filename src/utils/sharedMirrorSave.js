import { roundTo, ceilTo, getPrecision } from "./format";
import { SHARED_ENTRY_KINDS as K, SHARED_MODES, SHARED_TRANSFER_METHODS as M } from "../constants/money";
import { splitWithFees } from "./splitCalc";
import { EMPTY_ENTRY, balancesAfter, sharedTxNote } from "./sharedSave";

// Общие расходы — группа Tricount (mode mirror, §5.1): начальный баланс, сверки, «Повторить из
// прошлого месяца» (§5.17), перенос долга с тусы («Записать в Tricount»). Чистые функции — данные
// для RPC save_shared_entry.

// ─── Квартира: зеркало Tricount (этап 10) ───────────────────────────────────────────────────

// Моя доля покупки «поровну на N» — вверх до точности валюты, как все доли в приложении
// (0,13 ₸ → 1 ₸, §8.1): никто не недоплачивает.
export const mirrorShare = (amount, splitPeople, precision = 2) =>
  (Number(splitPeople) > 0 ? ceilTo((Number(amount) || 0) / Number(splitPeople), precision) : 0);

// Начальный баланс (§5.1c): запись opening на дату старта; 0 — записи нет (старую удалить).
//   amount — + мне должны, − я должен. → { entries, deleteEntryIds }
export function openingSave({ group, amount, date, existing = null, newId }) {
  const value = Number(amount) || 0;
  if (!value) return { entries: [], deleteEntryIds: existing ? [existing.id] : [] };
  return {
    entries: [{ ...EMPTY_ENTRY, ...existing, id: existing?.id || newId(), group_id: group.id, kind: K.opening,
                date, currency: group.currency, amount: value, amount_group: value }],
    deleteEntryIds: [],
  };
}

// Новая квартира: группа, «я» и соседи, начальный баланс — одним вызовом save_shared_entry.
export function buildMirrorGroupSave({ group, members, opening, newId }) {
  return { group, members, entries: openingSave({ group, ...opening, newId }).entries };
}

// Сверка с Tricount (§5.1d): запись reconcile на разницу «Tricount − приложение». В баланс
// входит, в статистику — нет.
export function buildReconcileSave({ group, tricountBalance, appBalance, date, newId }) {
  const diff = roundTo(Number(tricountBalance) - Number(appBalance), getPrecision(group.currency));
  if (!diff) return null;
  return { entries: [{ ...EMPTY_ENTRY, id: newId(), group_id: group.id, kind: K.reconcile, date, currency: group.currency,
                       amount: diff, amount_group: diff, note: "Сверка с Tricount" }] };
}

// Та же дата через месяц, последний день — с учётом длины месяца (31.01 → 28.02).
export function shiftMonth(date, months = 1) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const pad = n => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}

// Способ деления при повторе сохраняется: проценты и части — те же веса; суммы — пропорционально
// (вес = прошлая сумма, новое значение = новая доля); поровну — по × N.
const WEIGHT_SHARE_MODES = new Set(["percent", "parts", "amount"]);
const repeatWeight = x => (WEIGHT_SHARE_MODES.has(x.mode) ? Number(x.value) || 0 : x.heads || 1);
const repeatShare = (prev, amount, fee = 0) => ({
  ...(WEIGHT_SHARE_MODES.has(prev.mode)
    ? { member_id: prev.member_id, heads: prev.heads || 1, mode: prev.mode, value: prev.mode === "amount" ? roundTo(amount - fee, 2) : prev.value }
    : { member_id: prev.member_id, heads: prev.heads || 1, mode: "auto" }),
  ...(fee ? { fee } : {}),
  amount,
});

// Тот же состав делится заново на новую сумму. Сумма меньше сборов (или нулевая) — деление
// невозможно: записать такую копию значит сохранить счёт с нулевыми долями, и деньги пропадут
// из долгов молча. Поэтому — ошибка (форма её покажет), а не запись.
function repeatSplit(entry, value, precision) {
  const prevShares = entry.shares || [];
  const res = splitWithFees(value, prevShares.map(x => ({ member_id: x.member_id, heads: repeatWeight(x), mode: "auto" })), entry.fees || [],
    { remainderMemberId: entry.payer_member_id, precision, feeHeads: Object.fromEntries(prevShares.map(x => [x.member_id, x.heads || 1])) });
  if (!res.valid) throw new Error(`Повтор «${entry.title || entry.id}»: ${res.reason}`);
  return res.shares.map((x, i) => repeatShare(prevShares[i], x.amount, x.fee));
}

const soloShare = (meId, amount) => [{ member_id: meId, heads: 1, mode: "fixed", value: amount, amount }];

// «Повторить из прошлого месяца» (§5.17): выбранные покупки копируются на месяц вперёд с
// поправленными суммами. Тот же состав (кто в доле, × N) делится заново поровну — splitBill,
// как в форме покупки; запись только с моей долей (без состава) — «поровну на N» или в той же пропорции.
// Платил я со счёта — у копии своя транзакция (p.txs, v28). Автосоздания нет — только по выбору.
//   picks: [{ entry, amount }]
export function buildRepeatSave({ group, picks, meId, accounts, newId }) {
  const precision = getPrecision(group.currency);
  const txs = [];
  const entries = picks.map(({ entry, amount }) => {
    const value = Number(amount);
    const prevShares = entry.shares || [];
    const hasComposition = prevShares.some(x => x.member_id !== meId);
    const prevMine = Number(prevShares.find(x => x.member_id === meId)?.amount) || 0;
    const shares = hasComposition
      ? repeatSplit(entry, value, precision)
      : soloShare(meId, entry.split_people ? mirrorShare(value, entry.split_people, precision)
          : Number(entry.amount) ? ceilTo(prevMine * value / Number(entry.amount), precision) : 0);
    const date = shiftMonth(entry.date, 1);
    const account = entry.payer_member_id === meId && entry.account_id ? accounts.find(a => a.id === entry.account_id) : null;
    const tx = account && account.currency === group.currency ? {
      id: newId(), type: "expense", amount: value, currency: account.currency, category_id: entry.category_id,
      account_id: account.id, date, note: sharedTxNote(entry.title, group.name),
    } : null;
    if (tx) txs.push(tx);
    return {
      ...EMPTY_ENTRY, id: newId(), group_id: group.id, kind: K.bill, date, currency: group.currency,
      amount: value, amount_group: value, account_amount: tx ? value : null, title: entry.title || "",
      category_id: entry.category_id, payer_member_id: entry.payer_member_id, split_people: entry.split_people,
      shares, fees: hasComposition ? entry.fees || [] : [],
      account_id: tx?.account_id || null, transaction_id: tx?.id || null,
    };
  });
  return { entries, txs, balances: balancesAfter(accounts, { added: txs }) };
}

// ─── «Записать в Tricount» ──────────────────────────────────────────────────────────────────

// Группы Tricount, где этот человек тоже есть (по person_id) и та же валюта, что у тусы (сумма
// долга переносится без пересчёта по курсу): туда можно перенести его долг.
// → [{ group, member }] — member — его участник в группе Tricount.
export function tricountTargets(member, { groups = [], members = [], currency }) {
  if (!member?.person_id) return [];
  return groups
    .filter(g => g.mode === SHARED_MODES.mirror && !g.archived && g.currency === currency)
    .map(g => ({ group: g, member: members.find(m => m.group_id === g.id && m.person_id === member.person_id) }))
    .filter(t => t.member);
}

export const movedDebtTitle = tusaName => `Долг с тусы «${tusaName}»`;

// Перенос долга с тусы в группу Tricount (у друга сейчас нет денег — рассчитаются в Tricount):
//   в тусе — перевод «он → я» method 'group' (долг закрыт, деньги не двигались, без транзакции);
//   в Tricount — покупка «Долг с тусы «…»»: платил я, доля целиком на нём, моя доля 0 — баланс с
//   группой растёт на сумму, в статистику не идёт (категории нет, моей доли нет).
// Обе записи — с общим batch_id: отмена любой удаляет пару (buildEntryDelete).
export function buildMoveToTricountSave({ tusa, tusaMember, tusaMeId, target, mirrorMeId, amount, date, newId }) {
  const batchId = newId();
  const value = Number(amount);
  const transfer = {
    ...EMPTY_ENTRY, id: newId(), group_id: tusa.id, kind: K.transfer, date, currency: tusa.currency,
    amount: value, amount_group: value, from_member_id: tusaMember.id, to_member_id: tusaMeId, method: M.group,
    sender_person_id: tusaMember.person_id || null, batch_id: batchId, note: `Записано в Tricount «${target.group.name}»`,
  };
  const bill = {
    ...EMPTY_ENTRY, id: newId(), group_id: target.group.id, kind: K.bill, date, currency: tusa.currency,
    amount: value, amount_group: value, title: movedDebtTitle(tusa.name), category_id: null,
    payer_member_id: mirrorMeId, split_people: 1, batch_id: batchId,
    shares: [{ member_id: target.member.id, heads: 1, mode: "amount", value, amount: value }],
  };
  return { entries: [transfer, bill] };
}
