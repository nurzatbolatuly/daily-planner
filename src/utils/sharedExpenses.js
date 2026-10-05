import { roundTo, ceilTo, floorTo, getPrecision } from "./format";
import { normName } from "./people";
import { SHARED_ENTRY_KINDS as K, SHARED_ADJUST_REASONS as R } from "../constants/money";

// Общие расходы — чистые функции расчёта (docs/shared-expenses.md §8–§9). Без React и БД.
//
// Знаки:
// • баланс участника (memberBalances) — с моей стороны: + он должен мне, − я должен ему;
// • сумма корректировки (kind:"adjust", amount_group) — знаковая: сколько ПЕРЕНОСИТСЯ из его
//   долга мне в мою долю расходов. Долг участника −= amount, моя доля в счёте += amount.
//   rounding −90 (он переплатил 90) · forgive +410 · treat +весь долг ·
//   overpaid_them +100 (я переплатил ему) · treated_me −400 (я недоплатил, «хватит»).
//   Одно правило вместо «плюс для одних причин, минус для других».
//
// Все суммы долгов — в валюте группы по amount_group (курс зафиксирован при вводе, §5.18),
// а не через текущие rates, чтобы долг не «плыл» вместе с курсом.

const isBill = e => e.kind === K.bill || e.kind === K.refund;

// Сумма записи в валюте группы. У переводов и корректировок amount_group — сама сумма.
const groupAmount = e => Number(e.amount_group ?? e.amount) || 0;

// Пересчёт части счёта (доли, extra) из валюты чека в валюту группы — по той же пропорции,
// что и весь счёт, поэтому Σ долей в валюте группы = amount_group.
const toGroup = (bill, x) => {
  const amt = Number(bill.amount) || 0;
  return bill.amount_group != null && amt !== 0 ? x * Number(bill.amount_group) / amt : x;
};

const shareRow = (bill, memberId) => (bill.shares || []).find(s => s.member_id === memberId);

// По дате, в один день — в порядке создания (стор грузит записи в обратном порядке).
const byDate = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || "");

export const meIdOf = members => members.find(m => m.is_me)?.id ?? null;

// Доля участника в одном счёте, в валюте группы. 0 — если он в счёте не участвует.
export function billMemberDebt(bill, memberId) {
  const s = shareRow(bill, memberId);
  return s ? toGroup(bill, Number(s.amount) || 0) : 0;
}

// Сколько счёт стоил лично мне, с корректировками, отнесёнными к нему (bill_id).
// Для возврата (refund, §5.16) доля со знаком минус — возврат уменьшает мой расход.
export function myShareOf(bill, meId, adjustments = [], { precision = 2 } = {}) {
  const sign = bill.kind === K.refund ? -1 : 1;
  const adj = adjustments
    .filter(a => a.kind === K.adjust && a.bill_id === bill.id)
    .reduce((s, a) => s + groupAmount(a), 0);
  return roundTo(sign * billMemberDebt(bill, meId) + adj, precision);
}

// Долг каждого участника передо мной (режим event, §8.2).
// → { [member_id]: { balance, accrued } }
//   balance — текущий долг (+ мне должны, − я должен), с учётом переводов и корректировок;
//   accrued — сколько набежало только по счетам/возвратам (для статуса «частично»).
export function memberBalances(entries, members, { precision = 2 } = {}) {
  const meId = meIdOf(members);
  const res = {};
  members.forEach(m => { if (m.id !== meId) res[m.id] = { balance: 0, accrued: 0 }; });

  const add = (memberId, x, accrues) => {
    const r = res[memberId];
    if (!r) return;
    r.balance += x;
    if (accrues) r.accrued += x;
  };

  entries.forEach(e => {
    if (isBill(e)) {
      // Счёт: кто платил — тому должны остальные. Возврат — наоборот: кто получил деньги,
      // тот должен остальным их часть.
      const sign = e.kind === K.refund ? -1 : 1;
      if (e.payer_member_id === meId) {
        (e.shares || []).forEach(s => {
          if (s.member_id !== meId) add(s.member_id, sign * toGroup(e, Number(s.amount) || 0), true);
        });
      } else {
        add(e.payer_member_id, -sign * billMemberDebt(e, meId), true);
      }
    } else if (e.kind === K.transfer) {
      if (e.to_member_id === meId) add(e.from_member_id, -groupAmount(e), false);
      else if (e.from_member_id === meId) add(e.to_member_id, groupAmount(e), false);
    } else if (e.kind === K.adjust) {
      add(e.member_id, -groupAmount(e), false);
    }
  });

  Object.values(res).forEach(r => {
    r.balance = roundTo(r.balance, precision);
    r.accrued = roundTo(r.accrued, precision);
  });
  return res;
}

