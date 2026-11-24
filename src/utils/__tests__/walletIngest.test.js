// Edge Function wallet-ingest (docs/apple-pay-inbox.md §5): разбор суммы/продавца и обработчик целиком.
// Функция — Deno, но на Web API: тесты гоняют те же файлы в Vitest, RPC подменяется.
import {
  parseAmount, parseNumber, detectCurrency, merchantKey, parseOccurredAt, cleanText, formatMoney,
} from "../../../supabase/functions/_shared/walletParse.ts";
import { handleRequest, DEFAULT_CONFIG, buildMessage, sha256Hex } from "../../../supabase/functions/wallet-ingest/handler.ts";

describe("parseAmount — форматы суммы из iOS", () => {
  test.each([
    // русская / казахская локаль: пробелы (в т.ч. неразрывные) — тысячи, запятая — дробь
    ["2 500 ₸",          2500,    "KZT"],
    ["2 500 ₸",     2500,    "KZT"],
    ["1 234,50 ₸",  1234.5,  "KZT"],
    ["12 345 678 ₸",     12345678, "KZT"],
    ["990,00 ₸",         990,     "KZT"],
    // английская локаль: запятая — тысячи, точка — дробь, символ спереди
    ["₸1,234.50",        1234.5,  "KZT"],
    ["$12.99",           12.99,   "USD"],
    ["$1,299",           1299,    "USD"],
    ["US$5.00",          5,       "USD"],
    ["€8,50",            8.5,     "EUR"],
    ["12,99 €",          12.99,   "EUR"],
    ["1.234,5 €",        1234.5,  "EUR"],
    ["£3.20",            3.2,     "GBP"],
    ["₽1 500",           1500,    "RUB"],
    ["1 500,00 ₽",       1500,    "RUB"],
    ["CA$4.75",          4.75,    "CAD"],
    ["A$10",             10,      "AUD"],
    ["₺250,00",          250,     "TRY"],
    ["₩15,000",          15000,   "KRW"],
    ["¥1,200",           1200,    "JPY"],
    ["฿120.00",          120,     "THB"],
    ["₾45.5",            45.5,    "GEL"],
    ["50 000 сўм",       50000,   "UZS"],
    // ISO-код вместо символа
    ["KZT 2,500.00",     2500,    "KZT"],
    ["2500 KZT",         2500,    "KZT"],
    ["USD 7.10",         7.1,     "USD"],
    ["7.10 usd",         7.1,     "USD"],
    ["CHF 3.40",         3.4,     "CHF"],
    ["PLN 19,99",        19.99,   "PLN"],
    // без валюты — возьмётся валюта счёта
    ["2500",             2500,    null],
    ["1'234.5",          1234.5,  null],
    ["  990  ",          990,     null],
  ])("%j → %d %s", (raw, amount, currency) => {
    expect(parseAmount(raw)).toEqual({ amount, currency });
  });

  test.each([
    [""], ["   "], ["0"], ["0,00 ₸"], ["-500 ₸"], ["₸"], ["abc"], [null], [undefined], [{}], [[]], ["99999999999"],
  ])("%j → без суммы (введут руками)", raw => {
    expect(parseAmount(raw).amount).toBeNull();
  });

  test("число, а не строка", () => {
    expect(parseAmount(12.345)).toEqual({ amount: 12.35, currency: null });
    expect(parseAmount(0)).toEqual({ amount: null, currency: null });
  });

  test("валюта определяется, даже если сумма не разобралась", () => {
    expect(parseAmount("₸ —")).toEqual({ amount: null, currency: "KZT" });
  });
});

