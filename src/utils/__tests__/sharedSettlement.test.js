import { groupNets, settlementPlan, pairBalances, groupSettlement, pairBalanceOf, sortPlanRows } from "../sharedSettlement";
import { memberBalances, mirrorBalance, splitAdjustmentByBills } from "../sharedExpenses";
import { buildPeerTransferSave } from "../sharedTransferSave";

const P = { precision: 0 };
const ids = ["me", "asan", "bek", "dauren"];

const bill = (id, payer, amount, shares, extra = {}) =>
  ({ id, kind: "bill", date: "2026-10-03", payer_member_id: payer, amount, amount_group: amount, shares, ...extra });
const sh = (member_id, amount, heads = 1) => ({ member_id, amount, heads, mode: "auto" });
const transfer = (from, to, amount) =>
  ({ id: `t-${from}-${to}-${amount}`, kind: "transfer", from_member_id: from, to_member_id: to, amount, amount_group: amount });

// §5.8: ужин платил я, бильярд — Асан (за Бека тоже), такси — я, только компашке Бека.
const dinner = bill("dinner", "me", 36000, [sh("me", 6000), sh("asan", 6000), sh("bek", 18000, 3), sh("dauren", 6000)]);
const billiards = bill("billiards", "asan", 12000, [sh("me", 2400), sh("asan", 2400), sh("bek", 7200, 3)]);
const taxi = bill("taxi", "me", 4500, [sh("bek", 4500, 3)]);
const evening = [dinner, billiards, taxi];

const netsObj = nets => Object.fromEntries(nets);
const plan = (entries, opts = {}) => groupSettlement(entries, "me", { memberIds: ids, ...P, ...opts }).plan;

describe("groupNets", () => {
  test("§5.8: баланс каждого — заплатил минус его доля, Σ = 0", () => {
    const nets = groupNets(evening, "me", { memberIds: ids, ...P });
    expect(netsObj(nets)).toEqual({ me: 32100, asan: 3600, bek: -29700, dauren: -6000 });
    expect([...nets.values()].reduce((s, x) => s + x, 0)).toBe(0);
  });

  test("перевод и возврат: кто отдал деньги — в плюс, кто получил — в минус", () => {
    const refund = { ...bill("r", "me", 3000, [sh("me", 1000), sh("bek", 2000)]), kind: "refund" };
    const nets = groupNets([bill("b", "me", 6000, [sh("me", 3000), sh("bek", 3000)]), refund, transfer("bek", "me", 500)], "me", P);
    expect(netsObj(nets)).toEqual({ me: 500, bek: -500 });
  });

  test("корректировка (прощено) переносит долг участника в мою долю", () => {
    const forgive = { id: "a", kind: "adjust", member_id: "bek", amount_group: 1000, reason: "forgive" };
    expect(netsObj(groupNets([bill("b", "me", 2000, [sh("me", 1000), sh("bek", 1000)]), forgive], "me", P))).toEqual({ me: 0, bek: 0 });
  });

  test("Tricount: мой баланс = mirrorBalance, начальный баланс — поровну на остальных, Σ ровно 0", () => {
    const opening = { id: "o", kind: "opening", date: "2026-10-01", amount_group: -1001 };
    const entries = [opening, bill("pc", "dima", 3000, [sh("me", 1000), sh("dima", 1000), sh("erlan", 1000)])];
    const nets = groupNets(entries, "me", { memberIds: ["me", "dima", "erlan"], ...P });
    expect(nets.get("me")).toBe(mirrorBalance(entries, "me", P));
    expect(netsObj(nets)).toEqual({ me: -2001, dima: 2501, erlan: -500 }); // −1 001 → Диме 501, Ерлану 500
    expect([...nets.values()].reduce((s, x) => s + x, 0)).toBe(0);
  });
});

