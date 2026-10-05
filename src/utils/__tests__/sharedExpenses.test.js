import {
  memberBalances, memberStatus, myShareOf, billMemberDebt,
  closingOptions, splitAdjustmentByBills, perHeadOf, memberLabel, groupSummary,
  memberDebtLines, debtLineText, debtShareText,
  guestNameSuggestions, guestOccurrences, adjustLabel, memberUsage, allocateTransfer, mirrorBalance, mirrorBalanceByMonth, groupMonthSummary, totalsAcrossGroups, personGroupSummary, offsetOptions, groupHeadcount,
} from "../sharedExpenses";

const P = { precision: 0 };

// Участники вечера из §5.8.
const members = [
  { id: "me", is_me: true, heads: 1 },
  { id: "asan", guest_name: "Асан", heads: 1, sort_order: 1 },
  { id: "bek", person_id: "p-bek", heads: 3, sort_order: 2 },
  { id: "dauren", guest_name: "Даурен", heads: 1, sort_order: 3 },
];

const bill = (id, payer, amount, shares, extra = {}) =>
  ({ id, kind: "bill", date: "2026-10-03", payer_member_id: payer, amount, amount_group: amount, shares, ...extra });
const sh = (member_id, amount, heads = 1, extra) => ({ member_id, amount, heads, mode: "auto", ...(extra ? { extra } : {}) });
const transfer = (from, to, amount) =>
  ({ id: `t-${from}-${to}-${amount}`, kind: "transfer", from_member_id: from, to_member_id: to, amount, amount_group: amount });
const adjust = (member_id, amount, reason, bill_id = null) =>
  ({ id: `a-${member_id}-${amount}`, kind: "adjust", member_id, amount_group: amount, reason, bill_id });

// §5.8: ужин платил я, бильярд — Асан (без Даурена), такси — я, только компашке Бека.
const dinner = bill("dinner", "me", 36000, [sh("me", 6000), sh("asan", 6000), sh("bek", 18000, 3), sh("dauren", 6000)]);
const billiards = bill("billiards", "asan", 12000, [sh("me", 2400), sh("asan", 2400), sh("bek", 7200, 3)]);
const taxi = bill("taxi", "me", 4500, [sh("bek", 4500, 3)]);
const evening = [dinner, billiards, taxi];

describe("memberBalances", () => {
  test("§5.8: долги только между мной и участником, взаимный долг сворачивается", () => {
    const b = memberBalances(evening, members, P);
    expect(b.asan.balance).toBe(3600);
    expect(b.bek.balance).toBe(22500);
    expect(b.dauren.balance).toBe(6000);
    expect(b.me).toBeUndefined();
  });

  test("§5.2: переплата 90 закрыта округлением — долг 0, моя доля 9 820", () => {
    const b1 = bill("b1", "me", 29730, [sh("me", 9910), sh("asan", 9910), sh("bek", 9910)]);
    const round = adjust("asan", -90, "rounding", "b1");
    const entries = [b1, transfer("asan", "me", 10000), round];
    const b = memberBalances(entries, members, P);
    expect(b.asan.balance).toBe(0);
    expect(b.bek.balance).toBe(9910);
    expect(myShareOf(b1, "me", [round], P)).toBe(9820);
  });

  test("§5.7: платил участник — я должен ему свою долю", () => {
    const b = memberBalances([bill("d", "asan", 8500, [sh("me", 8500)])], members, P);
    expect(b.asan.balance).toBe(-8500);
  });

  test("§5.15: перевод до счёта — аванс", () => {
    const b = memberBalances([transfer("bek", "me", 10000)], members, P);
    expect(b.bek).toEqual({ balance: -10000, accrued: 0 });
    expect(memberStatus(b.bek)).toBe("advance");
  });

  test("§5.16: возврат, который получил я, уменьшает долги участников", () => {
    const refund = { ...bill("r", "me", 6000, [sh("me", 1000), sh("asan", 1000), sh("bek", 3000, 3), sh("dauren", 1000)]), kind: "refund" };
    const b = memberBalances([dinner, refund], members, P);
    expect(b.bek.balance).toBe(15000);
    expect(myShareOf(refund, "me", [], P)).toBe(-1000);
  });

  test("§5.18: долг считается в валюте группы по зафиксированному курсу", () => {
    const tryBill = { ...bill("tr", "me", 3000, [sh("me", 1500), sh("bek", 1500)]), currency: "TRY", amount_group: 47100 };
    expect(memberBalances([tryBill], members, P).bek.balance).toBe(23550);
    expect(billMemberDebt(tryBill, "bek")).toBe(23550);
  });
});