describe("parseNumber / detectCurrency", () => {
  test("три цифры после единственного разделителя — это тысячи", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("1.234")).toBe(1234);
  });
  test("разделитель в конце не ломает число", () => {
    expect(parseNumber("2 500,")).toBe(2500);
  });
  test("короткие буквенные символы и металлы не распознаются в словах", () => {
    expect(detectCurrency("Rr 100 г с")).toBeNull();
  });
  test("длинный символ раньше короткого", () => {
    expect(detectCurrency("NZ$9")).toBe("NZD");
    expect(detectCurrency("S$9")).toBe("SGD");
  });
  test("буквы вокруг кода не дают ложного ISO", () => {
    expect(detectCurrency("USDT 10")).toBeNull();
  });
});

describe("merchantKey", () => {
  test.each([
    ["MAGNUM CASH&CARRY 0123",       "magnum cash carry"],
    ["Magnum Cash & Carry",          "magnum cash carry"],
    ["ТОО «Арбуз Групп»",            "арбуз групп"],
    ["ИП Ёлкин",                     "елкин"],
    ["Small #45",                    "small"],
    ["SMALL 12 34",                  "small"],
    ["Starbucks Coffee LLC",         "starbucks coffee"],
    ["  ",                           ""],
    [null,                           ""],
    ["7-Eleven",                     "7 eleven"],
  ])("%j → %j", (name, key) => {
    expect(merchantKey(name)).toBe(key);
  });
  test("длина ограничена", () => {
    expect(merchantKey("a".repeat(500), 200)).toHaveLength(200);
  });
});

describe("parseOccurredAt / cleanText / formatMoney", () => {
  const now = new Date("2026-11-24T14:00:00Z");
  test("ISO с поясом → UTC", () => {
    expect(parseOccurredAt("2026-11-24T19:05:12+05:00", now)).toBe("2026-11-24T14:05:12.000Z");
  });
  test("мусор, будущее и далёкое прошлое → null (время приёма)", () => {
    expect(parseOccurredAt("вчера", now)).toBeNull();
    expect(parseOccurredAt("2026-11-27T10:00:00Z", now)).toBeNull();
    expect(parseOccurredAt("2026-01-01T10:00:00Z", now)).toBeNull();
    expect(parseOccurredAt(123, now)).toBeNull();
  });
  test("cleanText схлопывает пробелы и режет длину", () => {
    expect(cleanText("  Kaspi  Gold  ", 100)).toBe("Kaspi Gold");
    expect(cleanText("x".repeat(150), 100)).toHaveLength(100);
    expect(cleanText(undefined, 10)).toBe("");
  });
  test("formatMoney: точность валюты, символ", () => {
    expect(formatMoney(2500, "KZT")).toBe("2 500 ₸");
    expect(formatMoney(12.99, "USD")).toBe("12,99 $");
    expect(formatMoney(5, null)).toBe("5");
  });
});

describe("buildMessage — уведомление только при проблеме", () => {
  const known = { status: "ok", account_id: "a1", account_currency: "KZT" };
  test("всё известно — молча", () => {
    const m = buildMessage({ amount: 2500, currency: null, merchant: "Magnum", card: "Kaspi Gold" }, known);
    expect(m).toEqual({ message: "2 500 ₸ · Magnum → во «Входящих» CashFlow", notify: false });
  });
  test("валютная покупка — не проблема", () => {
    expect(buildMessage({ amount: 12.99, currency: "USD", merchant: "Apple", card: "Kaspi Gold" }, known).notify).toBe(false);
  });
  test("нет суммы", () => {
    const m = buildMessage({ amount: null, currency: null, merchant: "Magnum", card: "Kaspi Gold" }, known);
    expect(m.notify).toBe(true);
    expect(m.message).toMatch(/сумма не пришла/);
  });
  test("карта не привязана", () => {
    const m = buildMessage({ amount: 100, currency: null, merchant: "", card: "Halyk" }, { status: "ok" });
    expect(m.notify).toBe(true);
    expect(m.message).toMatch(/«Halyk» ещё не привязана/);
  });
});

