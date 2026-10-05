import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedPurchaseFormPage } from "../SharedPurchaseFormPage";
import { SharedMirrorPage } from "../SharedMirrorPage";
import { SharedMirrorTransferPage } from "../SharedMirrorTransferPage";
import { SharedGroupFormPage } from "../SharedGroupFormPage";
import { SharedGroupsListPage } from "../SharedGroupsListPage";
import { supaRpc, supaUpsert } from "../../../../lib/supabase";
import { todayStr } from "../../../../utils/date";
import { shiftMonth } from "../../../../utils/sharedMirrorSave";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()), supaUpsert: jest.fn(() => Promise.resolve()) }));

// §5.1: квартира с пацанами, поровну на 4. Даты — в текущем месяце, чтобы тест не зависел от дня запуска.
const month = todayStr().slice(0, 7);
const prevMonth = shiftMonth(`${month}-01`, -1).slice(0, 7);
const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT", minor_category_id: null, archived: false };
const members = [
  { id: "me", group_id: "f1", is_me: true, sort_order: 0 },
  { id: "dima", group_id: "f1", person_id: "p-dima", sort_order: 1 },
  { id: "askhat", group_id: "f1", person_id: "p-askhat", sort_order: 2 },
  { id: "erlan", group_id: "f1", person_id: "p-erlan", sort_order: 3 },
];
const people = [{ id: "p-dima", name: "Дима" }, { id: "p-askhat", name: "Асхат" }, { id: "p-erlan", name: "Ерлан" }];
const kaspi = { id: "kaspi", name: "Kaspi", currency: "KZT", balance: 500000, icon: "bank", color: "#f00" };
const expCats = [{ id: "tech", name: "Техника", icon: "other" }, { id: "food", name: "Продукты", icon: "groceries" }, { id: "net", name: "Связь", icon: "other" }, { id: "minor", name: "Мелочи", icon: "melochi" }];
const my = amount => [{ member_id: "me", heads: 1, mode: "auto", amount }];
const bill = (id, payer, amount, share, category_id, day, extra = {}) =>
  ({ id, group_id: "f1", kind: "bill", date: `${month}-${day}`, title: "", payer_member_id: payer, amount, amount_group: amount, split_people: 4, shares: my(share), category_id, ...extra });
const october = [
  bill("pc", "dima", 400000, 100000, "tech", "02", { title: "Компьютер" }),
  bill("food", "me", 40000, 10000, "food", "05", { title: "Продукты", account_id: "kaspi", transaction_id: "tx-food" }),
  bill("wifi", "askhat", 12000, 3000, "net", "07", { title: "Wi-Fi" }),
];

beforeEach(() => { supaRpc.mockClear(); supaUpsert.mockClear(); });

// Способ деления — кнопка-селект «Как делить» справа в заголовке состава.
const chooseMethod = label => { userEvent.click(screen.getByLabelText("Как делить")); userEvent.click(screen.getAllByText(label).pop()); };

