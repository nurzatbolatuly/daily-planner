import fs from "fs";
import path from "path";
import { parseLinkPayload, parsePdfReceipt, parseReceiptLink } from "../receipts";
import { describeItem, expandAbbreviations, splitLanguages } from "../receipts/names";
import { parsePack, formatPack, parseVariant, findBrand, tidyBrand, findKind } from "../receipts/attributes";

// Этап 2 (docs/receipts.md §7.2): названия и признаки товаров по правилам, без ИИ.
const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures/receipts", name), "utf8");
const receipts = {
  kaspi: parseLinkPayload(parseReceiptLink("https://receipt.kaspi.kz/web/fiscal?i=1&f=2&s=3&t=4"), fixture("kaspi-magnum.html")),
  oofd: parseLinkPayload(parseReceiptLink("https://consumer.oofd.kz/ru?i=1&f=2&s=3&t=4"), fixture("oofd-small.json")),
  arbuz: parsePdfReceipt(JSON.parse(fixture("arbuz-pdf-items.json"))),
};
// core проверяется косвенно — через name (он из core и признаков собирается).
const describe_ = (receipt, item, knownBrands) => {
  const { core, ...rest } = describeItem(item, { splitName: receipt.splitName, knownBrands });
  return rest;
};

// «Золотая» таблица: все позиции трёх реальных чеков → [название, вид, бренд, вариант, фасовка].
// Проверена пользователем. Правило поменялось и строка разошлась — это осознанное решение, а не
// «поправить ожидание под код».
const GOLDEN = {
  kaspi: [
    ["Мыло Натурэль Интенсивное Увлажнение олива и увлажняющее молочко «Palmolive», 5 × 70 г", "Мыло", "Palmolive", null, {qty: 0.35, unit: "кг", count: 5}],
    ["Бедро цыпленка бройлера со спинкой замороженное ульма «Алель»", "Бедро", "Алель", null, null],
    ["Творог «Молочный Бидончик» 9%, 500 г", "Творог", "Молочный Бидончик", "9%", {qty: 0.5, unit: "кг"}],
    ["Лапша гнезда с томатом 5 мм «Султан», 400 г", "Лапша", "Султан", null, {qty: 0.4, unit: "кг"}],
    ["Чечевица красная колотая «Arbella», 800 г", "Чечевица", "Arbella", null, {qty: 0.8, unit: "кг"}],
    ["Вареники «Ansar Halal», 400 г", "Вареники", "Ansar Halal", null, {qty: 0.4, unit: "кг"}],
    ["Упаковка", null, null, null, null],
  ],
  oofd: [
    ["Банан", "Банан", null, null, null],
    ["Салфетки микрофибра «Parex» 32×34, 5 шт", "Салфетки", "Parex", "32×34", {qty: 5, unit: "шт"}],
    ["Творог «Молочный Бидончик» 5%, 500 г", "Творог", "Молочный Бидончик", "5%", {qty: 0.5, unit: "кг"}],
    ["Сметанный продукт домашний «Иртыш» 20%, 700 г", "Сметанный продукт", "Иртыш", "20%", {qty: 0.7, unit: "кг"}],
    ["Бедро замороженное «Chip-Chip»", "Бедро", "Chip-Chip", null, null],
    ["Бедро замороженное «Chip-Chip»", "Бедро", "Chip-Chip", null, null],
    ["Сосиски утренние «Нәрлен», 400 г", "Сосиски", "Нәрлен", null, {qty: 0.4, unit: "кг"}],
    ["Картофель 1 сорт", "Картофель", null, "1 сорт", null],
    ["Лук белый", "Лук", null, null, null],
    ["Перец ласточка", "Перец", null, null, null],
    ["Колбаса прима халал «Нәрлен», 500 г", "Колбаса", "Нәрлен", null, {qty: 0.5, unit: "кг"}],
    ["Морковь", "Морковь", null, null, null],
    ["Паприка молотая «Омега», 15 г", "Паприка", "Омега", null, {qty: 0.015, unit: "кг"}],
    ["Приправа хмели-сунели «Выбор Шефа», 120 г", "Приправа", "Выбор Шефа", null, {qty: 0.12, unit: "кг"}],
    ["Томатная паста «Томастер», 550 г", "Томатная паста", "Томастер", null, {qty: 0.55, unit: "кг"}],
    ["Пакет small food", null, null, null, null],
  ],
  arbuz: [
    ["Лук репчатый", "Лук", null, null, null],
    ["Перец ласточка красный", "Перец", null, null, null],
    ["Бананы", "Бананы", null, null, null],
    ["Картофель", "Картофель", null, null, null],
    ["Вареники с картофелем «Baron», 400 г", "Вареники", "Baron", null, {qty: 0.4, unit: "кг"}],
    ["Молоко «Петропавловское» 3.2%, 900 мл", "Молоко", "Петропавловское", "3.2%", {qty: 0.9, unit: "л"}],
    ["Баклажаны", "Баклажаны", null, null, null],
    ["Сметанный продукт «Умут и Ко» 20%, 700 г", "Сметанный продукт", "Умут и Ко", "20%", {qty: 0.7, unit: "кг"}],
    ["Окорочка замороженные «UKPF»", "Окорочка", "UKPF", null, null],
    ["Помидоры черри красные", "Помидоры", null, null, null],
    ["Перец ласточка зеленый", "Перец", null, null, null],
    ["Морковь", "Морковь", null, null, null],
    ["Овсяные хлопья геркулес «Arbuz select», 400 г", "Овсяные хлопья", "Arbuz select", null, {qty: 0.4, unit: "кг"}],
    ["Кефир бидончик «Молочный» 2.5%, 1 л", "Кефир", "Молочный", "2.5%", {qty: 1, unit: "л"}],
    ["Творог бидончик «Молочный» 5%, 500 г", "Творог", "Молочный", "5%", {qty: 0.5, unit: "кг"}],
    ["Рис баракат «Asia Rice»", "Рис", "Asia Rice", null, null],
    ["Кефир «Golden Milk» 2.5%, 1 кг", "Кефир", "Golden Milk", "2.5%", {qty: 1, unit: "кг"}],
    ["Масло крестьянское особое «Масленково» 72.5%, 400 г", "Масло", "Масленково", "72.5%", {qty: 0.4, unit: "кг"}],
    ["Яйца куриное SB-B категория высшая «Сары-Булак», 30 шт", "Яйца", "Сары-Булак", null, {qty: 30, unit: "шт"}],
    ["Доставка", null, null, null, null],
  ],
};

