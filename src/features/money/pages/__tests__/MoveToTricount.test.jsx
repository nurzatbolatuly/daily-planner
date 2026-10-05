import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedGroupDetailPage } from "../SharedGroupDetailPage";
import { SharedMirrorPage } from "../SharedMirrorPage";
import { supaRpc } from "../../../../lib/supabase";
import { todayStr } from "../../../../utils/date";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()), supaUpsert: jest.fn() }));

// Туса «Шашлыки»: я оплатил 29 730 на троих. Бек — из «Люди», он же в двух группах Tricount; Асан — гость.
const tusa = { id: "t1", name: "Шашлыки", mode: "event", currency: "KZT", date: "2026-10-03" };
const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
const office = { id: "f2", name: "Офис", mode: "mirror", currency: "KZT" };
const members = [
  { id: "me", group_id: "t1", is_me: true }, { id: "bek", group_id: "t1", person_id: "p-bek", sort_order: 1 }, { id: "asan", group_id: "t1", guest_name: "Асан", sort_order: 2 },
  { id: "me2", group_id: "f1", is_me: true }, { id: "bek2", group_id: "f1", person_id: "p-bek" },
  { id: "me3", group_id: "f2", is_me: true }, { id: "bek3", group_id: "f2", person_id: "p-bek" },
];
const sh = (member_id, amount) => ({ member_id, amount, heads: 1, mode: "auto" });
const bill = { id: "b1", group_id: "t1", kind: "bill", date: "2026-10-03", title: "Мясо", payer_member_id: "me", amount: 29730, amount_group: 29730, category_id: "rest",
  shares: [sh("me", 9910), sh("bek", 9910), sh("asan", 9910)] };
const people = [{ id: "p-bek", name: "Бек" }];
const expCats = [{ id: "rest", name: "Рестораны", icon: "eating" }];

const renderTusa = (groups, entries = [bill]) => {
  const onReload = jest.fn(() => Promise.resolve());
  render(<SharedGroupDetailPage group={tusa} groups={groups} members={members} entries={entries} people={people}
    accounts={[]} expCats={expCats} navigate={jest.fn()} onReload={onReload} onBack={jest.fn()}/>);
  return { onReload };
};

beforeEach(() => supaRpc.mockClear());

test("Бек есть в двух группах Tricount — выбор группы, долг закрывается в тусе и записывается туда", async () => {
  const { onReload } = renderTusa([tusa, flat, office]);
  userEvent.click(screen.getByText("Бек"));
  userEvent.click(screen.getByText("Записать в Tricount"));
  expect(screen.getByText("Куда записать")).toBeInTheDocument();
  userEvent.click(screen.getByRole("radio", { name: /Офис/ }));
  expect(screen.getByText("Долг с тусы «Шашлыки»")).toBeInTheDocument();
  userEvent.click(screen.getByText("Записать в «Офис»"));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  const [t, b] = supaRpc.mock.calls[0][1].p.entries;
  expect(t).toMatchObject({ group_id: "t1", kind: "transfer", method: "group", from_member_id: "bek", amount: 9910, note: "Записано в Tricount «Офис»" });
  expect(b).toMatchObject({ group_id: "f2", kind: "bill", payer_member_id: "me3", amount: 9910, title: "Долг с тусы «Шашлыки»", shares: [expect.objectContaining({ member_id: "bek3" })] });
});

test("гостю (нет в группах Tricount) кнопки нет; одна группа — без выбора", () => {
  renderTusa([tusa, flat]);
  userEvent.click(screen.getByText("Асан"));
  expect(screen.queryByText("Записать в Tricount")).toBeNull();
});

test("перенесённый долг в тусе — «записано в Tricount», тап — отмена всей пары", async () => {
  const moved = [
    { id: "tr", group_id: "t1", kind: "transfer", date: todayStr(), from_member_id: "bek", to_member_id: "me", amount: 9910, amount_group: 9910, method: "group", batch_id: "B", note: "Записано в Tricount «Квартира»" },
    { id: "bl", group_id: "f1", kind: "bill", date: todayStr(), payer_member_id: "me2", amount: 9910, amount_group: 9910, batch_id: "B", title: "Долг с тусы «Шашлыки»", shares: [sh("bek2", 9910)] },
  ];
  const { onReload } = renderTusa([tusa, flat], [bill, ...moved]);
  expect(screen.getByText(/Записано в Tricount «Квартира»/)).toBeInTheDocument();
  userEvent.click(screen.getByText(/Записано в Tricount «Квартира»/));
  userEvent.click(screen.getByRole("button", { name: "Отменить" }));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  expect(supaRpc.mock.calls[0][1].p.ids).toEqual(["tr", "bl"]);

  // со стороны Tricount — то же самое
  supaRpc.mockClear();
  render(<SharedMirrorPage group={flat} members={members} entries={[bill, ...moved]} people={people} accounts={[]} expCats={expCats}
    navigate={jest.fn()} onReload={onReload} onBack={jest.fn()}/>);
  userEvent.click(screen.getByText("Долг с тусы «Шашлыки»"));
  expect(screen.getByText("Отменить перенос с тусы?")).toBeInTheDocument();
  userEvent.click(screen.getAllByRole("button", { name: "Отменить" }).pop());
  await waitFor(() => expect(supaRpc).toHaveBeenCalled());
  expect(supaRpc.mock.calls[0][1].p.ids).toEqual(["tr", "bl"]);
});
