import { parseReceiptLink, RECEIPT_ERRORS } from "../receipts";
import { toNumber, cleanText, resolveMerchant, isServiceItem } from "../receipts/normalize";

const KASPI = "https://receipt.kaspi.kz/web/fiscal?i=000000000101&f=000000000202&s=5772&t=2026-07-14+13:07:50.871995";
const OOFD = "https://consumer.oofd.kz/ru?i=1000000001&f=000000000303&s=11537.00&t=20261008T175844";

const errorCode = fn => { try { fn(); } catch (e) { return e.code; } return null; };

describe("parseReceiptLink", () => {
  test("Kaspi: параметры QR, «+» в дате — пробел", () => {
    const link = parseReceiptLink(KASPI);
    expect(link.source).toBe("kaspi");
    expect(link.params).toEqual({ i: "000000000101", f: "000000000202", s: "5772", t: "2026-07-14 13:07:50.871995" });
  });

  test("oofd.kz: /ru, без /ru, без «/» перед «?», http", () => {
    expect(parseReceiptLink(OOFD).source).toBe("oofd");
    expect(parseReceiptLink(OOFD.replace("/ru?", "/?")).params.i).toBe("1000000001");
    expect(parseReceiptLink(OOFD.replace("/ru?", "?")).params.s).toBe("11537.00");
    expect(parseReceiptLink(OOFD.replace("https", "http")).source).toBe("oofd");
  });

  test("ссылка внутри текста из «Поделиться» и без протокола", () => {
    expect(parseReceiptLink(`Чек об оплате: ${KASPI}.`).params.f).toBe("000000000202");
    expect(parseReceiptLink(KASPI.replace("https://", "")).source).toBe("kaspi");
  });

  test("параметры в любом порядке", () => {
    const link = parseReceiptLink("https://consumer.oofd.kz/ru?t=20261008T175844&s=11537.00&f=000000000303&i=1000000001");
    expect(link.params).toEqual({ i: "1000000001", f: "000000000303", s: "11537.00", t: "20261008T175844" });
  });

  test.each([
    ["чужой сайт", "https://example.com/web/fiscal?i=1&f=2&s=3&t=4"],
    ["другая страница Kaspi", "https://receipt.kaspi.kz/other?i=1&f=2&s=3&t=4"],
    ["нет параметра", KASPI.replace("&s=5772", "")],
    ["не ссылка", "чек от 14.07.2026 на 5.772"],
    ["пусто", ""],
  ])("не чек: %s", (_, text) => {
    expect(errorCode(() => parseReceiptLink(text))).toBe(RECEIPT_ERRORS.unsupportedLink);
  });
});

describe("normalize", () => {
  test("toNumber: строки чеков", () => {
    expect(toNumber("0.684")).toBe(0.684);
    expect(toNumber("1 018 ₸")).toBe(1018);
    expect(toNumber("5 772")).toBe(5772);
    expect(toNumber("2,5")).toBe(2.5);
    expect(toNumber(1489)).toBe(1489);
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(null)).toBeNull();
  });

  test("cleanText: табуляции и повторы пробелов", () => {
    expect(cleanText(" Мыло\t 5 штук\t")).toBe("Мыло 5 штук");
  });

  test("resolveMerchant: известный магазин и неизвестный продавец", () => {
    expect(resolveMerchant('ТОО "MAGNUM E-COMMERCE KAZAKHSTAN"').merchant).toBe("Magnum GO");
    expect(resolveMerchant('ТОВАРИЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "СКИФ ТРЕЙД"')).toMatchObject({ merchant: "Small", splitName: true });
    expect(resolveMerchant('ТОО "Ромашка"').merchant).toBe("Ромашка");
  });

  test("служебные позиции", () => {
    expect(isServiceItem("Упаковка")).toBe(true);
    expect(isServiceItem("Доставка")).toBe(true);
    expect(isServiceItem("Small food пакеті - Пакет small food - SMALL")).toBe(true);
    expect(isServiceItem("Пакеты мороз")).toBe(true);
    expect(isServiceItem("Кефир Golden Milk 2,5% пак. 1000 г")).toBe(false);
    expect(isServiceItem("Пакетированный чай")).toBe(false);
  });
});
