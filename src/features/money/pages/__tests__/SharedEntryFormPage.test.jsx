import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedEntryFormPage } from "../SharedEntryFormPage";
import { supaRpc } from "../../../../lib/supabase";

jest.mock("../../../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()), supaUpsert: jest.fn(() => Promise.resolve()) }));

const accounts = [{ id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000, icon: "bank", color: "#f00" }];
const expCats = [{ id: "rest", name: "Рестораны", icon: "eating", color: "#0f0" }, { id: "cat-monthly-payments", name: "Платежи", icon: "payments", color: "#00f" }];
const people = [{ id: "p-bek", name: "Бек", color: "#123456" }];

const renderForm = (props = {}) => {
  const onSaved = jest.fn();
  const onBack = jest.fn();
  const view = render(<SharedEntryFormPage groups={[]} members={[]} accounts={accounts} transactions={[]} expCats={expCats}
    people={people} setPeople={jest.fn()} onBack={onBack} onSaved={onSaved} {...props}/>);
  return { onSaved, onBack, ...view };
};

beforeEach(() => { supaRpc.mockClear(); localStorage.clear(); });

// Название новой группы вводит пользователь — автоназвания нет.
const typeGroupName = (name = "Шашлыки") => userEvent.type(screen.getByPlaceholderText("Например, Шашлыки на даче"), name);

test("новая туса: 29 730 на троих — группа, участники и счёт одним сохранением", async () => {
  const { onSaved } = renderForm();
  typeGroupName("Ужин в Тбилиси");
  userEvent.type(screen.getByPlaceholderText("0"), "29730");
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByText("＋ Человек"));
  userEvent.click(within(screen.getByRole("dialog", { name: "Человек из «Люди»" })).getByText("Бек"));
  userEvent.click(screen.getByText("Добавить (1)"));
  userEvent.click(screen.getByText("Рестораны"));

  expect(screen.getAllByText("₸9 910")).toHaveLength(4); // 3 строки + «Ваша доля»
  expect(screen.getByText("₸19 820")).toBeInTheDocument(); // вернут
  expect(screen.queryByText("Платежи")).toBeNull(); // системная категория скрыта

  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(supaRpc).toHaveBeenCalledTimes(1));

  const [fn, { p }] = supaRpc.mock.calls[0];
  expect(fn).toBe("save_shared_entry");
  expect(p.group).toMatchObject({ mode: "event", currency: "KZT" });
  expect(p.group.name).toBe("Ужин в Тбилиси");
  expect(p.members).toHaveLength(3);
  expect(p.members.filter(m => m.is_me)).toHaveLength(1);
  expect(p.members.find(m => m.person_id === "p-bek")).toBeTruthy();
  expect(p.entries[0].shares.map(s => s.amount)).toEqual([9910, 9910, 9910]);
  expect(p.tx).toMatchObject({ amount: 29730, account_id: "kaspi", category_id: "rest" });
  expect(p.balances).toEqual([{ account_id: "kaspi", balance: 70270, delta: -29730 }]);
  expect(onSaved).toHaveBeenCalledWith(p.group.id, true);
});

test("без других участников и категории сохранить нельзя", async () => {
  renderForm();
  userEvent.type(screen.getByPlaceholderText("0"), "1000");
  userEvent.click(screen.getByText("Сохранить"));
  expect(await screen.findByText("Отметьте, за кого вы платили")).toBeInTheDocument();
  expect(screen.getByText(/Введите название/)).toBeInTheDocument();       // название — обязательно
  expect(screen.getByText("Выберите категорию")).toBeInTheDocument();
  expect(supaRpc).not.toHaveBeenCalled();
});

test("фикс сумма через шторку участника, остальное поровну", async () => {
  renderForm();
  userEvent.type(screen.getByPlaceholderText("0"), "10000");
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByText("Компашка 1"));
  userEvent.click(screen.getByText("Фикс сумма"));
  userEvent.type(screen.getAllByPlaceholderText("0").pop(), "1000");
  userEvent.click(screen.getByText("Готово"));
  // 10 000 − 1 000 = 9 000 на двоих «поровну»: по 4 500
  expect(screen.getByText("₸1 000")).toBeInTheDocument();
  expect(screen.getAllByText("₸4 500")).toHaveLength(3); // я, Компашка 2 + «Ваша доля»
});