describe("memberStatus", () => {
  test("закрыто / частично / не вернул", () => {
    expect(memberStatus({ balance: 0, accrued: 9910 })).toBe("settled");
    expect(memberStatus({ balance: 7666, accrued: 23000 })).toBe("partial");
    expect(memberStatus({ balance: 9910, accrued: 9910 })).toBe("open");
    expect(memberStatus({ balance: -90, accrued: 9910 })).toBe("open");
  });
});

describe("closingOptions", () => {
  const apply = (debt, amt, dir, opt) => debt + (dir === "in" ? -amt : amt) - opt.adjustAmount;

  test("ровно — без вариантов", () => {
    expect(closingOptions(9910, 9910, "in", P)).toMatchObject({ status: "exact", options: [] });
  });

  test("§5.2: мне перевели на 90 больше — всегда округление, долг закрывается в 0", () => {
    const res = closingOptions(9910, 10000, "in", P);
    expect(res.status).toBe("over");
    expect(res.diff).toBe(90);
    expect(res.options[0]).toMatchObject({ reason: "rounding", adjustAmount: -90 });
    expect(apply(9910, 10000, "in", res.options[0])).toBe(0);
    expect(res.options).toHaveLength(1);   // «записать, что я должен ему» — нет: всегда округление
  });

  test("недоплата — по умолчанию оставить долг, вариант простить", () => {
    const res = closingOptions(9910, 9500, "in", P);
    expect(res.options[0].reason).toBe(null);
    expect(res.options[1]).toMatchObject({ reason: "forgive", adjustAmount: 410 });
    expect(apply(9910, 9500, "in", res.options[1])).toBe(0);
  });

  test("я перевёл больше — overpaid_them +100", () => {
    const res = closingOptions(-2400, 2500, "out", P);
    expect(res.options[0]).toMatchObject({ reason: "overpaid_them", adjustAmount: 100 });
    expect(apply(-2400, 2500, "out", res.options[0])).toBe(0);
  });

  test("я перевёл меньше — «хватит» treated_me −400", () => {
    const res = closingOptions(-2400, 2000, "out", P);
    expect(res.options[0].reason).toBe(null);
    expect(res.options[1]).toMatchObject({ reason: "treated_me", adjustAmount: -400 });
    expect(apply(-2400, 2000, "out", res.options[1])).toBe(0);
  });

  test("долга в эту сторону нет — аванс, без вариантов", () => {
    expect(closingOptions(0, 10000, "in", P).status).toBe("advance");
    expect(closingOptions(3600, 1000, "out", P).status).toBe("advance");
  });
});

describe("splitAdjustmentByBills", () => {
  test("§5.8: округление Асана ложится только на ужин, не на его бильярд", () => {
    expect(splitAdjustmentByBills(-90, "rounding", evening, "asan", "me", P))
      .toEqual([{ bill_id: "dinner", amount: -90 }]);
  });

  test("угощаю компашку Бека — пропорционально ужину и такси, Σ ровно", () => {
    expect(splitAdjustmentByBills(22500, "treat", evening, "bek", "me", P))
      .toEqual([{ bill_id: "dinner", amount: 18000 }, { bill_id: "taxi", amount: 4500 }]);
    const odd = splitAdjustmentByBills(1001, "forgive", evening, "bek", "me", P);
    expect(odd.reduce((s, x) => s + x.amount, 0)).toBe(1001);
  });

  test("мой долг ему — на счета, где платил он", () => {
    expect(splitAdjustmentByBills(100, "overpaid_them", evening, "asan", "me", P))
      .toEqual([{ bill_id: "billiards", amount: 100 }]);
  });

  test("счетов нет — одна строка без bill_id", () => {
    expect(splitAdjustmentByBills(500, "treat", [], "bek", "me", P)).toEqual([{ bill_id: null, amount: 500 }]);
  });
});

