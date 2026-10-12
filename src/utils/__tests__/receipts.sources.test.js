import fs from "fs";
import path from "path";
import { parseLinkPayload, parsePdfReceipt, parseReceiptLink, itemsTotal, RECEIPT_ERRORS } from "../receipts";
import { parseArbuzRows } from "../receipts/arbuz";

// Фикстуры — реальные чеки трёх магазинов, обезличенные (docs/receipts.md §10, этап 1).
const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures/receipts", name), "utf8");
const kaspiHtml = fixture("kaspi-magnum.html");
const oofdJson = fixture("oofd-small.json");
const arbuzPages = JSON.parse(fixture("arbuz-pdf-items.json"));

const KASPI_LINK = parseReceiptLink("https://receipt.kaspi.kz/web/fiscal?i=000000000101&f=000000000202&s=5772&t=2026-07-14+13:07:50.871995");
const OOFD_LINK = parseReceiptLink("https://consumer.oofd.kz/ru?i=1000000001&f=000000000303&s=11537.00&t=20261008T175844");

const errorCode = fn => { try { fn(); } catch (e) { return e.code; } return null; };
const byName = (receipt, part) => receipt.items.find(i => i.name.includes(part));

describe("Kaspi ОФД — Magnum GO", () => {
  const r = parseLinkPayload(KASPI_LINK, kaspiHtml);

  test("шапка: магазин, ФП:РНМ, дата, итог, ссылка", () => {
    expect(r).toMatchObject({
      source: "kaspi",
      externalId: "kaspi:000000000101:000000000202",
      merchant: "Magnum GO",
      merchantRaw: 'ТОО "MAGNUM E-COMMERCE KAZAKHSTAN"',
      date: "2026-07-14",
      datetime: "2026-07-14T13:07:50",
      total: 5772,
      currency: "KZT",
      url: KASPI_LINK.url,
    });
  });

  test("7 позиций, Σ = итог", () => {
    expect(r.items).toHaveLength(7);
    expect(itemsTotal(r.items, r.adjustments)).toBe(r.total);
  });

  test("весовой товар: количество из строки, цена за кг, коды", () => {
    expect(byName(r, "Бедро цыпленка")).toMatchObject({ qty: 0.684, unit: "кг", price: 1489, sum: 1018, gtin: "2154926", ntin: "0200155798580" });
  });

  test("хвостовая табуляция в названии убрана", () => {
    expect(r.items[0].name).toBe("Мыло Palmolive Натурэль Интенсивное Увлажнение олива и увлажняющее молочко 5 штук по 70 гр");
    expect(r.items[0]).toMatchObject({ qty: 1, unit: "шт", gtin: "8693495033046", isService: false });
  });

  test("«Упаковка» — служебная", () => {
    expect(byName(r, "Упаковка").isService).toBe(true);
    expect(r.items.filter(i => i.isService)).toHaveLength(1);
  });

  test("чек возврата не принимается", () => {
    expect(errorCode(() => parseLinkPayload(KASPI_LINK, kaspiHtml.replace('"Продажа"', '"Возврат"')))).toBe(RECEIPT_ERRORS.refund);
  });

  test("страница без данных чека — ошибка формата", () => {
    expect(errorCode(() => parseLinkPayload(KASPI_LINK, "<html><body>Чек</body></html>"))).toBe(RECEIPT_ERRORS.format);
  });
});

describe("Казахтелеком ОФД (oofd.kz) — Small", () => {
  const r = parseLinkPayload(OOFD_LINK, oofdJson);

  test("шапка: магазин по юрлицу, ФП:РНМ, дата, итог", () => {
    expect(r).toMatchObject({
      source: "oofd",
      externalId: "oofd:1000000001:000000000303",
      merchant: "Small",
      date: "2026-10-08",
      datetime: "2026-10-08T17:58:44",
      total: 11537,
      adjustments: [],
    });
  });

  test("16 позиций, «Коррекция округления» свёрнута в товары: Σ = итог до копейки", () => {
    expect(r.items).toHaveLength(16);
    expect(r.items.some(i => /Коррекция/.test(i.name))).toBe(false);
    expect(itemsTotal(r.items, r.adjustments)).toBe(11537);
  });

  test("скидка-коррекция уменьшила сумму предыдущего товара", () => {
    // Банан 668.05 и следом «Коррекция округления» −0.05
    expect(byName(r, "Банан")).toMatchObject({ qty: 0.862, unit: "кг", price: 775, sum: 668 });
  });

  test("единицы из словаря ответа (796 → «шт », с пробелом), NTIN без штрихкода", () => {
    expect(byName(r, "Творог 500гр")).toMatchObject({ qty: 1, unit: "шт", price: 968, sum: 968, gtin: null, ntin: expect.any(String) });
  });

  test("одинаковый товар двумя строками — две позиции", () => {
    expect(r.items.filter(i => i.name.includes("Бедро CHIP CHIP"))).toHaveLength(2);
  });

  test("пакет — служебный", () => {
    expect(r.items.filter(i => i.isService).map(i => i.name)).toEqual(["Small food пакеті - Пакет small food - SMALL"]);
  });

  test("возврат и неизвестная операция", () => {
    const json = JSON.parse(oofdJson);
    expect(errorCode(() => parseLinkPayload(OOFD_LINK, { ...json, ticket: { ...json.ticket, operationType: 3 } }))).toBe(RECEIPT_ERRORS.refund);
    expect(errorCode(() => parseLinkPayload(OOFD_LINK, { ...json, ticket: { ...json.ticket, operationType: 0 } }))).toBe(RECEIPT_ERRORS.format);
  });

  test("скидка на весь чек — корректировка, Σ всё равно = итог", () => {
    const json = JSON.parse(oofdJson);
    const res = parseLinkPayload(OOFD_LINK, { ...json, ticket: { ...json.ticket, totalSum: 11037, discount: { discount: true, name: "Акция", sum: 500 } } });
    expect(res.adjustments).toEqual([{ name: "Акция", sum: -500 }]);
    expect(itemsTotal(res.items, res.adjustments)).toBe(11037);
  });

  test("не JSON — ошибка формата", () => {
    expect(errorCode(() => parseLinkPayload(OOFD_LINK, "<html>"))).toBe(RECEIPT_ERRORS.format);
  });
});

