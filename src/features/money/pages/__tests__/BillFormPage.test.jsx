import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supaUpsert } from "../../../../lib/supabase";
import { BillFormPage } from "../BillFormPage";

vi.mock("../../../../lib/supabase", () => ({ supaUpsert: vi.fn(), supa: { delete: vi.fn() } }));

beforeEach(() => { vi.clearAllMocks(); supaUpsert.mockResolvedValue(undefined); });

const typeIn = (el, value) => fireEvent.change(el, { target: { value } });
const addItem = (name, amount) => {
  fireEvent.click(screen.getByText("＋ Позиция"));
  const names = screen.getAllByLabelText("Название позиции");
  typeIn(names[names.length - 1], name);
  if (amount != null) typeIn(screen.getByLabelText(`Сумма: ${name}`), amount);
};

describe("BillFormPage — состав и «где платить» (v42)", () => {
  it("итог считается из позиций, состав и место пишутся в recurring", async () => {
    const onBack = vi.fn();
    render(<BillFormPage onBack={onBack} recurring={[{ id: "r0", pay_place: "Kaspi" }]}/>);
    typeIn(screen.getByPlaceholderText("Например, Netflix"), "Подписки");
    addItem("Spotify", "1990");
    addItem("iCloud", "1490");
    expect(screen.getByLabelText("Сумма из состава").textContent).toMatch(/3\s?480/);

    fireEvent.click(screen.getByRole("button", { name: "Kaspi" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
    expect(supaUpsert).toHaveBeenCalledWith("recurring", expect.objectContaining({
      name: "Подписки", amount: 3480, pay_place: "Kaspi",
      items: [expect.objectContaining({ name: "Spotify", amount: 1990 }), expect.objectContaining({ name: "iCloud", amount: 1490 })],
    }));
  });

  it("позиция без суммы — итог вводится вручную и обязателен", async () => {
    render(<BillFormPage onBack={vi.fn()}/>);
    typeIn(screen.getByPlaceholderText("Например, Netflix"), "Мелочи");
    addItem("Чай");
    expect(screen.queryByLabelText("Сумма из состава")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/Введите сумму/)).toBeTruthy();
    expect(supaUpsert).not.toHaveBeenCalled();
  });
});