test("§5.12: платил друг, я должен свою долю — та же туса: «Платил: участник», в составе только я", async () => {
  const { onSaved } = renderForm({ members: [{ id: "old", group_id: "g0", guest_name: "Асан", created_at: "2026-09-01" }] });
  typeGroupName("Ужин с Асаном");
  userEvent.click(screen.getByText("＋ Гость"));
  userEvent.click(screen.getByRole("button", { name: "Асан" }));             // подсказка из прошлых групп
  userEvent.click(screen.getByText("Участник"));
  userEvent.type(screen.getByPlaceholderText("0"), "8500");
  userEvent.click(screen.getAllByLabelText("Не участвует")[1]);               // Асан платил за меня — сам не в доле
  userEvent.click(screen.getByText("Рестораны"));
  expect(screen.getByText("Всего в счёте:")).toBeInTheDocument();
  userEvent.click(screen.getByText("Угостили меня — возвращать не нужно"));

  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const { p } = supaRpc.mock.calls[0][1];
  const asan = p.members.find(m => m.guest_name === "Асан");
  const me = p.members.find(m => m.is_me);
  expect(p.tx).toBe(null);
  expect(p.entries[0]).toMatchObject({ payer_member_id: asan.id, amount: 8500 });
  expect(p.entries[0].shares).toEqual([expect.objectContaining({ member_id: me.id, amount: 8500 })]);
  expect(p.entries[1]).toMatchObject({ kind: "adjust", reason: "treated_me", amount_group: -8500, member_id: asan.id });
});

test("§5.7: платил участник — без счёта списания, меня нужно отметить", async () => {
  renderForm();
  typeGroupName();
  userEvent.click(screen.getByText("＋ Гость"));
  userEvent.type(screen.getByPlaceholderText("Например, Асан"), "Асан");
  userEvent.click(screen.getByRole("button", { name: "Добавить" }));
  userEvent.click(screen.getByText("Участник"));
  expect(screen.queryByText("С какого счёта")).toBeNull();
  expect(screen.getByText("Асан заплатил")).toBeInTheDocument();
  userEvent.type(screen.getByPlaceholderText("0"), "12000");
  userEvent.click(screen.getByText("Рестораны"));

  userEvent.click(screen.getAllByLabelText("Не участвует")[0]); // снять себя (первая строка)
  userEvent.click(screen.getByText("Сохранить"));
  expect(await screen.findByText("Отметьте себя — иначе этот счёт вас не касается")).toBeInTheDocument();
  userEvent.click(screen.getAllByLabelText("Участвует")[0]);

  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(supaRpc).toHaveBeenCalledTimes(1));
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.tx).toBe(null);
  expect(p.balances).toEqual([]);
  expect(p.entries[0].payer_member_id).toBe(p.members.find(m => m.guest_name === "Асан").id);
  expect(p.entries[0].shares.map(s => s.amount)).toEqual([6000, 6000]);
});

test("§5.9: «＋ Личное» — сначала вычитается, остаток поровну, личное сверху", async () => {
  renderForm();
  typeGroupName();
  userEvent.type(screen.getByPlaceholderText("0"), "41000");
  ["＋ Без имени", "＋ Без имени", "＋ Без имени"].forEach(t => userEvent.click(screen.getByText(t)));
  userEvent.click(screen.getByText("Компашка 1"));
  userEvent.click(screen.getByLabelText("Больше"));
  userEvent.click(screen.getByLabelText("Больше"));
  userEvent.click(screen.getByText("＋ Личное — заказал только себе"));
  userEvent.type(screen.getAllByPlaceholderText("0").pop(), "5000");
  userEvent.type(screen.getByPlaceholderText("Что, например кальян"), "кальян");
  userEvent.click(screen.getByText("Готово"));
  // 41 000 = 5 000 личное + 36 000 на 6 человек: компашка × 3 — 18 000 + 5 000
  expect(screen.getByText("₸23 000")).toBeInTheDocument();
  expect(screen.getByText("× 3 · ＋ кальян ₸5 000")).toBeInTheDocument();

  userEvent.click(screen.getByText("Рестораны"));
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(supaRpc).toHaveBeenCalledTimes(1));
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.entries[0].shares.find(s => s.extra)).toMatchObject({ heads: 3, extra: 5000, extra_note: "кальян", amount: 23000 });
});

test("§5.9: «Выделить человека» — новый участник × 1, у компашки на одного меньше", () => {
  renderForm();
  userEvent.type(screen.getByPlaceholderText("0"), "9000");
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByText("Компашка 1"));
  expect(screen.queryByText("Выделить человека")).toBeNull(); // × 1 — выделять некого
  userEvent.click(screen.getByLabelText("Больше"));
  userEvent.click(screen.getByText("Выделить человека"));
  userEvent.type(screen.getByPlaceholderText("Например, Асан"), "Данияр");
  userEvent.click(screen.getByRole("button", { name: "Выделить" }));
  // 9 000 на троих: я, Компашка 1 (теперь × 1), Данияр
  expect(screen.getAllByText("₸3 000")).toHaveLength(4); // 3 строки + «Ваша доля»
  expect(screen.getByText("Данияр")).toBeInTheDocument();
});

