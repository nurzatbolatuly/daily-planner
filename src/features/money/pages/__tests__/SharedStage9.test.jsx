import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedEntryFormPage } from "../SharedEntryFormPage";
import { SharedTransferFormPage } from "../SharedTransferFormPage";
import { SharedGroupFormPage } from "../SharedGroupFormPage";
import { MakeSharedButton } from "../../components/MakeSharedButton";
import { supaRpc } from "../../../../lib/supabase";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()), supaUpsert: jest.fn(() => Promise.resolve()) }));

// Счёт в тенге и счёт в лирах (avg_rate даёт курс TRY → KZT для подсказки «≈»).
const kaspi = { id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000, icon: "bank", color: "#f00" };
const tryAcc = { id: "try", name: "Лиры", currency: "TRY", balance: 500, avg_rate: 15.7, icon: "cash", color: "#0f0" };
const expCats = [{ id: "rest", name: "Рестораны", icon: "eating", color: "#0f0" }];
const sh = (member_id, amount, heads = 1) => ({ member_id, amount, heads, mode: "auto" });
const group = { id: "g1", name: "Вечер 03.10", currency: "KZT", date: "2026-10-03", mode: "event" };

beforeEach(() => { supaRpc.mockClear(); localStorage.clear(); });

describe("счёт", () => {
  const members = [{ id: "me", group_id: "g1", is_me: true, heads: 1, sort_order: 0 }, { id: "bek", group_id: "g1", guest_name: "Бек", heads: 1, sort_order: 1 }];
  const renderBill = props => {
    const onSaved = jest.fn();
    render(<SharedEntryFormPage group={group} groups={[group]} members={members} entries={[]} accounts={[kaspi, tryAcc]} transactions={[]}
      expCats={expCats} people={[]} setPeople={jest.fn()} onBack={jest.fn()} onSaved={onSaved} {...props}/>);
    return { onSaved };
  };

  test("§5.18: чек в лирах с тенговой карты — нужно, сколько списалось; долг в тенге", async () => {
    const { onSaved } = renderBill();
    userEvent.click(screen.getByLabelText("Валюта чека"));
    userEvent.click(screen.getByText("Турецкая лира"));
    userEvent.type(screen.getAllByPlaceholderText("0")[0], "3000");
    userEvent.click(screen.getByText("Рестораны"));
    expect(screen.getByText("Списалось со счёта, KZT")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    expect(await screen.findByText(/Сколько списалось со счёта/)).toBeInTheDocument();

    userEvent.click(screen.getByText("Подставить ≈ ₸47 100"));
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.tx).toMatchObject({ amount: 47100, currency: "KZT", account_id: "kaspi" });
    expect(p.entries[0]).toMatchObject({ currency: "TRY", amount: 3000, account_amount: 47100, amount_group: 47100 });
    expect(p.entries[0].shares.map(s => s.amount)).toEqual([1500, 1500]); // доли — в лирах
  });

  test("§5.13: «Сделать общим» — сумма, счёт и дата из транзакции, новая не создаётся", async () => {
    const linkTx = { id: "t9", type: "expense", amount: 29730, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-03", note: "бар" };
    const { onSaved } = renderBill({ linkTx, transactions: [linkTx] });
    expect(screen.getByText(/Привязано к транзакции Kaspi · ₸29 730/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("₸29 730")).toBeDisabled();
    expect(screen.queryByText("С какого счёта")).toBeNull();
    expect(screen.queryByText("Платил")).toBeNull();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p).toMatchObject({ tx: null, tx_delete_id: null, balances: [] });
    expect(p.entries[0]).toMatchObject({ transaction_id: "t9", title: "бар", category_id: "rest", linked_tx_snapshot: { category_id: "rest", note: "бар" } });
  });

  test("§5.19: «Доплатил с другого счёта» — тот же состав и название, другой счёт", async () => {
    const first = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Ужин", currency: "KZT", category_id: "rest", account_id: "kaspi",
      amount: 30000, amount_group: 30000, payer_member_id: "me", shares: [sh("me", 10000), sh("bek", 20000, 2)] };
    const { onSaved } = renderBill({ copyFrom: first });
    expect(screen.getByDisplayValue("Ужин")).toBeInTheDocument();
    const amount = screen.getAllByPlaceholderText("0")[0];
    expect(amount).toHaveValue("");
    userEvent.type(amount, "6000");
    expect(screen.getByText("× 2")).toBeInTheDocument(); // компашка × 2 из первого счёта
    // Kaspi — счёт первой части, поэтому по умолчанию другой счёт (в лирах): нужна сумма списания
    userEvent.type(screen.getAllByPlaceholderText(/≈|0/)[1], "382");
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.entries[0].id).not.toBe("b1");
    expect(p.entries[0]).toMatchObject({ account_id: "try", title: "Ужин", category_id: "rest", currency: "KZT", amount: 6000, amount_group: 6000, account_amount: 382 });
    expect(p.tx).toMatchObject({ amount: 382, currency: "TRY" });
    expect(p.entries[0].shares.map(s => s.amount)).toEqual([2000, 4000]);
  });

  test("из правки своего счёта — кнопка «Доплатил с другого счёта»", () => {
    const onPayRest = jest.fn();
    const entry = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", currency: "KZT", category_id: "rest", amount: 1000, amount_group: 1000,
      payer_member_id: "me", shares: [sh("me", 500), sh("bek", 500)] };
    renderBill({ entry, onPayRest });
    userEvent.click(screen.getByText("Доплатил с другого счёта ›"));
    expect(onPayRest).toHaveBeenCalledWith(entry);
  });
});

