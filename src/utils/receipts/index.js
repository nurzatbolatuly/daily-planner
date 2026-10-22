import { RECEIPT_LINK_HOSTS, RECEIPT_SOURCES } from "../../constants/receipts";
import { ReceiptError, RECEIPT_ERRORS, extractUrl, itemsTotal } from "./normalize";
import { parseKaspiHtml } from "./kaspi";
import { parseOofdTicket } from "./oofd";
import { groupPdfRows } from "./pdfRows";
import { isArbuzRows, parseArbuzRows } from "./arbuz";
import { isTtcRows, parseTtcRows } from "./ttc";
import { receiptLog } from "./log";

// Чеки: единая точка входа (docs/receipts.md §2, §9). Адаптер выбирается по содержимому —
// домену ссылки или сигнатуре PDF, пользователь источник не выбирает.
// pdfText.js сюда не импортируется: pdf.js грузится только по требованию.

export { ReceiptError, RECEIPT_ERRORS, itemsTotal };
export { describeItem } from "./names";

const LINK_PARAMS = ["i", "f", "s", "t"];

// Текст со ссылкой из QR → { source, url, params: { i, f, s, t } }. Параметры одинаковы у всех ОФД:
// ФП, РНМ, сумма, дата-время. Загрузку по ним делает прокси (этап 3).
export function parseReceiptLink(text) {
  const url = extractUrl(text);
  const rule = url && RECEIPT_LINK_HOSTS.find(h => h.host === url.hostname.toLowerCase() && h.path.test(url.pathname));
  const params = url && Object.fromEntries(LINK_PARAMS.map(k => [k, url.searchParams.get(k)?.trim() || null]));
  if (!rule || LINK_PARAMS.some(k => !params[k])) {
    throw new ReceiptError(RECEIPT_ERRORS.unsupportedLink, "Поддерживаются чеки Kaspi и oofd.kz");
  }
  return { source: rule.source, url: url.toString(), params };
}

const parseJson = payload => {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    throw new ReceiptError(RECEIPT_ERRORS.format, "Источник вернул не JSON");
  }
};

// Ответ прокси по ссылке → чек (§4).
export function parseLinkPayload(link, payload) {
  switch (link.source) {
    case RECEIPT_SOURCES.kaspi: return parseKaspiHtml(payload, { url: link.url });
    case RECEIPT_SOURCES.oofd: return parseOofdTicket(parseJson(payload), { url: link.url });
    default: throw new ReceiptError(RECEIPT_ERRORS.unsupportedLink, "Неизвестный источник чека");
  }
}

// Страницы PDF (extractPdfPages) → чек: накладная Арбуза или чек ОФД «Транстелеком».
export function parsePdfReceipt(pages) {
  const rows = groupPdfRows(pages);
  const format = isArbuzRows(rows) ? "arbuz" : isTtcRows(rows) ? "ttc" : null;
  receiptLog("pdf: строки собраны", { rows: rows.length, format, head: rows.slice(0, 3).map(r => r.text) });
  if (format === "arbuz") return parseArbuzRows(rows);
  if (format === "ttc") return parseTtcRows(rows);
  throw new ReceiptError(RECEIPT_ERRORS.unsupportedFile, "Не удалось распознать PDF. Поддерживаются: накладная Арбуза, чек ОФД «Транстелеком»");
}
