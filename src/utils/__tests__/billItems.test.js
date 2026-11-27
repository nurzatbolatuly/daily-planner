import { describe, it, expect } from "vitest";
import {
  cleanBillItems, billItemsTotal, billItemsProgress, billItemsSummary, billTxNote,
  cleanPayPlace, payPlaceSuggestions, PAY_PLACE_MAX,
} from "../billItems";

describe("cleanBillItems", () => {
  it("убирает пустые строки, сумму приводит к числу или null", () => {
    expect(cleanBillItems([
      { id: "a", name: " Spotify ", amount: "1990" },
      { id: "b", name: "  ", amount: "100" },
      { id: "c", name: "iCloud", amount: "" },
      { id: "d", name: "Чай", amount: 0 },
    ])).toEqual([
      { id: "a", name: "Spotify", amount: 1990 },
      { id: "c", name: "iCloud", amount: null },
      { id: "d", name: "Чай", amount: null },
    ]);
  });
});

describe("billItemsTotal", () => {
  it("сумма позиций, если суммы есть у всех", () => {
    expect(billItemsTotal([{ name: "A", amount: "0.1" }, { name: "B", amount: 0.2 }])).toBe(0.3);
  });
  it("null, если хоть у одной нет суммы или состав пуст", () => {
    expect(billItemsTotal([{ name: "A", amount: "10" }, { name: "B", amount: "" }])).toBeNull();
    expect(billItemsTotal([])).toBeNull();
    expect(billItemsTotal([{ name: "", amount: "" }])).toBeNull();
  });
  it("пустая строка без названия не мешает итогу", () => {
    expect(billItemsTotal([{ name: "A", amount: "10" }, { name: "", amount: "" }])).toBe(10);
  });
});

describe("billItemsProgress", () => {
  it("считает указанное и сколько без суммы", () => {
    expect(billItemsProgress([{ name: "A", amount: "10" }, { name: "B" }, { name: "C" }]))
      .toEqual({ sum: 10, missing: 2 });
  });
});

describe("подписи", () => {
  const items = [{ name: "Spotify", amount: 1990 }, { name: "iCloud", amount: null }];
  it("summary через точку", () => expect(billItemsSummary(items)).toBe("Spotify · iCloud"));
  it("заметка транзакции с составом", () => expect(billTxNote("Подписки", items)).toBe("Подписки: Spotify, iCloud"));
  it("без состава — просто название", () => {
    expect(billTxNote("Аренда", [])).toBe("Аренда");
    expect(billTxNote("Аренда", undefined)).toBe("Аренда");
  });
});

describe("payPlace", () => {
  it("обрезает пробелы и длину", () => {
    expect(cleanPayPlace("  Kaspi ")).toBe("Kaspi");
    expect(cleanPayPlace("x".repeat(100))).toHaveLength(PAY_PLACE_MAX);
    expect(cleanPayPlace(null)).toBe("");
  });
  it("подсказки: без дублей по регистру, частые первыми, с лимитом", () => {
    const bills = [{ pay_place: "Kaspi" }, { pay_place: "kaspi " }, { pay_place: "eGov" }, { pay_place: "" }];
    const loans = [{ pay_place: "Halyk" }, { pay_place: "Halyk" }, { pay_place: "KASPI" }, {}];
    expect(payPlaceSuggestions([bills, loans])).toEqual(["Kaspi", "Halyk", "eGov"]);
    expect(payPlaceSuggestions([bills, loans], 2)).toEqual(["Kaspi", "Halyk"]);
  });
});