describe("Накладная Арбуза (PDF)", () => {
  const r = parsePdfReceipt(arbuzPages);

  test("шапка: номер заказа, дата без времени, «Итого к оплате»", () => {
    expect(r).toMatchObject({
      source: "arbuz",
      externalId: "arbuz:1000001",
      merchant: "Арбуз",
      merchantRaw: "Arbuz Group",
      date: "2026-09-05",
      datetime: null,
      total: 18678,
      url: null,
    });
  });

  test("20 позиций; Σ по отгруженному = к оплате («Вернуться 800» — возврат предоплаты, не скидка)", () => {
    expect(r.items).toHaveLength(20);
    expect(r.adjustments).toEqual([]);
    expect(itemsTotal(r.items, r.adjustments)).toBe(18678);
  });

  test("количество — «Отгружено», а не «Заказано»; цена за кг", () => {
    expect(byName(r, "Картофель")).toMatchObject({ qty: 3.138, unit: "кг", price: 195, sum: 612 });
    expect(byName(r, "Лук репчатый")).toMatchObject({ name: "Лук репчатый, кг", qty: 1.716, unit: "кг", price: 95, sum: 163 });
  });

  test("штучный товар; слова, разбитые pdf.js («м» «/» «у»), склеены", () => {
    expect(byName(r, "Вареники")).toMatchObject({ qty: 2, unit: "шт", price: 899, sum: 1798 });
    expect(byName(r, "Молоко").name).toBe("Молоко Петропавловское 3.2% м/у 0.9 л");
  });

  test("доставка — служебная, штрихкодов нет", () => {
    expect(r.items.filter(i => i.isService).map(i => i.name)).toEqual(["Доставка"]);
    expect(r.items.every(i => i.gtin === null && i.ntin === null)).toBe(true);
  });

  test("не накладная Арбуза — ошибка файла", () => {
    expect(errorCode(() => parsePdfReceipt([[{ str: "Счёт-фактура", x: 10, y: 10, w: 50 }]]))).toBe(RECEIPT_ERRORS.unsupportedFile);
  });
});

describe("Арбуз: строки таблицы", () => {
  // Колонка «Название» начинается с x = 86
  const row = (text, x = 66) => ({ text, x, cells: [{ str: text, x, w: 1 }] });
  const head = [
    row("№ 42", 57), row("2026-09-05", 60),
    { text: "№ Название Цена, ₸ Заказано / Отгружено Сумма, ₸", x: 61, cells: [{ str: "№", x: 61 }, { str: "Название", x: 86 }] },
    row("Arbuz Group", 60),
  ];
  const tail = [row("Итого: 1000 ₸", 456), row("Итого к оплате: 1000 ₸", 408)];

  test("не привезённый товар (отгружено 0) пропускается", () => {
    const r = parseArbuzRows([...head,
      row("1 Хлеб 200 ₸ 1 шт / 0 шт 0 ₸"),
      row("2 Сыр 1000 ₸ 1 шт / 1 шт 1000 ₸"),
      ...tail]);
    expect(r.items.map(i => i.name)).toEqual(["Сыр"]);
  });

  test("название, перенесённое на вторую строку, дописывается к позиции", () => {
    const r = parseArbuzRows([...head,
      row("1 Сыр Российский очень длинное 1000 ₸ 1 шт / 1 шт 1000 ₸"),
      row("название продолжение", 86),
      ...tail]);
    expect(r.items[0].name).toBe("Сыр Российский очень длинное название продолжение");
  });

  test("ни одной позиции — ошибка, а не пустой чек", () => {
    expect(errorCode(() => parseArbuzRows([...head, ...tail]))).toBe(RECEIPT_ERRORS.empty);
  });
});
