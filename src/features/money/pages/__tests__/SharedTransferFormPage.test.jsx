import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedTransferFormPage } from "../SharedTransferFormPage";
import { supaRpc } from "../../../../lib/supabase";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()) }));

const group = { id: "g1", name: "Вечер 03.10", currency: "KZT", date: "2026-10-03" };
const members = [
  { id: "me", group_id: "g1", is_me: true, heads: 1 },
  { id: "asan", group_id: "g1", guest_name: "Асан", heads: 1 },
  { id: "bek", group_id: "g1", guest_name: "Бек", heads: 3 },
];
const accounts = [{ id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000 }];
const sh = (member_id, amount, heads = 1) => ({ member_id, amount, heads, mode: "auto" });
const dinner = { id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Ужин", payer_member_id: "me", amount: 29730, amount_group: 29730,
  shares: [sh("me", 9910), sh("asan", 9910), sh("bek", 9910)] };

const renderForm = (props) => {
  const onBack = jest.fn();
  render(<SharedTransferFormPage group={group} members={members} entries={[dinner]} people={[]} accounts={accounts} transactions={[]}
    direction="in" onBack={onBack} {...props}/>);
  return { onBack };
};

beforeEach(() => supaRpc.mockClear());

test("§5.2: Асан прислал 10 000 — по умолчанию округление 90, одно сохранение", async () => {
  const { onBack } = renderForm({ memberId: "asan" });
  const input = screen.getByDisplayValue("₸9 910");                   // по умолчанию — весь долг
  userEvent.clear(input);
  userEvent.type(input, "10000");
  expect(screen.getByText("Лишние ₸90 — округление")).toBeInTheDocument();       // без выбора — всегда округление
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByText(/я должен ему/)).toBeNull();
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.tx).toMatchObject({ type: "income", amount: 10000, category_id: null });
  expect(p.entries[1]).toMatchObject({ reason: "rounding", amount_group: -90, bill_id: "b1" });
  expect(p.balances).toEqual([{ account_id: "kaspi", balance: 110000, delta: 10000 }]);
});

test("компашка × 3: кнопки «за 1 / за 2 / за всех», недоплата — по умолчанию долг остаётся", async () => {
  const bekDinner = { ...dinner, shares: [sh("me", 6000), sh("bek", 18000, 3)], amount: 24000, amount_group: 24000 };
  render(<SharedTransferFormPage group={group} memberId="bek" direction="in" members={members} entries={[bekDinner]} people={[]}
    accounts={accounts} transactions={[]} onBack={jest.fn()}/>);
  expect(screen.getByText("за 1 · ₸6 000")).toBeInTheDocument();
  expect(screen.getByText("за всех · ₸18 000")).toBeInTheDocument();
  userEvent.click(screen.getByText("за 2 · ₸12 000"));
  expect(screen.getByDisplayValue("₸12 000")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Оставить долг ₸6 000/ })).toHaveAttribute("aria-checked", "true");
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(supaRpc).toHaveBeenCalled());
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.entries).toHaveLength(1);
  expect(p.entries[0]).toMatchObject({ heads_covered: 2, amount: 12000 });
});

test("аванс: перевод до счетов — без вариантов закрытия", () => {
  render(<SharedTransferFormPage group={group} memberId="asan" direction="in" members={members} entries={[]} people={[]}
    accounts={accounts} transactions={[]} onBack={jest.fn()}/>);
  userEvent.type(screen.getByPlaceholderText("0"), "5000");
  expect(screen.getByText(/сохранится как аванс/)).toBeInTheDocument();
  expect(screen.queryByRole("radio")).toBeNull();
});

test("§5.10: «От кого» — по умолчанию контакт, можно «без имени»", async () => {
  renderForm({ memberId: "bek" });
  expect(screen.getByText("От кого")).toBeInTheDocument();
  userEvent.click(screen.getByRole("button", { name: "Без имени" }));
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(supaRpc).toHaveBeenCalledTimes(1));
  expect(supaRpc.mock.calls[0][1].p.entries[0]).toMatchObject({ from_member_id: "bek", sender_person_id: null, sender_name: null });
});