describe("perHeadOf", () => {
  test("§8.3: «за 1» по всем счетам, где платил я, личное — отдельно", () => {
    const dinnerWithHookah = bill("d", "me", 41000,
      [sh("me", 6000), sh("asan", 6000), sh("bek", 23000, 3, 5000), sh("dauren", 6000)], { title: "Ужин" });
    const res = perHeadOf([dinnerWithHookah, { ...taxi, title: "Такси" }, billiards], "bek", "me", P);
    expect(res.perHead).toBe(7500);
    expect(res.extras).toBe(5000);
    expect(res.breakdown.map(x => [x.title, x.perHead])).toEqual([["Ужин", 6000], ["Такси", 1500]]);
  });
});

describe("memberLabel", () => {
  const people = [{ id: "p-bek", name: "Бек" }];
  const all = [...members, { id: "x1", heads: 2, sort_order: 4 }, { id: "x2", heads: 1, sort_order: 5 }];
  const label = id => memberLabel(all.find(m => m.id === id), { people, members: all });

  test("подпись, человек, гость, безымянные по порядку", () => {
    expect(label("me")).toBe("Я");
    expect(label("bek")).toBe("Бек × 3");
    expect(label("asan")).toBe("Асан");
    expect(label("x1")).toBe("Компашка 1 × 2");
    expect(label("x2")).toBe("Компашка 2");
    expect(memberLabel({ id: "y", label: "Компашка Асана", heads: 3 })).toBe("Компашка Асана");
  });
});

describe("groupSummary", () => {
  test("§5.8: моя доля 8 400, мне должны 32 100, никто ещё не рассчитался", () => {
    expect(groupSummary(evening, members, P)).toEqual({ myShare: 8400, owedToMe: 32100, iOwe: 0, participants: 3, settled: 0 });
  });

  test("§5.2: Асан закрыт округлением — 1 из 2, моя доля 9 820", () => {
    const b1 = bill("b1", "me", 29730, [sh("me", 9910), sh("asan", 9910), sh("bek", 9910)]);
    const entries = [b1, transfer("asan", "me", 10000), adjust("asan", -90, "rounding", "b1")];
    expect(groupSummary(entries, members, P)).toMatchObject({ myShare: 9820, owedToMe: 9910, participants: 2, settled: 1 });
  });
});

describe("memberDebtLines / debtShareText", () => {
  const fmt = n => `${n}`;
  const titleOf = e => e.id;

  test("Σ строк = баланс участника (§5.8)", () => {
    const b = memberBalances(evening, members, P);
    ["asan", "bek", "dauren"].forEach(id => {
      expect(memberDebtLines(evening, id, "me").reduce((s, l) => s + l.amount, 0)).toBe(b[id].balance);
    });
  });

  test("§11.7: текст напоминания Асану — ужин, его бильярд, итого 3 600", () => {
    const lines = memberDebtLines(evening, "asan", "me");
    expect(debtShareText({ groupName: "Вечер 03.10", lines, balance: 3600, fmt, titleOf })).toBe(
      "Вечер 03.10\ndinner — твоя доля 6000\nbilliards — ты платил, моя доля −2400\nИтого: 3600");
  });

  test("переводы и корректировки в раскладке", () => {
    const b1 = bill("b1", "me", 29730, [sh("me", 9910), sh("asan", 9910)]);
    const day = (e, created_at) => ({ ...e, date: "2026-10-03", created_at });
    // Порядок в сторе — обратный (date.desc, created_at.desc); раскладка — в порядке событий.
    const lines = memberDebtLines([day(adjust("asan", -90, "rounding", "b1"), "3"), day(transfer("asan", "me", 10000), "2"), day(b1, "1")], "asan", "me");
    expect(lines.map(l => [l.kind, l.amount])).toEqual([["bill", 9910], ["transfer_in", -10000], ["adjust", 90]]);
    expect(lines.map(l => debtLineText(l, { fmt, titleOf }))).toEqual(["b1 — твоя доля 9910", "Ты перевёл −10000", "округление 90"]);
  });
});

