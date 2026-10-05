import { newMirrorGroup, billAmounts, balanceUpdates, buildBillSave, buildEntryDelete, sharedTxNote } from "../sharedSave";
import { linkableTransactions, transferCandidates, buildBatchTransferSave, defaultBatchParts, buildTransferSave, buildTreatSave, transferClosing } from "../sharedTransferSave";
import { regroupAmounts, buildArchiveSave, groupDeletionImpact, buildGroupDelete, buildGroupSettingsSave, buildGuestToPersonSave } from "../sharedGroupSave";
import { tricountTargets, buildMoveToTricountSave, mirrorShare, openingSave, buildMirrorGroupSave, buildReconcileSave, shiftMonth, buildRepeatSave } from "../sharedMirrorSave";
import { memberBalances, mirrorBalance } from "../sharedExpenses";

const accounts = [
  { id: "kaspi", currency: "KZT", balance: 100000 },
  { id: "cash", currency: "KZT", balance: 5000 },
];
const group = { id: "g1", name: "Вечер 03.10", currency: "KZT" };
const shares = [{ member_id: "me", amount: 9910 }, { member_id: "asan", amount: 9910 }, { member_id: "bek", amount: 9910 }];
const form = (extra = {}) => ({ title: "Ужин", date: "2026-10-03", amount: 29730, accountId: "kaspi", categoryId: "rest", shares, ...extra });
let seq;
const newId = () => `id${++seq}`;
beforeEach(() => { seq = 0; });

describe("balanceUpdates", () => {
  test("новый расход списывает со счёта", () => {
    expect(balanceUpdates(accounts, { newTx: { account_id: "kaspi", type: "expense", amount: 29730 } }))
      .toEqual([{ account_id: "kaspi", balance: 70270, delta: -29730 }]);
  });

  test("смена суммы на том же счёте — один итоговый баланс", () => {
    const old = { account_id: "kaspi", type: "expense", amount: 29730 };
    expect(balanceUpdates([{ ...accounts[0], balance: 70270 }, accounts[1]], { oldTx: old, newTx: { ...old, amount: 30000 } }))
      .toEqual([{ account_id: "kaspi", balance: 70000, delta: -270 }]);
  });

  test("смена счёта: старому возврат, новому списание", () => {
    const res = balanceUpdates(accounts, { oldTx: { account_id: "kaspi", type: "expense", amount: 1000 }, newTx: { account_id: "cash", type: "expense", amount: 1000 } });
    expect(res).toEqual([{ account_id: "kaspi", balance: 101000, delta: 1000 }, { account_id: "cash", balance: 4000, delta: -1000 }]);
  });

  test("удалённый счёт и нулевое изменение не пишутся", () => {
    expect(balanceUpdates(accounts, { oldTx: { account_id: "gone", type: "expense", amount: 1 } })).toEqual([]);
    const same = { account_id: "kaspi", type: "expense", amount: 5 };
    expect(balanceUpdates(accounts, { oldTx: same, newTx: same })).toEqual([]);
  });
});

describe("buildBillSave — платил участник (этап 7)", () => {
  const hisShares = [{ member_id: "me", amount: 2400 }, { member_id: "asan", amount: 9600 }];
  const hisForm = (extra = {}) => form({ amount: 12000, payerId: "asan", shares: hisShares, ...extra });

  test("§5.7: без транзакции и счёта, даже если счёт был выбран", () => {
    const p = buildBillSave({ form: hisForm(), group, meId: "me", accounts, transactions: [], newId });
    expect(p.tx).toBe(null);
    expect(p.balances).toEqual([]);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]).toMatchObject({ payer_member_id: "asan", account_id: null, account_amount: null, transaction_id: null });
  });

  test("§14: правка «я платил → не я» — транзакция удаляется, деньги возвращаются", () => {
    const tx = { id: "t1", type: "expense", amount: 12000, account_id: "kaspi" };
    const p = buildBillSave({ form: hisForm(), group, meId: "me", edit: { id: "b1", transaction_id: "t1", payer_member_id: "me" },
      accounts: [{ ...accounts[0], balance: 88000 }], transactions: [tx], newId });
    expect(p.tx_delete_id).toBe("t1");
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 100000, delta: 12000 }]);
  });

  test("§5.12: платил друг 8 500 + «Угостили меня» — счёт и treated_me −8 500 одним вызовом", () => {
    const members = [{ id: "me", is_me: true }, { id: "asan", guest_name: "Асан" }];
    const p = buildBillSave({ form: form({ amount: 8500, payerId: "asan", treatedMe: true, shares: [{ member_id: "me", amount: 8500 }] }),
      group, isNewGroup: true, members, meId: "me", accounts, transactions: [], newId });
    const [b, adj] = p.entries;
    expect(b).toMatchObject({ kind: "bill", payer_member_id: "asan", amount: 8500 });
    expect(adj).toMatchObject({ kind: "adjust", reason: "treated_me", member_id: "asan", bill_id: b.id, amount_group: -8500, transfer_id: null, date: "2026-10-03" });
  });

  test("правка: старое «угостили меня» заменяется; галку сняли — только удаляется", () => {
    const edit = { id: "b1", payer_member_id: "asan" };
    const old = { id: "a1", kind: "adjust", reason: "treated_me", bill_id: "b1", transfer_id: null };
    const fromTransfer = { id: "a2", kind: "adjust", reason: "treated_me", bill_id: "b1", transfer_id: "t1" };
    const on = buildBillSave({ form: hisForm({ treatedMe: true }), group, meId: "me", edit, entries: [old, fromTransfer], accounts, transactions: [], newId });
    expect(on.delete_entry_ids).toEqual(["a1"]);
    expect(on.entries[1]).toMatchObject({ reason: "treated_me", amount_group: -2400 });
    const off = buildBillSave({ form: hisForm(), group, meId: "me", edit, entries: [old], accounts, transactions: [], newId });
    expect(off.delete_entry_ids).toEqual(["a1"]);
    expect(off.entries).toHaveLength(1);
  });

  test("«угостили меня» при моей оплате не пишется", () => {
    expect(buildBillSave({ form: form({ treatedMe: true }), group, meId: "me", accounts, transactions: [], newId }).entries).toHaveLength(1);
  });
});

describe("buildGuestToPersonSave", () => {
  test("новый человек и выбранные участники — person_id вместо имени гостя", () => {
    const person = { id: "p1", name: "Асан" };
    const p = buildGuestToPersonSave({ person, personId: "p1", members: [{ id: "a1", group_id: "g1", guest_name: "Асан", heads: 1 }] });
    expect(p).toEqual({ people: [person], members: [{ id: "a1", group_id: "g1", guest_name: null, person_id: "p1", heads: 1 }], entries: [] });
    expect(buildGuestToPersonSave({ personId: "p0", members: [] }).people).toEqual([]);
  });
});

