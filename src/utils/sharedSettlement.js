import { roundTo } from "./format";
import { SHARED_ENTRY_KINDS as K } from "../constants/money";
import { isBill, groupAmount, toGroup } from "./sharedAmounts";

// Итог группы как в Tricount: баланс каждого участника и минимум переводов «кто кому сколько».
// Чистые функции, без React и БД. Суммы — в валюте группы по amount_group (§5.18).
//
// Баланс участника (net): + ему должны (заплатил больше своей доли), − он должен группе.
// Σ net всех участников = 0. План переводов строится по net, поэтому долг упрощается и «через
// меня»: Бек должен мне, а я Асану → в плане Бек → Асан напрямую.
//
// Записи:
//   bill    — плательщику +доля каждого, каждому в доле −его доля;
//   refund  — наоборот: кто получил деньги, должен остальным их часть;
//   transfer— от кого +сумма, кому −сумма (в т.ч. между двумя другими участниками);
//   adjust  — корректировка переносит долг участника в мою долю (знак — см. sharedExpenses):
//             участнику +amount, мне −amount;
//   opening / reconcile (только Tricount) — мой баланс с группой целиком; с кем именно — не
//             известно, поэтому встречная сумма делится поровну между остальными участниками.

// Каноничный порядок при равных суммах: я первым, дальше по id — один и тот же план на любом
// экране, как бы ни были отсортированы участники или записи.
const canonical = meId => (a, b) => (a === meId ? -1 : b === meId ? 1 : a < b ? -1 : a > b ? 1 : 0);

// Встречную сумму начального баланса/сверки делим поровну в минимальных единицах валюты;
// остаток — первым по каноничному порядку, чтобы Σ совпала ровно.
function spreadEvenly(amount, ids, precision) {
  const scale = 10 ** precision;
  const units = Math.round(amount * scale);
  const base = Math.trunc(units / ids.length);
  let rest = units - base * ids.length;
  return ids.map(id => {
    const extra = rest === 0 ? 0 : Math.sign(rest);
    rest -= extra;
    return [id, (base + extra) / scale];
  });
}

// → Map(member_id → net), округлено до точности валюты. memberIds — участники группы (у кого
// записей нет, тоже попадут с 0 и получат часть начального баланса).
export function groupNets(entries, meId, { memberIds = [], precision = 2 } = {}) {
  const nets = new Map();
  const add = (id, x) => { if (id) nets.set(id, (nets.get(id) || 0) + x); };
  [meId, ...memberIds].forEach(id => add(id, 0));

  let carried = 0;
  entries.forEach(e => {
    if (isBill(e)) {
      const sign = e.kind === K.refund ? -1 : 1;
      (e.shares || []).forEach(s => {
        const part = sign * toGroup(e, Number(s.amount) || 0);
        add(s.member_id, -part);
        add(e.payer_member_id, part);
      });
    } else if (e.kind === K.transfer) {
      add(e.from_member_id, groupAmount(e));
      add(e.to_member_id, -groupAmount(e));
    } else if (e.kind === K.adjust) {
      add(e.member_id, groupAmount(e));
      add(meId, -groupAmount(e));
    } else if (e.kind === K.opening || e.kind === K.reconcile) {
      carried += groupAmount(e);
    }
  });

  const others = [...nets.keys()].filter(id => id !== meId).sort(canonical(meId));
  if (carried && others.length) {
    add(meId, carried);
    spreadEvenly(-carried, others, precision).forEach(([id, x]) => add(id, x));
  }

  nets.forEach((x, id) => nets.set(id, roundTo(x, precision)));
  return nets;
}

// Минимум переводов по балансам (как Tricount / Splitwise): сначала пары с равными суммами
// (один перевод закрывает обоих), затем жадно — самый большой долг гасится самому большому
// кредитору. Переводов не больше «участников с ненулевым балансом − 1».
// → [{ from, to, amount }] — от должника к тому, кому должны.
export function settlementPlan(nets, meId, { precision = 2 } = {}) {
  const order = canonical(meId);
  const half = 10 ** -precision / 2;
  const sides = sign => [...nets]
    .filter(([, x]) => sign * x > half)
    .map(([id, x]) => ({ id, left: Math.abs(x) }));
  const byLeft = (a, b) => b.left - a.left || order(a.id, b.id);
  let creditors = sides(1).sort(byLeft);
  let debtors = sides(-1).sort(byLeft);
  const plan = [];

  debtors.forEach(d => {
    const c = creditors.find(x => x.left > half && Math.abs(x.left - d.left) < half);
    if (!c) return;
    plan.push({ from: d.id, to: c.id, amount: roundTo(d.left, precision) });
    c.left = 0;
    d.left = 0;
  });
  creditors = creditors.filter(x => x.left > half);
  debtors = debtors.filter(x => x.left > half);

  while (creditors.length && debtors.length) {
    creditors.sort(byLeft);
    debtors.sort(byLeft);
    const c = creditors[0];
    const d = debtors[0];
    const amount = roundTo(Math.min(c.left, d.left), precision);
    if (!(amount > 0)) break;
    plan.push({ from: d.id, to: c.id, amount });
    c.left = roundTo(c.left - amount, precision);
    d.left = roundTo(d.left - amount, precision);
    if (c.left <= half) creditors.shift();
    if (d.left <= half) debtors.shift();
  }
  return plan;
}

// Мои строки плана как долг каждого участника передо мной: + он должен мне, − я должен ему.
// → { [member_id]: balance } — только участники, с кем у меня есть перевод в плане.
export function pairBalances(plan, meId) {
  const res = {};
  plan.forEach(({ from, to, amount }) => {
    if (to === meId) res[from] = (res[from] || 0) + amount;
    else if (from === meId) res[to] = (res[to] || 0) - amount;
  });
  return res;
}

// Итог группы целиком: балансы и план. memberIds — участники (порядок не важен).
// → { nets: Map, plan }
export function groupSettlement(entries, meId, { memberIds = [], precision = 2 } = {}) {
  const nets = groupNets(entries, meId, { memberIds, precision });
  return { nets, plan: settlementPlan(nets, meId, { precision }) };
}

// Долг одного участника передо мной по плану группы (+ должен мне). Для форм перевода.
export function pairBalanceOf(entries, memberId, meId, { precision = 2 } = {}) {
  const { plan } = groupSettlement(entries, meId, { memberIds: [memberId], precision });
  return roundTo(pairBalances(plan, meId)[memberId] || 0, precision);
}

// Строки плана для экрана: сначала мои (с ними есть действие), затем остальные; внутри — по сумме.
export function sortPlanRows(plan, meId) {
  const mine = r => r.from === meId || r.to === meId;
  return [...plan].sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.amount - a.amount);
}