// Сводка группы для списка и шапки экрана вечера.
// → { myShare, owedToMe, iOwe, participants, settled }
//   myShare — сколько вечер стоил лично мне (Σ моих долей с корректировками);
//   participants — участники, у кого есть хоть одна доля; settled — из них рассчитались.
//   mode "mirror" — квартира: owedToMe/iOwe — мой баланс с группой (mirrorBalance), myShare — за
//   месяц month ("YYYY-MM"), участников-должников нет.
export function groupSummary(entries, members, { precision = 2, mode = "event", month = null } = {}) {
  const meId = meIdOf(members);
  if (mode === "mirror") {
    const balance = mirrorBalance(entries, meId, { precision });
    const share = entries
      .filter(e => (isBill(e)) && (!month || monthOf(e.date) === month))
      .reduce((s, e) => s + (e.kind === K.refund ? -1 : 1) * billMemberDebt(e, meId), 0);
    return { myShare: roundTo(share, precision), owedToMe: Math.max(balance, 0), iOwe: Math.max(-balance, 0),
             participants: 0, settled: 0, hasEntries: entries.length > 0 };
  }
  const balances = Object.values(memberBalances(entries, members, { precision }));
  const myShare = entries.filter(isBill).reduce((s, b) => s + myShareOf(b, meId, entries, { precision: 9 }), 0);
  const withShares = balances.filter(b => b.accrued !== 0);
  return {
    myShare: roundTo(myShare, precision),
    owedToMe: roundTo(balances.reduce((s, b) => s + Math.max(b.balance, 0), 0), precision),
    iOwe: roundTo(balances.reduce((s, b) => s + Math.max(-b.balance, 0), 0), precision),
    participants: withShares.length,
    settled: withShares.filter(b => b.balance === 0).length,
  };
}

// 'settled' — рассчитались · 'advance' — счетов ещё нет, только аванс (§5.15) ·
// 'partial' — вернули часть · 'open' — ничего не вернули (или долг сменил направление).
// Принимает округлённые значения из memberBalances.
export function memberStatus({ balance, accrued }) {
  if (balance === 0) return "settled";
  if (accrued === 0) return "advance";
  if (Math.sign(balance) === Math.sign(accrued) && Math.abs(balance) < Math.abs(accrued)) return "partial";
  return "open";
}

// Варианты закрытия долга при переводе (§9, только event).
// debt — баланс участника ДО перевода (+ он должен мне); direction — "in" (он → я) | "out" (я → он).
// → { status: 'exact'|'over'|'under'|'advance', diff, options: [{ id, reason, adjustAmount }] }
//   diff — на сколько перевод больше (>0) или меньше (<0) долга. Первый вариант — по умолчанию.
//   reason === null — корректировки нет, разница остаётся долгом.
export function closingOptions(debt, transferAmount, direction, { precision = 2 } = {}) {
  const owed = direction === "in" ? debt : -debt;
  if (!(owed > 0)) return { status: "advance", diff: 0, options: [] };

  const diff = roundTo(transferAmount - owed, precision);
  if (diff === 0) return { status: "exact", diff, options: [] };

  const over = diff > 0;
  const gap = Math.abs(diff);
  // Корректировка в соглашении знака выше: переносим остаток долга (после перевода) в мою долю.
  // Мне перевели больше — ВСЕГДА округление, без выбора «записать, что я должен» (решение 05.10.2026).
  const options = direction === "in"
    ? (over
      ? [{ id: "rounding",  reason: R.rounding,      adjustAmount: -gap }]
      : [{ id: "keep_debt", reason: null,             adjustAmount: 0 },
         { id: "forgive",   reason: R.forgive,        adjustAmount: gap }])
    : (over
      ? [{ id: "rounding",  reason: R.overpaid_them,  adjustAmount: gap },
         { id: "owes_me",   reason: null,             adjustAmount: 0 }]
      : [{ id: "keep_debt", reason: null,             adjustAmount: 0 },
         { id: "enough",    reason: R.treated_me,     adjustAmount: -gap }]);

  return { status: over ? "over" : "under", diff, options };
}

