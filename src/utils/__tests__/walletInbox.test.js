// «Входящие» Apple Pay (docs/apple-pay-inbox.md §6–§9): подсказки, валюта, сборка транзакции, дубли, пачка.
import {
  suggestForItem, itemCurrency, isForeign, estimateCharged, inboxNote, validateConfirm, buildInboxTx,
  findInboxMatches, isPossibleRepeat, groupByDay, bulkReady, buildBulk, inboxErrorText, lastSignalText, fmtInboxAmount,
} from "../walletInbox";
import { txDelta, newTxRpcParams } from "../txSave";

const kaspi = { id: "kaspi", name: "Kaspi", currency: "KZT", balance: 10000 };
const usd = { id: "usd", name: "Freedom $", currency: "USD", balance: 100, avg_rate: 500 };
const accounts = [kaspi, usd];
const expCats = [{ id: "food", name: "Продукты" }, { id: "cafe", name: "Кафе" }];
const cards = [{ card_label: "Kaspi Gold", account_id: "kaspi" }, { card_label: "Old", account_id: "deleted" }];
const merchants = [{ merchant_key: "magnum", category_id: "food" }, { merchant_key: "gone", category_id: "deleted" }];
const ctx = { cards, merchants, accounts, expCats, transactions: [] };
// 19:05 по Алматы — 14:05 UTC; дата транзакции — местная (тесты идут в поясе машины, поэтому
// время выбрано так, чтобы день совпадал в любом поясе от UTC−9 до UTC+9).
const item = (over = {}) => ({ id: "in1", amount: 2500, currency: "KZT", merchant: "MAGNUM", merchant_key: "magnum",
  card_label: "Kaspi Gold", occurred_at: "2026-11-24T12:00:00Z", ...over });

describe("подсказки", () => {
  test("счёт по карте, категория по продавцу", () => {
    expect(suggestForItem(item(), ctx)).toEqual({ accountId: "kaspi", categoryId: "food" });
  });
  test("неизвестные карта и продавец — пусто", () => {
    expect(suggestForItem(item({ card_label: "Halyk", merchant_key: "small" }), ctx)).toEqual({ accountId: "", categoryId: "" });
  });
  test("правило на удалённый счёт/категорию не подставляется", () => {
    expect(suggestForItem(item({ card_label: "Old", merchant_key: "gone" }), ctx)).toEqual({ accountId: "", categoryId: "" });
  });
  test("пустые ключи не совпадают с пустыми правилами", () => {
    expect(suggestForItem(item({ card_label: "", merchant_key: "" }), { ...ctx, cards: [{ card_label: "", account_id: "kaspi" }] }).accountId).toBe("");
  });
});

describe("валюта", () => {
  test("валюта не пришла — как у счёта, не валютная", () => {
    expect(itemCurrency(item({ currency: null }), kaspi)).toBe("KZT");
    expect(isForeign(item({ currency: null }), kaspi)).toBe(false);
  });
  test("доллары с тенгового счёта — валютная", () => {
    expect(isForeign(item({ currency: "USD" }), kaspi)).toBe(true);
    expect(isForeign(item({ currency: "USD" }), usd)).toBe(false);
    expect(isForeign(item({ currency: "USD" }), null)).toBe(false);
  });
  test("≈ по курсу счёта, с точностью валюты счёта", () => {
    expect(estimateCharged(item({ amount: 12.99, currency: "USD" }), kaspi, { USD: 500 })).toBe(6495);
    expect(estimateCharged(item({ amount: 1000, currency: "KZT" }), usd, { USD: 480 })).toBe(2.08);
  });
  test("заметка: продавец; у валютной — исходная сумма", () => {
    expect(inboxNote(item(), kaspi)).toBe("MAGNUM");
    expect(inboxNote(item({ merchant: "Apple", amount: 12.99, currency: "USD" }), kaspi)).toBe("Apple · $12.99");
    expect(inboxNote(item({ merchant: "" }), kaspi)).toBe("");
  });
  test("fmtInboxAmount без валюты — без символа", () => {
    expect(fmtInboxAmount(2500, null)).toBe("2 500");
    expect(fmtInboxAmount(2500, "KZT")).toBe("₸2 500");
  });
});