test("«Сделать общим» недоступно при сплите «Оплатил за других»", () => {
  const tx = { id: "t1", type: "expense" };
  const onPick = jest.fn();
  const { rerender } = render(<MakeSharedButton tx={tx} debtEvents={[{ transaction_id: "t1", type: "paid_for_them" }]} groups={[group]} onPick={onPick}/>);
  expect(screen.getByRole("button", { name: /Сделать общим/ })).toBeDisabled();
  expect(screen.getByText(/Сначала уберите разделение с людьми/)).toBeInTheDocument();

  rerender(<MakeSharedButton tx={tx} debtEvents={[]} groups={[group, { ...group, id: "g2", name: "Старый", archived: true }]} onPick={onPick}/>);
  userEvent.click(screen.getByRole("button", { name: /Сделать общим/ }));
  expect(screen.queryByText("Старый")).toBeNull(); // архивные не предлагаются
  userEvent.click(screen.getByText("Вечер 03.10"));
  expect(onPick).toHaveBeenCalledWith("g1");
});

describe("перевод", () => {
  const members = [
    { id: "me", group_id: "g1", is_me: true }, { id: "bek1", group_id: "g1", person_id: "p-bek", heads: 1, sort_order: 1 },
    { id: "me2", group_id: "g2", is_me: true }, { id: "bek2", group_id: "g2", person_id: "p-bek", sort_order: 1 },
  ];
  const g2 = { id: "g2", name: "Вечер 10.10", currency: "KZT", date: "2026-10-10", mode: "event" };
  const entries = [
    { id: "x1", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "me", amount: 30000, amount_group: 30000, shares: [sh("me", 7500), sh("bek1", 22500)] },
    { id: "x2", group_id: "g2", kind: "bill", date: "2026-10-10", payer_member_id: "me2", amount: 8000, amount_group: 8000, shares: [sh("me2", 4000), sh("bek2", 4000)] },
  ];
  const people = [{ id: "p-bek", name: "Бек" }];
  const renderTransfer = props => {
    const onBack = jest.fn();
    render(<SharedTransferFormPage group={group} groups={[group, g2]} memberId="bek1" direction="in" members={members} entries={entries}
      people={people} setPeople={jest.fn()} accounts={[kaspi]} transactions={[]} debtEvents={[]} onBack={onBack} {...props}/>);
    return { onBack };
  };

  test("§5.14: Бек одним платежом за два вечера — одна транзакция, две записи пачкой", async () => {
    const { onBack } = renderTransfer();
    userEvent.click(screen.getByText("＋ Этим же платежом закрыть ещё долг"));
    userEvent.click(screen.getByRole("checkbox", { name: /Вечер 10.10/ }));
    userEvent.click(screen.getByText("Готово"));
    const amount = screen.getAllByDisplayValue("₸22 500")[0]; // сумма платежа (первое поле)
    userEvent.clear(amount);
    userEvent.type(amount, "26500");
    expect(screen.getByText("Распределено ₸26 500 ✓")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull(); // для пачки варианты закрытия не предлагаются

    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.tx).toMatchObject({ amount: 26500, type: "income", note: "Перевод · 2 долга ← Бек" });
    expect(p.entries.map(e => [e.group_id, e.from_member_id, e.to_member_id, e.amount])).toEqual([["g1", "bek1", "me", 22500], ["g2", "bek2", "me2", 4000]]);
    expect(new Set(p.entries.map(e => e.batch_id)).size).toBe(1);
  });

  test("части пачки правятся вручную; сумма частей должна совпасть с платежом", async () => {
    renderTransfer();
    userEvent.click(screen.getByText("＋ Этим же платежом закрыть ещё долг"));
    userEvent.click(screen.getByRole("checkbox", { name: /Вечер 10.10/ }));
    userEvent.click(screen.getByText("Готово"));
    const part = screen.getByLabelText("Часть: Бек");
    userEvent.clear(part);
    userEvent.type(part, "20000");
    expect(screen.getByText("Не распределено ₸2 500")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    expect(await screen.findByText(/Сумма частей не равна платежу/)).toBeInTheDocument();
    expect(supaRpc).not.toHaveBeenCalled();
  });

  test("§5.13: доход уже записан — привязка вместо новой операции", async () => {
    const income = { id: "i1", type: "income", amount: 22500, currency: "KZT", category_id: "gift", account_id: "kaspi", date: "2026-10-04", note: "от Бека" };
    const { onBack } = renderTransfer({ transactions: [income] });
    userEvent.click(screen.getByText("Уже записан? Выбрать транзакцию ›"));
    userEvent.click(screen.getByText("от Бека"));
    expect(screen.getByText(/Привязано к операции 4 октября · ₸22 500/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("₸22 500")).toBeDisabled();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.tx).toMatchObject({ id: "i1", category_id: null, note: "Перевод · Вечер 03.10 ← Бек · от Бека" });
    expect(p.balances).toEqual([]);
    expect(p.entries[0]).toMatchObject({ date: "2026-10-04", transaction_id: "i1" });
  });
});

test("смена валюты группы — предупреждение с пересчётом долгов и amount_group в том же вызове", async () => {
  const usd = { id: "usd", name: "USD", currency: "USD", balance: 100, avg_rate: 500 };
  const members = [{ id: "me", group_id: "g1", is_me: true, sort_order: 0 }, { id: "bek", group_id: "g1", guest_name: "Бек", sort_order: 1 }];
  const entries = [{ id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", currency: "KZT", payer_member_id: "me", amount: 20000, amount_group: 20000, shares: [sh("me", 10000), sh("bek", 10000)] }];
  const onBack = jest.fn();
  render(<SharedGroupFormPage group={group} data={{ groups: [group], members, entries, transactions: [], debtEvents: [], accounts: [kaspi, usd] }}
    people={[]} setPeople={jest.fn()} cats={expCats} onBack={onBack} onDeleted={jest.fn()}/>);
  userEvent.click(screen.getByLabelText("Валюта группы"));
  userEvent.click(screen.getByText("Доллар США"));
  expect(screen.getByText(/Долги пересчитаются по сегодняшнему курсу/)).toBeInTheDocument();
  expect(screen.getByText("Бек: ₸10 000 → $20")).toBeInTheDocument();
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  expect(supaRpc.mock.calls[0][1].p).toMatchObject({ currency: "USD", amounts: [{ id: "b1", amount_group: 40 }] });
});
