import fs from "fs";
import path from "path";
import { parseLinkPayload, parsePdfReceipt, parseReceiptLink } from "../receipts";
import { planReceipt, planItemStatus, priceEntryOf, searchProducts, rawMatchKey, categoriesByKind } from "../receipts/catalogMatch";
import { buildReceiptSave } from "../receipts/receiptSave";

// Этап 5 (docs/receipts.md §7): позиции чека → товары и цены каталога.
const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures/receipts", name), "utf8");
const kaspi = parseLinkPayload(parseReceiptLink("https://receipt.kaspi.kz/web/fiscal?i=1&f=2&s=3&t=4"), fixture("kaspi-magnum.html"));
const small = parseLinkPayload(parseReceiptLink("https://consumer.oofd.kz/ru?i=1&f=2&s=3&t=4"), fixture("oofd-small.json"));
const arbuz = parsePdfReceipt(JSON.parse(fixture("arbuz-pdf-items.json")));

const EMPTY = { products: [], links: [] };
const idx = (receipt, part) => receipt.items.findIndex(i => i.rawName.includes(part));

// Каталог после сохранения чека — как его вернула бы БД.
const catalogAfter = (...saves) => ({
  products: saves.flatMap(s => s.products),
  links: saves.flatMap(s => s.links),
});

describe("первый чек — пустой каталог", () => {
  const plan = planReceipt(small, EMPTY);
  const p = buildReceiptSave("tx-1", small, { plan });

  test("все товары новые и «проверьте»; служебный пакет — не в каталог", () => {
    const statuses = small.items.map((item, i) => planItemStatus(item, plan[i]));
    expect(statuses.filter(s => s === "newUnconfirmed")).toHaveLength(15);
    expect(statuses[idx(small, "Пакет")]).toBe("service");
    expect(plan[idx(small, "Пакет")].inCatalog).toBe(false);
  });

  test("бедро двумя строками по одной цене за кг — один товар, ОДНА запись цены, одна ссылка", () => {
    expect(p.products).toHaveLength(14);
    expect(p.entries).toHaveLength(14);
    expect(p.links).toHaveLength(14);
    const chicken = p.items.filter(i => i.raw_name.includes("CHIP CHIP"));
    expect(chicken[0].product_id).toBe(chicken[1].product_id);
    expect(p.entries.filter(e => e.product_id === chicken[0].product_id)).toEqual([
      expect.objectContaining({ price: 1479, qty: 1, unit: "кг", date: "2026-10-08" }),
    ]);
  });

  test("новый товар: признаки из правил, не подтверждён, без категории, коды из чека", () => {
    const tvorog = p.products.find(x => x.kind === "Творог");
    expect(tvorog).toMatchObject({
      name: "Творог «Молочный Бидончик» 5%, 500 г", brand: "Молочный Бидончик", variant: "5%",
      pack_qty: 0.5, pack_unit: "кг", pack_count: null, category_id: null, gtin: null, ntin: expect.any(String), name_confirmed: false,
    });
  });

  test("записи цен: весовой — за 1 кг; с фасовкой — цена за упаковку и её объём; магазин и дата чека", () => {
    const banana = p.items.find(i => i.raw_name.startsWith("Банан"));
    expect(p.entries.find(e => e.product_id === banana.product_id)).toMatchObject({ price: 775, qty: 1, unit: "кг", source: "Small", date: "2026-10-08" });
    const tvorog = p.items.find(i => i.raw_name.includes("сүзбесі"));
    expect(p.entries.find(e => e.product_id === tvorog.product_id)).toMatchObject({ price: 968, qty: 0.5, unit: "кг" });
  });

  test("позиции чека ссылаются на товары; служебная — нет", () => {
    expect(p.items.find(i => i.raw_name.includes("Пакет"))).toMatchObject({ product_id: null, in_catalog: false });
    expect(p.items.filter(i => i.in_catalog).every(i => i.product_id)).toBe(true);
  });
});

test("второй такой же чек — всё узнаётся по коду, новых товаров нет", () => {
  const first = buildReceiptSave("tx-1", small, { plan: planReceipt(small, EMPTY) });
  const plan = planReceipt(small, catalogAfter(first));
  expect(plan.filter(pi => pi.inCatalog).every(pi => pi.match.via === "ntin")).toBe(true);
  const second = buildReceiptSave("tx-2", small, { plan });
  expect(second.products).toHaveLength(0);
  expect(second.product_updates).toHaveLength(15);
  expect(second.entries).toHaveLength(14);
});

test("Kaspi: мыло 5 × 70 г — цена за упаковку, объём 0.35 кг; штрихкод — в товар", () => {
  const p = buildReceiptSave("tx-1", kaspi, { plan: planReceipt(kaspi, EMPTY) });
  const soap = p.items[idx(kaspi, "Мыло")];
  expect(p.entries.find(e => e.product_id === soap.product_id)).toMatchObject({ price: 1789, qty: 0.35, unit: "кг" });
  expect(p.products.find(x => x.id === soap.product_id)).toMatchObject({ gtin: "8693495033046", pack_count: 5 });
});