describe("покупка", () => {
  const renderPurchase = props => {
    const onSaved = jest.fn();
    render(<SharedPurchaseFormPage group={flat} members={members} entries={october} accounts={[kaspi]} transactions={[]}
      expCats={expCats} people={people} setPeople={jest.fn()} onBack={jest.fn()} onSaved={onSaved} {...props}/>);
    return { onSaved };
  };
  const shareOf = (p, id) => p.entries[0].shares.find(x => x.member_id === id)?.amount;

  test("§5.1: компьютер 400 000, платил Дима — все в доле, видно сколько на каждого, без транзакции", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "400000");
    userEvent.click(screen.getAllByText("Дима")[0]);                              // чип «Кто платил»
    expect(screen.queryByText("С какого счёта")).toBeNull();
    userEvent.click(screen.getByText("Техника"));
    expect(screen.getAllByText("₸100 000").length).toBeGreaterThanOrEqual(4);      // у каждого из четырёх
    expect(screen.getByText("Всего в счёте:")).toBeInTheDocument();
    expect(screen.getByText(/Баланс с группой −₸100 000/)).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.tx).toBe(null);
    expect(p.entries[0]).toMatchObject({ kind: "bill", payer_member_id: "dima", amount: 400000, split_people: 4 });
    expect(["me", "dima", "askhat", "erlan"].map(id => shareOf(p, id))).toEqual([100000, 100000, 100000, 100000]);
  });

  test("я не участвую — моя доля 0, я оплатил за остальных", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "30000");
    userEvent.click(screen.getByText("Продукты"));
    userEvent.click(screen.getByRole("checkbox", { name: "Я" }));                   // тап по себе — снять
    expect(screen.getByText("Вы не участвуете — ваша доля 0", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Баланс с группой \+₸30 000/)).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(shareOf(p, "me")).toBeUndefined();
    expect(["dima", "askhat", "erlan"].map(id => shareOf(p, id))).toEqual([10000, 10000, 10000]);
    expect(p.tx).toMatchObject({ amount: 30000, account_id: "kaspi" });
  });

  test("Tricount: тап по человеку выбирает и снимает, без галочки и шторки", () => {
    renderPurchase();
    expect(screen.queryByLabelText("Не участвует")).toBeNull();                      // галочек нет
    const erlan = screen.getByRole("checkbox", { name: "Ерлан" });
    expect(erlan).toHaveAttribute("aria-checked", "true");
    userEvent.click(erlan);
    expect(erlan).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("не в доле")).toBeInTheDocument();
    expect(screen.queryByText("Сколько человек")).toBeNull();                        // шторка тусы не открылась
    userEvent.click(erlan);
    expect(erlan).toHaveAttribute("aria-checked", "true");
  });

  test("не все в доле: 400 000 на троих — вверх до тенге, остаток у плательщика", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "400000");
    userEvent.click(screen.getAllByText("Дима")[0]);
    userEvent.click(screen.getByText("Техника"));
    userEvent.click(screen.getByRole("checkbox", { name: "Ерлан" }));               // тап — Ерлан не в доле
    expect(screen.getByText("3 человека")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(["me", "askhat", "dima"].map(id => shareOf(p, id))).toEqual([133334, 133334, 133332]);
    expect(p.entries[0].split_people).toBe(3);
  });

  test("возврата нет — вернули деньги: правится сумма покупки", () => {
    renderPurchase();
    expect(screen.queryByText("Возврат")).toBeNull();
    expect(screen.queryByText("Кого касается")).toBeNull();
  });

  // Продукты 40 000 оплатил я с Kaspi (баланс сейчас 500 000), поровну на четверых.
  const foodTx = { id: "tx-food", type: "expense", amount: 40000, currency: "KZT", category_id: "food", account_id: "kaspi", date: `${month}-05`, note: "Продукты · Квартира" };
  const foodEntry = { ...october[1], shares: ["me", "dima", "askhat", "erlan"].map(id => ({ member_id: id, heads: 1, mode: "auto", amount: 10000 })) };
  const editFood = async change => {
    const onSaved = jest.fn();
    render(<SharedPurchaseFormPage group={flat} entry={foodEntry} members={members} entries={october} accounts={[kaspi]} transactions={[foodTx]}
      expCats={expCats} people={people} setPeople={jest.fn()} onBack={jest.fn()} onSaved={onSaved}/>);
    change();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    return supaRpc.mock.calls[0][1].p;
  };

  test("правка суммы: вернули 10 000 — та же запись и транзакция, баланс счёта +10 000, доли пересчитаны", async () => {
    const p = await editFood(() => {
      const amount = screen.getByDisplayValue("₸40 000");
      userEvent.clear(amount);
      userEvent.type(amount, "30000");
    });
    expect(p.entries[0]).toMatchObject({ id: "food", amount: 30000, amount_group: 30000, transaction_id: "tx-food", split_people: 4 });
    expect(p.entries[0].shares.map(x => x.amount)).toEqual([7500, 7500, 7500, 7500]);
    expect(p.tx).toMatchObject({ id: "tx-food", amount: 30000 });
    expect(p.tx_delete_id).toBe(null);
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 510000, delta: 10000 }]);
  });

  test("правка состава: Ерлан не участвовал — 40 000 на троих, транзакция та же", async () => {
    const p = await editFood(() => userEvent.click(screen.getByRole("checkbox", { name: "Ерлан" })));
    expect(p.entries[0].shares.map(x => [x.member_id, x.amount])).toEqual([["me", 13332], ["dima", 13334], ["askhat", 13334]]);
    expect(p.tx).toMatchObject({ id: "tx-food", amount: 40000 });
    expect(p.balances).toEqual([]);                                                 // сумма не менялась — баланс тот же
  });

  test("правка плательщика: на самом деле платил Дима — транзакция удаляется, деньги возвращаются на счёт", async () => {
    const p = await editFood(() => userEvent.click(screen.getAllByText("Дима")[0]));
    expect(p.entries[0]).toMatchObject({ payer_member_id: "dima", transaction_id: null, account_id: null });
    expect(p.tx).toBe(null);
    expect(p.tx_delete_id).toBe("tx-food");
    expect(p.balances).toEqual([{ account_id: "kaspi", balance: 540000, delta: 40000 }]);
  });

  test("проценты: 50 / 30 / 20 / 0 — Σ должна быть 100%", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "10000");
    userEvent.click(screen.getByText("Продукты"));
    chooseMethod("Проценты");
    expect(screen.getByText("Итого 100% ✓")).toBeInTheDocument();                 // по умолчанию — поровну до 100
    const set = (label, v) => { const el = screen.getByLabelText(`Проценты: ${label}`); userEvent.clear(el); userEvent.type(el, v); };
    set("Я", "50"); set("Дима", "30"); set("Асхат", "10"); set("Ерлан", "0");
    expect(screen.getByText("Итого 90% — нужно 100%")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    expect((await screen.findAllByText(/Сумма процентов — 90%, нужно 100%/)).length).toBeGreaterThan(0);
    set("Асхат", "20");
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0].shares).toEqual([
      expect.objectContaining({ member_id: "me", mode: "percent", value: 50, amount: 5000 }),
      expect.objectContaining({ member_id: "dima", mode: "percent", value: 30, amount: 3000 }),
      expect.objectContaining({ member_id: "askhat", mode: "percent", value: 20, amount: 2000 }),
    ]); // у Ерлана 0% — не в доле
  });

  test("части: 2 / 1 / 1 — сумма делится пропорционально", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "10000");
    userEvent.click(screen.getByText("Продукты"));
    userEvent.click(screen.getByRole("checkbox", { name: "Ерлан" }));                // тап — Ерлан не в доле
    chooseMethod("Части");
    const me = screen.getByLabelText("Части: Я");
    userEvent.clear(me);
    userEvent.type(me, "2");
    expect(screen.getByText(/Всего 4 части/)).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0].shares.map(x => [x.member_id, x.mode, x.value, x.amount])).toEqual([["me", "parts", 2, 5000], ["dima", "parts", 1, 2500], ["askhat", "parts", 1, 2500]]);
  });

  test("суммы: каждому точная сумма, Σ = сумме покупки", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "10000");
    userEvent.click(screen.getByText("Продукты"));
    chooseMethod("Суммы");
    expect(screen.getByText("Распределено ₸10 000 из ₸10 000 ✓")).toBeInTheDocument();   // по умолчанию — поровну
    const set = (label, v) => { const el = screen.getByLabelText(`Суммы: ${label}`); userEvent.clear(el); userEvent.type(el, v); };
    set("Я", "1000"); set("Дима", "4000");
    expect(screen.getByText("Распределено ₸10 000 из ₸10 000 ✓")).toBeInTheDocument(); // 1 000 + 4 000 + по 2 500 у остальных
    set("Асхат", "4000");
    expect(screen.getByText("Распределено ₸11 500 из ₸10 000")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    expect((await screen.findAllByText(/больше счёта на ₸1 500/)).length).toBeGreaterThan(0);
    set("Ерлан", "1000");
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0].shares.map(x => [x.member_id, x.mode, x.amount])).toEqual([["me", "amount", 1000], ["dima", "amount", 4000], ["askhat", "amount", 4000], ["erlan", "amount", 1000]]);
  });

  test("разные заказы + общая доставка: суммы у каждого, доставка 1 500 поровну на троих", async () => {
    const { onSaved } = renderPurchase();
    userEvent.type(screen.getByPlaceholderText("0"), "11500");
    userEvent.click(screen.getByText("Продукты"));
    userEvent.click(screen.getByRole("checkbox", { name: "Ерлан" }));               // Ерлан не заказывал
    chooseMethod("Суммы");
    userEvent.click(screen.getByText("＋ Доставка, сервис или комиссия"));
    userEvent.type(screen.getByLabelText("Название сбора"), "Доставка");
    userEvent.type(screen.getByLabelText("Сумма сбора: Доставка"), "1500");
    const set = (label, v) => { const el = screen.getByLabelText(`Суммы: ${label}`); userEvent.clear(el); userEvent.type(el, v); };
    set("Я", "3000"); set("Дима", "4000"); set("Асхат", "3000");
    expect(screen.getByText("Распределено ₸10 000 из ₸10 000 ✓")).toBeInTheDocument();   // 11 500 − доставка 1 500
    expect(screen.getAllByText(/＋ сборы ₸500/)).toHaveLength(3);
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0].fees).toEqual([expect.objectContaining({ title: "Доставка", amount: 1500, split: "equal" })]);
    expect(p.entries[0].shares.map(x => [x.member_id, x.value, x.fee, x.amount])).toEqual([["me", 3000, 500, 3500], ["dima", 4000, 500, 4500], ["askhat", 3000, 500, 3500]]);
  });

  test("сервис «по заказу» — пропорционально, правка открывает сборы как были", async () => {
    const entry = { ...october[1], amount: 11000, amount_group: 11000, fees: [{ id: "s", title: "Сервис", amount: 1000, split: "proportional" }],
      shares: [{ member_id: "me", heads: 1, mode: "amount", value: 2500, fee: 250, amount: 2750 }, { member_id: "dima", heads: 1, mode: "amount", value: 7500, fee: 750, amount: 8250 }] };
    renderPurchase({ entry });
    expect(screen.getByDisplayValue("Сервис")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "по заказу" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/＋ сборы ₸250/)).toBeInTheDocument();
    expect(screen.getByText(/＋ сборы ₸750/)).toBeInTheDocument();
  });

  test("покупка с доставкой, сохранённая без колонки fees, — при правке суммы не перераспределяются", async () => {
    // Так сохранила старая функция (v30 не запущена): доли со сборами есть, списка сборов нет.
    const legacy = { ...october[1], amount: 11500, amount_group: 11500, transaction_id: null, account_id: null,
      shares: [{ member_id: "me", heads: 1, mode: "amount", value: 3000, fee: 500, amount: 3500 },
               { member_id: "dima", heads: 1, mode: "amount", value: 4000, fee: 500, amount: 4500 },
               { member_id: "askhat", heads: 1, mode: "amount", value: 3000, fee: 500, amount: 3500 }] };
    const onSaved = jest.fn();
    render(<SharedPurchaseFormPage group={flat} entry={legacy} feesSupported={false} members={members} entries={october} accounts={[kaspi]} transactions={[]}
      expCats={expCats} people={people} setPeople={jest.fn()} onBack={jest.fn()} onSaved={onSaved}/>);
    expect(screen.getByDisplayValue("Сборы")).toBeInTheDocument();
    expect(screen.getByText(/запустите в Supabase миграцию v30/)).toBeInTheDocument();
    expect(screen.getByText("Распределено ₸10 000 из ₸10 000 ✓")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0].shares.map(x => [x.member_id, x.amount])).toEqual([["me", 3500], ["dima", 4500], ["askhat", 3500]]);
  });

  test("база без v30 — блок сборов предупреждает, а не теряет данные молча", () => {
    renderPurchase({ feesSupported: false });
    expect(screen.queryByText("＋ Доставка, сервис или комиссия")).toBeNull();
    expect(screen.getByText(/Доставка и сборы пока недоступны: запустите в Supabase миграцию v30/)).toBeInTheDocument();
  });

  test("правка покупки, поделённой процентами, — открывается в процентах", () => {
    const entry = { ...october[1], shares: [{ member_id: "me", heads: 1, mode: "percent", value: 25, amount: 10000 }, { member_id: "dima", heads: 1, mode: "percent", value: 75, amount: 30000 }] };
    renderPurchase({ entry });
    expect(screen.getByLabelText("Как делить")).toHaveTextContent("Проценты");
    expect(screen.getByLabelText("Проценты: Дима")).toHaveValue("75");
  });
});

