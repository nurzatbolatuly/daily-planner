import { roundTo, ceilTo } from "./format";

// Деление суммы между участниками. Одно ядро — splitBill — для двух мест:
// • «Общие расходы» (docs/shared-expenses.md §8.1) — вызывают splitBill напрямую;
// • тугл «Оплатил за других» в TxPage/SplitToggle — через обёртку computeSplit.
//
// Правило округления: доли участников, которые делят остаток поровну («auto»), округляются
// ВВЕРХ до точности валюты (KZT — целые, getPrecision): никто не недоплачивает «тиыны», а
// разницу берёт на себя плательщик. 10 000 ₸ на троих = 3 334 + 3 334 + 3 332 (плательщик).

// ─── Ядро ─────────────────────────────────────────────────────────────────────────────────
//
// rows: [{ member_id, heads, mode: "auto"|"fixed", value, extra, ...любые поля строки }]
//   heads — вес участника (в общих расходах — сколько человек за ним в этом счёте);
//   "auto" — делит остаток пропорционально heads; "fixed" — ровно value;
//   extra — личная позиция поверх доли (кальян только себе). Исключённых в rows просто нет.
// remainderMemberId — плательщик: разница от округления вверх уходит на него, если он сам
//   "auto" (фиксированная сумма по смыслу точная). Иначе — по одной единице точности на
//   участника, по порядку, чтобы никто не платил заметно меньше остальных.
// precision — знаков после запятой (getPrecision(currency)).
//
// → { shares: [{ ...row, amount }], valid, reason, gap }; при valid Σ amount === total ровно.
export function splitBill(total, rows, { remainderMemberId = null, precision = 2 } = {}) {
  const sum = arr => roundTo(arr.reduce((s, x) => s + x, 0), precision);
  const t = roundTo(total, precision);
  const fail = (reason, gap = 0) =>
    ({ shares: rows.map(r => ({ ...r, amount: 0 })), valid: false, reason, gap: roundTo(gap, precision) });

  if (!(t > 0)) return fail("no_amount");
  if (rows.length === 0) return fail("no_participants");

  const extraOf = r => roundTo(Math.max(Number(r.extra) || 0, 0), precision);
  const fixedOf = r => roundTo(Math.max(Number(r.value) || 0, 0), precision);
  const headsOf = r => Math.max(Number(r.heads) || 0, 0);
  const isAuto  = r => r.mode !== "fixed";

  const fixedSum = sum(rows.map(r => (isAuto(r) ? 0 : fixedOf(r)) + extraOf(r)));
  if (fixedSum > t) return fail("over_total", fixedSum - t);

  const rest = roundTo(t - fixedSum, precision);
  const autoHeads = rows.filter(isAuto).reduce((s, r) => s + headsOf(r), 0);
  if (autoHeads === 0 && rest !== 0) return fail("unallocated", rest);

  const amounts = rows.map(r =>
    (isAuto(r) ? ceilTo(rest * headsOf(r) / autoHeads, precision) : fixedOf(r)) + extraOf(r));

  absorbRoundingDiff(amounts, rows, roundTo(t - sum(amounts), precision), {
    payerIdx: rows.findIndex(r => r.member_id === remainderMemberId && isAuto(r)),
    autoIdx: rows.map((r, i) => (isAuto(r) && headsOf(r) > 0 ? i : -1)).filter(i => i >= 0),
    floorOf: i => extraOf(rows[i]),
    precision,
  });

  return {
    shares: rows.map((r, i) => ({ ...r, amount: amounts[i] })),
    valid: true,
    reason: null,
    gap: 0,
  };
}

// ─── Общие сборы поверх деления (доставка, сервис, комиссия) ──────────────────────────────
//
// Из суммы сначала вычитаются сборы, остаток делится rows (любым способом — splitBill), затем
// каждый сбор раскладывается сверху на тех же участников:
//   split "equal"        — поровну по людям (feeHeads: { member_id: сколько человек }, по умолчанию 1);
//   split "proportional" — пропорционально доле заказа (сервисный сбор: кто заказал больше — больше).
// Каждый сбор — тем же splitBill: вверх до точности валюты, остаток — плательщику.
// fees: [{ id, title, amount, split }] (нулевые игнорируются).
// → { shares: [{ ...row, base, fee, amount }], valid, reason, gap, feesTotal, base }
export function splitWithFees(total, rows, fees = [], { remainderMemberId = null, precision = 2, feeHeads = {} } = {}) {
  const opts = { remainderMemberId, precision };
  // Каждый сбор — сразу до точности валюты: иначе 100,5 ₸ + 100,5 ₸ вычитаются как 201, а
  // раскладываются как 101 + 101, и Σ долей уходит выше суммы счёта.
  const feeList = fees.map(f => ({ ...f, amount: roundTo(Number(f.amount) || 0, precision) })).filter(f => f.amount > 0);
  const feesTotal = roundTo(feeList.reduce((s, f) => s + f.amount, 0), precision);
  const base = roundTo((Number(total) || 0) - feesTotal, precision);
  const withParts = (res, feeOf = {}) => ({
    ...res,
    shares: res.shares.map(s => ({ ...s, base: s.amount, fee: feeOf[s.member_id] || 0, amount: roundTo(s.amount + (feeOf[s.member_id] || 0), precision) })),
    feesTotal, base,
  });

  if (!feeList.length) return withParts(splitBill(total, rows, opts));
  if (base < 0) return withParts({ shares: rows.map(r => ({ ...r, amount: 0 })), valid: false, reason: "fees_over_total", gap: roundTo(-base, precision) });
  if (rows.length === 0) return withParts({ shares: [], valid: false, reason: "no_participants", gap: 0 });

  // Без остатка (вся сумма — сборы) делить нечего: доля заказа у всех 0.
  const baseRes = base > 0 ? splitBill(base, rows, opts) : { shares: rows.map(r => ({ ...r, amount: 0 })), valid: true, reason: null, gap: 0 };
  if (!baseRes.valid) return withParts(baseRes);

  const feeOf = {};
  const anyBase = baseRes.shares.some(s => s.amount > 0);
  feeList.forEach(f => {
    const weightRows = baseRes.shares
      .map(s => ({ member_id: s.member_id, mode: "auto",
                   heads: f.split === "proportional" && anyBase ? s.amount : Math.max(Number(feeHeads[s.member_id]) || 1, 0) }))
      .filter(r => r.heads > 0);
    splitBill(f.amount, weightRows, opts).shares.forEach(x => {
      feeOf[x.member_id] = roundTo((feeOf[x.member_id] || 0) + x.amount, precision);
    });
  });
  return withParts(baseRes, feeOf);
}