describe("золотая таблица: все позиции трёх чеков", () => {
  Object.entries(GOLDEN).forEach(([key, rows]) => {
    test(`${key}: ${rows.length} позиций`, () => {
      const r = receipts[key];
      expect(r.items).toHaveLength(rows.length);
      r.items.forEach((item, i) => {
        const [name, kind, brand, variant, pack] = rows[i];
        expect({ raw: item.rawName, ...describe_(r, item) }).toEqual({ raw: item.rawName, name, kind, brand, variant, pack });
      });
    });
  });
});

describe("известные бренды каталога (подтверждённые товары, этап 5)", () => {
  const known = ["Молочный Бидончик"];
  const arbuz = part => receipts.arbuz.items.find(i => i.rawName.includes(part));

  test("бренд из нескольких слов узнаётся целиком, хотя «бидончик» с маленькой", () => {
    expect(describe_(receipts.arbuz, arbuz("Кефир Молочный"), known)).toMatchObject({ name: "Кефир «Молочный Бидончик» 2.5%, 1 л", brand: "Молочный Бидончик" });
  });

  test("один и тот же творог в Small и Арбузе — одно название и одни признаки", () => {
    const small = receipts.oofd.items.find(i => i.rawName.includes("сүзбесі"));
    const a = describe_(receipts.arbuz, arbuz("Творог Молочный"), known);
    const s = describe_(receipts.oofd, small, known);
    expect(a).toEqual(s);
    expect(a.name).toBe("Творог «Молочный Бидончик» 5%, 500 г");
  });

  test("но 9% из Magnum GO — другой товар того же вида", () => {
    const kaspi = describe_(receipts.kaspi, receipts.kaspi.items.find(i => i.rawName.includes("Творог")), known);
    expect(kaspi).toMatchObject({ kind: "Творог", brand: "Молочный Бидончик", variant: "9%" });
  });
});

