import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatTxsPageMon } from "../CatTxsPageMon";
import { DebtsListPage } from "../DebtsListPage";
import { DebtPersonDetailPage } from "../DebtPersonDetailPage";
import { SharedGroupsListPage } from "../SharedGroupsListPage";
import { TxHistoryRow } from "../../components/TxHistoryRow";
import { buildPersonalTransactions } from "../../../../utils/personalTransactions";
import { buildSharedTxIndex } from "../../../../utils/txBadges";

jest.mock("../../../../lib/supabase", () => ({ supabase: { from: jest.fn() }, supaRpc: jest.fn(), supaUpsert: jest.fn() }));

// §5.8: ужин 36 000 оплатил я с Kaspi, бильярд 12 000 — Асан. Бек (из «Люди») — компашка × 3.
const group = { id: "g1", name: "Вечер 03.10", mode: "event", currency: "KZT", date: "2026-10-03" };
const members = [
  { id: "me", group_id: "g1", is_me: true }, { id: "asan", group_id: "g1", guest_name: "Асан", sort_order: 1 },
  { id: "bek", group_id: "g1", person_id: "p-bek", heads: 3, sort_order: 2 },
];
const people = [{ id: "p-bek", name: "Бек", color: "#123" }];
const sh = (member_id, amount, heads = 1) => ({ member_id, amount, heads, mode: "auto" });
const entries = [
  { id: "dinner", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Ужин", category_id: "rest", payer_member_id: "me", amount: 36000, amount_group: 36000,
    transaction_id: "tx-dinner", account_id: "kaspi", shares: [sh("me", 6000), sh("asan", 6000), sh("bek", 18000, 3), sh("dauren", 6000)] },
  { id: "billiards", group_id: "g1", kind: "bill", date: "2026-10-03", title: "Бильярд", category_id: "rest", payer_member_id: "asan", amount: 12000, amount_group: 12000,
    shares: [sh("me", 2400), sh("asan", 2400), sh("bek", 7200, 3)] },
];
const accounts = [{ id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000 }];
const transactions = [{ id: "tx-dinner", type: "expense", amount: 36000, currency: "KZT", category_id: "rest", account_id: "kaspi", date: "2026-10-03", note: "Ужин · Вечер 03.10" }];
const index = buildSharedTxIndex({ sharedGroups: [group], sharedMembers: members, sharedEntries: entries, people });

test("§11.1: категория показывает мою долю, полную сумму и виртуальную строку «платил Асан»", () => {
  const personal = buildPersonalTransactions({ transactions, sharedGroups: [group], sharedMembers: members, sharedEntries: entries });
  const navigate = jest.fn();
  render(<CatTxsPageMon cat={{ id: "rest", name: "Рестораны" }} txs={personal} rawById={new Map(transactions.map(t => [t.id, t]))} sharedTxIndex={index}
    periodLabel="Октябрь" txType="expense" accounts={accounts} navigate={navigate} onBack={jest.fn()}/>);
  expect(screen.getByText("всего ₸36 000")).toBeInTheDocument();
  expect(screen.getByText("Kaspi · Общие · Вечер 03.10")).toBeInTheDocument();
  expect(screen.getByText("Вечер 03.10 · платил Асан")).toBeInTheDocument();
  userEvent.click(screen.getByText("Kaspi · Общие · Вечер 03.10"));
  expect(navigate).toHaveBeenLastCalledWith("editTx", transactions[0]);           // правка — исходной транзакции, не доли
  userEvent.click(screen.getByText("Вечер 03.10 · платил Асан"));
  expect(navigate.mock.calls[1][1]).toMatchObject({ virtual: true, shared_entry_id: "billiards" });
});

test("§11.4: строка истории без категории с бейджем общих расходов", () => {
  render(<TxHistoryRow tx={{ id: "t", type: "income", amount: 10000, currency: "KZT" }} badge={{ label: "Перевод · Вечер 03.10 ← Асан", tone: "shared" }}/>);
  expect(screen.getByText("Общие расходы")).toBeInTheDocument();
  expect(screen.getByText("Перевод · Вечер 03.10 ← Асан")).toBeInTheDocument();
});

test("§11.6: в «Долгах» у Бека — отдельная строка долга в общих группах", () => {
  render(<DebtsListPage debtPeople={people} debtEvents={[]} accounts={accounts} sharedGroups={[group]} sharedMembers={members} sharedEntries={entries}
    navigate={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.getByText("в расчёте")).toBeInTheDocument();                         // личный NET — 0
  expect(screen.getByText("+ ₸18 000 в общих группах")).toBeInTheDocument();          // ужин × 3; бильярд Бек должен Асану, не мне
});

test("§11.5: карточка Бека — блок «Общие группы» с переходом в вечер", () => {
  const navigate = jest.fn();
  render(<DebtPersonDetailPage person={people[0]} people={people} debtEvents={[]} sharedGroups={[group]} sharedMembers={members} sharedEntries={entries}
    accounts={accounts} transactions={transactions} navigate={navigate} onReload={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.getByText("Общие группы")).toBeInTheDocument();
  expect(screen.getByText("должен ₸18 000")).toBeInTheDocument();
  userEvent.click(screen.getByText("Вечер 03.10"));
  expect(navigate).toHaveBeenCalledWith("sharedGroup", { groupId: "g1" });
});

test("§12.1: общие итоги по группам и разбивка по людям и гостям", () => {
  const navigate = jest.fn();
  render(<SharedGroupsListPage groups={[group]} members={members} entries={entries} people={people} accounts={accounts} navigate={navigate} onBack={jest.fn()}/>);
  userEvent.click(screen.getByLabelText("Кто кому должен"));
  expect(screen.getByText("Бек")).toBeInTheDocument();
  expect(screen.getByText("Асан")).toBeInTheDocument();
  expect(screen.getByText("₸3 600")).toBeInTheDocument();                             // 6 000 − 2 400
  userEvent.click(screen.getByText("Бек"));
  expect(navigate).toHaveBeenCalledWith("debtPersonDetail", people[0]);
});

test("«Долги»: участники группы Tricount не получают строку «в общих группах»", () => {
  const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
  const ms = [{ id: "me2", group_id: "f1", is_me: true }, { id: "bek2", group_id: "f1", person_id: "p-bek" }];
  const food = { id: "food", group_id: "f1", kind: "bill", date: "2026-10-05", payer_member_id: "me2", amount: 6000, amount_group: 6000,
    shares: [sh("me2", 3000), sh("bek2", 3000)] };
  render(<DebtsListPage debtPeople={people} debtEvents={[]} accounts={accounts} sharedGroups={[flat]} sharedMembers={ms} sharedEntries={[food]}
    navigate={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.queryByText(/в общих группах/)).toBeNull();
});
