import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MoneyMenuPage } from "../MoneyMenuPage";
import { PeopleListPage } from "../PeopleListPage";

jest.mock("../../../../lib/supabase", () => ({ supabase: { from: jest.fn() }, supaUpsert: jest.fn(), supaRpc: jest.fn() }));

test("«Общие расходы» — последний пункт меню", () => {
  render(<MoneyMenuPage navigate={jest.fn()}/>);
  const labels = screen.getAllByText(/./, { selector: "span" }).map(el => el.textContent).filter(Boolean);
  expect(labels[labels.length - 1]).toBe("Общие расходы");
});

test("«Люди»: сколько человек всего и сколько скрыто", () => {
  const people = [{ id: "1", name: "Бек" }, { id: "2", name: "Дима" }, { id: "3", name: "Асхат" }, { id: "4", name: "Ерлан" }, { id: "5", name: "Старый", archived: true }];
  render(<PeopleListPage people={people} onReload={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.getByText("Всего 4 человека · скрытых 1")).toBeInTheDocument();
});