describe("buildBillSave", () => {
  test("новый вечер: группа, участники, транзакция и счёт одним вызовом", () => {
    const members = [{ id: "me", is_me: true }, { id: "asan" }, { id: "bek" }];
    const p = buildBillSave({ form: form(), group, isNewGroup: true, members, meId: "me", accounts, transactions: [], newId });
    expect(p.group).toBe(group);
    expect(p.members).toBe(members);
    expect(p.tx).toMatchObject({ type: "expense", amount: 29730, currency: "KZT", category_id: "rest", account_id: "kaspi", note: sharedTxNote("Ужин", "Вечер 03.10") });
    expect(p.entries[0]).toMatchObject({ kind: "bill", amount: 29730, amount_group: 29730, account_amount: 29730, payer_member_id: "me", transaction_id: p.tx.id, account_id: "kaspi", shares });
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 70270, delta: -29730 }]);
    expect(p.tx_delete_id).toBe(null);
  });

  test("без счёта (наличные мимо учёта) — без транзакции и балансов", () => {
    const p = buildBillSave({ form: form({ accountId: "" }), group, isNewGroup: false, meId: "me", accounts, transactions: [], newId });
    expect(p.tx).toBe(null);
    expect(p.entries[0]).toMatchObject({ account_id: null, transaction_id: null, account_amount: null });
    expect(p.balances).toEqual([]);
    expect(p.group).toBe(null);
  });

  test("правка: та же транзакция обновляется, поля вне формы сохраняются", () => {
    const tx = { id: "t1", type: "expense", amount: 29730, account_id: "kaspi" };
    const edit = { id: "b1", group_id: "g1", kind: "bill", transaction_id: "t1", account_id: "kaspi", note: "заметка", created_at: "x" };
    const p = buildBillSave({ form: form({ amount: 30000 }), group, meId: "me", edit, accounts: [{ ...accounts[0], balance: 70270 }], transactions: [tx], newId });
    expect(p.tx.id).toBe("t1");
    expect(p.entries[0]).toMatchObject({ id: "b1", note: "заметка", amount: 30000 });
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 70000, delta: -270 }]);
  });

  test("правка «со счёта → без счёта»: транзакция удаляется, деньги возвращаются", () => {
    const tx = { id: "t1", type: "expense", amount: 29730, account_id: "kaspi" };
    const p = buildBillSave({ form: form({ accountId: "" }), group, meId: "me", edit: { id: "b1", transaction_id: "t1" },
      accounts: [{ ...accounts[0], balance: 70270 }], transactions: [tx], newId });
    expect(p.tx).toBe(null);
    expect(p.tx_delete_id).toBe("t1");
    expect(p.entries[0].transaction_id).toBe(null);
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 100000, delta: 29730 }]);
  });

  test("необязательный «весь счёт» пишется только если указан", () => {
    expect(buildBillSave({ form: form({ venueTotal: "120000" }), group, meId: "me", accounts, transactions: [], newId }).entries[0].venue_total).toBe(120000);
    expect(buildBillSave({ form: form({ venueTotal: "" }), group, meId: "me", accounts, transactions: [], newId }).entries[0].venue_total).toBe(null);
  });
});

describe("buildEntryDelete", () => {
  test("удаление счёта возвращает деньги на счёт", () => {
    const tx = { id: "t1", type: "expense", amount: 29730, account_id: "kaspi" };
    expect(buildEntryDelete({ entry: { id: "b1", transaction_id: "t1" }, accounts: [{ ...accounts[0], balance: 70270 }], transactions: [tx] }))
      .toMatchObject({ id: "b1", ids: [], tx_delete_id: "t1", tx_restore: null, balances: [{ account_id: "kaspi", balance: 100000 }] });
  });
});