describe("между магазинами", () => {
  // Пользователь подтвердил творог из Small (без кода в Арбузе узнать можно только по признакам).
  const confirmed = { id: "p-tvorog", name: "Творог «Молочный Бидончик» 5%, 500 г", kind: "Творог", brand: "Молочный Бидончик",
    variant: "5%", pack_qty: 0.5, pack_unit: "кг", name_confirmed: true };

  test("Арбуз без кодов находит подтверждённый товар по всем 4 признакам — бренд целиком из каталога", () => {
    const plan = planReceipt(arbuz, { products: [confirmed], links: [] });
    expect(plan[idx(arbuz, "Творог")].match).toMatchObject({ productId: "p-tvorog", via: "attributes" });
    expect(plan[idx(arbuz, "Кефир Молочный")].description.name).toBe("Кефир «Молочный Бидончик» 2.5%, 1 л");
    expect(plan[idx(arbuz, "Кефир Молочный")].match.productId).toBeNull();   // кефира в каталоге нет
  });

  test("неподтверждённый товар по признакам не сопоставляется — правила могли ошибиться", () => {
    const plan = planReceipt(arbuz, { products: [{ ...confirmed, name_confirmed: false }], links: [] });
    expect(plan[idx(arbuz, "Творог")].match.productId).toBeNull();
  });

  test("другая жирность того же бренда — другой товар", () => {
    const plan = planReceipt(kaspi, { products: [confirmed], links: [] });
    expect(plan[idx(kaspi, "Творог")].match.productId).toBeNull();   // 9%
  });

  test("ссылка «строка чека» — только в своём магазине", () => {
    const link = { id: "l1", product_id: "p-luk", source: "Арбуз", match_key: rawMatchKey("Лук репчатый, кг") };
    const products = [{ id: "p-luk", name: "Лук репчатый", name_confirmed: true }];
    expect(planReceipt(arbuz, { products, links: [link] })[idx(arbuz, "Лук")].match).toMatchObject({ productId: "p-luk", via: "link" });
    expect(planReceipt(arbuz, { products, links: [{ ...link, source: "Small" }] })[idx(arbuz, "Лук")].match.productId).toBeNull();
  });
});

describe("правки пользователя в предпросмотре", () => {
  test("снятая галочка — позиция в чеке, но не в каталоге", () => {
    const plan = planReceipt(small, EMPTY);
    plan[idx(small, "Банан")].inCatalog = false;
    const p = buildReceiptSave("tx-1", small, { plan });
    expect(p.items[idx(small, "Банан")]).toMatchObject({ in_catalog: false, product_id: null });
    expect(p.products.some(x => x.kind === "Банан")).toBe(false);
    expect(p.links.some(l => l.match_key === rawMatchKey("Банан - Банан - ."))).toBe(false);
  });

  test("поправили новый товар — создаётся подтверждённым, с новым именем", () => {
    const plan = planReceipt(kaspi, EMPTY);
    const i = idx(kaspi, "Бедро");
    plan[i].edits = { ...plan[i].description, core: "Бедро куриное", brand: "Алель" };
    const p = buildReceiptSave("tx-1", kaspi, { plan });
    expect(p.products.find(x => x.id === p.items[i].product_id)).toMatchObject({ name: "Бедро куриное «Алель»", name_confirmed: true });
    expect(p.items[i].name).toBe("Бедро куриное «Алель»");
  });

  test("«Это тот же товар, что…» — запись и ссылка на выбранный товар, его коды дописываются", () => {
    const plan = planReceipt(small, EMPTY);
    const i = idx(small, "Банан");
    plan[i].match = { productId: "p-banana", via: "manual", productName: "Бананы", confirmed: true };
    const p = buildReceiptSave("tx-1", small, { plan });
    expect(p.items[i]).toMatchObject({ product_id: "p-banana", name: "Бананы" });
    expect(p.product_updates).toContainEqual(expect.objectContaining({ id: "p-banana", confirm: false }));
    expect(p.links).toContainEqual(expect.objectContaining({ product_id: "p-banana", source: "Small" }));
  });

  test("поправили найденный товар — обновление с confirm", () => {
    const plan = planReceipt(small, EMPTY);
    const i = idx(small, "Банан");
    plan[i].match = { productId: "p-banana", via: "manual", productName: "Бананы", confirmed: false };
    plan[i].edits = { core: "Бананы", kind: "Бананы", brand: null, variant: null, pack: null };
    const p = buildReceiptSave("tx-1", small, { plan });
    expect(p.product_updates).toContainEqual(expect.objectContaining({ id: "p-banana", confirm: true, name: "Бананы", kind: "Бананы" }));
  });
});