describe("проверка и сборка транзакции", () => {
  test("обычная: сумма, счёт, категория", () => {
    expect(validateConfirm({ item: item(), account: null, categoryId: "", amount: "", charged: "" }))
      .toEqual({ account: "Выберите счёт", category: "Выберите категорию", amount: "Введите сумму" });
    expect(validateConfirm({ item: item(), account: kaspi, categoryId: "food", amount: "2500", charged: "" })).toEqual({});
  });
  test("валютная: обязательно «Списалось со счёта», сумма покупки не проверяется", () => {
    const it = item({ amount: 12.99, currency: "USD" });
    expect(validateConfirm({ item: it, account: kaspi, categoryId: "food", amount: "", charged: "" })).toEqual({ charged: "Сколько списалось со счёта" });
    expect(validateConfirm({ item: it, account: kaspi, categoryId: "food", amount: "", charged: "6600" })).toEqual({});
  });
  test("транзакция — в валюте счёта, с местной датой и wallet_inbox_id", () => {
    expect(buildInboxTx({ id: "t1", item: item(), account: kaspi, categoryId: "food", amount: "2400", charged: "" })).toEqual({
      id: "t1", type: "expense", amount: 2400, currency: "KZT", category_id: "food", account_id: "kaspi",
      date: "2026-11-24", note: "MAGNUM", wallet_inbox_id: "in1",
    });
    const fx = buildInboxTx({ id: "t2", item: item({ merchant: "Apple", amount: 12.99, currency: "USD" }), account: kaspi, categoryId: "food", amount: "12.99", charged: "6600" });
    expect(fx).toMatchObject({ amount: 6600, currency: "KZT", note: "Apple · $12.99" });
  });
  test("баланс новой транзакции — тот же расчёт, что в TxPage", () => {
    expect(txDelta("expense", "2500")).toBe(-2500);
    expect(txDelta("income", 100)).toBe(100);
    expect(newTxRpcParams({ type: "expense", amount: 0.1 }, { id: "a", balance: 0.3 }).p_new_balance).toBe(0.2);
  });
});

describe("дубли", () => {
  const tx = (over = {}) => ({ id: "t", type: "expense", amount: 2500, account_id: "kaspi", date: "2026-11-24", ...over });
  test("уже введённый вручную — тот же счёт, сумма, ±1 день; ближайший первым", () => {
    const list = [tx({ id: "far", date: "2026-11-23" }), tx({ id: "same" }), tx({ id: "other-acc", account_id: "usd" }),
      tx({ id: "linked", wallet_inbox_id: "x" }), tx({ id: "income", type: "income" }), tx({ id: "old", date: "2026-11-21" }),
      tx({ id: "virtual", virtual: true }), tx({ id: "diff", amount: 2501 })];
    expect(findInboxMatches(item(), list, kaspi).map(t => t.id)).toEqual(["same", "far"]);
  });
  test("без суммы, без счёта и валютная — не сравниваются", () => {
    expect(findInboxMatches(item({ amount: null }), [tx()], kaspi)).toEqual([]);
    expect(findInboxMatches(item(), [tx()], null)).toEqual([]);
    expect(findInboxMatches(item({ currency: "USD" }), [tx()], kaspi)).toEqual([]);
  });
  test("повтор команды: та же карта/сумма/продавец в пределах 2 минут — помечается только второй", () => {
    const a = item({ id: "a", occurred_at: "2026-11-24T12:00:00Z" });
    const b = item({ id: "b", occurred_at: "2026-11-24T12:01:00Z" });
    const c = item({ id: "c", occurred_at: "2026-11-24T12:10:00Z" });
    const list = [a, b, c];
    expect([a, b, c].map(x => isPossibleRepeat(x, list))).toEqual([false, true, false]);
  });
  test("одинаковое время — повтором считается одна из двух", () => {
    const a = item({ id: "a" }), b = item({ id: "b" });
    expect([isPossibleRepeat(a, [a, b]), isPossibleRepeat(b, [a, b])]).toEqual([false, true]);
  });
  test("другая сумма или валюта — не повтор", () => {
    const a = item({ id: "a" });
    expect(isPossibleRepeat(item({ id: "b", amount: 900 }), [a, item({ id: "b", amount: 900 })])).toBe(false);
    expect(isPossibleRepeat(item({ id: "c", currency: "USD" }), [a, item({ id: "c", currency: "USD" })])).toBe(false);
  });
});

