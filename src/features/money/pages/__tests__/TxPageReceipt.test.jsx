import "@testing-library/jest-dom";
import fs from "fs";
import path from "path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TxPage } from "../TxPage";
import { supabase, supaRpc } from "../../../../lib/supabase";
import { loadReceiptFromLink } from "../../../../lib/receiptProxy";
import { fetchTransactionReceipt, findReceiptOwner, saveReceipt, deleteReceipt, fetchCatalogIndex } from "../../../../lib/receiptsApi";
import { parseLinkPayload, parseReceiptLink } from "../../../../utils/receipts";
import { buildReceiptSave } from "../../../../utils/receipts/receiptSave";
import { FX_LOSS_CATEGORY } from "../../../../constants/money";

// Блок «Чек» в форме транзакции (docs/receipts.md §3, этап 4). Сеть и БД мокаются: разбор —
// настоящий, на обезличенной фикстуре чека Magnum GO (Kaspi).
jest.mock("../../../../lib/supabase", () => ({ supabase: { from: jest.fn() }, supaRpc: jest.fn(), supaUpsert: jest.fn() }));
jest.mock("../../../../lib/receiptProxy", () => ({ loadReceiptFromLink: jest.fn() }));
jest.mock("../../../../lib/receiptsApi", () => ({
  fetchTransactionReceipt: jest.fn(), findReceiptOwner: jest.fn(), saveReceipt: jest.fn(), deleteReceipt: jest.fn(), fetchCatalogIndex: jest.fn(),
}));

const LINK = "https://receipt.kaspi.kz/web/fiscal?i=000000000101&f=000000000202&s=5772&t=2026-07-14+13:07:50.871995";
const html = fs.readFileSync(path.join(__dirname, "../../../../utils/__tests__/fixtures/receipts/kaspi-magnum.html"), "utf8");
const parsed = parseLinkPayload(parseReceiptLink(LINK), html);

// Строка receipts из БД — как её вернул бы PostgREST (select *, receipt_items(*)).
const storedRow = txId => {
  const p = buildReceiptSave(txId, parsed, { id: "r-1" });
  return { ...p.receipt, receipt_items: p.items.map(i => ({ ...i, receipt_id: "r-1" })) };
};

const accounts = [{ id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000, icon: "bank", color: "#f00" }];
const expCats = [{ id: "food", name: "Продукты", icon: "groceries" }, FX_LOSS_CATEGORY];
const incCats = [{ id: "salary", name: "Зарплата", icon: "salary" }];
const base = { accounts, expCats, incCats, debtPeople: [], setDebtPeople: jest.fn() };
const expense = { id: "t1", type: "expense", amount: 5772, currency: "KZT", category_id: "food", account_id: "kaspi", date: "2026-07-14", note: "" };

beforeEach(() => {
  jest.clearAllMocks();
  supaRpc.mockResolvedValue(null);
  // правка расхода пересобирает debt_events (TxPage) — цепочка запроса
  const query = { eq: () => Promise.resolve({ error: null }) };
  supabase.from.mockReturnValue({ delete: () => query, update: () => query });
  loadReceiptFromLink.mockResolvedValue(parsed);
  findReceiptOwner.mockResolvedValue(null);
  fetchCatalogIndex.mockResolvedValue({ products: [], links: [] });
  fetchTransactionReceipt.mockResolvedValue(null);
  saveReceipt.mockResolvedValue(undefined);
  deleteReceipt.mockResolvedValue(undefined);
});

const attachByLink = async () => {
  userEvent.click(screen.getByText(/Ссылка из QR/));
  userEvent.type(screen.getByRole("textbox", { name: "Ссылка на чек" }), `Чек: ${LINK}`);
  userEvent.click(screen.getByText("Загрузить"));
  const sheet = await screen.findByRole("dialog", { name: "Чек" });
  expect(within(sheet).getByText("Magnum GO")).toBeInTheDocument();
  expect(within(sheet).getByText("Творог «Молочный Бидончик» 9%, 500 г")).toBeInTheDocument();
  userEvent.click(within(sheet).getByText("Прикрепить"));
};