test("priceEntryOf", () => {
  expect(priceEntryOf({ unit: "кг", price: 1489 }, null)).toEqual({ price: 1489, qty: 1, unit: "кг" });
  expect(priceEntryOf({ unit: "шт", price: 493 }, { qty: 0.9, unit: "л" })).toEqual({ price: 493, qty: 0.9, unit: "л" });
  expect(priceEntryOf({ unit: "шт", price: 1145 }, null)).toEqual({ price: 1145, qty: 1, unit: "шт" });
});

test("searchProducts: сначала тот же вид, поиск без регистра", () => {
  const products = [{ id: "a", name: "Кефир «Golden Milk»", kind: "Кефир" }, { id: "b", name: "Бананы", kind: "Бананы" }, { id: "c", name: "Банан", kind: "Банан" }];
  expect(searchProducts(products, "", "Банан").map(p => p.id)).toEqual(["c", "b", "a"]);
  expect(searchProducts(products, "БАН").map(p => p.id)).toEqual(["c", "b"]);
});

describe("категории (§7.7)", () => {
  const dairy = "cat-dairy", veg = "cat-veg";

  test("вид → самая частая категория среди товаров каталога этого вида", () => {
    const byKind = categoriesByKind([
      { kind: "Творог", category_id: dairy }, { kind: "творог", category_id: dairy }, { kind: "Творог", category_id: veg },
      { kind: "Морковь", category_id: veg }, { kind: "Кефир", category_id: null },
    ]);
    expect(byKind.get("творог")).toBe(dairy);
    expect(byKind.get("морковь")).toBe(veg);
    expect(byKind.has("кефир")).toBe(false);
  });

  test("новый товар получает категорию по виду; служебная и незнакомый вид — без категории", () => {
    const catalog = { products: [{ id: "p0", name: "Творог «Простоквашино» 9%", kind: "Творог", category_id: dairy, name_confirmed: true }], links: [] };
    const plan = planReceipt(small, catalog);
    expect(plan[idx(small, "сүзбесі")]).toMatchObject({ categoryId: dairy, categorySource: "kind" });
    expect(plan[idx(small, "Банан")]).toMatchObject({ categoryId: null, categorySource: null });
    expect(plan[idx(small, "Пакет")].categoryId).toBeNull();
    const p = buildReceiptSave("tx-1", small, { plan });
    expect(p.products.find(x => x.kind === "Творог").category_id).toBe(dairy);
  });

  test("у найденного товара — его категория, а не по виду", () => {
    const first = buildReceiptSave("tx-1", small, { plan: planReceipt(small, EMPTY) });
    const products = first.products.map(x => (x.kind === "Творог" ? { ...x, category_id: veg } : x));
    products.push({ id: "other", name: "Творог другой", kind: "Творог", category_id: dairy });
    products.push({ id: "other2", name: "Творог третий", kind: "Творог", category_id: dairy });
    const plan = planReceipt(small, { products, links: first.links });
    expect(plan[idx(small, "сүзбесі")]).toMatchObject({ categoryId: veg, categorySource: "product" });
  });

  test("найденному товару: выбор пользователя — заменить, по виду — только если пусто", () => {
    const first = buildReceiptSave("tx-1", small, { plan: planReceipt(small, EMPTY) });
    const catalog = { products: [...first.products, { id: "z", name: "Бананы", kind: "Банан", category_id: veg }], links: first.links };
    const plan = planReceipt(small, catalog);
    const banana = idx(small, "Банан");
    expect(plan[banana].categorySource).toBe("kind");
    let p = buildReceiptSave("tx-2", small, { plan });
    expect(p.product_updates.find(u => u.id === plan[banana].match.productId)).toMatchObject({ category_id: veg, category_mode: "fill" });

    plan[banana] = { ...plan[banana], categoryId: dairy, categorySource: "manual" };
    p = buildReceiptSave("tx-2", small, { plan });
    expect(p.product_updates.find(u => u.id === plan[banana].match.productId)).toMatchObject({ category_id: dairy, category_mode: "set" });
  });
});

test("один товар по разной цене в одном чеке (скидка на строку) — две записи", () => {
  const twoPrices = { ...small, items: small.items.map(i => (i.rawName.includes("CHIP CHIP") && i.qty === 0.784 ? { ...i, price: 1399 } : i)) };
  const p = buildReceiptSave("tx-1", twoPrices, { plan: planReceipt(twoPrices, EMPTY) });
  const chicken = p.items.find(i => i.raw_name.includes("CHIP CHIP")).product_id;
  expect(p.entries.filter(e => e.product_id === chicken).map(e => e.price).sort()).toEqual([1399, 1479]);
});
