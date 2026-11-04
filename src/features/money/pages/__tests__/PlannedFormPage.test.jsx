import { fireEvent, render, screen } from "@testing-library/react";
import { PlannedFormPage } from "../PlannedFormPage";
import { supa, supaUpsert } from "../../../../lib/supabase";

vi.mock("../../../../lib/supabase", () => ({ supaUpsert: vi.fn(), supa: { delete: vi.fn() } }));

const cats = [{ id: "salary", name: "Зарплата", icon: "work", color: "#0f0" }];
const edit = { id: "pi-1", name: "Зарплата", amount: 500000, category_id: "salary", expected_date: "2026-11-10", status: "pending", is_recurring: true, note: "" };

beforeEach(() => {
  supaUpsert.mockResolvedValue();
  supa.delete.mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

test("доход: пишет в planned_incomes в базовой валюте", async () => {
  const onBack = vi.fn();
  render(<PlannedFormPage kind="income" cats={cats} onBack={onBack}/>);
  expect(screen.getByText("Ожидаемый доход")).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Например, Зарплата"), { target: { value: "  Аванс " } });
  fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "200000" } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

  await screen.findByRole("button", { name: "Сохранить" });
  expect(supaUpsert).toHaveBeenCalledWith("planned_incomes", expect.objectContaining({ name: "Аванс", amount: 200000, currency: "KZT", category_id: "salary", status: "pending" }));
  expect(onBack).toHaveBeenCalledWith(true);
});

test("расход: без названия и суммы не сохраняет", () => {
  render(<PlannedFormPage kind="expense" cats={cats} onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  expect(screen.getByText("Введите название")).toBeInTheDocument();
  expect(supaUpsert).not.toHaveBeenCalled();
});

test("ошибка удаления видна в шторке, экран не закрывается", async () => {
  supa.delete.mockRejectedValueOnce(new Error("offline"));
  const onBack = vi.fn();
  render(<PlannedFormPage kind="expense" cats={cats} onBack={onBack} edit={edit}/>);
  expect(screen.getByText("Редактировать расход")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Удалить" }).at(-1));

  expect(await screen.findByText("Не удалось удалить")).toBeInTheDocument();
  expect(supa.delete).toHaveBeenCalledWith("planned_expenses", "id=eq.pi-1");
  expect(onBack).not.toHaveBeenCalled();
  expect(screen.getByText("Удалить плановый расход?")).toBeInTheDocument();
});