// К каким счетам относится корректировка (§9): чтобы она попала в правильные категории,
// делим её пропорционально долям участника в счетах ОДНОГО направления с ней:
// rounding/forgive/treat закрывают его долг мне → счета, где платил я;
// overpaid_them/treated_me закрывают мой долг ему → счета, где платил он.
// → [{ bill_id, amount }], Σ amount === amount ровно. Счетов нет → одна строка с bill_id: null.
export function splitAdjustmentByBills(amount, reason, entries, memberId, meId, { precision = 2 } = {}) {
  const closesHisDebt = reason !== R.overpaid_them && reason !== R.treated_me;
  const weighted = entries
    .filter(e => e.kind === K.bill && e.payer_member_id === (closesHisDebt ? meId : memberId))
    .sort(byDate)
    .map(b => ({ bill_id: b.id, w: billMemberDebt(b, closesHisDebt ? memberId : meId) }))
    .filter(x => x.w > 0);

  if (weighted.length === 0) return [{ bill_id: null, amount: roundTo(amount, precision) }];

  const totalW = weighted.reduce((s, x) => s + x.w, 0);
  let left = roundTo(amount, precision);
  return weighted.map((x, i) => {
    const part = i === weighted.length - 1 ? left : roundTo(amount * x.w / totalW, precision);
    left = roundTo(left - part, precision);
    return { bill_id: x.bill_id, amount: part };
  });
}

// «За 1 человека» для кнопок «за 1 / за 2 / за всех» в переводе (§8.3): сколько стоил бы один
// человек участника, будь он во всех счетах, где платил я. Личные позиции (extra) — отдельно.
// → { perHead, extras, breakdown: [{ bill_id, title, perHead }] }
export function perHeadOf(entries, memberId, meId, { precision = 2 } = {}) {
  const breakdown = entries
    .filter(e => e.kind === K.bill && e.payer_member_id === meId)
    .sort(byDate)
    .map(b => ({ b, s: shareRow(b, memberId) }))
    .filter(({ s }) => s && Number(s.heads) > 0)
    .map(({ b, s }) => ({
      bill_id: b.id,
      title: b.title || "",
      // Вверх, как и доли в splitBill: «за 1» не должно оставлять долг в 1 ₸.
      perHead: ceilTo(toGroup(b, (Number(s.amount) || 0) - (Number(s.extra) || 0)) / Number(s.heads), precision),
      extra: toGroup(b, Number(s.extra) || 0),
    }));

  return {
    perHead: roundTo(breakdown.reduce((s, x) => s + x.perHead, 0), precision),
    extras: roundTo(breakdown.reduce((s, x) => s + x.extra, 0), precision),
    breakdown: breakdown.map(({ bill_id, title, perHead }) => ({ bill_id, title, perHead })),
  };
}