describe("buildTransferSave / buildTreatSave", () => {
  const bill = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "me", amount: 29730, amount_group: 29730,
    shares: [{ member_id: "me", amount: 9910 }, { member_id: "asan", amount: 9910 }, { member_id: "bek", amount: 9910 }] };
  const asan = { id: "asan", guest_name: "Асан", person_id: null };
  const base = (extra = {}) => ({ group, meId: "me", member: asan, memberName: "Асан", entries: [bill], accounts, transactions: [], newId, precision: 0, ...extra });
  const tform = (extra = {}) => ({ direction: "in", amount: 10000, accountId: "kaspi", date: "2026-10-04", ...extra });

  test("§5.2: Асан прислал 10 000 — доход без категории + округление −90 на ужин", () => {
    const p = buildTransferSave({ ...base(), form: tform() });
    expect(p.tx).toMatchObject({ type: "income", amount: 10000, category_id: null, note: "Перевод · Вечер 03.10 ← Асан" });
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 110000, delta: 10000 }]);
    const [t, adj] = p.entries;
    expect(t).toMatchObject({ kind: "transfer", from_member_id: "asan", to_member_id: "me", method: "account", sender_name: "Асан", amount_group: 10000 });
    expect(adj).toMatchObject({ kind: "adjust", reason: "rounding", amount_group: -90, bill_id: "b1", transfer_id: t.id, member_id: "asan" });
  });

  test("переплата — всегда округление, даже если пришёл старый вариант «я должен ему»; наличные — без транзакции", () => {
    const p = buildTransferSave({ ...base(), form: tform({ optionId: "owe_them", accountId: "" }) });
    expect(p.entries).toHaveLength(2);
    expect(p.entries[1]).toMatchObject({ reason: "rounding", amount_group: -90 });
    expect(p.entries[0].method).toBe("cash");
    expect(p.tx).toBe(null);
    expect(p.balances).toEqual([]);
  });

  test("недоплата: по умолчанию долг остаётся, «простить» — forgive +410", () => {
    expect(buildTransferSave({ ...base(), form: tform({ amount: 9500 }) }).entries).toHaveLength(1);
    const p = buildTransferSave({ ...base(), form: tform({ amount: 9500, optionId: "forgive" }) });
    expect(p.entries[1]).toMatchObject({ reason: "forgive", amount_group: 410 });
  });

  test("правка перевода: долг считается без него, старые корректировки заменяются", () => {
    const old = { id: "t1", group_id: "g1", kind: "transfer", from_member_id: "asan", to_member_id: "me", amount: 10000, amount_group: 10000, transaction_id: "tx1", account_id: "kaspi" };
    const oldAdj = { id: "a1", kind: "adjust", member_id: "asan", reason: "rounding", amount_group: -90, bill_id: "b1", transfer_id: "t1" };
    const p = buildTransferSave({ ...base({ entries: [bill, old, oldAdj], edit: old,
      accounts: [{ ...accounts[0], balance: 110000 }], transactions: [{ id: "tx1", type: "income", amount: 10000, account_id: "kaspi" }] }),
      form: tform({ amount: 9910 }) });
    expect(p.delete_entry_ids).toEqual(["a1"]);
    expect(p.entries).toHaveLength(1);           // ровно — без корректировки
    expect(p.entries[0].id).toBe("t1");
    expect(p.tx.id).toBe("tx1");
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 109910, delta: -90 }]);
  });

  test("я возвращаю Асану меньше — «хватит» treated_me −400 на его счёт", () => {
    const hisBill = { id: "bil", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "asan", amount: 12000, amount_group: 12000,
      shares: [{ member_id: "me", amount: 2400 }, { member_id: "asan", amount: 9600 }] };
    const p = buildTransferSave({ ...base({ entries: [hisBill] }), form: tform({ direction: "out", amount: 2000, optionId: "enough" }) });
    expect(p.tx).toMatchObject({ type: "expense", note: "Перевод · Вечер 03.10 → Асан" });
    expect(p.entries[0]).toMatchObject({ from_member_id: "me", to_member_id: "asan" });
    expect(p.entries[1]).toMatchObject({ reason: "treated_me", amount_group: -400, bill_id: "bil" });
  });

  test("§5.10: отправитель — не контакт: другой человек или «без имени»", () => {
    const other = buildTransferSave({ ...base(), form: tform({ sender: { personId: "p-danir", name: "Данир" } }) });
    expect(other.entries[0]).toMatchObject({ sender_person_id: "p-danir", sender_name: null });
    const none = buildTransferSave({ ...base(), form: tform({ sender: { personId: null, name: "  " } }) });
    expect(none.entries[0]).toMatchObject({ sender_person_id: null, sender_name: null });
  });

  test("§5.15: аванс до счёта — без вариантов закрытия", () => {
    expect(transferClosing({ entries: [], memberId: "asan", meId: "me", amount: 10000, direction: "in", precision: 0 }))
      .toMatchObject({ debt: 0, status: "advance", options: [] });
  });

  test("угощаю: весь долг одной пачкой по счетам", () => {
    const p = buildTreatSave({ group, memberId: "bek", meId: "me", entries: [bill], date: "2026-10-04", newId, precision: 0 });
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]).toMatchObject({ reason: "treat", amount_group: 9910, bill_id: "b1", batch_id: expect.any(String), transfer_id: null });
    expect(buildTreatSave({ group, memberId: "bek", meId: "me", entries: [], date: "2026-10-04", newId })).toBe(null);
  });
});

