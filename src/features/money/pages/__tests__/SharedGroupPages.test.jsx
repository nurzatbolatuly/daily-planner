import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedGroupDetailPage } from "../SharedGroupDetailPage";
import { SharedGroupsListPage } from "../SharedGroupsListPage";
import { supaRpc } from "../../../../lib/supabase";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()) }));

const group = { id: "g1", name: "Вечер 03.10", currency: "KZT", date: "2026-10-03", mode: "event" };
const members = [
  { id: "me", group_id: "g1", is_me: true, heads: 1, sort_order: 0 },
  { id: "asan", group_id: "g1", guest_name: "Асан", heads: 1, sort_order: 1 },
  { id: "bek", group_id: "g1", person_id: "p-bek", heads: 3, sort_order: 2 },
];
const sh = (member_id, amount, heads = 1) => ({ member_id, amount, heads, mode: "auto" });
const entries = [
  { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Ужин", payer_member_id: "me", amount: 30000, amount_group: 30000, category_id: "rest", account_id: "kaspi",
    shares: [sh("me", 6000), sh("asan", 6000), sh("bek", 18000, 3)] },
  { id: "t1", group_id: "g1", kind: "transfer", date: "2026-10-04", from_member_id: "asan", to_member_id: "me", amount: 6000, amount_group: 6000 },
];
const people = [{ id: "p-bek", name: "Бек" }];
// Другой вечер с гостем «Асан» — может быть другим человеком (§7.2).
const group2 = { id: "g2", name: "Вечер 20.11", currency: "KZT", date: "2026-11-20", mode: "event" };
const members2 = [
  { id: "me2", group_id: "g2", is_me: true, heads: 1 },
  { id: "asan2", group_id: "g2", guest_name: "асан", heads: 1 },
];

const renderDetail = () => {
  const navigate = jest.fn();
  const onReload = jest.fn(() => Promise.resolve());
  render(<SharedGroupDetailPage group={group} groups={[group, group2]} members={[...members, ...members2]} entries={entries} people={people}
    accounts={[{ id: "kaspi", name: "Kaspi" }]} expCats={[{ id: "rest", name: "Рестораны", icon: "eating" }]}
    navigate={navigate} onReload={onReload} onBack={jest.fn()}/>);
  return { navigate, onReload };
};

test("экран вечера: моя доля, кто сколько должен, счета, переводы", () => {
  const { navigate } = renderDetail();
  expect(screen.getAllByText("₸6 000").length).toBeGreaterThan(0);       // моя доля
  expect(screen.getByText("₸18 000")).toBeInTheDocument();                // мне должны
  expect(screen.getByText("₸18 000 · не вернул")).toBeInTheDocument();    // Бек × 3
  expect(screen.getByText("закрыто ✓")).toBeInTheDocument();              // Асан вернул
  expect(screen.getByText("← Асан")).toBeInTheDocument();                 // перевод
  userEvent.click(screen.getByText("Получено"));
  expect(navigate).toHaveBeenCalledWith("addSharedTransfer", { groupId: "g1", memberId: "bek", direction: "in" });
  userEvent.click(screen.getByText("Ужин"));
  expect(navigate).toHaveBeenCalledWith("editSharedEntry", { entryId: "b1" });
  userEvent.click(screen.getByText("Счёт"));
  expect(navigate).toHaveBeenCalledWith("addSharedBill", { groupId: "g1" });
});

test("шторка участника: раскладка долга и «угощаю» одним сохранением", async () => {
  supaRpc.mockClear();
  const { onReload } = renderDetail();
  userEvent.click(screen.getByText("Бек × 3"));
  expect(screen.getByText("Ужин — твоя доля ₸18 000")).toBeInTheDocument();
  expect(screen.getByText("Должен мне ₸18 000")).toBeInTheDocument();
  userEvent.click(screen.getByText("Угощаю — простить весь долг"));
  userEvent.click(screen.getByRole("button", { name: "Угощаю" }));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  const [fn, { p }] = supaRpc.mock.calls[0];
  expect(fn).toBe("save_shared_entry");
  expect(p.entries).toEqual([expect.objectContaining({ kind: "adjust", reason: "treat", member_id: "bek", amount_group: 18000, bill_id: "b1" })]);
});