const pickAccountAndCategory = () => {
  userEvent.click(screen.getByText("Select account"));
  userEvent.click(screen.getByText("Kaspi"));
  userEvent.click(screen.getByText("Продукты"));
};

test("новый расход: ссылка → предпросмотр → сумма и дата из чека → чек пишется к той же транзакции", async () => {
  const onBack = jest.fn();
  render(<TxPage {...base} onBack={onBack}/>);
  pickAccountAndCategory();
  await attachByLink();

  expect(loadReceiptFromLink).toHaveBeenCalledWith(`Чек: ${LINK}`);
  expect(screen.getByDisplayValue("5 772")).toBeInTheDocument();
  expect(screen.getByText(/Magnum GO · 7 позиций/)).toBeInTheDocument();

  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const tx = supaRpc.mock.calls.find(([fn]) => fn === "save_tx")[1].p_tx;
  expect(tx).toMatchObject({ amount: 5772, date: "2026-07-14", type: "expense" });
  expect(saveReceipt).toHaveBeenCalledWith(tx.id, parsed, expect.any(Array));
});

test("сумму уже ввели — не перезаписывается, расхождение видно", async () => {
  render(<TxPage {...base} onBack={jest.fn()}/>);
  userEvent.type(screen.getByPlaceholderText("0"), "5700");
  await attachByLink();
  expect(screen.getByDisplayValue("5 700")).toBeInTheDocument();
  expect(screen.getByText(/В чеке ₸5 772, в транзакции ₸5 700/)).toBeInTheDocument();
});

test("чек уже прикреплён к другому расходу — ошибка и переход к нему, предпросмотра нет", async () => {
  findReceiptOwner.mockResolvedValue({ transaction_id: "t-other", transactions: { date: "2026-07-14", amount: 5772, currency: "KZT" } });
  const onOpenTransaction = jest.fn();
  render(<TxPage {...base} onBack={jest.fn()} onOpenTransaction={onOpenTransaction}/>);
  userEvent.click(screen.getByText(/Ссылка из QR/));
  userEvent.type(screen.getByRole("textbox", { name: "Ссылка на чек" }), LINK);
  userEvent.click(screen.getByText("Загрузить"));
  expect(await screen.findByText(/Чек уже прикреплён к расходу/)).toBeInTheDocument();
  expect(screen.queryByText("Прикрепить")).toBeNull();
  userEvent.click(screen.getByText("Открыть"));
  expect(onOpenTransaction).toHaveBeenCalledWith("t-other");
});

test("правка: сохранённый чек виден; «Убрать чек» → delete_receipt при сохранении", async () => {
  fetchTransactionReceipt.mockResolvedValue(storedRow("t1"));
  const onBack = jest.fn();
  render(<TxPage {...base} edit={expense} onBack={onBack}/>);
  expect(fetchTransactionReceipt).toHaveBeenCalledWith("t1");
  userEvent.click(await screen.findByText(/Magnum GO · 7 позиций/));
  userEvent.click(within(screen.getByRole("dialog", { name: "Чек" })).getByText("Убрать чек"));
  expect(screen.queryByText(/Magnum GO · 7 позиций/)).toBeNull();

  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  expect(deleteReceipt).toHaveBeenCalledWith("t1");
  expect(saveReceipt).not.toHaveBeenCalled();
});

test("правка без чека и без изменений чека — ни одного запроса к чекам при сохранении", async () => {
  const onBack = jest.fn();
  render(<TxPage {...base} edit={expense} onBack={onBack}/>);
  await waitFor(() => expect(fetchTransactionReceipt).toHaveBeenCalled());
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  expect(saveReceipt).not.toHaveBeenCalled();
  expect(deleteReceipt).not.toHaveBeenCalled();
});

test("сменили тип на доход — предупреждение, чек откреплён при сохранении", async () => {
  fetchTransactionReceipt.mockResolvedValue(storedRow("t1"));
  const onBack = jest.fn();
  render(<TxPage {...base} edit={expense} onBack={onBack}/>);
  await screen.findByText(/Magnum GO · 7 позиций/);
  userEvent.click(screen.getByText("ДОХОДЫ"));
  expect(screen.getByText(/при сохранении он будет откреплён/)).toBeInTheDocument();
  expect(screen.queryByText(/Ссылка из QR/)).toBeNull();
  userEvent.click(screen.getByText("Зарплата"));
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  expect(deleteReceipt).toHaveBeenCalledWith("t1");
});