describe("управление группой (этап 8)", () => {
  // Вечер §5.2: ужин 29 730 оплатил я с Kaspi, Асан вернул 10 000 (округление −90), Бек должен 9 910.
  const g = { id: "g1", name: "Вечер 03.10", currency: "KZT", date: "2026-10-03", archived: false };
  const ms = [{ id: "me", group_id: "g1", is_me: true }, { id: "asan", group_id: "g1", guest_name: "Асан" }, { id: "bek", group_id: "g1", guest_name: "Бек" }];
  const sh3 = [{ member_id: "me", amount: 9910 }, { member_id: "asan", amount: 9910 }, { member_id: "bek", amount: 9910 }];
  const dinner = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "me", amount: 29730, amount_group: 29730, category_id: "rest", shares: sh3, transaction_id: "tx1", account_id: "kaspi" };
  const tr = { id: "t1", group_id: "g1", kind: "transfer", date: "2026-10-04", from_member_id: "asan", to_member_id: "me", amount: 10000, amount_group: 10000, transaction_id: "tx2", account_id: "kaspi" };
  const adj = { id: "a1", group_id: "g1", kind: "adjust", date: "2026-10-04", member_id: "asan", reason: "rounding", amount_group: -90, bill_id: "b1", transfer_id: "t1" };
  const txs = [
    { id: "tx1", type: "expense", amount: 29730, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-03" },
    { id: "tx2", type: "income", amount: 10000, currency: "KZT", category_id: null, account_id: "kaspi", date: "2026-10-04" },
    { id: "tx3", type: "expense", amount: 500, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-04" },
  ];
  const data = { groups: [g], members: ms, entries: [dinner, tr, adj], transactions: txs, accounts: [{ id: "kaspi", currency: "KZT", balance: 80270 }] };

  test("§7.6: что связано с группой и как изменится аналитика в двух вариантах", () => {
    const imp = groupDeletionImpact(g, data);
    expect(imp.counts).toEqual({ bills: 1, transfers: 1, adjusts: 1 });
    expect(imp.txIds).toEqual(["tx1", "tx2"]);
    expect(imp.accountMoves).toEqual([{ account_id: "kaspi", currency: "KZT", out: 29730, in: 10000 }]);
    expect(imp.balancesIfDelete).toEqual([{ account_id: "kaspi", balance: 100000, delta: 19730 }]);
    expect(imp.openDebts.map(d => [d.member.id, d.balance])).toEqual([["bek", 9910]]);
    expect(imp.hasLinked).toBe(true);
    // Оставить операции: «Рестораны» возвращаются к полной сумме (9 820 → 29 730)
    expect(imp.analytics.keep).toEqual([{ type: "expense", category_id: "rest", currency: "KZT", delta: 19910 }]);
    // Удалить вместе с операциями: моя доля 9 820 пропадает
    expect(imp.analytics.remove).toEqual([{ type: "expense", category_id: "rest", currency: "KZT", delta: -9820 }]);
  });

  test("без операций на счетах — hasLinked false, удаление без транзакций", () => {
    const cashOnly = { ...dinner, transaction_id: null, account_id: null };
    const imp = groupDeletionImpact(g, { ...data, entries: [cashOnly], transactions: [] });
    expect(imp.hasLinked).toBe(false);
    expect(buildGroupDelete({ group: g, impact: imp, keepTransactions: false })).toEqual({ group_id: "g1", tx_delete_ids: [], tx_restore: [], balances: [] });
  });

  test("удаление: оставить операции — без транзакций и балансов; удалить — с откатом", () => {
    const imp = groupDeletionImpact(g, data);
    expect(buildGroupDelete({ group: g, impact: imp, keepTransactions: true })).toEqual({ group_id: "g1", tx_delete_ids: [], tx_restore: [], balances: [] });
    expect(buildGroupDelete({ group: g, impact: imp, keepTransactions: false }))
      .toEqual({ group_id: "g1", tx_delete_ids: ["tx1", "tx2"], tx_restore: [], balances: [{ account_id: "kaspi", balance: 100000, delta: 19730 }] });
  });

  test("привязанная ранее транзакция (§5.13) не удаляется с группой — ей возвращаются категория и заметка", () => {
    const linkedTr = { ...tr, linked_tx_snapshot: { category_id: "salary", note: "от Асана" } };
    const txsLinked = txs.map(t => (t.id === "tx2" ? { ...t, note: "Перевод · Вечер 03.10 ← Асан · от Асана" } : t));
    const imp = groupDeletionImpact(g, { ...data, entries: [dinner, linkedTr, adj], transactions: txsLinked });
    expect(imp.txIds).toEqual(["tx1"]);
    expect(imp.txRestore).toEqual([{ id: "tx2", category_id: "salary", note: "от Асана" }]);
    expect(imp.balancesIfDelete).toEqual([{ account_id: "kaspi", balance: 110000, delta: 29730 }]);
    // доход «Зарплата» возвращается в статистику в обоих вариантах
    expect(imp.analytics.keep).toContainEqual({ type: "income", category_id: "salary", currency: "KZT", delta: 10000 });
    expect(imp.analytics.remove).toContainEqual({ type: "income", category_id: "salary", currency: "KZT", delta: 10000 });
    expect(buildGroupDelete({ group: g, impact: imp, keepTransactions: false }))
      .toMatchObject({ tx_delete_ids: ["tx1"], tx_restore: [{ id: "tx2", category_id: "salary", note: "от Асана" }] });
  });

  test("в архив: с прощением — «угощаю» только тем, кто должен мне", () => {
    const hisBill = { id: "b2", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "asan", amount: 1000, amount_group: 1000, shares: [{ member_id: "me", amount: 1000 }] };
    const entries = [dinner, tr, adj, hisBill];
    const p = buildArchiveSave({ group: g, members: ms, entries, forgive: true, date: "2026-10-05", newId, precision: 0 });
    expect(p.group).toMatchObject({ id: "g1", archived: true });
    expect(p.entries).toEqual([expect.objectContaining({ reason: "treat", member_id: "bek", amount_group: 9910 })]); // Асану я должен 1 000 — не прощается
    expect(buildArchiveSave({ group: g, members: ms, entries, date: "2026-10-05", newId }).entries).toEqual([]);
    expect(buildArchiveSave({ group: { ...g, archived: true }, members: ms, entries, archived: false, forgive: true, newId }).entries).toEqual([]);
  });

  test("настройки и участники одним вызовом", () => {
    expect(buildGroupSettingsSave({ group: g, groupId: "g1", members: [ms[1]], deleteIds: ["bek"] }))
      .toEqual({ group_id: "g1", group: g, members: [ms[1]], delete_member_ids: ["bek"], entries: [], delete_entry_ids: [] });
  });
});

describe("этап 9: валюта, привязка, пачки", () => {
  const rates = { TRY: 15.7, USD: 500 };
  const kaspi = { id: "kaspi", currency: "KZT", balance: 100000 };
  const usdCard = { id: "usd", currency: "USD", balance: 1000 };

  describe("billAmounts — §5.18", () => {
    test("ужин 3 000 TRY с тенговой карты: группа в KZT берёт реально списанное", () => {
      expect(billAmounts({ amount: 3000, currency: "TRY", accountAmount: "47300", account: kaspi, groupCurrency: "KZT", rates }))
        .toEqual({ amount: 3000, accountAmount: 47300, amountGroup: 47300, needsAccountAmount: true, estimate: 47100 });
    });
    test("та же валюта — списано столько же; платил участник — по курсу", () => {
      expect(billAmounts({ amount: 5000, currency: "KZT", account: kaspi, groupCurrency: "KZT", rates }))
        .toMatchObject({ accountAmount: 5000, amountGroup: 5000, needsAccountAmount: false });
      expect(billAmounts({ amount: 3000, currency: "TRY", groupCurrency: "KZT", rates }))
        .toMatchObject({ accountAmount: null, amountGroup: 47100 });
      expect(billAmounts({ amount: 3000, currency: "TRY", account: usdCard, accountAmount: "95", groupCurrency: "KZT", rates }))
        .toMatchObject({ accountAmount: 95, amountGroup: 47100 }); // ни счёт, ни чек не в валюте группы — по курсу
    });
  });

  test("§5.18: счёт в лирах — транзакция в тенге по факту, доли в лирах, долг в тенге", () => {
    const shares2 = [{ member_id: "me", amount: 1500 }, { member_id: "bek", amount: 1500 }];
    const p = buildBillSave({ form: form({ amount: 3000, currency: "TRY", accountAmount: 47300, amountGroup: 47300, shares: shares2 }),
      group, meId: "me", accounts: [kaspi], transactions: [], newId });
    expect(p.tx).toMatchObject({ amount: 47300, currency: "KZT" });
    expect(p.entries[0]).toMatchObject({ currency: "TRY", amount: 3000, account_amount: 47300, amount_group: 47300, shares: shares2 });
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 52700, delta: -47300 }]);
  });

  test("«угостили меня» в чужой валюте — корректировка в валюте группы", () => {
    const p = buildBillSave({ form: form({ amount: 3000, currency: "TRY", amountGroup: 47100, payerId: "asan", treatedMe: true,
      shares: [{ member_id: "me", amount: 3000 }] }), group, meId: "me", accounts: [kaspi], transactions: [], newId });
    expect(p.entries[1]).toMatchObject({ reason: "treated_me", amount_group: -47100 });
  });

  describe("§5.13: привязка уже записанной транзакции", () => {
    const tx = { id: "t9", type: "expense", amount: 29730, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-03", note: "бар" };

    test("«Сделать общим»: транзакция не создаётся и не меняется, баланс тот же", () => {
      const p = buildBillSave({ form: form({ linkTx: tx }), group, meId: "me", accounts: [kaspi], transactions: [tx], newId });
      expect(p.tx).toBe(null);
      expect(p.tx_delete_id).toBe(null);
      expect(p.balances).toEqual([]);
      expect(p.entries[0]).toMatchObject({ transaction_id: "t9", account_id: "kaspi", account_amount: 29730, linked_tx_snapshot: { category_id: "rest", note: "бар" } });
      // правка привязанного счёта сохраняет ту же транзакцию
      const again = buildBillSave({ form: form(), group, meId: "me", edit: p.entries[0], accounts: [kaspi], transactions: [tx], newId });
      expect(again).toMatchObject({ tx: null, tx_delete_id: null, balances: [] });
      expect(again.entries[0].transaction_id).toBe("t9");
    });

    test("удаление привязанной записи — транзакция остаётся, категория и заметка возвращаются", () => {
      const entry = { id: "b1", kind: "bill", transaction_id: "t9", linked_tx_snapshot: { category_id: "rest", note: "бар" } };
      expect(buildEntryDelete({ entry, accounts: [kaspi], transactions: [tx] }))
        .toEqual({ id: "b1", ids: [], tx_delete_id: null, tx_restore: { id: "t9", category_id: "rest", note: "бар" }, balances: [] });
    });

    const income = { id: "i1", type: "income", amount: 9910, currency: "KZT", category_id: "gift", account_id: "kaspi", date: "2026-10-04", note: "от Асана" };
    const bill = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "me", amount: 29730, amount_group: 29730,
      shares: [{ member_id: "me", amount: 9910 }, { member_id: "asan", amount: 9910 }, { member_id: "bek", amount: 9910 }] };
    const base = { group, meId: "me", member: { id: "asan", guest_name: "Асан" }, memberName: "Асан", entries: [bill], accounts: [kaspi], newId, precision: 0 };

    test("перевод: доход уже записан — привязывается без категории, с префиксом заметки", () => {
      const p = buildTransferSave({ ...base, transactions: [income], form: { direction: "in", amount: 9910, date: "2026-10-04", linkTx: income } });
      expect(p.tx).toMatchObject({ id: "i1", amount: 9910, category_id: null, note: "Перевод · Вечер 03.10 ← Асан · от Асана" });
      expect(p.balances).toEqual([]);
      expect(p.tx_delete_id).toBe(null);
      expect(p.entries[0]).toMatchObject({ transaction_id: "i1", method: "account", linked_tx_snapshot: { category_id: "gift", note: "от Асана" } });
    });

    test("перевод со своей транзакцией перепривязан к записанной — своя удаляется с откатом", () => {
      const own = { id: "own", type: "income", amount: 9910, account_id: "kaspi" };
      const edit = { id: "t1", group_id: "g1", kind: "transfer", from_member_id: "asan", to_member_id: "me", amount: 9910, amount_group: 9910, transaction_id: "own" };
      const p = buildTransferSave({ ...base, entries: [bill, edit], edit, transactions: [own, income],
        accounts: [{ ...kaspi, balance: 119820 }], form: { direction: "in", amount: 9910, date: "2026-10-04", linkTx: income } });
      expect(p.tx_delete_id).toBe("own");
      expect(p.balances).toEqual([{ account_id: "kaspi", balance: 109910, delta: -9910 }]);
    });

    test("кандидаты: тот же счёт, тип и сумма, ±7 дней, не связанные", () => {
      const txs = [income, { ...income, id: "far", date: "2026-10-20" }, { ...income, id: "used" }, { ...income, id: "debt" },
        { ...income, id: "fx", transfer_id: "tr" }, { ...income, id: "other", amount: 10000 }, { ...income, id: "near", date: "2026-10-05" }];
      const res = linkableTransactions({ transactions: txs, accountId: "kaspi", type: "income", amount: 9910, date: "2026-10-04",
        sharedEntries: [{ transaction_id: "used" }], debtEvents: [{ transaction_id: "debt" }] });
      expect(res.map(t => t.id)).toEqual(["i1", "near"]);
    });
  });

  describe("§5.14: один перевод на несколько долгов", () => {
    const g1 = { id: "g1", name: "Вечер 03.10", mode: "event", currency: "KZT", date: "2026-10-03" };
    const g2 = { id: "g2", name: "Вечер 10.10", mode: "event", currency: "KZT", date: "2026-10-10" };
    const g3 = { id: "g3", name: "Стамбул", mode: "event", currency: "TRY", date: "2026-10-01" };
    const members = [
      { id: "me1", group_id: "g1", is_me: true }, { id: "bek1", group_id: "g1", person_id: "p-bek", heads: 3, sort_order: 1 }, { id: "dau", group_id: "g1", guest_name: "Даурен", sort_order: 2 },
      { id: "me2", group_id: "g2", is_me: true }, { id: "bek2", group_id: "g2", person_id: "p-bek", sort_order: 1 }, { id: "asan2", group_id: "g2", guest_name: "Асан", sort_order: 2 },
      { id: "me3", group_id: "g3", is_me: true }, { id: "bek3", group_id: "g3", person_id: "p-bek" },
    ];
    const b = (id, gid, me, shares) => ({ id, group_id: gid, kind: "bill", date: "2026-10-03", payer_member_id: me, amount: 1, amount_group: shares.reduce((s, x) => s + x.amount, 0), shares });
    const ents = [
      { ...b("x1", "g1", "me1", [{ member_id: "me1", amount: 6000 }, { member_id: "bek1", amount: 22500 }, { member_id: "dau", amount: 6000 }]), amount: 34500 },
      { ...b("x2", "g2", "me2", [{ member_id: "bek2", amount: 4000 }, { member_id: "asan2", amount: 4000 }]), amount: 8000 },
      { ...b("x3", "g3", "me3", [{ member_id: "bek3", amount: 500 }]), amount: 500 },
    ];
    const groups = [g2, g1, g3];

    test("кандидаты: эта группа + тот же человек в других вечерах той же валюты, старые первыми", () => {
      const res = transferCandidates({ groups, members, entries: ents, group: g1, sender: { personId: "p-bek" }, direction: "in" });
      expect(res.map(c => [c.member.id, c.debt])).toEqual([["bek1", 22500], ["dau", 6000], ["bek2", 4000]]);
    });

    test("allocateTransfer: по порядку, недостаток — последним, переплата — у последнего", () => {
      expect(defaultBatchParts(30000, [{ debt: 22500 }, { debt: 6000 }, { debt: 4000 }], 0).map(p => p.amount)).toEqual([22500, 6000, 1500]);
      expect(defaultBatchParts(30000, [{ debt: 20000 }, { debt: 5000 }], 0).map(p => p.amount)).toEqual([20000, 10000]);
    });

    test("пачка: одна транзакция, по записи на долг с общим batch_id; удаление — целиком", () => {
      const parts = [{ member: members[1], group: g1, amount: 22500 }, { member: members[4], group: g2, amount: 7500 }];
      const p = buildBatchTransferSave({ form: { direction: "in", accountId: "kaspi", date: "2026-10-12", sender: { personId: "p-bek" }, parts, meIds: { g1: "me1", g2: "me2" } },
        entries: ents, accounts: [kaspi], transactions: [], newId, senderLabel: "Бек" });
      expect(p.tx).toMatchObject({ type: "income", amount: 30000, category_id: null, note: "Перевод · 2 долга ← Бек" });
      expect(p.balances).toEqual([{ account_id: "kaspi", balance: 130000, delta: 30000 }]);
      expect(p.entries).toHaveLength(2);
      const [a, c] = p.entries;
      expect(a).toMatchObject({ group_id: "g1", from_member_id: "bek1", to_member_id: "me1", amount_group: 22500, sender_person_id: "p-bek", transaction_id: p.tx.id });
      expect(c).toMatchObject({ group_id: "g2", from_member_id: "bek2", to_member_id: "me2", amount_group: 7500, batch_id: a.batch_id, transaction_id: p.tx.id });

      // правка: вторую часть убрали — её запись и корректировки удаляются, транзакция та же
      const adj = { id: "adj", kind: "adjust", transfer_id: c.id };
      const tx = p.tx;
      const edit = buildBatchTransferSave({ form: { direction: "in", accountId: "kaspi", date: "2026-10-12", sender: { personId: "p-bek" }, parts: [{ ...parts[0], amount: 30000 }], meIds: { g1: "me1" } },
        edit: p.entries, entries: [...ents, ...p.entries, adj], accounts: [{ ...kaspi, balance: 130000 }], transactions: [tx], newId, senderLabel: "Бек" });
      expect(edit.entries).toEqual([expect.objectContaining({ id: a.id, amount_group: 30000, batch_id: a.batch_id })]);
      expect(edit.delete_entry_ids).toEqual([c.id, "adj"]);
      expect(edit.tx.id).toBe(tx.id);
      expect(edit.balances).toEqual([]);

      expect(buildEntryDelete({ entry: c, entries: p.entries, accounts: [{ ...kaspi, balance: 130000 }], transactions: [tx] }))
        .toMatchObject({ ids: [a.id, c.id], tx_delete_id: tx.id, balances: [{ account_id: "kaspi", balance: 100000 }] });
    });
  });

  test("пересчёт по курсу — тоже вверх (по модулю, долг не теряет копейку)", () => {
    expect(regroupAmounts([{ id: "a", kind: "adjust", currency: "KZT", amount_group: -91 }], { from: "KZT", to: "USD", rates }))
      .toEqual([{ id: "a", amount_group: -0.19 }]);   // −0,182 → −0,19
    expect(billAmounts({ amount: 100, currency: "TRY", groupCurrency: "KZT", rates: { TRY: 15.71 } }).amountGroup).toBe(1571);
    expect(billAmounts({ amount: 1, currency: "TRY", groupCurrency: "KZT", rates: { TRY: 15.71 } }).amountGroup).toBe(16); // 15,71 → 16
  });

  test("смена валюты группы: точные суммы, где есть, иначе пересчёт по курсу", () => {
    const es = [
      { id: "b1", kind: "bill", currency: "KZT", amount: 29730, amount_group: 29730, account_id: "kaspi", account_amount: 29730 },
      { id: "b2", kind: "bill", currency: "TRY", amount: 3000, amount_group: 47300, account_id: "usd", account_amount: 95 },
      { id: "t1", kind: "transfer", currency: "KZT", amount: 10000, amount_group: 10000 },
      { id: "a1", kind: "adjust", currency: "KZT", amount_group: -90 },
    ];
    expect(regroupAmounts(es, { from: "KZT", to: "USD", rates, accounts: [kaspi, usdCard] })).toEqual([
      { id: "b1", amount_group: 59.46 }, { id: "b2", amount_group: 95 }, { id: "t1", amount_group: 20 }, { id: "a1", amount_group: -0.18 },
    ]);
    // обратно в KZT — точные суммы возвращаются без потерь
    expect(regroupAmounts([{ ...es[0], amount_group: 59.46 }, { ...es[2], amount_group: 20 }], { from: "USD", to: "KZT", rates, accounts: [kaspi] }))
      .toEqual([{ id: "b1", amount_group: 29730 }, { id: "t1", amount_group: 10000 }]);
  });
});