test("§5.7: счёт, оплаченный участником, — «платил Асан», «угостили меня» на строке", () => {
  const byAsan = { id: "b2", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Бильярд", payer_member_id: "asan", amount: 8000, amount_group: 8000, category_id: "rest",
    shares: [sh("me", 4000), sh("asan", 4000)] };
  const treat = { id: "a1", group_id: "g1", kind: "adjust", date: "2026-10-03", member_id: "asan", reason: "treated_me", amount_group: -4000, bill_id: "b2", transfer_id: null };
  render(<SharedGroupDetailPage group={group} groups={[group]} members={members} entries={[...entries, byAsan, treat]} people={people}
    accounts={[{ id: "kaspi", name: "Kaspi" }]} expCats={[{ id: "rest", name: "Рестораны", icon: "eating" }]}
    navigate={jest.fn()} onReload={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.getByText("платил Асан · 3 октября")).toBeInTheDocument();
  expect(screen.getByText("угостили меня")).toBeInTheDocument();
  expect(screen.queryByText(/угостили меня ·/)).toBeNull(); // не дублируется отдельной строкой «угощаю»
});

test("§7.2: «Сохранить в Люди» — все вечера с этим именем, по умолчанию только текущий", async () => {
  supaRpc.mockClear();
  const { onReload } = renderDetail();
  userEvent.click(screen.getByText("Асан"));
  userEvent.click(screen.getByText("Сохранить в «Люди»"));
  expect(screen.getByText("Вечер 03.10 · этот")).toBeInTheDocument();
  expect(screen.getByText("Вечер 20.11")).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox").map(c => c.getAttribute("aria-checked"))).toEqual(["false", "true"]); // свежие сверху
  userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.people).toEqual([expect.objectContaining({ name: "Асан", archived: false })]);
  expect(p.members).toEqual([expect.objectContaining({ id: "asan", person_id: p.people[0].id, guest_name: null })]);
  expect(p.entries).toEqual([]);
});

test("список групп: пустое состояние и строка вечера", () => {
  const navigate = jest.fn();
  const { rerender } = render(<SharedGroupsListPage groups={[]} members={[]} entries={[]} navigate={navigate} onBack={jest.fn()}/>);
  expect(screen.getByText("Общих расходов пока нет")).toBeInTheDocument();
  userEvent.click(screen.getByText("Туса с друзьями"));
  expect(navigate).toHaveBeenCalledWith("addSharedBill", {});
  userEvent.click(screen.getByText("Tricount"));
  expect(navigate).toHaveBeenCalledWith("addSharedGroup", { mode: "mirror" });

  rerender(<SharedGroupsListPage groups={[group]} members={members} entries={entries} navigate={navigate} onBack={jest.fn()}/>);
  expect(screen.getByText("Мне должны ₸18 000 · 1 из 2 ✓")).toBeInTheDocument();
  userEvent.click(screen.getByText("Вечер 03.10"));
  expect(navigate).toHaveBeenCalledWith("sharedGroup", { groupId: "g1" });
});

test("экран тусы: «Переименовать» в шторке участника — save_shared_members с новым названием", async () => {
  supaRpc.mockClear();
  const { onReload } = renderDetail();
  userEvent.click(screen.getByText("Бек × 3"));
  userEvent.click(screen.getByText("Переименовать"));
  const input = screen.getByRole("textbox", { name: "Название участника" });
  expect(input).toHaveAttribute("placeholder", "Бек × 3");
  userEvent.type(input, "Компашка Бека");
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  const [fn, { p }] = supaRpc.mock.calls[0];
  expect(fn).toBe("save_shared_members");
  expect(p).toMatchObject({ group_id: "g1", members: [expect.objectContaining({ id: "bek", label: "Компашка Бека", person_id: "p-bek" })] });
});