describe("adjustLabel", () => {
  test("treated_me без перевода — «угостили меня», с переводом — «хватит»", () => {
    expect(adjustLabel({ reason: "treated_me", transfer_id: null })).toBe("угостили меня");
    expect(adjustLabel({ reason: "treated_me", transfer_id: "t1" })).toBe("«хватит»");
    expect(adjustLabel({ reason: "treat" })).toBe("угощаю");
  });

  test("§5.12: «Угостили меня» — долг 0, в раскладке ужин и угощение", () => {
    const dinnerByAsan = bill("d", "asan", 8500, [sh("me", 8500)]);
    const entries = [dinnerByAsan, { ...adjust("asan", -8500, "treated_me", "d"), transfer_id: null, date: "2026-10-03" }];
    expect(memberBalances(entries, members, P).asan.balance).toBe(0);
    expect(myShareOf(dinnerByAsan, "me", entries, P)).toBe(0);
    const text = memberDebtLines(entries, "asan", "me").map(l => debtLineText(l, { fmt: String, titleOf: () => "Ужин" }));
    expect(text).toEqual(["Ужин — ты платил, моя доля −8500", "угостили меня 8500"]);
  });
});

describe("guestNameSuggestions", () => {
  const ms = [
    { id: "1", guest_name: "Асан", created_at: "2026-09-01" },
    { id: "2", guest_name: "асан ", created_at: "2026-10-01" },
    { id: "3", guest_name: "Даурен", created_at: "2026-09-15" },
    { id: "4", guest_name: "Арман", created_at: "2026-08-01" },
    { id: "5", person_id: "p-bek", created_at: "2026-10-02" },
  ];

  test("уникальные без регистра, свежие сверху", () => {
    expect(guestNameSuggestions(ms)).toEqual(["асан", "Даурен", "Арман"]);
  });

  test("по введённой подстроке, без точного совпадения и уже добавленных", () => {
    expect(guestNameSuggestions(ms, "ар")).toEqual(["Арман"]);
    expect(guestNameSuggestions(ms, "асан")).toEqual([]);
    expect(guestNameSuggestions(ms, "", { exclude: ["Даурен"] })).toEqual(["асан", "Арман"]);
    expect(guestNameSuggestions(ms, "", { limit: 1 })).toEqual(["асан"]);
  });
});

describe("guestOccurrences", () => {
  test("все гости с этим именем по группам — с долгом, свежие вечера сверху", () => {
    const groups = [{ id: "g1", date: "2026-10-03", currency: "KZT" }, { id: "g2", date: "2026-11-20", currency: "KZT" }];
    const ms = [
      { id: "me1", group_id: "g1", is_me: true }, { id: "a1", group_id: "g1", guest_name: "Асан" },
      { id: "me2", group_id: "g2", is_me: true }, { id: "a2", group_id: "g2", guest_name: "асан" },
      { id: "b2", group_id: "g2", guest_name: "Бек" }, { id: "a3", group_id: "g2", guest_name: "Асан", person_id: "p1" },
    ];
    const entries = [{ ...bill("x", "me1", 20000, [sh("me1", 10000), sh("a1", 10000)]), group_id: "g1" }];
    const res = guestOccurrences(" АСАН", { groups, members: ms, entries });
    expect(res.map(o => [o.member.id, o.balance])).toEqual([["a2", 0], ["a1", 10000]]);
    expect(guestOccurrences("", { groups, members: ms, entries })).toEqual([]);
  });
});