describe("этап 10: квартира", () => {
  const flat = newMirrorGroup("f1", { name: "Квартира", currency: "KZT" });
  const kaspi = { id: "kaspi", currency: "KZT", balance: 100000 };

  test("моя доля «поровну на N» — вверх до точности валюты (0,1 → 1)", () => {
    expect(mirrorShare(400000, 4, 0)).toBe(100000);
    expect(mirrorShare(10000, 3, 0)).toBe(3334);   // 3 333,33 → 3 334
    expect(mirrorShare(10001, 10, 0)).toBe(1001);  // 1 000,1 → 1 001
    expect(mirrorShare(10, 3, 2)).toBe(3.34);
    expect(mirrorShare(100, 0, 0)).toBe(0);
  });

  test("§5.1c: новая квартира с начальным балансом −20 000 одним вызовом; 0 — без записи", () => {
    const members = [{ id: "me", is_me: true }, { id: "dima", person_id: "p-dima" }];
    const p = buildMirrorGroupSave({ group: flat, members, opening: { amount: -20000, date: "2026-10-01" }, newId });
    expect(p.group).toMatchObject({ mode: "mirror", minor_category_id: null });
    expect(p.entries).toEqual([expect.objectContaining({ kind: "opening", amount_group: -20000, date: "2026-10-01", group_id: "f1" })]);
    expect(buildMirrorGroupSave({ group: flat, members, opening: { amount: "", date: "2026-10-01" }, newId }).entries).toEqual([]);
  });

  test("правка начального баланса: та же запись; обнулили — запись удаляется", () => {
    const existing = { id: "o1", kind: "opening", amount_group: -20000, group_id: "f1" };
    expect(openingSave({ group: flat, amount: -25000, date: "2026-10-01", existing, newId }).entries[0]).toMatchObject({ id: "o1", amount_group: -25000 });
    expect(openingSave({ group: flat, amount: 0, date: "2026-10-01", existing, newId })).toEqual({ entries: [], deleteEntryIds: ["o1"] });
  });

  test("§5.1d: сверка — разница «Tricount − приложение»; совпало — ничего не пишем", () => {
    expect(buildReconcileSave({ group: flat, tricountBalance: -74250, appBalance: -73000, date: "2026-10-04", newId }).entries[0])
      .toMatchObject({ kind: "reconcile", amount_group: -1250, date: "2026-10-04" });
    expect(buildReconcileSave({ group: flat, tricountBalance: -73000, appBalance: -73000, date: "2026-10-04", newId })).toBe(null);
  });

  test("§5.16: возврат, полученный мной, — доход без категории", () => {
    const p = buildBillSave({ form: form({ kind: "refund", amount: 100000, title: "Залог", splitPeople: 4, shares: [{ member_id: "me", amount: 25000 }] }),
      group: flat, meId: "me", accounts: [kaspi], transactions: [], newId });
    expect(p.tx).toMatchObject({ type: "income", amount: 100000, category_id: null, note: "Возврат · Залог · Квартира" });
    expect(p.entries[0]).toMatchObject({ kind: "refund", split_people: 4, category_id: "rest" });
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 200000, delta: 100000 }]);
  });

  test("shiftMonth: та же дата через месяц, конец месяца — по длине месяца", () => {
    expect(shiftMonth("2026-09-15")).toBe("2026-10-15");
    expect(shiftMonth("2026-01-31")).toBe("2026-02-28");
    expect(shiftMonth("2026-12-10")).toBe("2027-01-10");
  });

  test("§5.17: «Повторить из прошлого месяца» — даты +1 месяц, новые суммы, своя транзакция у моей оплаты", () => {
    const rent = { id: "r", kind: "bill", date: "2026-09-01", title: "Аренда", category_id: "home", payer_member_id: "me", account_id: "kaspi",
      amount: 400000, amount_group: 400000, split_people: 4, shares: [{ member_id: "me", amount: 100000 }] };
    const wifi = { id: "w", kind: "bill", date: "2026-09-07", title: "Wi-Fi", category_id: "net", payer_member_id: "askhat",
      amount: 12000, amount_group: 12000, split_people: null, shares: [{ member_id: "me", amount: 4000 }] };
    const p = buildRepeatSave({ group: flat, picks: [{ entry: rent, amount: 420000 }, { entry: wifi, amount: 15000 }], meId: "me", accounts: [kaspi], newId });
    expect(p.entries[0]).toMatchObject({ date: "2026-10-01", amount: 420000, payer_member_id: "me", split_people: 4, shares: [expect.objectContaining({ amount: 105000 })] });
    expect(p.entries[1]).toMatchObject({ date: "2026-10-07", amount: 15000, transaction_id: null, shares: [expect.objectContaining({ amount: 5000 })] }); // та же пропорция 1/3
    expect(p.txs).toEqual([expect.objectContaining({ amount: 420000, account_id: "kaspi", category_id: "home", id: p.entries[0].transaction_id })]);
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: -320000, delta: -420000 }]);
  });

  test("повтор покупки с составом — тот же состав делится заново, остаток у плательщика", () => {
    const shop = { id: "s", kind: "bill", date: "2026-09-05", title: "Продукты", category_id: "food", payer_member_id: "dima", amount: 30000, amount_group: 30000,
      split_people: 3, shares: [{ member_id: "me", heads: 1, amount: 10000 }, { member_id: "dima", heads: 1, amount: 10000 }, { member_id: "askhat", heads: 1, amount: 10000 }] };
    const p = buildRepeatSave({ group: flat, picks: [{ entry: shop, amount: 10000 }], meId: "me", accounts: [kaspi], newId });
    expect(p.entries[0].shares.map(x => [x.member_id, x.amount])).toEqual([["me", 3334], ["dima", 3332], ["askhat", 3334]]);
    expect(p.txs).toEqual([]);
  });

  test("удаление квартиры: долгов с участниками нет — показывается мой баланс с группой", () => {
    const ms = [{ id: "me", group_id: "f1", is_me: true }, { id: "dima", group_id: "f1", person_id: "p-dima" }];
    const pc = { id: "pc", group_id: "f1", kind: "bill", date: "2026-10-02", payer_member_id: "dima", amount: 400000, amount_group: 400000, shares: [{ member_id: "me", amount: 100000 }] };
    const imp = groupDeletionImpact(flat, { groups: [flat], members: ms, entries: [pc], transactions: [], accounts: [kaspi] });
    expect(imp.openDebts).toEqual([]);
    expect(imp.mirrorBalance).toBe(-100000);
  });
});

