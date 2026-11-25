// «Оплатил за всех» из «Входящих» Apple Pay (docs/apple-pay-inbox.md §6.3): данные покупки → форма
// тусы / Tricount; транзакция создаётся формой с wallet_inbox_id — покупка закрывается вместе со счётом.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supaRpc } from "../../../../lib/supabase";
import { InboxItemSheet } from "../../components/InboxItemSheet";
import { WalletInboxPage } from "../WalletInboxPage";
import { SharedEntryFormPage } from "../SharedEntryFormPage";
import { SharedPurchaseFormPage } from "../SharedPurchaseFormPage";
import { inboxSharePrefill, purchaseAmountFor, shareTargets } from "../../../../utils/walletInbox";
import { buildBillSave } from "../../../../utils/sharedSave";

vi.mock("../../../../lib/supabase", () => ({ supabase: { from: vi.fn() }, supaRpc: vi.fn(() => Promise.resolve()), supaUpsert: vi.fn() }));
vi.mock("../../../../lib/receiptsApi", () => ({ fetchTransactionReceipt: () => Promise.resolve(null) }));

const kaspi = { id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000, icon: "bank", color: "#f00" };
const usdAcc = { id: "usd", name: "Freedom $", currency: "USD", balance: 500, avg_rate: 500, icon: "bank", color: "#00f" };
const accounts = [kaspi, usdAcc];
const expCats = [{ id: "rest", name: "Рестораны", icon: "eating", color: "#0f0" }];
const people = [{ id: "p-bek", name: "Бек", color: "#123456" }];
const item = (over = {}) => ({ id: "in1", amount: 29730, currency: "KZT", merchant: "Del Papa", merchant_key: "del papa",
  card_label: "Kaspi Gold", occurred_at: "2026-11-24T12:00:00Z", ...over });
const prefill = (over = {}) => inboxSharePrefill({ item: item(), account: kaspi, categoryId: "rest", amount: "29730", charged: "", ...over });

beforeEach(() => localStorage.clear());

describe("данные покупки для общих расходов", () => {
  test("обычная: сумма, валюта, счёт, категория, дата, название", () => {
    expect(prefill()).toEqual({ inboxId: "in1", title: "Del Papa", date: "2026-11-24", currency: "KZT", amount: 29730,
      accountId: "kaspi", accountCurrency: "KZT", accountAmount: null, categoryId: "rest" });
  });
  test("валютная: чек в валюте покупки, списанное — отдельно", () => {
    const p = inboxSharePrefill({ item: item({ amount: 12.99, currency: "USD" }), account: kaspi, categoryId: "", amount: "", charged: "6600" });
    expect(p).toMatchObject({ currency: "USD", amount: 12.99, accountId: "kaspi", accountCurrency: "KZT", accountAmount: 6600 });
  });
  test("сумма не пришла — берётся введённая в карточке", () => {
    expect(inboxSharePrefill({ item: item({ amount: null }), account: kaspi, categoryId: "", amount: "1500", charged: "" }).amount).toBe(1500);
  });
  test("сумма для Tricount — только в валюте группы", () => {
    expect(purchaseAmountFor(prefill(), "KZT")).toBe(29730);
    const fx = { currency: "USD", amount: 12.99, accountCurrency: "KZT", accountAmount: 6600 };
    expect(purchaseAmountFor(fx, "KZT")).toBe(6600);
    expect(purchaseAmountFor(fx, "EUR")).toBeNull();
  });
  test("группы: без архива, свежая активность — первой", () => {
    const groups = [
      { id: "old", name: "Квартира", mode: "mirror", created_at: "2026-01-01T00:00:00Z" },
      { id: "tusa", name: "Пятница", mode: "event", created_at: "2026-11-20T00:00:00Z" },
      { id: "arch", name: "Старое", mode: "event", archived: true, created_at: "2026-11-24T00:00:00Z" },
    ];
    const entries = [{ group_id: "old", created_at: "2026-11-10T00:00:00Z" }, { group_id: "tusa", created_at: "2026-11-24T11:00:00Z" }];
    expect(shareTargets(groups, entries).map(t => [t.group.id, t.kind])).toEqual([["tusa", "Туса"], ["old", "Tricount"]]);
  });
  test("buildBillSave: wallet_inbox_id — только у новой транзакции", () => {
    const form = { title: "x", date: "2026-11-24", currency: "KZT", amount: 1000, accountId: "kaspi", categoryId: "rest",
      payerId: "me", shares: [{ member_id: "me", amount: 500 }, { member_id: "m2", amount: 500 }], walletInboxId: "in1" };
    const group = { id: "g", name: "Пятница", currency: "KZT" };
    let n = 0;
    const fresh = buildBillSave({ form, group, meId: "me", accounts, transactions: [], newId: () => `id${++n}` });
    expect(fresh.tx.wallet_inbox_id).toBe("in1");
    const edit = { id: "e1", transaction_id: "t1", account_id: "kaspi" };
    const tx = { id: "t1", type: "expense", amount: 1000, currency: "KZT", account_id: "kaspi" };
    expect(buildBillSave({ form, group, meId: "me", edit, accounts, transactions: [tx], newId: () => "z" }).tx.wallet_inbox_id).toBeUndefined();
  });
});