describe("memberUsage", () => {
  test("§7.5: участник в долях, платёж, переводы и корректировки — удалять нельзя", () => {
    const entries = [...evening, transfer("dauren", "me", 100), adjust("asan", 5, "rounding")];
    expect(memberUsage("dauren", entries).map(e => e.id)).toEqual(["dinner", "t-dauren-me-100"]);
    expect(memberUsage("asan", entries).map(e => e.id)).toEqual(["dinner", "billiards", "a-asan-5"]);
    expect(memberUsage("nobody", entries)).toEqual([]);
  });
});

describe("allocateTransfer", () => {
  test("Σ частей = сумме ровно, с точностью валюты", () => {
    expect(allocateTransfer(10, [3.335, 3.335, 3.33], { precision: 2 })).toEqual([3.34, 3.34, 3.32]);
    expect(allocateTransfer(1000, [5000, 3000], { precision: 0 })).toEqual([1000, 0]);
  });
});

describe("квартира (mirror)", () => {
  // §5.1: я, Дима, Асхат, Ерлан; поровну на 4. В mirror в shares — только моя доля.
  const mine = (id, payer, amount, my, date, extra = {}) =>
    ({ id, kind: "bill", date, payer_member_id: payer, amount, amount_group: amount, shares: [sh("me", my)], split_people: 4, ...extra });
  const october = [
    mine("pc", "dima", 400000, 100000, "2026-10-02", { category_id: "tech" }),
    mine("food", "me", 40000, 10000, "2026-10-05", { category_id: "food" }),
    mine("wifi", "askhat", 12000, 3000, "2026-10-07", { category_id: "net" }),
  ];

  test("§5.1: мой баланс −73 000, после перевода Диме — 0", () => {
    expect(mirrorBalance(october, "me", P)).toBe(-73000);
    expect(mirrorBalance([...october, transfer("me", "dima", 73000)], "me", P)).toBe(0);
  });

  test("§5.1a: перевод от кого угодно уменьшает баланс с группой, переплаты не бывает", () => {
    // я оплатил продукты 100 000 за всех (моя доля 25 000) → мне должны 75 000; Асхат прислал 50 000, Ерлан — Диме
    const es = [mine("f", "me", 100000, 25000, "2026-10-05"), transfer("askhat", "me", 50000)];
    expect(mirrorBalance(es, "me", P)).toBe(25000);
  });

  test("§5.1b: вернул свою часть мимо Tricount — перевод в группе, баланс как в Tricount", () => {
    expect(mirrorBalance([mine("f", "me", 40000, 10000, "2026-10-05"), transfer("askhat", "me", 10000)], "me", P)).toBe(20000);
  });

  test("§5.1c/§5.1d: начальный баланс и сверка входят в баланс", () => {
    const es = [{ id: "o", kind: "opening", date: "2026-10-01", amount_group: -20000 }, ...october, { id: "r", kind: "reconcile", date: "2026-10-20", amount_group: -1250 }];
    expect(mirrorBalance(es, "me", P)).toBe(-94250);
  });

  test("§5.16: возврат залога — получил я / получил Дима", () => {
    const refund = (payer) => ({ id: `rf-${payer}`, kind: "refund", date: "2026-10-10", payer_member_id: payer, amount: 100000, amount_group: 100000, shares: [sh("me", 25000)] });
    expect(mirrorBalance([refund("me")], "me", P)).toBe(-75000);   // должен соседям их часть
    expect(mirrorBalance([refund("dima")], "me", P)).toBe(25000);  // Дима должен мне мою часть
  });

  test("раскладка по месяцам: перенесено + движение месяца = итог", () => {
    const es = [
      { id: "o", kind: "opening", date: "2026-09-01", amount_group: -20000 },
      ...october,
      transfer("me", "dima", 50000),
    ].map(e => (e.kind === "transfer" ? { ...e, date: "2026-10-31" } : e));
    expect(mirrorBalanceByMonth(es, "me", P)).toEqual([
      { month: "2026-09", carriedIn: 0, share: 0, paid: 0, transfers: 0, adjust: -20000, closing: -20000 },
      { month: "2026-10", carriedIn: -20000, share: -113000, paid: 40000, transfers: 50000, adjust: 0, closing: -43000 },
    ]);
  });

  test("лента месяца: записи месяца свежие сверху, моя доля за месяц", () => {
    const es = [...october, mine("bread", "me", 800, 200, "2026-10-08"), mine("sept", "me", 999, 250, "2026-09-30")];
    const { items, myShare } = groupMonthSummary(es, "2026-10", "me", P);
    expect(items.map(i => i.id)).toEqual(["bread", "wifi", "food", "pc"]);
    expect(myShare).toBe(113200);
  });
});