describe("settlementPlan", () => {
  test("§5.8: три перевода, долг Даурена частично уходит Асану", () => {
    expect(plan(evening)).toEqual([
      { from: "bek", to: "me", amount: 29700 },
      { from: "dauren", to: "asan", amount: 3600 },
      { from: "dauren", to: "me", amount: 2400 },
    ]);
  });

  test("равные суммы сводятся одним переводом", () => {
    const nets = new Map([["a", 100], ["b", 50], ["c", -50], ["d", -100]]);
    expect(settlementPlan(nets, "me", P)).toEqual([{ from: "d", to: "a", amount: 100 }, { from: "c", to: "b", amount: 50 }]);
  });

  test("план не зависит от порядка записей и участников", () => {
    const reversed = groupSettlement([...evening].reverse(), "me", { memberIds: [...ids].reverse(), ...P }).plan;
    expect(reversed).toEqual(plan(evening));
  });

  test("после перевода по плану между двумя другими он исчезает из плана, мои строки не меняются", () => {
    expect(plan([...evening, transfer("dauren", "asan", 3600)])).toEqual([
      { from: "bek", to: "me", amount: 29700 },
      { from: "dauren", to: "me", amount: 2400 },
    ]);
  });

  test("все рассчитались — план пуст; копейки округления не дают переводов", () => {
    expect(plan([...evening, transfer("bek", "me", 29700), transfer("dauren", "asan", 3600), transfer("dauren", "me", 2400)])).toEqual([]);
    expect(settlementPlan(new Map([["me", 0.004], ["a", -0.004]]), "me", { precision: 2 })).toEqual([]);
  });

  test("переводов не больше «участников с ненулевым балансом − 1»", () => {
    const nets = new Map([["a", 70], ["b", 30], ["c", -45], ["d", -35], ["e", -20]]);
    const p = settlementPlan(nets, "me", P);
    expect(p.length).toBeLessThanOrEqual(4);
    const after = new Map(nets);
    p.forEach(({ from, to, amount }) => { after.set(from, after.get(from) + amount); after.set(to, after.get(to) - amount); });
    expect([...after.values()].every(x => x === 0)).toBe(true);
  });
});

describe("мои строки плана", () => {
  test("pairBalances: + должен мне, − я должен", () => {
    expect(pairBalances([{ from: "bek", to: "me", amount: 10 }, { from: "me", to: "asan", amount: 4 }, { from: "x", to: "y", amount: 1 }], "me"))
      .toEqual({ bek: 10, asan: -4 });
  });

  test("pairBalanceOf совпадает с memberBalances", () => {
    const members = ids.map(id => ({ id, is_me: id === "me" }));
    const b = memberBalances(evening, members, P);
    ids.slice(1).forEach(id => expect(pairBalanceOf(evening, id, "me", P)).toBe(b[id].balance));
  });

  test("sortPlanRows: мои строки первыми, дальше по сумме", () => {
    expect(sortPlanRows(plan(evening), "me").map(r => `${r.from}>${r.to}`)).toEqual(["bek>me", "dauren>me", "dauren>asan"]);
  });
});

describe("корректировка долга, пришедшего упрощением", () => {
  test("прямых счетов со мной нет — делится по счетам, где он был в доле", () => {
    // Счетов, где платил я и был Бек, нет (долг пришёл упрощением) — по бильярду, где он был в доле.
    expect(splitAdjustmentByBills(2400, "forgive", [billiards], "bek", "me", P)).toEqual([{ bill_id: "billiards", amount: 2400 }]);
  });
});

describe("buildPeerTransferSave", () => {
  test("перевод между двумя другими — без счёта и транзакции", () => {
    const p = buildPeerTransferSave({ group: { id: "g1", currency: "KZT" }, fromId: "dauren", toId: "asan", amount: 3600, date: "2026-10-05", newId: () => "n1" });
    expect(p.entries).toEqual([expect.objectContaining({
      id: "n1", group_id: "g1", kind: "transfer", from_member_id: "dauren", to_member_id: "asan",
      amount: 3600, amount_group: 3600, currency: "KZT", method: "cash", account_id: null, transaction_id: null,
    })]);
    expect(p.tx).toBeUndefined();
  });
});
