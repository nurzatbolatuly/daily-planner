import { splitWithFees, splitBill, computeSplit } from "../splitCalc";

const KZT = { precision: 0 };
const amounts = res => Object.fromEntries(res.shares.map(s => [s.member_id, s.amount]));
const auto = (member_id, heads = 1, extra) => ({ member_id, heads, mode: "auto", ...(extra ? { extra } : {}) });

describe("splitBill", () => {
  test("§5.2: 29 730 на три компашки — по 9 910", () => {
    const res = splitBill(29730, [auto("me"), auto("asan"), auto("bek")], { ...KZT, remainderMemberId: "me" });
    expect(res.valid).toBe(true);
    expect(amounts(res)).toEqual({ me: 9910, asan: 9910, bek: 9910 });
  });

  test("§5.3: фикс 3 000, остальные поровну — по 11 750", () => {
    const rows = [auto("me"), { member_id: "erlan", heads: 1, mode: "fixed", value: 3000 },
      auto("a"), auto("b"), auto("c")];
    expect(amounts(splitBill(50000, rows, KZT))).toEqual({ me: 11750, erlan: 3000, a: 11750, b: 11750, c: 11750 });
  });

  test("§5.8: доля считается по количеству человек", () => {
    const res = splitBill(36000, [auto("me"), auto("asan"), auto("bek", 3), auto("dauren")], KZT);
    expect(amounts(res)).toEqual({ me: 6000, asan: 6000, bek: 18000, dauren: 6000 });
  });

  test("§5.9: личная позиция вычитается и добавляется сверху", () => {
    const res = splitBill(41000, [auto("me"), auto("asan"), auto("bek", 3, 5000), auto("dauren")], KZT);
    expect(amounts(res)).toEqual({ me: 6000, asan: 6000, bek: 23000, dauren: 6000 });
  });

  test("KZT — доли вверх до целых, разницу берёт плательщик", () => {
    const res = splitBill(10000, [auto("me"), auto("a"), auto("b")], { ...KZT, remainderMemberId: "me" });
    expect(amounts(res)).toEqual({ me: 3332, a: 3334, b: 3334 });
  });

  test("0,13 ₸ округляется до 1 ₸", () => {
    expect(amounts(splitBill(1000.13, [auto("me"), auto("a")], { ...KZT, remainderMemberId: "me" })))
      .toEqual({ me: 500, a: 500 });
    expect(amounts(splitBill(1001, [auto("me"), auto("a")], { ...KZT, remainderMemberId: "me" })))
      .toEqual({ me: 500, a: 501 });
  });

  test("float-мусор не превращается в лишний тенге", () => {
    expect(amounts(splitBill(29730, [auto("me"), auto("a"), auto("b")], { ...KZT, remainderMemberId: "me" })))
      .toEqual({ me: 9910, a: 9910, b: 9910 });
  });

  test("плательщика нет среди покрытых — разница по 1 ₸ на человека", () => {
    const res = splitBill(100, [auto("a"), auto("b"), auto("c")], { ...KZT, remainderMemberId: "me" });
    expect(amounts(res)).toEqual({ a: 33, b: 33, c: 34 });
  });

  test("плательщику не хватает доли на разницу — остаток раскладывается на других", () => {
    const res = splitBill(5, Array.from({ length: 10 }, (_, i) => auto(i === 0 ? "me" : `p${i}`)), { ...KZT, remainderMemberId: "me" });
    expect(res.shares.every(s => s.amount >= 0)).toBe(true);
    expect(res.shares.reduce((s, x) => s + x.amount, 0)).toBe(5);
  });

  test("на фиксированную сумму плательщика разница не ложится", () => {
    const rows = [{ member_id: "me", heads: 1, mode: "fixed", value: 1000 }, auto("a"), auto("b")];
    expect(amounts(splitBill(1001, rows, { ...KZT, remainderMemberId: "me" }))).toEqual({ me: 1000, a: 0, b: 1 });
  });

  test("личная позиция плательщика не уменьшается разницей", () => {
    const res = splitBill(10, [auto("me", 1, 9), auto("a"), auto("b")], { ...KZT, remainderMemberId: "me" });
    expect(amounts(res).me).toBeGreaterThanOrEqual(9);
    expect(res.shares.reduce((s, x) => s + x.amount, 0)).toBe(10);
  });

  test("USD — вверх до центов", () => {
    expect(amounts(splitBill(10, [auto("me"), auto("a"), auto("b")], { precision: 2, remainderMemberId: "me" })))
      .toEqual({ me: 3.32, a: 3.34, b: 3.34 });
  });

  test("фиксы больше суммы — over_total с размером превышения", () => {
    const res = splitBill(5000, [{ member_id: "a", heads: 1, mode: "fixed", value: 6000 }, auto("b")], KZT);
    expect(res).toMatchObject({ valid: false, reason: "over_total", gap: 1000 });
  });

  test("все фикс, остаток не распределён — unallocated", () => {
    const res = splitBill(5000, [{ member_id: "a", heads: 1, mode: "fixed", value: 3000 }], KZT);
    expect(res).toMatchObject({ valid: false, reason: "unallocated", gap: 2000 });
  });

  test("пустой счёт и счёт без участников невалидны", () => {
    expect(splitBill(0, [auto("a")], KZT).reason).toBe("no_amount");
    expect(splitBill(100, [], KZT).reason).toBe("no_participants");
  });

  test("поля строки сохраняются для повторного открытия формы", () => {
    const res = splitBill(1000, [{ member_id: "a", heads: 2, mode: "auto", extra: 100, extra_note: "кальян" }], KZT);
    expect(res.shares[0]).toEqual({ member_id: "a", heads: 2, mode: "auto", extra: 100, extra_note: "кальян", amount: 1000 });
  });
});