describe("экран квартиры", () => {
  const smallBills = [bill("bread", "me", 800, 200, "food", "08", { title: "Хлеб" }), bill("water", "dima", 1200, 300, "food", "09", { title: "Вода" })];
  const renderMirror = (entries = [...october, ...smallBills]) => {
    const navigate = jest.fn();
    const onReload = jest.fn(() => Promise.resolve());
    render(<SharedMirrorPage group={flat} members={members} entries={entries} people={people} accounts={[kaspi]} expCats={expCats}
      navigate={navigate} onReload={onReload} onBack={jest.fn()}/>);
    return { navigate, onReload };
  };

  test("§5.1: баланс −72 700 «я должен», лента месяца, раскладка по месяцам", () => {
    const { navigate } = renderMirror();
    expect(screen.getByText("₸72 700")).toBeInTheDocument(); // −73 000 + хлеб (+800 − 200) + вода (−300)
    expect(screen.getByText("я должен")).toBeInTheDocument();
    expect(screen.getByText("Хлеб")).toBeInTheDocument();
    expect(screen.queryByText("＋ Мелочь")).toBeNull();
    expect(screen.getByText("Компьютер")).toBeInTheDocument();
    expect(screen.getByText(/Моя доля за месяц/).textContent).toContain("₸113 500");

    userEvent.click(screen.getByText(/Мой баланс/));
    expect(screen.getByText(/доля −₸113 500 · оплатил \+₸40 800/)).toBeInTheDocument();
    userEvent.click(screen.getByText("Перевести"));
    expect(navigate).toHaveBeenCalledWith("addMirrorTransfer", { groupId: "f1" });
    userEvent.click(screen.getByText("＋ Покупка"));
    expect(navigate).toHaveBeenCalledWith("addSharedPurchase", { groupId: "f1" });
  });

  test("§5.1d: сверка — разница с Tricount и запись reconcile", async () => {
    const { onReload } = renderMirror(october);
    userEvent.click(screen.getByText("Сверить с Tricount"));
    userEvent.type(screen.getByLabelText("Баланс в Tricount"), "74250");
    expect(screen.getByText("Разница −₸1 250")).toBeInTheDocument();
    userEvent.click(screen.getByText("Выровнять"));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(supaRpc.mock.calls[0][1].p.entries[0]).toMatchObject({ kind: "reconcile", amount_group: -1250, group_id: "f1" });
  });

  test("§5.17: повторить аренду из прошлого месяца с новой суммой", async () => {
    const rent = { ...bill("rent", "me", 400000, 100000, "food", "01", { title: "Аренда" }), date: `${prevMonth}-01` };
    const { onReload } = renderMirror([...october, rent]);
    userEvent.click(screen.getByText("Повторить из прошлого месяца ›"));
    userEvent.click(screen.getByRole("checkbox", { name: /Аренда/ }));
    const input = screen.getByLabelText("Сумма: Аренда");
    userEvent.clear(input);
    userEvent.type(input, "420000");
    userEvent.click(screen.getByText("Повторить (1)"));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0]).toMatchObject({ date: `${month}-01`, amount: 420000, shares: [expect.objectContaining({ amount: 105000 })] });
  });
});