describe("handleRequest", () => {
  const TOKEN = "cf_" + "ab".repeat(32);
  const now = () => new Date("2026-11-24T14:00:00Z");
  const req = (body, { token = TOKEN, method = "POST", headers = {} } = {}) => new Request("https://x/functions/v1/wallet-ingest", {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...headers },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const run = (request, result = { status: "ok", id: "in1", account_id: "a1", account_currency: "KZT" }) => {
    const rpc = vi.fn().mockResolvedValue(result);
    const log = vi.fn();
    return handleRequest(request, { config: DEFAULT_CONFIG, rpc, now, log }).then(res => ({ res, rpc, log }));
  };
  const purchase = { v: 1, amount: "2 500 ₸", merchant: "MAGNUM 0123", card: "Kaspi Gold", occurred_at: "2026-11-24T19:05:12+05:00" };

  test("покупка → RPC с разобранными полями и хешем ключа, ответ без уведомления", async () => {
    const { res, rpc } = await run(req(purchase));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "in1", message: "2 500 ₸ · MAGNUM 0123 → во «Входящих» CashFlow", notify: false });
    expect(rpc).toHaveBeenCalledWith("wallet_ingest", { p: {
      token_hash: await sha256Hex(TOKEN), max_per_hour: 60, retention_days: 90, test: false,
      amount: 2500, currency: "KZT", merchant: "MAGNUM 0123", merchant_key: "magnum", card_label: "Kaspi Gold",
      occurred_at: "2026-11-24T14:05:12.000Z", raw: purchase,
    } });
  });

  test("проверка связи → уведомление", async () => {
    const { res, rpc } = await run(req({ v: 1, test: true }), { status: "ok", test: true });
    expect(await res.json()).toEqual({ message: "Связь с CashFlow есть ✅", notify: true });
    expect(rpc.mock.calls[0][1].p.test).toBe(true);
  });

  test("v по умолчанию — 1; неизвестная версия → 400", async () => {
    expect((await run(req({ amount: "1" }))).res.status).toBe(200);
    const { res, rpc } = await run(req({ v: 99 }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ["без ключа", { token: "" }],
    ["кривой ключ", { token: "cf_123" }],
    ["чужой формат", { token: "eyJhbGciOi.x.y" }],
  ])("%s → 401 без обращения к БД", async (_, opts) => {
    const { res, rpc } = await run(req(purchase, opts));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("ключ не найден/отозван → 401", async () => {
    const { res } = await run(req(purchase), { status: "invalid_token" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  test("лимит → 429 + Retry-After", async () => {
    const { res } = await run(req(purchase), { status: "too_many", retry_after: 120.4 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("121");
    expect(await res.json()).toEqual({ error: "too_many", retry_after: 121 });
  });

  test("не JSON / массив / слишком большое тело → 400", async () => {
    expect((await run(req("{oops"))).res.status).toBe(400);
    expect((await run(req("[1,2]"))).res.status).toBe(400);
    const big = await run(req({ v: 1, merchant: "x".repeat(DEFAULT_CONFIG.maxBodyBytes) }));
    expect(big.res.status).toBe(400);
    expect(big.rpc).not.toHaveBeenCalled();
  });

  test("GET → 405", async () => {
    expect((await run(req(null, { method: "GET" }))).res.status).toBe(405);
  });

  test("ошибка БД → 500, в лог — только префикс ключа", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("rpc wallet_ingest: 500"));
    const log = vi.fn();
    const res = await handleRequest(req(purchase), { config: DEFAULT_CONFIG, rpc, now, log });
    expect(res.status).toBe(500);
    expect(log.mock.calls[0][0]).toContain("cf_ababab:");
    expect(log.mock.calls[0][0]).not.toContain(TOKEN);
  });

  test("пустой продавец и нулевая сумма (известный сбой iOS) — покупка всё равно принимается", async () => {
    const { res, rpc } = await run(req({ v: 1, amount: "0.0", merchant: "", card: "Kaspi Gold" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notify).toBe(true);
    expect(rpc.mock.calls[0][1].p).toMatchObject({ amount: null, merchant: "", merchant_key: "" });
  });
});
