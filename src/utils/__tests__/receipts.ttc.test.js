import fs from "fs";
import path from "path";
import { parsePdfReceipt, itemsTotal, RECEIPT_ERRORS } from "../receipts";
import { parseTtcRows } from "../receipts/ttc";

// Реальный чек Magnum на ОФД «Транстелеком» (PDF со страницы чека), обезличен: ФП, РНМ, № чека.
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/receipts/ttc-magnum-pdf.json"), "utf8"));
const errorCode = fn => { try { fn(); } catch (e) { return e.code; } return null; };
const byName = (receipt, part) => receipt.items.find(i => i.name.includes(part));

describe("ОФД «Транстелеком» — Magnum (PDF)", () => {
  const r = parsePdfReceipt(pages);

  test("шапка: ФП:РНМ, магазин, дата и время, итог", () => {
    expect(r).toMatchObject({
      source: "ttc",
      externalId: "ttc:000000000404:000000000505",
      merchant: "Magnum",
      date: "2026-10-21",
      datetime: "2026-10-21T19:58:00",
      total: 2917,
      url: null,
    });
    expect(r.merchantRaw).toMatch(/^ФИЛИАЛ №51 .*"MAGNUM CASH&CARRY" В ГОРОДЕ АЛМАТЫ$/);
  });

  test("5 позиций; скидка ROUND — корректировка чека; Σ = итог", () => {
    expect(r.items).toHaveLength(5);
    expect(r.adjustments).toEqual([{ name: "ROUND (Жеңілдік /скидка)", sum: -0.89 }]);
    expect(itemsTotal(r.items, r.adjustments)).toBe(2917);
  });

  test("весовой товар: код кассы «0» и тысячи через пробел не путают цену; название с переносом; "
    + "внутренний код магазина (2…) — не GTIN", () => {
    expect(byName(r, "ТАБАН")).toMatchObject({
      name: "ТАБАН БАЛЫҚ ТАЗАРТЫЛҒАН ПЛАСТ С/Ы КГ", qty: 0.284, unit: "кг", price: 2679, sum: 760.84,
      gtin: null, ntin: null,
    });
    expect(byName(r, "БАНАН")).toMatchObject({ qty: 1.022, unit: "кг", price: 775, sum: 792.05 });
  });

  test("штучный товар: штрихкод и NTIN", () => {
    expect(byName(r, "МАСТЕР КЕСПЕ")).toMatchObject({
      qty: 2, unit: "шт", price: 465, sum: 930, gtin: "4870244250655", ntin: "0200139879380",
    });
  });

  test("пакет — служебная позиция", () => {
    expect(r.items.filter(i => i.isService).map(i => i.name)).toEqual(["MAGNUM ПАКЕТІ АҚЫЛЫ ЛОГО"]);
  });
});

describe("ОФД «Транстелеком»: строки", () => {
  const row = text => ({ text, x: 34, cells: [{ str: text, x: 34, w: 1 }] });
  const head = (op = "Продажа") => [
    row('ТОО "Ромашка"'), row("ИИН/БИН : 1"), row("МТН / РНМ: 777"),
    row("Күні мен уақыты / Дата и время: 5 мая"), row("2026, 09:05"),
    row(`Кассовый чек / ${op}`), row("Чек нөмірі / Номер чека: 1"),
  ];
  const tail = total => [row("Барлығы / ИТОГО:"), row(total), row("Фискальный признак:"), row("888"), row("АО «Транстелеком»")];

  test("без кода перед ценой; тысячи через пробел; май — «мая»", () => {
    const r = parseTtcRows([...head(), row("4870000000001 СЫР"), row("1 234.50 x 2 шт = 2 469.00"), ...tail("2469.00")]);
    expect(r).toMatchObject({ merchant: "Ромашка", datetime: "2026-05-05T09:05:00", total: 2469 });
    expect(r.items[0]).toMatchObject({ name: "СЫР", price: 1234.5, qty: 2, sum: 2469 });
  });

  test("надбавка — корректировка с плюсом", () => {
    const r = parseTtcRows([...head(), row("ХЛЕБ"), row("0 100.00 x 1 шт = 100.00"), row("Сервис (надбавка) 10.00"), ...tail("110.00")]);
    expect(r.adjustments).toEqual([{ name: "Сервис (надбавка)", sum: 10 }]);
    expect(r.items[0]).toMatchObject({ name: "ХЛЕБ", gtin: null });
  });

  test("чек возврата — отдельная ошибка", () => {
    expect(errorCode(() => parseTtcRows([...head("Возврат продажи"), row("ХЛЕБ"), row("100.00 x 1 шт = 100.00"), ...tail("100.00")])))
      .toBe(RECEIPT_ERRORS.refund);
  });

  test("нет фискального признака — ошибка формата", () => {
    expect(errorCode(() => parseTtcRows([...head(), row("ХЛЕБ"), row("100.00 x 1 шт = 100.00"), row("ИТОГО: 100.00"), row("Транстелеком")])))
      .toBe(RECEIPT_ERRORS.format);
  });

  test("ни одной позиции — ошибка, а не пустой чек", () => {
    expect(errorCode(() => parseTtcRows([...head(), ...tail("0.00")]))).toBe(RECEIPT_ERRORS.empty);
  });
});
