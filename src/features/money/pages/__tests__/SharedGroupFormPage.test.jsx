import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedGroupFormPage } from "../SharedGroupFormPage";
import { SharedGroupDetailPage } from "../SharedGroupDetailPage";
import { SharedGroupsListPage } from "../SharedGroupsListPage";
import { supaRpc } from "../../../../lib/supabase";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()), supaUpsert: jest.fn(() => Promise.resolve()) }));

// Вечер §5.2: ужин 29 730 оплатил я с Kaspi; Асан вернул 9 910, Бек должен 9 910; Даурен ни в чём не участвует.
const group = { id: "g1", name: "Вечер 03.10", currency: "KZT", date: "2026-10-03", mode: "event", archived: false };
const members = [
  { id: "me", group_id: "g1", is_me: true, heads: 1, sort_order: 0 },
  { id: "asan", group_id: "g1", guest_name: "Асан", heads: 1, sort_order: 1 },
  { id: "bek", group_id: "g1", guest_name: "Бек", heads: 1, sort_order: 2 },
  { id: "dauren", group_id: "g1", guest_name: "Даурен", heads: 1, sort_order: 3 },
];
const sh = (member_id, amount) => ({ member_id, amount, heads: 1, mode: "auto" });
const entries = [
  { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Ужин", payer_member_id: "me", amount: 29730, amount_group: 29730, category_id: "rest",
    shares: [sh("me", 9910), sh("asan", 9910), sh("bek", 9910)], transaction_id: "tx1", account_id: "kaspi" },
  { id: "t1", group_id: "g1", kind: "transfer", date: "2026-10-04", from_member_id: "asan", to_member_id: "me", amount: 9910, amount_group: 9910, method: "cash" },
];
const accounts = [{ id: "kaspi", name: "Kaspi", currency: "KZT", balance: 70270 }];
const transactions = [{ id: "tx1", type: "expense", amount: 29730, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-03" }];
const cats = [{ id: "rest", name: "Рестораны", icon: "eating" }];
const data = { groups: [group], members, entries, transactions, debtEvents: [], accounts };

const renderForm = (extra = {}) => {
  const onBack = jest.fn();
  const onDeleted = jest.fn();
  render(<SharedGroupFormPage group={group} data={data} people={[]} setPeople={jest.fn()} cats={cats} onBack={onBack} onDeleted={onDeleted} {...extra}/>);
  return { onBack, onDeleted };
};

beforeEach(() => supaRpc.mockClear());

test("§7.5: переименовать группу и участника, удалить неиспользуемого — одним вызовом", async () => {
  const { onBack } = renderForm();
  userEvent.clear(screen.getByDisplayValue("Вечер 03.10"));
  userEvent.type(screen.getByRole("textbox"), "Вечер у Бека");

  userEvent.click(screen.getByText("Асан"));
  userEvent.type(screen.getByPlaceholderText("Асан"), "Компашка Асана");
  userEvent.click(screen.getByLabelText("Больше"));
  userEvent.click(screen.getByText("Готово"));

  userEvent.click(screen.getByText("Даурен"));
  userEvent.click(screen.getByText("Удалить участника"));
  expect(screen.queryByText("Даурен")).toBeNull();

  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const [fn, { p }] = supaRpc.mock.calls[0];
  expect(fn).toBe("save_shared_members");
  expect(p.group).toMatchObject({ id: "g1", name: "Вечер у Бека", mode: "event" });
  expect(p.members).toEqual([expect.objectContaining({ id: "asan", label: "Компашка Асана", heads: 2 })]);
  expect(p.delete_member_ids).toEqual(["dauren"]);
});

test("§7.5: участник в записях не удаляется — видно, где он есть", () => {
  renderForm();
  userEvent.click(screen.getByText("Асан"));
  expect(screen.queryByText("Удалить участника")).toBeNull();
  expect(screen.getByText(/Есть в записях: Ужин, перевод/)).toBeInTheDocument();
});

test("§12.0: «назад» с несохранёнными изменениями — подтверждение", () => {
  const { onBack } = renderForm();
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByLabelText("Назад"));
  expect(onBack).not.toHaveBeenCalled();
  userEvent.click(screen.getByRole("button", { name: "Выйти" }));
  expect(onBack).toHaveBeenCalledWith(false);
});

test("§7.6: удаление с операциями — по умолчанию оставить; «удалить вместе» откатывает баланс", async () => {
  const { onDeleted } = renderForm();
  userEvent.click(screen.getByText("Удалить группу"));
  expect(screen.getByText("1 счёт · 1 перевод")).toBeInTheDocument();
  expect(screen.getByText("Kaspi −₸29 730")).toBeInTheDocument();
  expect(screen.getByText(/Бек должен вам ₸9 910/)).toBeInTheDocument();
  expect(screen.getByText("В архив — ничего не удалять")).toBeInTheDocument();
  expect(screen.getByText("Статистика: Рестораны +₸19 820")).toBeInTheDocument(); // полная сумма вместо доли 9 910

  userEvent.click(screen.getByText("Удалить вместе с операциями"));
  expect(screen.getByText("Статистика: Рестораны −₸9 910")).toBeInTheDocument();
  userEvent.click(screen.getByRole("button", { name: "Удалить" }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  expect(supaRpc).toHaveBeenCalledWith("delete_shared_group", { p: { group_id: "g1", tx_delete_ids: ["tx1"], tx_restore: [], balances: [{ account_id: "kaspi", balance: 100000, delta: 29730 }] } });
});

test("§7.6: «В архив» из удаления — шторка закрытия с прощением долга", async () => {
  const { onBack } = renderForm();
  userEvent.click(screen.getByText("Удалить группу"));
  userEvent.click(screen.getByText("В архив — ничего не удалять"));
  const sheet = screen.getByRole("group", { name: "Ещё должны мне" });
  expect(within(sheet).getByText("Бек")).toBeInTheDocument();
  userEvent.click(screen.getByText("Простить всё оставшееся — ₸9 910"));
  userEvent.click(screen.getAllByRole("button", { name: "В архив" }).pop()); // кнопка шторки, не страницы
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const [fn, { p }] = supaRpc.mock.calls[0];
  expect(fn).toBe("save_shared_entry");
  expect(p.group).toMatchObject({ id: "g1", archived: true });
  expect(p.entries).toEqual([expect.objectContaining({ reason: "treat", member_id: "bek", amount_group: 9910, bill_id: "b1" })]);
});

test("§12.3: экран тусы — «Закрыть группу», по умолчанию долги остаются", async () => {
  const onReload = jest.fn(() => Promise.resolve());
  render(<SharedGroupDetailPage group={group} groups={[group]} members={members} entries={entries} people={[]}
    accounts={accounts} expCats={cats} navigate={jest.fn()} onReload={onReload} onBack={jest.fn()}/>);
  userEvent.click(screen.getByText("Закрыть группу"));
  userEvent.click(screen.getByRole("button", { name: "В архив" }));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  expect(supaRpc.mock.calls[0][1].p).toMatchObject({ group: { archived: true }, entries: [] });
});

test("§12.1: архив свёрнут внизу списка, группы с долгом отмечены", () => {
  const archived = { ...group, id: "g2", name: "Вечер 01.09", archived: true };
  const ms2 = members.map(m => ({ ...m, id: `${m.id}2`, group_id: "g2" }));
  const es2 = [{ ...entries[0], id: "b2", group_id: "g2", payer_member_id: "me2", transaction_id: null, shares: [sh("me2", 9910), sh("asan2", 9910), sh("bek2", 9910)] }];
  render(<SharedGroupsListPage groups={[group, archived]} members={[...members, ...ms2]} entries={[...entries, ...es2]} navigate={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.queryByText("Вечер 01.09")).toBeNull();
  expect(screen.getByText("· 1 с долгом")).toBeInTheDocument();
  userEvent.click(screen.getByText(/Архив \(1\)/));
  expect(screen.getByText("Вечер 01.09")).toBeInTheDocument();
});
