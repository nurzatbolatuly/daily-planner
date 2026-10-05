import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TxPage } from "../TxPage";

jest.mock("../../../../lib/supabase", () => ({ supabase: { from: jest.fn() }, supaRpc: jest.fn(), supaUpsert: jest.fn() }));

const accounts = [{ id: "kaspi", name: "Kaspi", currency: "KZT", balance: 1000, icon: "bank", color: "#f00" }];
const expCats = [{ id: "rest", name: "Рестораны", icon: "eating" }];
const props = { accounts, expCats, incCats: [], debtPeople: [{ id: "p1", name: "Бек" }], setDebtPeople: jest.fn(), onBack: jest.fn() };

test("новый расход — без «Оплатил за других»: делить с друзьями — через «Общие расходы»", () => {
  render(<TxPage {...props}/>);
  expect(screen.queryByText(/Оплатил за других/)).toBeNull();
});

test("уже разделённый расход — переключатель остаётся, чтобы долю можно было поправить или снять", () => {
  const edit = { id: "t1", type: "expense", amount: 1000, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-05", note: "" };
  render(<TxPage {...props} edit={edit} debtEvents={[{ id: "d1", transaction_id: "t1", type: "paid_for_them", person_id: "p1", amount: 500 }]}/>);
  expect(screen.getByText(/Оплатил за других/)).toBeInTheDocument();
});