describe("этап 12: зачёт с личным долгом", () => {
  const group = { id: "g1", name: "Вечер 03.10", currency: "KZT" };
  const kaspi = { id: "kaspi", currency: "KZT", balance: 100000 };
  const bill = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "me", amount: 19820, amount_group: 19820,
    shares: [{ member_id: "me", amount: 9910 }, { member_id: "bek", amount: 9910 }] };
  const bek = { id: "bek", person_id: "p-bek" };
  const base = { group, meId: "me", member: bek, memberName: "Бек", entries: [bill], accounts: [kaspi], newId, precision: 0 };

  test("§10: Бек 9 910 за вечер, я ему лично 5 000 — зачёт 5 000: без транзакции, событие offset +5 000", () => {
    const p = buildTransferSave({ ...base, transactions: [], form: { direction: "in", amount: 5000, date: "2026-10-05", accountId: "kaspi", offset: { personId: "p-bek", sign: 1 } } });
    expect(p.tx).toBe(null);
    expect(p.balances).toEqual([]);
    expect(p.debt_event).toMatchObject({ person_id: "p-bek", type: "offset", amount: 5000, transaction_id: null, note: "Зачёт · Вечер 03.10" });
    expect(p.entries[0]).toMatchObject({ kind: "transfer", method: "offset", account_id: null, transaction_id: null, debt_event_id: p.debt_event.id, amount_group: 5000 });
    expect(p.entries).toHaveLength(1); // недоплата 4 910 — по умолчанию остаётся долгом
  });

  test("перевод со счёта стал зачётом — транзакция удаляется с откатом; зачёт стал переводом — событие удаляется", () => {
    const own = { id: "tx1", type: "income", amount: 5000, account_id: "kaspi" };
    const asAccount = { id: "t1", group_id: "g1", kind: "transfer", from_member_id: "bek", to_member_id: "me", amount: 5000, amount_group: 5000, method: "account", transaction_id: "tx1", account_id: "kaspi" };
    const toOffset = buildTransferSave({ ...base, entries: [bill, asAccount], edit: asAccount, transactions: [own], accounts: [{ ...kaspi, balance: 105000 }],
      form: { direction: "in", amount: 5000, date: "2026-10-05", offset: { personId: "p-bek", sign: 1 } } });
    expect(toOffset).toMatchObject({ tx: null, tx_delete_id: "tx1", balances: [{ account_id: "kaspi", balance: 100000 }] });

    const asOffset = { ...asAccount, method: "offset", transaction_id: null, account_id: null, debt_event_id: "ev1" };
    const back = buildTransferSave({ ...base, entries: [bill, asOffset], edit: asOffset, transactions: [],
      form: { direction: "in", amount: 5000, date: "2026-10-05", accountId: "kaspi" } });
    expect(back.debt_event_delete_id).toBe("ev1");
    expect(back.entries[0]).toMatchObject({ method: "account", debt_event_id: null });
    expect(back.tx).toMatchObject({ type: "income", amount: 5000 });
    // правка суммы зачёта — то же событие
    const again = buildTransferSave({ ...base, entries: [bill, asOffset], edit: asOffset, transactions: [],
      form: { direction: "in", amount: 4000, date: "2026-10-05", offset: { personId: "p-bek", sign: 1 } } });
    expect(again.debt_event).toMatchObject({ id: "ev1", amount: 4000 });
  });

  test("квартира: я перевожу Диме зачётом — событие с минусом (его личный долг мне уменьшается)", () => {
    const p = buildTransferSave({ ...base, member: { id: "dima", person_id: "p-dima" }, memberName: "Дима", entries: [], transactions: [],
      form: { direction: "out", amount: 13000, date: "2026-10-05", noClosing: true, offset: { personId: "p-dima", sign: -1 } } });
    expect(p.debt_event).toMatchObject({ person_id: "p-dima", amount: -13000 });
    expect(p.entries[0]).toMatchObject({ from_member_id: "me", to_member_id: "dima", method: "offset" });
  });
});