describe("computeSplit («Оплатил за других»)", () => {
  const KZ = { precision: 0 };
  const others = res => Object.fromEntries(res.others.map(o => [o.id, o.amount]));

  test("поровну: чужие доли вверх, разница — моя", () => {
    const res = computeSplit(10000, [{ id: "a" }, { id: "b" }], "equal", KZ);
    expect(others(res)).toEqual({ a: 3334, b: 3334 });
    expect(res).toMatchObject({ me: 3332, valid: true });
  });

  test("поровну без меня: вся сумма на других, Σ ровно", () => {
    const res = computeSplit(10000, [{ id: "a" }, { id: "b" }, { id: "c" }], "equal", { ...KZ, meIncluded: false });
    expect(res.me).toBe(0);
    expect(res.others.reduce((s, o) => s + o.amount, 0)).toBe(10000);
  });

  test("доли: мой вес участвует в нормировке", () => {
    const res = computeSplit(9000, [{ id: "a", value: 2 }], "shares", { ...KZ, meValue: 1 });
    expect(others(res)).toEqual({ a: 6000 });
    expect(res.me).toBe(3000);
  });

  test("проценты должны сойтись к 100", () => {
    const ok = computeSplit(10000, [{ id: "a", value: 33.33 }, { id: "b", value: 33.33 }], "percent", { ...KZ, meValue: 33.34 });
    expect(ok.valid).toBe(true);
    expect(ok.me + ok.others.reduce((s, o) => s + o.amount, 0)).toBe(10000);

    const bad = computeSplit(10000, [{ id: "a", value: 30 }], "percent", { ...KZ, meValue: 50 });
    expect(bad).toMatchObject({ valid: false, reason: "unallocated", gap: 2000 });
    expect(others(bad)).toEqual({ a: 3000 }); // предпросмотр при вводе
  });

  test("суммами: моя доля — остаток, перебор — negative_share", () => {
    expect(computeSplit(10000, [{ id: "a", value: 4000 }], "exact", KZ)).toMatchObject({ me: 6000, valid: true });
    expect(computeSplit(10000, [{ id: "a", value: 12000 }], "exact", KZ))
      .toMatchObject({ valid: false, reason: "negative_share", gap: 2000 });
  });

  test("суммами без меня: должны покрыть всё", () => {
    expect(computeSplit(10000, [{ id: "a", value: 4000 }], "exact", { ...KZ, meIncluded: false }))
      .toMatchObject({ valid: false, reason: "unallocated", gap: 6000 });
  });

  test("нет участников", () => {
    expect(computeSplit(10000, [], "equal", KZ).reason).toBe("no_participants");
  });
});