test("транзакция сохранилась, чек нет — «Повторить» пишет только чек к той же транзакции", async () => {
  saveReceipt.mockRejectedValueOnce(new Error("Чек уже прикреплён к другому расходу"));
  const onBack = jest.fn();
  render(<TxPage {...base} onBack={onBack}/>);
  pickAccountAndCategory();
  await attachByLink();
  userEvent.click(screen.getByText("Сохранить"));

  expect(await screen.findByRole("alert")).toHaveTextContent("Транзакция сохранена, но чек не прикреплён: Чек уже прикреплён к другому расходу");
  expect(onBack).not.toHaveBeenCalled();
  expect(screen.queryByText("Сохранить")).toBeNull();
  const txId = supaRpc.mock.calls.find(([fn]) => fn === "save_tx")[1].p_tx.id;

  userEvent.click(screen.getByText("Повторить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  expect(saveReceipt).toHaveBeenLastCalledWith(txId, parsed, expect.any(Array));
  expect(supaRpc.mock.calls.filter(([fn]) => fn === "save_tx")).toHaveLength(1);
});

test("системная категория (курсовая разница) — блока «Чек» нет", async () => {
  render(<TxPage {...base} edit={{ ...expense, category_id: FX_LOSS_CATEGORY.id }} onBack={jest.fn()}/>);
  await act(() => Promise.resolve());
  expect(screen.queryByText(/Ссылка из QR/)).toBeNull();
});

describe("каталог в предпросмотре (этап 5)", () => {
  const openPreview = async () => {
    render(<TxPage {...base} onBack={jest.fn()}/>);
    userEvent.click(screen.getByText(/Ссылка из QR/));
    userEvent.type(screen.getByRole("textbox", { name: "Ссылка на чек" }), LINK);
    userEvent.click(screen.getByText("Загрузить"));
    return screen.findByRole("dialog", { name: "Чек" });
  };

  test("галочки «в каталог» у всех, кроме служебных; «Снять все»; статус «новый товар · проверьте»", async () => {
    const sheet = await openPreview();
    expect(within(sheet).getByText("В каталог цен: 6 из 6")).toBeInTheDocument();
    expect(within(sheet).queryByRole("checkbox", { name: /Упаковка/ })).toBeNull();
    expect(within(sheet).getAllByText(/новый товар · проверьте/)).toHaveLength(6);
    userEvent.click(within(sheet).getByText("Снять все"));
    expect(within(sheet).getByText("В каталог цен: 0 из 6")).toBeInTheDocument();
  });

  test("товар из каталога узнаётся по штрихкоду", async () => {
    fetchCatalogIndex.mockResolvedValue({ products: [{ id: "p1", name: "Творог «Молочный Бидончик» 9%, 500 г", gtin: "4870202391161", name_confirmed: true }], links: [] });
    const sheet = await openPreview();
    expect(within(sheet).getByText("в каталоге", { exact: false })).toBeInTheDocument();
  });

  test("правка товара: название собирается из полей, позиция подтверждена, план уходит в сохранение", async () => {
    const sheet = await openPreview();
    userEvent.click(within(sheet).getByText(/Бедро цыпленка/));
    const item = screen.getByRole("dialog", { name: "Товар" });
    const core = within(item).getByRole("textbox", { name: "Название" });
    userEvent.clear(core);
    userEvent.type(core, "Бедро куриное");
    expect(within(item).getByText("Бедро куриное «Алель»")).toBeInTheDocument();
    userEvent.click(within(item).getByText("Готово"));
    const back = screen.getByRole("dialog", { name: "Чек" });
    expect(within(back).getByText("Бедро куриное «Алель»")).toBeInTheDocument();
    userEvent.click(within(back).getByText("Прикрепить"));
    userEvent.click(screen.getByText("Select account"));
    userEvent.click(screen.getByText("Kaspi"));
    userEvent.click(screen.getByText("Продукты"));
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(saveReceipt).toHaveBeenCalled());
    const plan = saveReceipt.mock.calls[0][2];
    expect(plan.find(pi => pi.edits)?.edits).toMatchObject({ core: "Бедро куриное", brand: "Алель" });
  });

  test("«Это тот же товар, что…» — выбор из каталога", async () => {
    fetchCatalogIndex.mockResolvedValue({ products: [{ id: "p-noodle", name: "Лапша «Султан» гнёзда", kind: "Лапша", name_confirmed: true }], links: [] });
    const sheet = await openPreview();
    userEvent.click(within(sheet).getByText(/Лапша гнезда/));
    const item = screen.getByRole("dialog", { name: "Товар" });
    userEvent.click(within(item).getByText("Это тот же товар, что…"));
    userEvent.click(within(item).getByText("Лапша «Султан» гнёзда"));
    expect(within(screen.getByRole("dialog", { name: "Чек" })).getByText("Лапша «Султан» гнёзда")).toBeInTheDocument();
  });
});

describe("категории в предпросмотре (§7.7)", () => {
  const categories = [{ id: "dairy", name: "Молочные" }, { id: "home", name: "Для дома" }];
  const catalog = { products: [{ id: "p0", name: "Творог «Простоквашино» 9%", kind: "Творог", category_id: "dairy", name_confirmed: true }], links: [], categories };
  const openPreview = async () => {
    render(<TxPage {...base} onBack={jest.fn()}/>);
    userEvent.click(screen.getByText(/Ссылка из QR/));
    userEvent.type(screen.getByRole("textbox", { name: "Ссылка на чек" }), LINK);
    userEvent.click(screen.getByText("Загрузить"));
    return screen.findByRole("dialog", { name: "Чек" });
  };
  const saveAndGetPlan = async () => {
    userEvent.click(within(screen.getByRole("dialog", { name: "Чек" })).getByText("Прикрепить"));
    userEvent.click(screen.getByText("Select account"));
    userEvent.click(screen.getByText("Kaspi"));
    userEvent.click(screen.getByText("Продукты"));
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(saveReceipt).toHaveBeenCalled());
    return saveReceipt.mock.calls[0][2];
  };

  test("новый творог получает категорию по виду — видно откуда", async () => {
    fetchCatalogIndex.mockResolvedValue(catalog);
    const sheet = await openPreview();
    expect(within(sheet).getByText(/Молочные \(по виду\)/)).toBeInTheDocument();
  });

  test("«Категория для товаров без неё» — только позициям без категории", async () => {
    fetchCatalogIndex.mockResolvedValue(catalog);
    const sheet = await openPreview();
    expect(within(sheet).getByText(/Категория для товаров без неё · 5/)).toBeInTheDocument();
    userEvent.click(within(sheet).getByText("Выбрать"));
    userEvent.click(within(screen.getByRole("dialog", { name: "Категория для товаров без неё" })).getByText("Для дома"));
    const plan = await saveAndGetPlan();
    const tvorog = plan[parsed.items.findIndex(i => i.rawName.includes("Творог"))];
    expect(tvorog).toMatchObject({ categoryId: "dairy", categorySource: "kind" });
    expect(plan.filter(pi => pi.categorySource === "bulk")).toHaveLength(5);
  });

  test("в правке позиции категорию выбирают вручную", async () => {
    fetchCatalogIndex.mockResolvedValue(catalog);
    const sheet = await openPreview();
    userEvent.click(within(sheet).getByText(/Мыло/));
    const item = screen.getByRole("dialog", { name: "Товар" });
    userEvent.click(within(item).getByText("Для дома"));
    userEvent.click(within(item).getByText("Готово"));
    expect(within(screen.getByRole("dialog", { name: "Чек" })).getByText(/· Для дома/)).toBeInTheDocument();
    const plan = await saveAndGetPlan();
    expect(plan[parsed.items.findIndex(i => i.rawName.includes("Мыло"))]).toMatchObject({ categoryId: "home", categorySource: "manual" });
  });
});
