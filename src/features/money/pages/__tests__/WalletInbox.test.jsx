// Apple Pay → «Входящие» (docs/apple-pay-inbox.md §6–§8): карточка, страница, пачка, меню, ключи.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { supaRpc } from "../../../../lib/supabase";
import { InboxItemSheet } from "../../components/InboxItemSheet";
import { WalletInboxPage } from "../WalletInboxPage";
import { WalletSetupPage } from "../WalletSetupPage";
import { MoneyMenuPage } from "../MoneyMenuPage";

vi.mock("../../../../lib/supabase", () => ({ supabase: { from: vi.fn() }, supaRpc: vi.fn(), supaUpsert: vi.fn() }));
vi.mock("../../../auth/AccountCard", () => ({ AccountCard: () => null }));

const kaspi = { id: "kaspi", name: "Kaspi", currency: "KZT", balance: 10000, icon: "bank", color: "#f00" };
const usd = { id: "usd", name: "Freedom $", currency: "USD", balance: 100, avg_rate: 500, icon: "bank", color: "#00f" };
const accounts = [kaspi, usd];
const expCats = [{ id: "food", name: "Продукты", icon: "food", color: "#0f0" }, { id: "cafe", name: "Кафе", icon: "eating", color: "#ff0" }];
const cards = [{ id: "c1", card_label: "Kaspi Gold", account_id: "kaspi" }];
const merchants = [{ id: "m1", merchant_key: "magnum", category_id: "food" }];
const item = (over = {}) => ({ id: "in1", amount: 2500, currency: "KZT", merchant: "MAGNUM", merchant_key: "magnum",
  card_label: "Kaspi Gold", occurred_at: "2026-11-24T12:00:00Z", status: "pending", ...over });

const sheet = (over = {}) => {
  const props = { item: item(), items: [item()], accounts, expCats, transactions: [], cards, merchants,
    onClose: vi.fn(), onSaved: vi.fn(), onDetails: vi.fn(), onDismiss: vi.fn().mockResolvedValue(1), onLink: vi.fn().mockResolvedValue(), ...over };
  render(<InboxItemSheet {...props}/>);
  return props;
};
const flush = () => act(() => Promise.resolve());