// Сводит Σ долей к сумме ровно после округления вверх (diff ≤ 0; > 0 — только на всякий случай).
// Сначала плательщик (не ниже своей личной позиции), остаток — по одной единице точности на
// auto-участника по кругу. Шагов меньше, чем auto-участников, поэтому цикл короткий.
function absorbRoundingDiff(amounts, rows, diff, { payerIdx, autoIdx, floorOf, precision }) {
  if (diff === 0 || autoIdx.length === 0) return;
  const unit = 10 ** -precision;
  const dir = Math.sign(diff);
  let steps = Math.round(Math.abs(diff) / unit);
  const room = i => (dir > 0 ? steps : Math.round((amounts[i] - floorOf(i)) / unit));
  const shift = (i, k) => { amounts[i] = roundTo(amounts[i] + dir * k * unit, precision); steps -= k; };

  if (payerIdx >= 0) shift(payerIdx, Math.min(steps, room(payerIdx)));

  while (steps > 0) {
    const before = steps;
    for (const i of autoIdx) {
      if (steps === 0) break;
      if (i !== payerIdx && room(i) > 0) shift(i, 1);
    }
    if (steps === before) break; // некуда раскладывать — не должно случаться при Σ ≥ 0
  }
}

// ─── «Оплатил за других» (SplitToggle / TxPage) ────────────────────────────────────────────
//
// entries — доли ОСТАЛЬНЫХ участников [{ id, value }], без меня. value: для "shares" — вес,
// для "percent" — 0..100, для "exact" — сумма, для "equal" не используется.
// meValue — мой вес/процент (в "shares"/"percent" у меня тоже есть поле, см. SplitToggle).
// Плательщик — я: разница от округления вверх уходит в мою долю. Моя доля в БД не пишется,
// только чужие — как debt_events.
// meIncluded=false — «оплатил целиком за других»: чужие доли обязаны покрыть всю сумму.
//
// → { others: [{ id, amount }], me, valid, reason, gap }

const ME = "__me__";
// Процентных пунктов — допуск ввода «33.33 + 33.33 + 33.34». Тот же — в формах групп (coverageRows).
export const PERCENT_TOLERANCE = 0.05;

const num = v => Math.max(parseFloat(v) || 0, 0);

export function computeSplit(totalAmount, entries, method, { meIncluded = true, meValue = null, precision = 2 } = {}) {
  const total = roundTo(totalAmount, precision) || 0;
  const empty = reason => ({ others: entries.map(e => ({ id: e.id, amount: 0 })), me: meIncluded ? total : 0, valid: false, reason, gap: 0 });
  if (total <= 0 || entries.length === 0) return empty("no_participants");

  if (method === "percent") {
    const overshoot = entries.reduce((s, e) => s + num(e.value), 0) + (meIncluded ? num(meValue) : 0) - 100;
    if (Math.abs(overshoot) > PERCENT_TOLERANCE) {
      // Пока проценты не сошлись к 100 — всё равно показываем, сколько выходит у каждого:
      // это подсказка при вводе в SplitToggle, сохранить такой сплит форма не даст (valid:false).
      const pct = v => ceilTo(total * num(v) / 100, precision);
      return {
        others: entries.map(e => ({ id: e.id, amount: pct(e.value) })),
        me: meIncluded ? pct(meValue) : 0,
        valid: false,
        reason: overshoot < 0 ? "unallocated" : meIncluded ? "negative_share" : "over_total",
        gap: roundTo(Math.abs(overshoot) / 100 * total, precision),
      };
    }
  }

  // Проценты после проверки «Σ = 100» — те же веса, что и доли.
  const weightOf = { equal: () => 1, shares: num, percent: num }[method];
  const row = (id, value) => weightOf
    ? { member_id: id, heads: weightOf(value), mode: "auto" }
    : { member_id: id, value: num(value), mode: "fixed" };

  const rows = entries.map(e => row(e.id, e.value));
  if (meIncluded) {
    // В "exact" я — остаток после чужих сумм; в остальных методах — участник со своим весом.
    rows.push(weightOf ? row(ME, meValue) : { member_id: ME, heads: 1, mode: "auto" });
  }

  const res = splitBill(total, rows, { remainderMemberId: ME, precision });
  const amountOf = id => res.shares.find(s => s.member_id === id)?.amount ?? 0;
  return {
    // При ошибке ввода в "exact" показываем введённые суммы как есть (по ним видно, где перебор).
    others: entries.map(e => ({ id: e.id, amount: res.valid ? amountOf(e.id) : weightOf ? 0 : num(e.value) })),
    me: res.valid ? amountOf(ME) : 0,
    valid: res.valid,
    // Чужие суммы больше итога, когда я в доле, — по смыслу «моя доля ушла в минус».
    reason: res.reason === "over_total" && meIncluded ? "negative_share" : res.reason,
    gap: res.gap,
  };
}
