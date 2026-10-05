import { personDebtBadge, buildSharedTxIndex, sharedTxBadge, virtualTxLabel, txBadge } from "../txBadges";

const groups = [{ id: "g1", name: "Вечер 03.10", mode: "event" }, { id: "f1", name: "Квартира", mode: "mirror" }];
const members = [
  { id: "me", group_id: "g1", is_me: true }, { id: "asan", group_id: "g1", guest_name: "Асан" }, { id: "bek", group_id: "g1", person_id: "p-bek" },
  { id: "me2", group_id: "f1", is_me: true }, { id: "dima", group_id: "f1", person_id: "p-dima" },
];
const people = [{ id: "p-bek", name: "Бек" }, { id: "p-dima", name: "Дима" }];
const entries = [
  { id: "b1", group_id: "g1", kind: "bill", transaction_id: "tx-bill", payer_member_id: "me" },
  { id: "b2", group_id: "g1", kind: "bill", payer_member_id: "asan" },
  { id: "t1", group_id: "g1", kind: "transfer", transaction_id: "tx-in", from_member_id: "asan", to_member_id: "me" },
  { id: "t2", group_id: "f1", kind: "transfer", transaction_id: "tx-out", from_member_id: "me2", to_member_id: "dima" },
  { id: "p1", group_id: "g1", kind: "transfer", transaction_id: "tx-batch", from_member_id: "bek", to_member_id: "me", sender_person_id: "p-bek", batch_id: "B" },
  { id: "p2", group_id: "g1", kind: "transfer", transaction_id: "tx-batch", from_member_id: "asan", to_member_id: "me", sender_person_id: "p-bek", batch_id: "B" },
  { id: "r1", group_id: "f1", kind: "refund", transaction_id: "tx-refund", payer_member_id: "me2" },
];
const index = buildSharedTxIndex({ sharedGroups: groups, sharedMembers: members, sharedEntries: entries, people });

test("§11.4: бейджи транзакций общих групп", () => {
  expect(sharedTxBadge({ id: "tx-bill" }, index)).toEqual({ label: "Общие · Вечер 03.10", tone: "shared" });
  expect(sharedTxBadge({ id: "tx-in" }, index).label).toBe("Перевод · Вечер 03.10 ← Асан");
  expect(sharedTxBadge({ id: "tx-out" }, index).label).toBe("Перевод · Квартира → Дима");
  expect(sharedTxBadge({ id: "tx-batch" }, index).label).toBe("Перевод · 2 долга ← Бек");
  expect(sharedTxBadge({ id: "tx-refund" }, index).label).toBe("Возврат · Квартира");
  expect(sharedTxBadge({ id: "other" }, index)).toBe(null);
});

test("виртуальная строка: кто платил", () => {
  expect(virtualTxLabel({ shared_entry_id: "b2" }, index)).toBe("Вечер 03.10 · платил Асан");
  expect(virtualTxLabel({ shared_entry_id: "nope" }, index)).toBe("Общие расходы");
});

test("бейдж истории: сначала общие, потом долги людям", () => {
  const debtEvents = [{ transaction_id: "tx-debt", type: "lent", person_id: "p-bek" }];
  expect(txBadge({ id: "tx-debt" }, { sharedIndex: index, debtEvents, debtPeople: people })).toEqual({ label: "Дал в долг · Бек", tone: "warn" });
  expect(txBadge({ id: "tx-bill" }, { sharedIndex: index, debtEvents, debtPeople: people }).tone).toBe("shared");
  expect(personDebtBadge({ id: "x", type: "income" }, [{ transaction_id: "x", type: "return", person_id: "p-bek" }], people)).toEqual({ label: "Бек вернул(а) долг", tone: "ok" });
});
