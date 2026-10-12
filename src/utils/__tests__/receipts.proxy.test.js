import fs from "fs";
import path from "path";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { loadReceiptFromLink } from "../../lib/receiptProxy";
import { RECEIPT_ERRORS } from "../receipts";

// Этап 3: клиент прокси чеков. supabase мокается — функция проверена отдельно (docs/receipts.md §10).
jest.mock("../../lib/supabase", () => ({ supabase: { functions: { invoke: jest.fn() } } }));

const KASPI = "https://receipt.kaspi.kz/web/fiscal?i=000000000101&f=000000000202&s=5772&t=2026-07-14+13:07:50.871995";
const html = fs.readFileSync(path.join(__dirname, "fixtures/receipts/kaspi-magnum.html"), "utf8");
const httpError = body => new FunctionsHttpError({ json: async () => body });
const codeOf = async promise => promise.then(() => null, e => e.code);

beforeEach(() => supabase.functions.invoke.mockReset());

test("ссылка → прокси получает источник и параметры QR, не URL → чек разобран", async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { body: html }, error: null });
  const receipt = await loadReceiptFromLink(`Чек: ${KASPI}`);
  expect(supabase.functions.invoke).toHaveBeenCalledWith("receipt-proxy", {
    body: { source: "kaspi", i: "000000000101", f: "000000000202", s: "5772", t: "2026-07-14 13:07:50.871995" },
  });
  expect(receipt).toMatchObject({ merchant: "Magnum GO", total: 5772 });
});

test("не ссылка на чек — без запроса к прокси", async () => {
  expect(await codeOf(loadReceiptFromLink("https://example.com"))).toBe(RECEIPT_ERRORS.unsupportedLink);
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});

test.each([
  ["upstream", RECEIPT_ERRORS.upstream],
  ["timeout", RECEIPT_ERRORS.network],
  ["bad_request", RECEIPT_ERRORS.unsupportedLink],
])("ошибка прокси %s → %s", async (proxyCode, code) => {
  supabase.functions.invoke.mockResolvedValue({ data: null, error: httpError({ error: proxyCode }) });
  expect(await codeOf(loadReceiptFromLink(KASPI))).toBe(code);
});

test("сбой сети до функции → network", async () => {
  supabase.functions.invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
  expect(await codeOf(loadReceiptFromLink(KASPI))).toBe(RECEIPT_ERRORS.network);
});