// Отображаемое имя участника (§7.2): label → «Я» / имя человека / имя гостя (+ « × N») →
// «Компашка N», где N — номер среди безымянных участников группы.
export function memberLabel(member, { people = [], members = [] } = {}) {
  if (member.label) return member.label;
  const heads = Number(member.heads) > 1 ? ` × ${member.heads}` : "";
  const name = member.is_me
    ? "Я"
    : people.find(p => p.id === member.person_id)?.name || member.guest_name;
  if (name) return name + heads;

  const unnamed = members
    .filter(m => !m.is_me && !m.label && !m.person_id && !m.guest_name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const n = unnamed.findIndex(m => m.id === member.id) + 1;
  return `Компашка${n > 0 ? ` ${n}` : ""}${heads}`;
}

// Из чего сложился долг участника передо мной (§5.8 «по тапу видно, из чего 3 600», §11.7).
// → [{ kind, entry, amount }] по дате; amount — вклад в его долг (+ должен мне больше), Σ = баланс.
//   kind: bill (я платил, он в доле) · their_bill (он платил, я в доле) · refund_mine / refund_his
//   (возврат получил я / он) · transfer_in (он → я) · transfer_out (я → он) · adjust.
export function memberDebtLines(entries, memberId, meId) {
  const lines = [];
  const push = (kind, entry, amount) => { if (amount) lines.push({ kind, entry, amount }); };
  [...entries].sort(byDate).forEach(e => {
    if (e.kind === K.bill && e.payer_member_id === meId) push("bill", e, billMemberDebt(e, memberId));
    else if (e.kind === K.bill && e.payer_member_id === memberId) push("their_bill", e, -billMemberDebt(e, meId));
    else if (e.kind === K.refund && e.payer_member_id === meId) push("refund_mine", e, -billMemberDebt(e, memberId));
    else if (e.kind === K.refund && e.payer_member_id === memberId) push("refund_his", e, billMemberDebt(e, meId));
    else if (e.kind === K.transfer && e.from_member_id === memberId && e.to_member_id === meId) push("transfer_in", e, -groupAmount(e));
    else if (e.kind === K.transfer && e.from_member_id === meId && e.to_member_id === memberId) push("transfer_out", e, groupAmount(e));
    else if (e.kind === K.adjust && e.member_id === memberId) push("adjust", e, -groupAmount(e));
  });
  return lines;
}

export const ADJUST_REASON_LABEL = {
  [R.rounding]: "округление", [R.forgive]: "прощено", [R.treat]: "угощаю",
  [R.overpaid_them]: "округление", [R.treated_me]: "«хватит»",
};

// Подпись корректировки. treated_me без перевода — «угостили меня» на счёте, который оплатил
// участник (§5.12); с переводом — «хватит» (я перевёл меньше, §9).
export const adjustLabel = adj => (adj.reason === R.treated_me && !adj.transfer_id
  ? "угостили меня"
  : ADJUST_REASON_LABEL[adj.reason] || "корректировка");

// Строка раскладки для людей: «Ужин — твоя доля 6 000». fmt(n) — форматирование суммы,
// titleOf(entry) — название счёта (title или категория).
export function debtLineText(line, { fmt, titleOf }) {
  const { kind, entry, amount } = line;
  const abs = fmt(Math.abs(amount));
  switch (kind) {
    case "bill":         return `${titleOf(entry)} — твоя доля ${abs}`;
    case "their_bill":   return `${titleOf(entry)} — ты платил, моя доля −${abs}`;
    case "refund_mine":  return `${titleOf(entry)} — возврат, твоя часть −${abs}`;
    case "refund_his":   return `${titleOf(entry)} — возврат у тебя, моя часть ${abs}`;
    case "transfer_in":  return `Ты перевёл −${abs}`;
    case "transfer_out": return `Я перевёл ${abs}`;
    default:             return `${adjustLabel(entry)} ${amount < 0 ? "−" : ""}${abs}`;
  }
}

// Текст «Напомнить о долге» (§11.7) — для navigator.share / буфера обмена.
export function debtShareText({ groupName, lines, balance, fmt, titleOf }) {
  const total = balance >= 0 ? `Итого: ${fmt(balance)}` : `Итого я должен: ${fmt(-balance)}`;
  return [groupName, ...lines.map(l => debtLineText(l, { fmt, titleOf })), total].join("\n");
}

// ─── Гости (этап 7, §7.2) ──────────────────────────────────────────────────────────────────

const byCreatedDesc = (a, b) => (b.created_at || "").localeCompare(a.created_at || "");

// Подсказки имён гостей из прошлых вечеров: уникальные (без регистра), свежие сверху.
// query — что уже введено (подстрока); совпадающее целиком и exclude (уже в этой группе) — не
// предлагаются. Отдельной таблицы нет: «Люди» не засоряются гостями.
export function guestNameSuggestions(members, query = "", { exclude = [], limit = 6 } = {}) {
  const q = normName(query);
  const seen = new Set(exclude.map(normName));
  const res = [];
  [...members].filter(m => m.guest_name?.trim()).sort(byCreatedDesc).forEach(m => {
    const key = normName(m.guest_name);
    if (seen.has(key) || key === q || (q && !key.includes(q))) return;
    seen.add(key);
    res.push(m.guest_name.trim());
  });
  return res.slice(0, limit);
}

// «Сохранить в Люди» (§7.2): одно имя ещё не значит один человек, поэтому показываем ВСЕ
// участники-гости с этим именем по всем группам — с группой и долгом, свежие вечера сверху.
// → [{ member, group, balance }]; balance — с моей стороны (+ он должен мне); у группы Tricount —
//   null: там долг с группой целиком, личного долга человека нет (§4, §5.1a).
export function guestOccurrences(name, { groups = [], members = [], entries = [] }) {
  const key = normName(name);
  if (!key) return [];
  return members
    .filter(m => !m.is_me && !m.person_id && normName(m.guest_name) === key)
    .map(m => {
      const group = groups.find(g => g.id === m.group_id);
      if (!group) return null;
      if (group.mode === "mirror") return { member: m, group, balance: null };
      const balances = memberBalances(
        entries.filter(e => e.group_id === group.id),
        members.filter(x => x.group_id === group.id),
        { precision: getPrecision(group.currency) });
      return { member: m, group, balance: balances[m.id]?.balance || 0 };
    })
    .filter(Boolean)
    .sort((a, b) => (b.group.date || "").localeCompare(a.group.date || "") || byCreatedDesc(a.group, b.group));
}

// ─── Управление группой (этап 8, §7.5–§7.6) ────────────────────────────────────────────────

// Записи, где участник встречается: плательщик, доля, перевод, корректировка. Удалить участника
// можно, только если их нет (§7.5); БД проверяет то же самое (FK + проверка shares в RPC, §7.8).
export const memberUsage = (memberId, entries) => entries.filter(e =>
  e.payer_member_id === memberId || e.from_member_id === memberId || e.to_member_id === memberId ||
  e.member_id === memberId || (e.shares || []).some(s => s.member_id === memberId));

// ─── Один платёж на несколько долгов (этап 9, §5.14) ───────────────────────────────────────

// Распределение суммы по долгам в заданном порядке (старые первыми): каждый закрывается
// полностью, пока хватает; недостаток — у последних, переплата — у последнего долга.
// → [amount] той же длины, Σ = amount ровно.
export function allocateTransfer(amount, debts, { precision = 2 } = {}) {
  let left = roundTo(amount, precision);
  return debts.map((d, i) => {
    const part = i === debts.length - 1 ? left : Math.min(left, roundTo(Math.max(d, 0), precision));
    left = roundTo(left - part, precision);
    return part;
  });
}

// ─── Квартира: зеркало Tricount (этап 10, §5.1, §8.2) ──────────────────────────────────────
// Долг — с группой целиком, одно число (+ мне должны, − я должен), накопительный за всё время.
// От кого пришёл перевод, на баланс не влияет (§5.1a): персональных долгов в mirror нет.

const monthOf = date => (date || "").slice(0, 7);

// Вклад записи в мой баланс с группой, по статьям раскладки (§12.4):
//   share — моя доля (покупки −, возвраты +); paid — я платил (+) / я получил возврат (−);
//   transfers — мои переводы (+) / переводы мне (−); carried — начальный баланс и сверки.
function mirrorMove(e, meId) {
  const amt = groupAmount(e);
  if (e.kind === K.bill) return { share: -billMemberDebt(e, meId), paid: e.payer_member_id === meId ? amt : 0 };
  if (e.kind === K.refund) return { share: billMemberDebt(e, meId), paid: e.payer_member_id === meId ? -amt : 0 };
  if (e.kind === K.transfer) return { transfers: e.from_member_id === meId ? amt : e.to_member_id === meId ? -amt : 0 };
  if (e.kind === K.opening || e.kind === K.reconcile) return { carried: amt };
  return {};
}

const MOVE_KEYS = ["share", "paid", "transfers", "carried"];

// Мой баланс с группой (§8.2): opening + сверки + я платил − моя доля − полученные мной возвраты
// + моя доля в возвратах + мои переводы − переводы мне.
export function mirrorBalance(entries, meId, { precision = 2 } = {}) {
  return roundTo(entries.reduce((s, e) => {
    const m = mirrorMove(e, meId);
    return s + MOVE_KEYS.reduce((x, k) => x + (m[k] || 0), 0);
  }, 0), precision);
}

// Раскладка баланса по месяцам для карточки (§12.4): «перенесено» + движение месяца = итог.
// Начальный баланс и сверки входят в движение своего месяца (статья carried).
// → [{ month: "YYYY-MM", carriedIn, share, paid, transfers, adjust, closing }] по возрастанию
export function mirrorBalanceByMonth(entries, meId, { precision = 2 } = {}) {
  const byMonth = new Map();
  entries.forEach(e => {
    const key = monthOf(e.date);
    if (!key) return;
    const acc = byMonth.get(key) || { share: 0, paid: 0, transfers: 0, carried: 0 };
    const m = mirrorMove(e, meId);
    MOVE_KEYS.forEach(k => { acc[k] += m[k] || 0; });
    byMonth.set(key, acc);
  });
  let running = 0;
  return [...byMonth.keys()].sort().map(month => {
    const a = byMonth.get(month);
    const carriedIn = roundTo(running, precision);
    running += a.share + a.paid + a.transfers + a.carried;
    return {
      month, carriedIn,
      share: roundTo(a.share, precision), paid: roundTo(a.paid, precision),
      transfers: roundTo(a.transfers, precision), adjust: roundTo(a.carried, precision),
      closing: roundTo(running, precision),
    };
  });
}

// Лента месяца группы Tricount (§12.4): все записи месяца, свежие сверху.
// myShare — моя доля за месяц (покупки − возвраты). → { items, myShare }
export function groupMonthSummary(entries, month, meId, { precision = 2 } = {}) {
  const items = entries.filter(e => monthOf(e.date) === month).sort((a, b) => -byDate(a, b));
  const myShare = items.reduce((s, e) => s + (e.kind === K.bill ? billMemberDebt(e, meId) : e.kind === K.refund ? -billMemberDebt(e, meId) : 0), 0);
  return { items, myShare: roundTo(myShare, precision) };
}

// ─── Интеграция с приложением (этап 11, §11.5–§11.6, §12.1) ────────────────────────────────

// Долги по всем группам — для шапки списка групп, «Долгов» и карточки человека. Архивные
// группы тоже: открытый долг в архиве не должен пропасть из вида. Суммы строк — в базовой
// валюте по текущим курсам (только для отображения; сами долги — по amount_group, §5.18).
//   rows: вечер — по человеку из «Люди» (p:<id>), гостю (g:<имя>) или безымянному участнику;
//   квартира — одной строкой на группу (долг с группой целиком, §4).
// → { owedToMe, iOwe, rows: [{ key, kind, personId, name, owedToMe, iOwe, items: [{ group, member, balance }] }] }
export function totalsAcrossGroups({ groups = [], members = [], entries = [], people = [], toBase = x => x }) {
  const rows = new Map();
  const add = (key, init, group, member, balance) => {
    const row = rows.get(key) || { key, ...init, owedToMe: 0, iOwe: 0, items: [] };
    const base = toBase(balance, group.currency);
    if (base > 0) row.owedToMe += base; else row.iOwe += -base;
    row.items.push({ group, member, balance });
    rows.set(key, row);
  };
  groups.forEach(g => {
    const gm = members.filter(m => m.group_id === g.id);
    const ge = entries.filter(e => e.group_id === g.id);
    const precision = getPrecision(g.currency);
    if (g.mode === "mirror") {
      const balance = mirrorBalance(ge, meIdOf(gm), { precision });
      if (balance) add(`grp:${g.id}`, { kind: "group", personId: null, name: g.name }, g, null, balance);
      return;
    }
    const balances = memberBalances(ge, gm, { precision });
    gm.forEach(m => {
      const balance = balances[m.id]?.balance;
      if (!balance) return;
      const person = m.person_id && people.find(p => p.id === m.person_id);
      if (person) add(`p:${person.id}`, { kind: "person", personId: person.id, name: person.name }, g, m, balance);
      else if (m.guest_name) add(`g:${normName(m.guest_name)}`, { kind: "guest", personId: null, name: m.guest_name.trim() }, g, m, balance);
      else add(`m:${m.id}`, { kind: "unnamed", personId: null, name: `${memberLabel(m, { people, members: gm })} · ${g.name}` }, g, m, balance);
    });
  });
  const list = [...rows.values()]
    .map(r => ({ ...r, owedToMe: roundTo(r.owedToMe, 2), iOwe: roundTo(r.iOwe, 2) }))
    .sort((a, b) => (b.owedToMe + b.iOwe) - (a.owedToMe + a.iOwe));
  return {
    owedToMe: roundTo(list.reduce((s, r) => s + r.owedToMe, 0), 2),
    iOwe: roundTo(list.reduce((s, r) => s + r.iOwe, 0), 2),
    rows: list,
  };
}

// Человек в общих группах — блок карточки (§11.5): где он контакт участника (с долгом
// участника; закрытые тоже — для истории) и переводы, где он реально прислал / получил деньги
// (§5.10, в т.ч. за чужую компашку).
// → { groups: [{ group, member, balance }], transfers: [{ entry, group, incoming }] }
export function personGroupSummary(personId, { groups = [], members = [], entries = [] }) {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const meByGroup = new Map(members.filter(m => m.is_me).map(m => [m.group_id, m.id]));
  const asContact = members
    .filter(m => m.person_id === personId && groupById.get(m.group_id)?.mode !== "mirror")
    .map(m => {
      const g = groupById.get(m.group_id);
      if (!g) return null;
      const balance = memberBalances(entries.filter(e => e.group_id === g.id), members.filter(x => x.group_id === g.id), { precision: getPrecision(g.currency) })[m.id]?.balance || 0;
      return { group: g, member: m, balance };
    })
    .filter(Boolean)
    .sort((a, b) => (b.group.date || "").localeCompare(a.group.date || ""));
  const transfers = entries
    .filter(e => e.kind === K.transfer && e.sender_person_id === personId && groupById.has(e.group_id))
    .sort((a, b) => -byDate(a, b))
    .map(e => ({ entry: e, group: groupById.get(e.group_id), incoming: e.to_member_id === meByGroup.get(e.group_id) }));
  return { groups: asContact, transfers };
}

// ─── Зачёт с личными долгами (этап 12, §10) ────────────────────────────────────────────────

// Можно ли закрыть перевод в группе зачётом с личным долгом того же человека.
//   direction — перевод в группе: "out" (я → он, я должен в группе), "in" (он → я);
//   personNet — его личный NET в валюте группы (+ он должен мне лично, − я ему).
// Зачёт возможен только при противоположных направлениях: я должен в группе, а он мне лично —
// или наоборот. Сумма ≤ min(перевода, |NET|), округление вниз — зачёт не может перевернуть долг.
// → { available, max, sign } — sign: знак события offset в debt_events (гасит NET).
export function offsetOptions({ direction, amount, personNet, precision = 2 }) {
  const net = Number(personNet) || 0;
  const available = direction === "out" ? net > 0 : direction === "in" ? net < 0 : false;
  if (!available) return { available: false, max: 0, sign: 0 };
  const cap = floorTo(Math.abs(net), precision);
  const amt = Number(amount) || 0;
  return { available: cap > 0, max: amt > 0 ? Math.min(amt, cap) : cap, sign: direction === "out" ? -1 : 1 };
}

// Сколько человек было в группе: по самому большому счёту (Σ heads покрытых), без счетов —
// по «× N» участников. Компашка × 3 — это три человека, а не один участник.
export function groupHeadcount(entries, members) {
  const bills = entries.filter(e => e.kind === K.bill);
  if (!bills.length) return members.reduce((n, m) => n + (Number(m.heads) || 1), 0);
  return Math.max(...bills.map(b => (b.shares || []).reduce((n, x) => n + (Number(x.heads) || 1), 0)));
}