describe("splitWithFees — доставка, сервис, комиссия поверх деления", () => {
  const amounts = (res, ids) => ids.map(id => res.shares.find(s => s.member_id === id).amount);

  test("заказы разные, доставка 1 500 поровну на троих", () => {
    // Счёт 11 500: Асан 4 000, Бек 3 000, я 3 000 + доставка 1 500
    const rows = [{ member_id: "me", heads: 1, mode: "fixed", value: 3000 }, { member_id: "asan", heads: 1, mode: "fixed", value: 4000 }, { member_id: "bek", heads: 1, mode: "fixed", value: 3000 }];
    const res = splitWithFees(11500, rows, [{ id: "d", title: "Доставка", amount: 1500, split: "equal" }], { remainderMemberId: "me", precision: 0 });
    expect(res.valid).toBe(true);
    expect(amounts(res, ["me", "asan", "bek"])).toEqual([3500, 4500, 3500]);
    expect(res.shares.map(s => s.fee)).toEqual([500, 500, 500]);
    expect(res).toMatchObject({ feesTotal: 1500, base: 10000 });
  });

  test("сервисный сбор пропорционально заказу; остаток округления — плательщику", () => {
    const rows = [{ member_id: "me", heads: 1, mode: "fixed", value: 2000 }, { member_id: "asan", heads: 1, mode: "fixed", value: 6000 }];
    const res = splitWithFees(8999, rows, [{ id: "s", title: "Сервис", amount: 999, split: "proportional" }], { remainderMemberId: "me", precision: 0 });
    expect(amounts(res, ["me", "asan"])).toEqual([2249, 6750]);   // 999 × ¼ = 249,75 → … Σ = 8 999 ровно
    expect(res.shares.reduce((s, x) => s + x.amount, 0)).toBe(8999);
  });

  test("доставка поровну по людям: компашка × 3 платит за троих", () => {
    const rows = [{ member_id: "me", heads: 1, mode: "auto" }, { member_id: "bek", heads: 3, mode: "auto" }];
    const res = splitWithFees(5000, rows, [{ id: "d", amount: 1000, split: "equal" }], { remainderMemberId: "me", precision: 0, feeHeads: { me: 1, bek: 3 } });
    expect(res.shares.map(s => s.fee)).toEqual([250, 750]);
  });

  test("сборы больше суммы — ошибка; без сборов — как splitBill", () => {
    expect(splitWithFees(1000, [{ member_id: "me", heads: 1, mode: "auto" }], [{ amount: 1500, split: "equal" }])).toMatchObject({ valid: false, reason: "fees_over_total", gap: 500 });
    const plain = splitWithFees(10000, [{ member_id: "me", heads: 1, mode: "auto" }, { member_id: "a", heads: 1, mode: "auto" }], [], { remainderMemberId: "me", precision: 0 });
    expect(plain.shares.map(s => [s.amount, s.fee])).toEqual([[5000, 0], [5000, 0]]);
  });

  test("сборы с копейками в тенге — Σ долей ровно равна счёту", () => {
    const rows = [{ member_id: "me", heads: 1, mode: "auto" }, { member_id: "a", heads: 1, mode: "auto" }];
    const res = splitWithFees(1001, rows, [{ amount: "100.5", split: "equal" }, { amount: "100.5", split: "equal" }], { remainderMemberId: "me", precision: 0 });
    expect(res.valid).toBe(true);
    expect(res.shares.reduce((s, x) => s + x.amount, 0)).toBe(1001);
  });
});