test("§12.0: черновик — после ухода форма предлагает продолжить, участники и сумма восстанавливаются", async () => {
  const { unmount } = renderForm();
  typeGroupName("Пятница");
  userEvent.type(screen.getByPlaceholderText("0"), "29730");
  userEvent.click(screen.getByText("＋ Без имени"));
  unmount();

  const { onSaved } = renderForm();
  expect(screen.getByText("Есть несохранённый черновик")).toBeInTheDocument();
  expect(screen.queryByText("Компашка 1")).toBeNull();
  userEvent.click(screen.getByText("Продолжить"));
  expect(screen.getByText("Компашка 1")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("0")).toHaveValue("₸29 730");

  userEvent.click(screen.getByText("Рестораны"));
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(supaRpc.mock.calls[0][1].p.members).toHaveLength(2);
  expect(localStorage.getItem("shared.draft.new")).toBeNull(); // после сохранения черновик удалён
});

test("§12.0: черновик можно удалить; «назад» с изменениями — подтверждение", () => {
  localStorage.setItem("shared.draft.new", JSON.stringify({ amount: "1" }));
  const { onBack } = renderForm();
  userEvent.click(screen.getByText("Удалить"));
  expect(screen.queryByText("Есть несохранённый черновик")).toBeNull();
  expect(localStorage.getItem("shared.draft.new")).toBeNull();

  userEvent.click(screen.getByLabelText("Назад"));
  expect(onBack).toHaveBeenCalledWith(false); // ничего не меняли — выходим сразу
  onBack.mockClear();
  userEvent.type(screen.getByPlaceholderText("0"), "500");
  userEvent.click(screen.getByLabelText("Назад"));
  expect(onBack).not.toHaveBeenCalled();
  expect(screen.getByText("Выйти без сохранения?")).toBeInTheDocument();
});

test("из «Люди» — несколько человек разом, одним подтверждением", async () => {
  renderForm({ people: [...people, { id: "p-dauren", name: "Даурен", color: "#654321" }, { id: "p-asan", name: "Асан", color: "#abcdef" }] });
  typeGroupName();
  userEvent.click(screen.getByText("＋ Человек"));
  const sheet = within(screen.getByRole("dialog", { name: "Человек из «Люди»" }));
  expect(sheet.getByText("Отметьте людей")).toBeDisabled();
  userEvent.click(sheet.getByText("Бек"));
  userEvent.click(sheet.getByText("Даурен"));
  userEvent.click(sheet.getByText("Асан"));
  userEvent.click(sheet.getByText("Даурен"));                               // передумал — снял
  userEvent.click(sheet.getByText("Добавить (2)"));
  expect(screen.getByText("Бек")).toBeInTheDocument();
  expect(screen.getByText("Асан")).toBeInTheDocument();
  expect(screen.queryByText("Даурен")).toBeNull();

  userEvent.type(screen.getByPlaceholderText("0"), "9000");
  userEvent.click(screen.getByText("Рестораны"));
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(supaRpc).toHaveBeenCalled());
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.members.filter(m => m.person_id).map(m => [m.person_id, m.sort_order])).toEqual([["p-bek", 1], ["p-asan", 2]]);
});

test("туса: способ «Части» — 2 части у компашки, 1 у меня", async () => {
  const { onSaved } = renderForm();
  typeGroupName();
  userEvent.type(screen.getByPlaceholderText("0"), "9000");
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByText("Рестораны"));
  userEvent.click(screen.getByLabelText("Как делить"));
  userEvent.click(screen.getAllByText("Части").pop());
  const part = screen.getByLabelText("Части: Компашка 1");
  userEvent.clear(part);
  userEvent.type(part, "2");
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.entries[0].shares.map(x => [x.mode, x.value, x.amount])).toEqual([["parts", 1, 3000], ["parts", 2, 6000]]);
});

test("переименовать компашку прямо в счёте — название сохраняется вместе со счётом", async () => {
  const { onSaved } = renderForm();
  typeGroupName();
  userEvent.type(screen.getByPlaceholderText("0"), "6000");
  userEvent.click(screen.getByText("＋ Без имени"));
  userEvent.click(screen.getByText("Компашка 1"));
  const name = screen.getByRole("textbox", { name: "Название участника" });
  expect(name).toHaveAttribute("placeholder", "Компашка 1");
  userEvent.type(name, "Компашка Асана");
  userEvent.click(screen.getByText("Готово"));
  expect(screen.getByText("Компашка Асана")).toBeInTheDocument();
  userEvent.click(screen.getByText("Рестораны"));
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(supaRpc.mock.calls[0][1].p.members.find(m => !m.is_me)).toMatchObject({ label: "Компашка Асана" });
});