describe("этап 11: итоги по группам и карточка человека", () => {
  const g1 = { id: "g1", name: "Вечер 03.10", mode: "event", currency: "KZT", date: "2026-10-03" };
  const g2 = { id: "g2", name: "Вечер 10.10", mode: "event", currency: "KZT", date: "2026-10-10", archived: true };
  const f1 = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
  const us = { id: "u1", name: "Нью-Йорк", mode: "event", currency: "USD", date: "2026-09-01" };
  const ms = [
    ...members.map(m => ({ ...m, group_id: "g1" })),
    { id: "me2", group_id: "g2", is_me: true }, { id: "bek2", group_id: "g2", person_id: "p-bek" }, { id: "anon2", group_id: "g2" },
    { id: "me3", group_id: "f1", is_me: true }, { id: "dima", group_id: "f1", person_id: "p-dima" },
    { id: "me4", group_id: "u1", is_me: true }, { id: "asan4", group_id: "u1", guest_name: "асан" },
  ];
  const people = [{ id: "p-bek", name: "Бек" }, { id: "p-dima", name: "Дима" }];
  const es = [
    ...evening.map(e => ({ ...e, group_id: "g1" })),                                        // §5.8: Асан 3 600, Бек 22 500, Даурен 6 000
    { ...bill("x", "me2", 3000, [sh("bek2", 2000), sh("anon2", 1000)]), group_id: "g2" },    // архив: Бек ещё 2 000
    { ...bill("pc", "dima", 400000, [sh("me3", 100000)]), group_id: "f1" },                  // квартира: я должен 100 000
    { ...bill("ny", "me4", 20, [sh("asan4", 10), sh("me4", 10)]), group_id: "u1" },           // Асан в долларах — тот же гость
    { id: "tr", group_id: "g2", kind: "transfer", date: "2026-10-11", from_member_id: "bek2", to_member_id: "me2", amount: 500, amount_group: 500, sender_person_id: "p-bek" },
  ];
  const toBase = (x, cur) => (cur === "USD" ? x * 500 : x);

  test("§12.1: мне должны / я должен по всем группам, по людям, гостям и квартирам; архив учитывается", () => {
    const t = totalsAcrossGroups({ groups: [g1, g2, f1, us], members: ms, entries: es, people, toBase });
    const row = key => t.rows.find(r => r.key === key);
    expect(row("p:p-bek")).toMatchObject({ kind: "person", name: "Бек", owedToMe: 24000 });       // 22 500 + 2 000 − 500
    expect(row("p:p-bek").items.map(i => i.group.id)).toEqual(["g1", "g2"]);
    expect(row("g:асан")).toMatchObject({ kind: "guest", owedToMe: 8600 });                         // 3 600 ₸ + $10
    expect(row("g:даурен")).toMatchObject({ owedToMe: 6000 });
    expect(row("m:anon2")).toMatchObject({ kind: "unnamed", owedToMe: 1000 });
    expect(row("grp:f1")).toMatchObject({ kind: "group", name: "Квартира", iOwe: 100000 });
    expect(t).toMatchObject({ owedToMe: 39600, iOwe: 100000 });
    expect(t.rows[0].key).toBe("grp:f1");                                                           // крупные сверху
  });

  test("§11.5: Бек в карточке — его участники в вечерах и переводы, которые прислал он", () => {
    const s = personGroupSummary("p-bek", { groups: [g1, g2, f1], members: ms, entries: es });
    expect(s.groups.map(x => [x.group.id, x.balance])).toEqual([["g2", 1500], ["g1", 22500]]);
    expect(s.transfers).toEqual([expect.objectContaining({ incoming: true, group: g2 })]);
    expect(personGroupSummary("p-dima", { groups: [f1], members: ms, entries: es }).groups).toEqual([]); // квартира — долг с группой
  });
});

