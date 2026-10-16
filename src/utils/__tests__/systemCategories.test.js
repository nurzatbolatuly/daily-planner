import { systemCategoryIds, missingSystemCategories, fxCategoryId } from "../systemCategories";

const exp = [{ id: "a", name: "Продукты" }, { id: "u-bills", system_key: "bills" }];
const inc = [{ id: "u-gain", system_key: "fx_gain" }];

test("id системных категорий — по роли, а не по фиксированному id", () => {
  expect(systemCategoryIds(exp, inc)).toEqual({ bills: "u-bills", fxLoss: null, fxGain: "u-gain" });
});

test("недостающие системные категории — со своими id и порядком после существующих", () => {
  const [row, ...rest] = missingSystemCategories("exp", exp);
  expect(rest).toEqual([]);
  expect(row).toMatchObject({ system_key: "fx_loss", name: "Курсовая разница", sort_order: 3 });
  expect(row.id).toEqual(expect.any(String));
  expect(row).not.toHaveProperty("table");
  expect(missingSystemCategories("inc", inc)).toEqual([]);
});

test("новый пользователь: у каждого свой id, не общий на всех", () => {
  const [a] = missingSystemCategories("inc", []);
  const [b] = missingSystemCategories("inc", []);
  expect(a.id).not.toBe(b.id);
});

test("курсовая прибыль — доход, убыток — расход", () => {
  const sys = { fxGain: "g", fxLoss: "l" };
  expect(fxCategoryId(10, sys)).toBe("g");
  expect(fxCategoryId(-10, sys)).toBe("l");
});