describe("правила", () => {
  test("splitLanguages: Small «каз. - рус. - бренд», «.» — без бренда, не три части — как есть", () => {
    expect(splitLanguages("Иртыш үйдегідей қаймақ өнімі 700 г 20% шелек - Смет.пр.700г 20% дом - ИРТЫШ"))
      .toEqual({ name: "Смет.пр.700г 20% дом", brand: "Иртыш", others: ["Иртыш үйдегідей қаймақ өнімі 700 г 20% шелек"] });
    expect(splitLanguages("Банан - Банан - .").brand).toBeNull();
    expect(splitLanguages("Сары-Булак яйца").name).toBe("Сары-Булак яйца");
  });

  test("tidyBrand: обрезанный хвост кассы и ВЕРХНИЙ РЕГИСТР", () => {
    expect(tidyBrand("МОЛОЧНЫЙ БИДОНЧИК ТВ")).toBe("Молочный Бидончик");
    expect(tidyBrand("ВЫБОР ШЕФА")).toBe("Выбор Шефа");
    expect(tidyBrand("Chip-Chip")).toBe("Chip-Chip");
    expect(tidyBrand(".")).toBeNull();
  });

  test("expandAbbreviations: вплотную к соседям, только целым словом без точки", () => {
    expect(expandAbbreviations("Смет.пр.700г")).toBe("сметанный продукт 700г");
    expect(expandAbbreviations("Припр.хмел-сунел.120")).toBe("приправа хмели-сунели 120");
    expect(expandAbbreviations("Бедро Зам")).toBe("Бедро замороженное");
    expect(expandAbbreviations("Домашний сыр")).toBe("Домашний сыр");
  });

  test("parsePack: единицы к базовой, упаковка из нескольких штук, мм — не фасовка", () => {
    expect(parsePack("Молоко 0.9 л").pack).toEqual({ qty: 0.9, unit: "л" });
    expect(parsePack("Кефир 1000 г").pack).toEqual({ qty: 1, unit: "кг" });
    expect(parsePack("Вода 500мл").pack).toEqual({ qty: 0.5, unit: "л" });
    expect(parsePack("Салфетки 5дана").pack).toEqual({ qty: 5, unit: "шт" });
    expect(parsePack("Мыло 5 штук по 70 гр").pack).toEqual({ qty: 0.35, unit: "кг", count: 5 });
    expect(parsePack("Лапша 5 мм").pack).toBeNull();
  });

  test("formatPack: до килограмма/литра — в граммах/миллилитрах", () => {
    expect(formatPack({ qty: 0.9, unit: "л" })).toBe("900 мл");
    expect(formatPack({ qty: 1.5, unit: "кг" })).toBe("1.5 кг");
    expect(formatPack({ qty: 0.35, unit: "кг", count: 5 })).toBe("5 × 70 г");
    expect(formatPack({ qty: 30, unit: "шт" })).toBe("30 шт");
  });

  test("parseVariant: жирность (запятая → точка), сорт, размер", () => {
    expect(parseVariant("Кефир 2,5% пак.")).toEqual({ variant: "2.5%", rest: "Кефир пак." });
    expect(parseVariant("Картофель 1сорт").variant).toBe("1 сорт");
    expect(parseVariant("Салфетки 32*34").variant).toBe("32×34");
    expect(parseVariant("Хлеб").variant).toBeNull();
  });

  test("findBrand: латиница, заглавные со связкой «и», кавычки; первое слово — вид, не бренд", () => {
    expect(findBrand("Рис Asia Rice баракат")).toEqual({ brand: "Asia Rice", rest: "Рис баракат" });
    expect(findBrand("Продукт Умут и Ко сметанный").brand).toBe("Умут и Ко");
    expect(findBrand("Яйца Сары-Булак куриное SB-B").brand).toBe("Сары-Булак");
    expect(findBrand('Сок «Да-да» яблочный')).toEqual({ brand: "Да-да", rest: "Сок яблочный" });
    expect(findBrand("Морковь мытая").brand).toBeNull();
  });

  test("findKind: многословный вид и его варианты написания", () => {
    expect(findKind("Продукт сметанный")).toEqual({ kind: "Сметанный продукт", core: "Сметанный продукт" });
    expect(findKind("Паста томатная")).toEqual({ kind: "Томатная паста", core: "Томатная паста" });
    expect(findKind("молоко пастеризованное")).toEqual({ kind: "Молоко", core: "Молоко пастеризованное" });
  });
});
