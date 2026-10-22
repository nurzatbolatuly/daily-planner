import { supaRpc } from "../../lib/supabase";
import { sortByIds, withSortOrder, migrateLegacyOrder } from "../accountOrder";

jest.mock("../../lib/supabase", () => ({ supaRpc: jest.fn(() => Promise.resolve()) }));

const acc = ids => ids.map(id => ({ id }));
const ids = list => list.map(a => a.id);

beforeEach(() => { supaRpc.mockClear(); localStorage.clear(); });

test("sortByIds: по сохранённым id, новые — в конце в прежнем порядке", () => {
  expect(ids(sortByIds(acc(["a", "b", "c", "d"]), ["c", "a", "gone"]))).toEqual(["c", "a", "b", "d"]);
});

test("withSortOrder: позиция с 1, как в reorder_accounts", () => {
  expect(withSortOrder(acc(["x", "y"]))).toEqual([{ id: "x", sort_order: 1 }, { id: "y", sort_order: 2 }]);
});

test("migrateLegacyOrder: нет ключа — счета как пришли, в БД не пишем", async () => {
  const list = acc(["a", "b"]);
  expect(await migrateLegacyOrder(list)).toBe(list);
  expect(supaRpc).not.toHaveBeenCalled();
});

test("migrateLegacyOrder: переносит порядок в БД и удаляет ключ", async () => {
  localStorage.setItem("accountOrder", JSON.stringify(["b", "a"]));
  const res = await migrateLegacyOrder(acc(["a", "b", "c"]));
  expect(ids(res)).toEqual(["b", "a", "c"]);
  expect(supaRpc).toHaveBeenCalledWith("reorder_accounts", { p_ids: ["b", "a", "c"] });
  expect(localStorage.getItem("accountOrder")).toBeNull();
});

test("migrateLegacyOrder: ошибка записи — порядок применён локально, ключ остаётся для повтора", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  supaRpc.mockRejectedValueOnce(new Error("offline"));
  localStorage.setItem("accountOrder", JSON.stringify(["b", "a"]));
  expect(ids(await migrateLegacyOrder(acc(["a", "b"])))).toEqual(["b", "a"]);
  expect(localStorage.getItem("accountOrder")).not.toBeNull();
  console.error.mockRestore();
});

test("migrateLegacyOrder: битый ключ — счета как пришли", async () => {
  localStorage.setItem("accountOrder", "{oops");
  const list = acc(["a"]);
  expect(await migrateLegacyOrder(list)).toBe(list);
});