describe("карточка покупки", () => {
  test("«Записать»: счёт и категория по подсказке, баланс, wallet_inbox_id", async () => {
    const p = sheet();
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(supaRpc).toHaveBeenCalledWith("save_tx", {
      p_tx: expect.objectContaining({ type: "expense", amount: 2500, currency: "KZT", account_id: "kaspi", category_id: "food",
        note: "MAGNUM", wallet_inbox_id: "in1" }),
      p_account_id: "kaspi", p_new_balance: 7500,
    });
    expect(p.onSaved).toHaveBeenCalled();
  });

  test("неизвестная карта и продавец — счёт и категорию надо выбрать, ничего не пишется", async () => {
    sheet({ item: item({ card_label: "Halyk", merchant_key: "small", merchant: "Small" }) });
    expect(screen.getByText("Счёт карты «Halyk» — запомним")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(screen.getByText(/Выберите категорию/)).toBeInTheDocument();
    expect(supaRpc).not.toHaveBeenCalled();
  });

  test("сумма не пришла — подсказка и проверка", async () => {
    sheet({ item: item({ amount: null }) });
    expect(screen.getByText(/не пришла с телефона/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(screen.getByText(/Введите сумму/)).toBeInTheDocument();
    expect(supaRpc).not.toHaveBeenCalled();
  });

  test("валютная покупка: обязательно «Списалось со счёта», «≈ по курсу» — только по тапу", async () => {
    sheet({ item: item({ amount: 12.99, currency: "USD", merchant: "Apple" }) });
    expect(screen.getByText("$12.99")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(supaRpc).not.toHaveBeenCalled();
    expect(screen.getByText(/Сколько списалось со счёта/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/≈ ₸6 495 по курсу — подставить/));
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(supaRpc).toHaveBeenCalledWith("save_tx", expect.objectContaining({
      p_tx: expect.objectContaining({ amount: 6495, currency: "KZT", note: "Apple · $12.99" }), p_new_balance: 3505,
    }));
  });

  test("уже записано вручную → «Это она» связывает, баланс не трогает", async () => {
    const manual = { id: "t9", type: "expense", amount: 2500, currency: "KZT", account_id: "kaspi", category_id: "food", date: "2026-11-24" };
    const p = sheet({ transactions: [manual] });
    fireEvent.click(screen.getByText("Это она"));
    await flush();
    expect(p.onLink).toHaveBeenCalledWith("in1", "t9");
    expect(supaRpc).not.toHaveBeenCalled();
    expect(p.onSaved).toHaveBeenCalled();
  });

  test("«Не записывать» — со второго тапа", async () => {
    const p = sheet();
    fireEvent.click(screen.getByText("Не записывать"));
    expect(p.onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Точно убрать?"));
    await flush();
    expect(p.onDismiss).toHaveBeenCalledWith(["in1"]);
  });

  test("«Подробнее» — префилл для TxPage с wallet_inbox_id", () => {
    const p = sheet();
    fireEvent.click(screen.getByText("Подробнее"));
    expect(p.onDetails).toHaveBeenCalledWith(expect.objectContaining({ amount: "2500", currency: "KZT", account_id: "kaspi",
      category_id: "food", note: "MAGNUM", wallet_inbox_id: "in1", date: "2026-11-24" }));
  });

  test("покупка уже записана в другой вкладке — понятная ошибка", async () => {
    supaRpc.mockRejectedValueOnce({ message: "inbox_already_resolved" });
    const p = sheet();
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(screen.getByText("Эта покупка уже записана — список обновлён")).toBeInTheDocument();
    expect(p.onSaved).not.toHaveBeenCalled();
  });
});

describe("страница «Новые покупки»", () => {
  const wallet = (items, over = {}) => ({ items, cards, merchants, tokens: [], loadError: null, reload: vi.fn(),
    dismiss: vi.fn(), link: vi.fn(), ...over });
  const page = (w, over = {}) => {
    const props = { wallet: w, accounts, expCats, transactions: [], onRecorded: vi.fn(), onDetails: vi.fn(), onBack: vi.fn(), ...over };
    render(<WalletInboxPage {...props}/>);
    return props;
  };

  test("пусто — подсказка, без кнопки пачки", () => {
    page(wallet([]));
    expect(screen.getByText("Новых покупок нет")).toBeInTheDocument();
    expect(screen.queryByText(/Записать все/)).toBeNull();
  });

  test("строка: продавец, карта → счёт, сумма; без суммы — «сумма?»", () => {
    page(wallet([item(), item({ id: "in2", amount: null, merchant: "", occurred_at: "2026-11-24T13:00:00Z" })]));
    expect(screen.getByText("MAGNUM")).toBeInTheDocument();
    expect(screen.getAllByText(/Kaspi Gold → Kaspi/, { selector: "p" })).toHaveLength(2);
    expect(screen.getByText("₸2 500")).toBeInTheDocument();
    expect(screen.getByText("сумма?")).toBeInTheDocument();
    expect(screen.getByText("Без названия")).toBeInTheDocument();
  });

  test("ошибка загрузки — видна, «Повторить»", () => {
    const w = wallet([], { loadError: "Не удалось загрузить покупки Apple Pay" });
    page(w);
    fireEvent.click(screen.getByText("Повторить"));
    expect(w.reload).toHaveBeenCalled();
  });

  test("«Записать все с подсказкой»: по одной, балансы накопительно, затем обновление", async () => {
    const items = [item({ id: "a", amount: 1000 }), item({ id: "b", amount: 500, occurred_at: "2026-11-24T12:30:00Z" })];
    const p = page(wallet(items));
    fireEvent.click(screen.getByText("Записать все с подсказкой (2)"));
    fireEvent.click(screen.getByText("Записать", { selector: "button" }));
    await flush();
    const balances = supaRpc.mock.calls.map(([fn, params]) => [fn, params.p_tx.wallet_inbox_id, params.p_new_balance]);
    expect(balances).toEqual([["save_tx", "a", 9000], ["save_tx", "b", 8500]]);
    expect(p.onRecorded).toHaveBeenCalled();
  });

  test("после записи открывается следующая покупка", async () => {
    const items = [item({ id: "a" }), item({ id: "b", merchant: "Small", merchant_key: "small", occurred_at: "2026-11-24T11:00:00Z" })];
    const p = page(wallet(items));
    fireEvent.click(screen.getByText("MAGNUM"));
    fireEvent.click(screen.getByText("Записать"));
    await flush();
    expect(p.onRecorded).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Small" })).toBeInTheDocument();
  });
});

describe("меню и настройки", () => {
  test("«Apple Pay» в меню — только когда БД поддерживает; «Общие расходы» — последний", () => {
    const { rerender } = render(<MoneyMenuPage navigate={vi.fn()}/>);
    expect(screen.queryByText("Apple Pay")).toBeNull();
    rerender(<MoneyMenuPage navigate={vi.fn()} walletAvailable/>);
    expect(screen.getByText("Apple Pay")).toBeInTheDocument();
    const labels = screen.getAllByText(/./, { selector: "span" }).map(el => el.textContent);
    expect(labels.at(-1)).toBe("Общие расходы");
  });

  const setup = (over = {}) => {
    const w = { tokens: [], cards: [], merchants: [], reload: vi.fn(), fetchTokens: vi.fn().mockResolvedValue([]),
      issueToken: vi.fn().mockResolvedValue({ id: "k1", token: "cf_" + "ab".repeat(32), prefix: "cf_ababab", name: "iPhone" }),
      revokeToken: vi.fn().mockResolvedValue(), updateCard: vi.fn(), removeCard: vi.fn(), removeMerchant: vi.fn(), ...over };
    render(<WalletSetupPage wallet={w} accounts={accounts} expCats={expCats} onBack={vi.fn()}/>);
    return w;
  };

  test("ключ: создаётся по имени и показывается один раз", async () => {
    const w = setup();
    expect(screen.getByText("Сначала создайте ключ.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Создать ключ"));
    fireEvent.change(screen.getByLabelText("Название устройства"), { target: { value: "  Watch  " } });
    fireEvent.click(screen.getByText("Создать"));
    await flush();
    expect(w.issueToken).toHaveBeenCalledWith("Watch");
    expect(screen.getByDisplayValue("cf_" + "ab".repeat(32))).toBeInTheDocument();
    expect(screen.getByText(/Больше мы его не покажем/)).toBeInTheDocument();
  });

  test("ключ: отзыв — через подтверждение", async () => {
    const w = setup({ tokens: [{ id: "k1", name: "iPhone", prefix: "cf_ababab", last_used_at: null }] });
    expect(screen.getByText(/сигнала ещё не было/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Отозвать", { selector: "button" }));
    expect(w.revokeToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText("Отозвать").at(-1));
    await flush();
    expect(w.revokeToken).toHaveBeenCalledWith("k1");
  });

  test("правило продавца удаляется", async () => {
    const w = setup({ merchants: [{ id: "m1", merchant_key: "magnum", category_id: "food" }] });
    expect(screen.getByText("→ Продукты")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Удалить правило magnum"));
    await flush();
    expect(w.removeMerchant).toHaveBeenCalledWith("m1");
  });
});