describe("группировка и пачка", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-24T15:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  test("по дням, новые сверху", () => {
    const groups = groupByDay([item({ id: "old", occurred_at: "2026-11-22T12:00:00Z" }), item({ id: "a" }), item({ id: "b", occurred_at: "2026-11-24T13:00:00Z" })]);
    expect(groups.map(g => [g.label, g.items.map(i => i.id)])).toEqual([["Сегодня", ["b", "a"]], ["22 ноября", ["old"]]]);
  });

  test("в пачку — только то, что подтвердили бы без правок", () => {
    const items = [
      item({ id: "ok" }),
      item({ id: "no-amount", amount: null, occurred_at: "2026-11-24T11:00:00Z" }),
      item({ id: "no-card", card_label: "Halyk", occurred_at: "2026-11-24T11:10:00Z" }),
      item({ id: "no-cat", merchant: "Small", merchant_key: "small", occurred_at: "2026-11-24T11:20:00Z" }),
      item({ id: "fx", currency: "USD", occurred_at: "2026-11-24T11:30:00Z" }),
      item({ id: "rep", occurred_at: "2026-11-24T12:00:30Z" }),   // повтор «ok»
      item({ id: "manual", amount: 900, occurred_at: "2026-11-24T10:00:00Z" }),
    ];
    const withManual = { ...ctx, transactions: [{ id: "t", type: "expense", amount: 900, account_id: "kaspi", date: "2026-11-24" }] };
    expect(bulkReady(items, withManual).map(i => i.id)).toEqual(["ok"]);
  });

  test("балансы в пачке — накопительно по счёту", () => {
    let n = 0;
    const plan = buildBulk([item({ id: "a", amount: 1000 }), item({ id: "b", amount: 500.5 })], ctx, () => `t${++n}`);
    expect(plan.map(p => [p.tx.id, p.tx.wallet_inbox_id, p.params.p_account_id, p.params.p_new_balance]))
      .toEqual([["t1", "a", "kaspi", 9000], ["t2", "b", "kaspi", 8499.5]]);
  });

  test("последний сигнал ключа", () => {
    const now = new Date();
    expect(lastSignalText(null, now)).toBe("сигнала ещё не было");
    expect(lastSignalText("2026-11-24T14:59:40Z", now)).toBe("сигнал только что");
    expect(lastSignalText("2026-11-24T14:55:00Z", now)).toBe("сигнал 5 минут назад");
    expect(lastSignalText("2026-11-24T13:00:00Z", now)).toBe("сигнал 2 часа назад");
    expect(lastSignalText("2026-11-20T12:00:00Z", now)).toBe("сигнал 20 ноября");
  });
});

describe("тексты ошибок", () => {
  test.each([
    [{ message: "inbox_already_resolved" }, "Эта покупка уже записана — список обновлён"],
    [{ code: "23505", message: 'duplicate key value violates unique constraint "transactions_wallet_inbox_id_key"' }, "Эта покупка уже записана — список обновлён"],
    [{ message: "tx_not_linkable" }, "Этот расход уже связан с другой покупкой"],
    [{ message: "network" }, "Не удалось"],
  ])("%j", (e, text) => {
    expect(inboxErrorText(e, "Не удалось")).toBe(text);
  });
});