describe("карточка и выбор группы", () => {
  test("«В общие расходы» отдаёт данные покупки с выбранными счётом и категорией", () => {
    const onShare = vi.fn();
    render(<InboxItemSheet item={item()} items={[item()]} accounts={accounts} expCats={expCats} transactions={[]}
      cards={[{ card_label: "Kaspi Gold", account_id: "kaspi" }]} merchants={[{ merchant_key: "del papa", category_id: "rest" }]}
      onClose={vi.fn()} onSaved={vi.fn()} onDetails={vi.fn()} onShare={onShare} onDismiss={vi.fn()} onLink={vi.fn()}/>);
    fireEvent.click(screen.getByText("В общие расходы — оплатил за всех"));
    expect(onShare).toHaveBeenCalledWith(prefill());
  });

  test("шторка групп: новая туса или существующая группа", () => {
    const onShare = vi.fn();
    const wallet = { items: [item()], cards: [{ card_label: "Kaspi Gold", account_id: "kaspi" }], merchants: [{ merchant_key: "del papa", category_id: "rest" }],
      loadError: null, reload: vi.fn(), dismiss: vi.fn(), link: vi.fn() };
    const groups = [{ id: "tusa", name: "Пятница", mode: "event", currency: "KZT", created_at: "2026-11-20T00:00:00Z" },
      { id: "flat", name: "Квартира", mode: "mirror", currency: "KZT", created_at: "2026-10-01T00:00:00Z" }];
    render(<WalletInboxPage wallet={wallet} accounts={accounts} expCats={expCats} transactions={[]} sharedGroups={groups} sharedEntries={[]}
      onRecorded={vi.fn()} onDetails={vi.fn()} onShare={onShare} onBack={vi.fn()}/>);
    fireEvent.click(screen.getByText("Del Papa"));
    fireEvent.click(screen.getByText("В общие расходы — оплатил за всех"));
    const sheet = screen.getByRole("dialog", { name: "Куда записать покупку" });
    expect(within(sheet).getByText("Туса · KZT")).toBeInTheDocument();
    expect(within(sheet).getByText("Tricount · KZT")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByText("Квартира"));
    expect(onShare).toHaveBeenLastCalledWith(groups[1], prefill());
    fireEvent.click(within(sheet).getByText("Новая туса"));
    expect(onShare).toHaveBeenLastCalledWith(null, prefill());
  });
});

describe("формы с покупкой", () => {
  test("новая туса: поля подставлены, «Платил: я» без выбора, транзакция с wallet_inbox_id", async () => {
    const onSaved = vi.fn();
    render(<SharedEntryFormPage fromInbox={prefill()} members={[]} accounts={accounts} transactions={[]} expCats={expCats}
      people={people} setPeople={vi.fn()} onBack={vi.fn()} onSaved={onSaved}/>);
    expect(screen.getByDisplayValue("Del Papa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("₸29 730")).toBeInTheDocument();
    expect(screen.getByText(/оплата Apple Pay/)).toBeInTheDocument();
    expect(screen.queryByText("Участник")).toBeNull();
    expect(screen.queryByText("Без счёта (наличные мимо учёта)")).toBeNull();

    userEvent.type(screen.getByPlaceholderText("Например, Шашлыки на даче"), "Пятница");
    userEvent.click(screen.getByText("＋ Без имени"));
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(supaRpc).toHaveBeenCalledTimes(1));
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.tx).toMatchObject({ amount: 29730, account_id: "kaspi", category_id: "rest", wallet_inbox_id: "in1" });
    expect(p.entries[0].payer_member_id).toBe(p.members.find(m => m.is_me).id);
  });

  test("валютная покупка в тусе: чек в долларах, списанное в тенге подставлено", () => {
    const fx = inboxSharePrefill({ item: item({ amount: 12.99, currency: "USD", merchant: "Apple" }), account: kaspi, categoryId: "rest", amount: "", charged: "6600" });
    render(<SharedEntryFormPage fromInbox={fx} members={[]} accounts={accounts} transactions={[]} expCats={expCats}
      people={people} setPeople={vi.fn()} onBack={vi.fn()} onSaved={vi.fn()}/>);
    expect(screen.getByDisplayValue("$12.99")).toBeInTheDocument();
    expect(screen.getByText(/Списалось со счёта, KZT/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("₸6 600")).toBeInTheDocument();
  });

  test("Tricount: сумма, счёт, «Платил: я»; без счёта не сохранить", async () => {
    const group = { id: "flat", name: "Квартира", mode: "mirror", currency: "KZT" };
    const members = [{ id: "me", group_id: "flat", is_me: true, heads: 1, sort_order: 0 }, { id: "m2", group_id: "flat", is_me: false, heads: 1, guest_name: "Асан", sort_order: 1 }];
    render(<SharedPurchaseFormPage group={group} fromInbox={prefill({ account: usdAcc })} members={members} entries={[]} accounts={accounts}
      transactions={[]} expCats={expCats} people={people} setPeople={vi.fn()} onBack={vi.fn()} onSaved={vi.fn()}/>);
    // счёт покупки — долларовый, в группе в тенге он недоступен: выбрать заново
    expect(screen.getByText(/оплата Apple Pay/)).toBeInTheDocument();
    expect(screen.queryByText("Кто платил")).toBeNull();
    fireEvent.click(screen.getByText("Сохранить"));
    await act(() => Promise.resolve());
    expect(screen.getByText(/Выберите счёт в KZT/)).toBeInTheDocument();
    expect(supaRpc).not.toHaveBeenCalled();
  });
});
