import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedTransferFormPage } from "../SharedTransferFormPage";
import { SharedMirrorTransferPage } from "../SharedMirrorTransferPage";
import { DebtPersonDetailPage } from "../DebtPersonDetailPage";
import { supaRpc } from "../../../../lib/supabase";

jest.mock("../../../../lib/supabase", () => ({ supabase: { from: jest.fn() }, supaRpc: jest.fn(() => Promise.resolve()), supaUpsert: jest.fn() }));

const kaspi = { id: "kaspi", name: "Kaspi", currency: "KZT", balance: 100000 };
const people = [{ id: "p-bek", name: "Бек" }, { id: "p-dima", name: "Дима" }];
const sh = (member_id, amount) => ({ member_id, amount, heads: 1, mode: "auto" });

beforeEach(() => supaRpc.mockClear());

describe("вечер: Бек должен за вечер 9 910, а я ему лично 5 000", () => {
  const group = { id: "g1", name: "Вечер 03.10", mode: "event", currency: "KZT", date: "2026-10-03" };
  const members = [{ id: "me", group_id: "g1", is_me: true }, { id: "bek", group_id: "g1", person_id: "p-bek" }, { id: "asan", group_id: "g1", guest_name: "Асан" }];
  const entries = [{ id: "b1", group_id: "g1", kind: "bill", date: "2026-10-03", payer_member_id: "me", amount: 29730, amount_group: 29730,
    shares: [sh("me", 9910), sh("bek", 9910), sh("asan", 9910)] }];
  const debtEvents = [{ id: "d1", person_id: "p-bek", type: "they_paid", amount: -5000, currency: "KZT", date: "2026-09-01" }];
  const renderTransfer = props => {
    const onBack = jest.fn();
    render(<SharedTransferFormPage group={group} groups={[group]} memberId="bek" direction="in" members={members} entries={entries} people={people}
      setPeople={jest.fn()} accounts={[kaspi]} transactions={[]} debtEvents={debtEvents} onBack={onBack} {...props}/>);
    return { onBack };
  };

  test("§10: «Зачесть 5 000» — без счёта и транзакции, событие offset в «Долгах»", async () => {
    const { onBack } = renderTransfer();
    expect(screen.getByText("Ваш личный долг · Бек · ₸5 000")).toBeInTheDocument();
    userEvent.click(screen.getByRole("radio", { name: /Зачесть ₸5 000/ }));
    expect(screen.getByDisplayValue("₸5 000")).toBeInTheDocument();         // сумма урезана до личного долга
    expect(screen.queryByText("Куда пришли деньги")).toBeNull();
    expect(screen.getByText(/Личный долг станет ₸0 ✓/)).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.tx).toBe(null);
    expect(p.debt_event).toMatchObject({ person_id: "p-bek", type: "offset", amount: 5000 });
    expect(p.entries[0]).toMatchObject({ method: "offset", amount_group: 5000, debt_event_id: p.debt_event.id, sender_person_id: "p-bek" });
  });

  test("гость или долг в ту же сторону — зачёт не предлагается", () => {
    renderTransfer({ memberId: "asan" });
    expect(screen.queryByText(/личный долг/i)).toBeNull();
  });

  test("выбрал зачёт, потом сменил направление — зачёт не применяется, деньги идут со счёта", async () => {
    const { onBack } = renderTransfer();
    userEvent.click(screen.getByRole("radio", { name: /Зачесть ₸5 000/ }));
    userEvent.click(screen.getByRole("button", { name: "Я → Бек" }));
    expect(screen.queryByRole("radio", { name: /Зачесть/ })).toBeNull();
    expect(screen.getByText("С какого счёта")).toBeInTheDocument();
    userEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
    const { p } = supaRpc.mock.calls[0][1];
    expect(p.debt_event).toBeUndefined();
    expect(p.entries[0]).toMatchObject({ method: "account", account_id: "kaspi" });
  });

  test("в ту же сторону: он должен и за вечер, и лично — зачёта нет", () => {
    renderTransfer({ debtEvents: [{ id: "d2", person_id: "p-bek", type: "lent", amount: 3000, currency: "KZT", date: "2026-09-01" }] });
    expect(screen.queryByRole("radio", { name: /Зачесть/ })).toBeNull();
  });
});