describe("offsetOptions — §10", () => {
  test("я должен Диме в группе 13 000, он мне лично 20 000 — зачесть до 13 000", () => {
    expect(offsetOptions({ direction: "out", amount: 13000, personNet: 20000, precision: 0 })).toEqual({ available: true, max: 13000, sign: -1 });
  });
  test("Бек должен мне за вечер 9 910, я ему лично 5 000 — зачесть до 5 000", () => {
    expect(offsetOptions({ direction: "in", amount: 9910, personNet: -5000, precision: 0 })).toEqual({ available: true, max: 5000, sign: 1 });
  });
  test("одно направление или долга нет — зачёт не предлагается", () => {
    expect(offsetOptions({ direction: "in", amount: 9910, personNet: 5000 }).available).toBe(false);
    expect(offsetOptions({ direction: "out", amount: 100, personNet: 0 }).available).toBe(false);
  });
  test("не больше личного долга — округление вниз, долг не сменит сторону", () => {
    expect(offsetOptions({ direction: "out", amount: 0, personNet: 100.009, precision: 2 }).max).toBe(100);
  });
});

describe("groupHeadcount", () => {
  test("§5.8: людей было 6 — по самому большому счёту, компашка × 3 — трое", () => {
    expect(groupHeadcount(evening, members)).toBe(6);
    expect(groupHeadcount([], members)).toBe(6);   // без счетов — по «× N» участников: 1 + 1 + 3 + 1
  });
});

describe("Tricount не создаёт личных долгов людей (§4, §5.1a)", () => {
  // Продукты 12 000 на четверых, платил я: в составе все четверо, но долг — с группой (+9 000),
  // а не «Баха должен 3 000»: кто кому переведёт, решает Tricount (у Бахи может быть свой долг).
  const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
  const ms = [
    { id: "me", group_id: "f1", is_me: true }, { id: "baha", group_id: "f1", person_id: "p-baha" },
    { id: "shyntas", group_id: "f1", person_id: "p-shyntas" }, { id: "erlan", group_id: "f1", guest_name: "Ерлан" },
  ];
  const food = { id: "food", group_id: "f1", kind: "bill", date: "2026-10-05", payer_member_id: "me", amount: 12000, amount_group: 12000,
    shares: [sh("me", 3000), sh("baha", 3000), sh("shyntas", 3000), sh("erlan", 3000)] };
  const people = [{ id: "p-baha", name: "Баха" }, { id: "p-shyntas", name: "Шынтас" }];

  test("итоги: одна строка группы +9 000, строк по людям нет", () => {
    const t = totalsAcrossGroups({ groups: [flat], members: ms, entries: [food], people });
    expect(t.rows.map(r => [r.key, r.owedToMe])).toEqual([["grp:f1", 9000]]);
  });

  test("карточка человека и «Сохранить в Люди» — без долгов из Tricount", () => {
    expect(personGroupSummary("p-baha", { groups: [flat], members: ms, entries: [food] }).groups).toEqual([]);
    expect(guestOccurrences("Ерлан", { groups: [flat], members: ms, entries: [food] }).map(o => o.balance)).toEqual([null]);
  });

  test("§5.1a: Баха прислал 6 000 (Tricount перекинул на него долг Шынтаса), Ерлан 3 000 — баланс 0", () => {
    const es = [food, transfer("baha", "me", 6000), transfer("erlan", "me", 3000)];
    expect(mirrorBalance(es, "me", P)).toBe(0);
  });
});