describe("повтор с другим способом деления", () => {
  const flat = newMirrorGroup("f1", { name: "Квартира", currency: "KZT" });
  test("проценты остаются процентами, суммы — пропорционально", () => {
    const pct = { id: "p", kind: "bill", date: "2026-09-01", payer_member_id: "me", amount: 10000, amount_group: 10000, category_id: "home",
      shares: [{ member_id: "me", heads: 1, mode: "percent", value: 50, amount: 5000 }, { member_id: "dima", heads: 1, mode: "percent", value: 50, amount: 5000 }] };
    const sums = { ...pct, id: "s", shares: [{ member_id: "me", heads: 1, mode: "amount", value: 3000, amount: 3000 }, { member_id: "dima", heads: 1, mode: "amount", value: 7000, amount: 7000 }] };
    const p = buildRepeatSave({ group: flat, picks: [{ entry: pct, amount: 20000 }, { entry: sums, amount: 20000 }], meId: "me", accounts: [], newId });
    expect(p.entries[0].shares).toEqual([
      { member_id: "me", heads: 1, mode: "percent", value: 50, amount: 10000 }, { member_id: "dima", heads: 1, mode: "percent", value: 50, amount: 10000 }]);
    expect(p.entries[1].shares.map(x => [x.mode, x.value, x.amount])).toEqual([["amount", 6000, 6000], ["amount", 14000, 14000]]);
  });

  test("новая сумма меньше сборов — ошибка, а не счёт с нулевыми долями", () => {
    const delivery = { id: "d", kind: "bill", date: "2026-09-01", payer_member_id: "me", amount: 1000, amount_group: 1000, title: "Доставка",
      shares: [{ member_id: "me", heads: 1, mode: "auto", amount: 500 }, { member_id: "dima", heads: 1, mode: "auto", amount: 500 }],
      fees: [{ id: "f", title: "Доставка", amount: 500, split: "equal" }] };
    expect(() => buildRepeatSave({ group: flat, picks: [{ entry: delivery, amount: 300 }], meId: "me", accounts: [], newId }))
      .toThrow(/fees_over_total/);
  });
});