test("§10 квартира: я должен Диме 13 000 по Tricount, он мне лично 20 000 — зачёт, Дима лично должен 7 000", async () => {
  const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
  const members = [{ id: "me", group_id: "f1", is_me: true }, { id: "dima", group_id: "f1", person_id: "p-dima" }];
  const entries = [{ id: "pc", group_id: "f1", kind: "bill", date: "2026-10-02", payer_member_id: "dima", amount: 52000, amount_group: 52000, shares: [sh("me", 13000)] }];
  const debtEvents = [{ id: "l1", person_id: "p-dima", type: "lent", amount: 20000, currency: "KZT", date: "2026-09-01" }];
  const onBack = jest.fn();
  render(<SharedMirrorTransferPage group={flat} members={members} entries={entries} people={people} accounts={[kaspi]} transactions={[]} debtEvents={debtEvents} onBack={onBack}/>);
  expect(screen.getByText("Лично Дима должен вам ₸20 000")).toBeInTheDocument();
  userEvent.click(screen.getByRole("radio", { name: /Зачесть ₸13 000/ }));
  expect(screen.getByText(/Личный долг станет ₸7 000/)).toBeInTheDocument();
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.debt_event).toMatchObject({ person_id: "p-dima", amount: -13000 });
  expect(p.entries[0]).toMatchObject({ from_member_id: "me", to_member_id: "dima", method: "offset" });
});

test("§10 квартира: зачёт выбран, затем направление сменено — зачёт не применяется", async () => {
  const flat = { id: "f1", name: "Квартира", mode: "mirror", currency: "KZT" };
  const members = [{ id: "me", group_id: "f1", is_me: true }, { id: "dima", group_id: "f1", person_id: "p-dima" }];
  const entries = [{ id: "pc", group_id: "f1", kind: "bill", date: "2026-10-02", payer_member_id: "dima", amount: 52000, amount_group: 52000, shares: [sh("me", 13000)] }];
  const debtEvents = [{ id: "l1", person_id: "p-dima", type: "lent", amount: 20000, currency: "KZT", date: "2026-09-01" }];
  const onBack = jest.fn();
  render(<SharedMirrorTransferPage group={flat} members={members} entries={entries} people={people} accounts={[kaspi]} transactions={[]} debtEvents={debtEvents} onBack={onBack}/>);
  userEvent.click(screen.getByRole("radio", { name: /Зачесть ₸13 000/ }));
  userEvent.click(screen.getByRole("button", { name: "Мне перевели" }));
  expect(screen.queryByRole("radio", { name: /Зачесть/ })).toBeNull();
  userEvent.click(screen.getByText("Сохранить"));
  await waitFor(() => expect(onBack).toHaveBeenCalledWith(true));
  const { p } = supaRpc.mock.calls[0][1];
  expect(p.debt_event).toBeUndefined();
  expect(p.entries[0]).toMatchObject({ method: "account", from_member_id: "dima", to_member_id: "me" });
});

test("§10: в «Долгах» у зачёта нет корзины, тап открывает перевод в группе", () => {
  const navigate = jest.fn();
  const debtEvents = [
    { id: "ev1", person_id: "p-bek", type: "offset", amount: 5000, currency: "KZT", date: "2026-10-05", note: "Зачёт · Вечер 03.10" },
    { id: "d1", person_id: "p-bek", type: "they_paid", amount: -5000, currency: "KZT", date: "2026-09-01" },
  ];
  const sharedEntries = [{ id: "t1", group_id: "g1", kind: "transfer", method: "offset", debt_event_id: "ev1" }];
  render(<DebtPersonDetailPage person={people[0]} people={people} debtEvents={debtEvents} sharedGroups={[]} sharedMembers={[]} sharedEntries={sharedEntries}
    accounts={[kaspi]} transactions={[]} navigate={navigate} onReload={jest.fn()} onBack={jest.fn()}/>);
  expect(screen.getByText("В расчёте")).toBeInTheDocument();
  expect(screen.getAllByLabelText("Удалить запись")).toHaveLength(1);                 // только у off-book «взял в долг»
  userEvent.click(screen.getByText("Зачёт"));
  expect(navigate).toHaveBeenCalledWith("editSharedEntry", { entryId: "t1" });
});