test("§5.1: перевод Диме — по умолчанию весь долг, без корректировок, баланс 0", async () => {
  const onBack = jest.fn();
  render(<SharedMirrorTransferPage group={flat} members={members} entries={october} people={people} accounts={[kaspi]} transactions={[]} onBack={onBack}/>);
  expect(screen.getByDisplayValue("₸73 000")).toBeInTheDocument();
  expect(screen.getByText("После перевода: рассчитались ✓")).toBeInTheDocument();
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.entries).toEqual([expect.objectContaining({ kind: "transfer", from_member_id: "me", to_member_id: "dima", amount_group: 73000 })]);
  expect(p.tx).toMatchObject({ type: "expense", amount: 73000, category_id: null });
});

test("§5.1c: новая группа Tricount — соседи и начальный баланс одним вызовом", async () => {
  const onCreated = jest.fn();
  render(<SharedGroupFormPage group={null} createMode="mirror" data={{ groups: [], members: [], entries: [], transactions: [], debtEvents: [], accounts: [kaspi] }}
    people={people} setPeople={jest.fn()} cats={expCats} expCats={expCats} onBack={jest.fn()} onDeleted={jest.fn()} onCreated={onCreated}/>);
  expect(screen.getByText("Новая группа Tricount")).toBeInTheDocument();
  expect(screen.queryByText("Категория мелочей")).toBeNull();                  // при создании — без выбора категории
  userEvent.type(screen.getByPlaceholderText("Например, Квартира"), "Квартира");
  expect(screen.queryByText("Удалить группу")).toBeNull();
  userEvent.click(screen.getByText("＋ Человек"));
  userEvent.click(within(screen.getByRole("dialog", { name: "Человек из «Люди»" })).getByText("Дима"));
  userEvent.click(screen.getByText("Добавить (1)"));
  userEvent.type(screen.getByLabelText("Начальный баланс"), "20000");
  userEvent.click(screen.getByText("Создать"));
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  const [fn, { p }] = supaRpc.mock.calls[0];
  expect(fn).toBe("save_shared_entry");
  expect(p.group).toMatchObject({ mode: "mirror", name: "Квартира", minor_category_id: null });
  expect(p.members.map(m => m.person_id || "me")).toEqual(["me", "p-dima"]);
  expect(p.entries).toEqual([expect.objectContaining({ kind: "opening", amount_group: -20000 })]);
  expect(onCreated).toHaveBeenCalledWith(p.group.id);
});