describe("«Записать в Tricount»: долг с тусы переносится в группу Tricount", () => {
  const tusa = { id: "t1", name: "Шашлыки", mode: "event", currency: "KZT" };
  const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
  const office = { id: "f2", name: "Офис", mode: "mirror", currency: "KZT" };
  const usd = { id: "f3", name: "Поездка", mode: "mirror", currency: "USD" };
  const archived = { ...flat, id: "f4", archived: true };
  const members = [
    { id: "me", group_id: "t1", is_me: true }, { id: "bek", group_id: "t1", person_id: "p-bek" }, { id: "asan", group_id: "t1", guest_name: "Асан" },
    { id: "me2", group_id: "f1", is_me: true }, { id: "bek2", group_id: "f1", person_id: "p-bek" },
    { id: "me3", group_id: "f2", is_me: true }, { id: "bek3", group_id: "f2", person_id: "p-bek" },
    { id: "bek4", group_id: "f3", person_id: "p-bek" }, { id: "bek5", group_id: "f4", person_id: "p-bek" },
  ];
  const groups = [tusa, flat, office, usd, archived];

  test("куда можно: группы Tricount с этим человеком, той же валюты, не в архиве; гостю — некуда", () => {
    expect(tricountTargets(members[1], { groups, members, currency: "KZT" }).map(t => [t.group.id, t.member.id])).toEqual([["f1", "bek2"], ["f2", "bek3"]]);
    expect(tricountTargets(members[2], { groups, members, currency: "KZT" })).toEqual([]);
  });

  test("пара записей: в тусе долг закрыт без денег, в Tricount — покупка на него, моя доля 0", () => {
    const p = buildMoveToTricountSave({ tusa, tusaMember: members[1], tusaMeId: "me", target: { group: flat, member: members[4] }, mirrorMeId: "me2",
      amount: 9910, date: "2026-10-05", newId });
    const [t, b] = p.entries;
    expect(t).toMatchObject({ group_id: "t1", kind: "transfer", from_member_id: "bek", to_member_id: "me", method: "group", amount_group: 9910,
      transaction_id: null, account_id: null, note: "Записано в Tricount «Квартира»" });
    expect(b).toMatchObject({ group_id: "f1", kind: "bill", payer_member_id: "me2", amount_group: 9910, category_id: null, title: "Долг с тусы «Шашлыки»",
      shares: [expect.objectContaining({ member_id: "bek2", amount: 9910 })] });
    expect(b.batch_id).toBe(t.batch_id);
    // долг в тусе закрыт, баланс с Tricount +9 910
    expect(memberBalances([{ id: "x", group_id: "t1", kind: "bill", payer_member_id: "me", amount: 9910, amount_group: 9910, shares: [{ member_id: "bek", amount: 9910 }] }, t],
      members.filter(m => m.group_id === "t1"), { precision: 0 }).bek.balance).toBe(0);
    expect(mirrorBalance([b], "me2", { precision: 0 })).toBe(9910);
    // отмена любой из записей удаляет обе
    expect(buildEntryDelete({ entry: b, entries: p.entries, accounts: [], transactions: [] }).ids).toEqual([t.id, b.id]);
    expect(buildEntryDelete({ entry: t, entries: p.entries, accounts: [], transactions: [] }).ids).toEqual([t.id, b.id]);
  });
});
