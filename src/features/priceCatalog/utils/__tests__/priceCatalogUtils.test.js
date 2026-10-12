import { unitPriceOf, productAttrsLabel, otherVariants } from "../priceCatalogUtils";
import { formatPack } from "../../../../utils/receipts/attributes";

// Этап 5 чеков (docs/receipts.md §7): варианты товара одного вида и цена за единицу.
const entry = (product_id, price, qty, unit, date, source = "Magnum GO") =>
  ({ id: `${product_id}-${date}-${source}`, product_id, price, qty, unit, date, source, created_at: date });

test("unitPriceOf: молоко 900 мл за ₸493 → за литр; штука — как есть", () => {
  expect(unitPriceOf({ price: 493, qty: 0.9 })).toBeCloseTo(547.78, 2);
  expect(unitPriceOf({ price: 1145, qty: 1 })).toBe(1145);
});

test("productAttrsLabel: вид · бренд · вариант · фасовка", () => {
  expect(productAttrsLabel({ kind: "Творог", brand: "Молочный Бидончик", variant: "5%", pack_qty: 0.5, pack_unit: "кг" }, formatPack))
    .toBe("Творог · Молочный Бидончик · 5% · 500 г");
  expect(productAttrsLabel({ kind: "Мыло", pack_qty: 0.35, pack_unit: "кг", pack_count: 5 }, formatPack)).toBe("Мыло · 5 × 70 г");
  expect(productAttrsLabel({ name: "Ручной товар" }, formatPack)).toBe("");
});

test("otherVariants: тот же вид без самого товара, сначала дешевле за единицу", () => {
  const products = [
    { id: "t5", name: "Творог 5%", kind: "Творог" },
    { id: "t9", name: "Творог 9%", kind: "творог" },
    { id: "t2", name: "Творог 2%", kind: "Творог" },
    { id: "k", name: "Кефир", kind: "Кефир" },
  ];
  const entries = [
    entry("t9", 885, 0.5, "кг", "2026-07-14"),   // 1770 / кг
    entry("t2", 600, 0.4, "кг", "2026-07-14"),   // 1500 / кг
  ];
  const v = otherVariants(products[0], products, entries);
  expect(v.map(x => x.product.id)).toEqual(["t2", "t9"]);
  expect(v[0].unitPrice).toBe(1500);
  expect(otherVariants({ id: "x", name: "Без вида" }, products, entries)).toEqual([]);
});
