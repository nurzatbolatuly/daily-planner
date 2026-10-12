import fs from "fs";
import path from "path";
import { parseLinkPayload, parseReceiptLink, RECEIPT_ERRORS } from "../receipts";
import { buildReceiptSave, buildReceiptDelete, receiptDbError } from "../receipts/receiptSave";

// Этап 3: данные для save_receipt / delete_receipt (tables.sql v33).
const json = fs.readFileSync(path.join(__dirname, "fixtures/receipts/oofd-small.json"), "utf8");
const link = parseReceiptLink("https://consumer.oofd.kz/ru?i=1000000001&f=000000000303&s=11537.00&t=20261008T175844");
const receipt = parseLinkPayload(link, json);

describe("buildReceiptSave", () => {
  const p = buildReceiptSave("tx-1", receipt, { id: "r-1" });

  test("шапка чека — колонки receipts", () => {
    expect(p.receipt).toEqual({
      id: "r-1",
      transaction_id: "tx-1",
      source: "oofd",
      external_id: "oofd:1000000001:000000000303",
      merchant: "Small",
      merchant_raw: expect.stringContaining("СКИФ ТРЕЙД"),
      date: "2026-10-08",
      datetime: "2026-10-08T17:58:44",
      total: 11537,
      currency: "KZT",
      url: link.url,
      adjustments: [],
    });
  });

  test("позиции — по порядку чека, сырое и читаемое имя, уникальные id", () => {
    expect(p.items).toHaveLength(receipt.items.length);
    expect(p.items.map(i => i.position)).toEqual(receipt.items.map((_, i) => i));
    expect(new Set(p.items.map(i => i.id)).size).toBe(p.items.length);
    expect(p.items.find(i => i.raw_name.includes("Смет.пр."))).toMatchObject({
      name: "Сметанный продукт домашний «Иртыш» 20%, 700 г", qty: 1, unit: "шт", price: 769, sum: 769, gtin: null, is_service: false,
    });
    expect(p.items.find(i => i.raw_name.includes("Пакет")).is_service).toBe(true);
  });

  test("известные бренды каталога доходят до названий", () => {
    const withBrands = buildReceiptSave("tx-1", receipt, { knownBrands: ["Иртыш"] });
    expect(withBrands.items.find(i => i.raw_name.includes("Смет.пр.")).name).toContain("«Иртыш»");
  });

  test("Σ позиций в записи = итог чека", () => {
    expect(Math.round(p.items.reduce((s, i) => s + i.sum, 0) * 100) / 100).toBe(p.receipt.total);
  });
});

test("buildReceiptDelete", () => {
  expect(buildReceiptDelete("tx-1")).toEqual({ transaction_id: "tx-1" });
});

describe("receiptDbError", () => {
  test("дубль external_id → «уже прикреплён»", () => {
    const err = receiptDbError({ code: "23505", message: 'duplicate key value violates unique constraint "receipts_external_id_key"' });
    expect(err.code).toBe(RECEIPT_ERRORS.alreadyAttached);
  });

  test("не расход → «только к расходу»", () => {
    expect(receiptDbError({ code: "P0001", message: "receipt_requires_expense" }).code).toBe(RECEIPT_ERRORS.expenseOnly);
  });

  test("прочие ошибки — как есть", () => {
    const original = { code: "08006", message: "connection failure" };
    expect(receiptDbError(original)).toBe(original);
  });
});