test("настройки квартиры: правка начального баланса — в том же вызове", async () => {
  const opening = { id: "o1", group_id: "f1", kind: "opening", date: `${month}-01`, amount: -20000, amount_group: -20000 };
  const onBack = jest.fn();
  render(<SharedGroupFormPage group={flat} data={{ groups: [flat], members, entries: [opening], transactions: [], debtEvents: [], accounts: [kaspi] }}
    people={people} setPeople={jest.fn()} cats={expCats} expCats={expCats} onBack={onBack} onDeleted={jest.fn()}/>);
  const input = screen.getByLabelText("Начальный баланс");
  expect(input).toHaveValue("₸20 000");
  userEvent.clear(input);
  userEvent.type(input, "25000");
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  expect(supaRpc.mock.calls[0][1].p).toMatchObject({ entries: [{ id: "o1", kind: "opening", amount_group: -25000 }], delete_entry_ids: [] });
});

test("§12.1: Tricount в списке — баланс с группой и метка; в шторке — два типа", () => {
  const navigate = jest.fn();
  render(<SharedGroupsListPage groups={[flat]} members={members} entries={october} navigate={navigate} onBack={jest.fn()}/>);
  expect(screen.getByText("Я должен ₸73 000")).toBeInTheDocument();
  expect(screen.getByText("Tricount")).toBeInTheDocument();
  expect(screen.getByText("за месяц ₸113 000")).toBeInTheDocument();
  userEvent.click(screen.getByLabelText("Добавить"));
  expect(screen.queryByText("Мне оплатили")).toBeNull();
  expect(screen.getByText("Туса с друзьями")).toBeInTheDocument();
  userEvent.click(screen.getAllByText("Tricount").pop());
  expect(navigate).toHaveBeenCalledWith("addSharedGroup", { mode: "mirror" });
});
