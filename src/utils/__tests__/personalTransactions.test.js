import { buildPersonalTransactions } from "../personalTransactions";

const tx = (id, amount, extra = {}) =>
  ({ id, type: "expense", amount, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-03", ...extra });
const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]));

const groups = [{ id: "g1", currency: "KZT" }];
const members = [
  { id: "me", group_id: "g1", is_me: true },
  { id: "asan", group_id: "g1" },
  { id: "bek", group_id: "g1" },
];
const bill = (id, payer, amount, shares, extra = {}) => ({
  id, group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: payer, amount, amount_group: amount,
  category_id: "rest", title: "Ужин", shares, ...extra,
});
const build = (transactions, sharedEntries = [], debtEvents = []) =>
  buildPersonalTransactions({ transactions, debtEvents, sharedGroups: groups, sharedMembers: members, sharedEntries });

describe("buildPersonalTransactions", () => {
  test("§6.1: транзакции без категории — не доход и не расход", () => {
    const rows = build([tx("t1", 5000), tx("ret", 20000, { type: "income", category_id: null })]);
    expect(rows.map(r => r.id)).toEqual(["t1"]);
  });

  test("сплит «Оплатил за других» — как раньше, до моей доли", () => {
    const rows = build([tx("t1", 9000)], [], [{ transaction_id: "t1", type: "paid_for_them", amount: 6000 }]);
    expect(rows[0].amount).toBe(3000);
  });

  test("§5.2: я оплатил 29 730, округление −90 — в категории моя доля 9 820", () => {
    const b = bill("b1", "me", 29730, [{ member_id: "me", amount: 9910 }, { member_id: "asan", amount: 9910 }, { member_id: "bek", amount: 9910 }],
      { transaction_id: "t1" });
    const adj = { id: "a1", group_id: "g1", kind: "adjust", member_id: "asan", amount_group: -90, reason: "rounding", bill_id: "b1" };
    const transferTx = tx("t2", 10000, { type: "income", category_id: null });
    const rows = byId(build([tx("t1", 29730), transferTx], [b, adj]));
    expect(rows.t1.amount).toBe(9820);
    expect(rows.t2).toBeUndefined();
  });

  test("§5.8: такси оплатил я, но не для меня — в категорию 0", () => {
    const b = bill("taxi", "me", 4500, [{ member_id: "bek", amount: 4500 }], { transaction_id: "t1" });
    expect(build([tx("t1", 4500)], [b])[0].amount).toBe(0);
  });

  test("§5.11: платил Асан — виртуальная строка на мою долю, без счёта", () => {
    const b = bill("b1", "asan", 12000, [{ member_id: "me", amount: 2400 }, { member_id: "asan", amount: 9600 }]);
    const [row] = build([], [b]);
    expect(row).toMatchObject({ id: "shared:b1", type: "expense", amount: 2400, currency: "KZT", category_id: "rest",
      account_id: null, date: "2026-10-03", virtual: true, shared_entry_id: "b1" });
  });

  test("§5.12: «Угостили меня» — моя доля 0, строки нет", () => {
    const b = bill("b1", "asan", 8500, [{ member_id: "me", amount: 8500 }]);
    const adj = { id: "a1", group_id: "g1", kind: "adjust", member_id: "asan", amount_group: -8500, reason: "treated_me", bill_id: "b1" };
    expect(build([], [b, adj])).toEqual([]);
  });

  test("§6.2: корректировка ложится на дату счёта", () => {
    const b = bill("b1", "me", 20000, [{ member_id: "me", amount: 10000 }, { member_id: "bek", amount: 10000 }],
      { transaction_id: "t1", date: "2026-10-30" });
    const forgive = { id: "a1", group_id: "g1", kind: "adjust", member_id: "bek", amount_group: 410, reason: "forgive", bill_id: "b1", date: "2026-11-05" };
    const [row] = build([tx("t1", 20000, { date: "2026-10-30" })], [b, forgive]);
    expect(row).toMatchObject({ amount: 10410, date: "2026-10-30" });
  });

  test("§5.16: возврат, полученный мной, — минус моя доля в категории", () => {
    const refund = { ...bill("r1", "me", 6000, [{ member_id: "me", amount: 2000 }, { member_id: "asan", amount: 2000 }, { member_id: "bek", amount: 2000 }]),
      kind: "refund", transaction_id: "t9" };
    const rows = build([tx("t9", 6000, { type: "income", category_id: null })], [refund]);
    expect(rows).toEqual([expect.objectContaining({ id: "shared:r1", type: "expense", amount: -2000 })]);
  });

  test("§5.18: счёт в лирах, оплачен с тенгового счёта — моя доля в тенге по факту списания", () => {
    const b = bill("b1", "me", 3000, [{ member_id: "me", amount: 1500 }, { member_id: "bek", amount: 1500 }],
      { currency: "TRY", amount_group: 47100, transaction_id: "t1" });
    expect(build([tx("t1", 47100)], [b])[0].amount).toBe(23550);
  });

  test("транзакция счёта удалена — доля остаётся виртуальной строкой", () => {
    const b = bill("b1", "me", 9000, [{ member_id: "me", amount: 3000 }, { member_id: "bek", amount: 6000 }], { transaction_id: "gone" });
    expect(build([], [b])[0]).toMatchObject({ id: "shared:b1", amount: 3000 });
  });
});
