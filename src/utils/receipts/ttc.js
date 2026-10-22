import { RECEIPT_SOURCES } from "../../constants/receipts";
import {
  ReceiptError, RECEIPT_ERRORS, cleanText, toNumber, money, normalizeUnit, resolveMerchant, makeItem, assertItems,
} from "./normalize";

// Чек ОФД «Транстелеком» (ofd1.kz / ofd.ttc.kz), PDF со страницы чека. Формат ОФД, а не магазина:
// так печатают все кассы на этом ОФД. Ссылку из QR (ofd1.kz) сервер не загрузит — страница чека
// за reCAPTCHA, поэтому только PDF. На входе — строки из groupPdfRows.
//
// Позиция — блок строк:
//   «2132531002845 ТАБАН БАЛЫҚ» / «ТАЗАРТЫЛҒАН ПЛАСТ С/Ы КГ»   штрихкод + название (переносится)
//   «0 2 679.00 x 0.284 кг = 760.84»                            [код] цена x кол-во ед = сумма
//   «ҚҚС … НДС(16.0%):» / «104.94»                              НДС (сумма может уйти на строку ниже)
//   «GTIN: NTIN: 0200139879380»
// Скидка/надбавка на чек — отдельный блок: «ROUND (Жеңілдік /скидка) 0.89».

const AMOUNT = String.raw`\d+(?:\s\d{3})*(?:[.,]\d{1,2})?`;
const PRICE_ROW = new RegExp(String.raw`^(.+?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)\s*(\S+)\s*=\s*(${AMOUNT})$`, "u");
const BARCODE_NAME = /^(\d{8,14})\s+(.+)$/;
// Штрихкоды 20–29 (GS1) — внутренние коды магазина (весовой товар): в другом магазине тот же код —
// другой товар, а каталог ищет по GTIN во всех магазинах. Такой товар узнаётся по строке чека.
const STORE_CODE = /^2\d{12}$/;
const MODIFIER_ROW = new RegExp(String.raw`^(.*?(скидка|жеңілдік|надбавка|үстеме).*?)\s+(${AMOUNT})$`, "iu");
const DISCOUNT_WORD = /скидка|жеңілдік/i;
const VAT_ROW = /НДС|ҚҚС/;
const NUMBER_ROW = new RegExp(String.raw`^${AMOUNT}$`);
const CODES_ROW = /^GTIN:/i;

const MONTHS = [/^янв/, /^фев/, /^мар/, /^апр/, /^ма[йя]/, /^июн/, /^июл/, /^авг/, /^сен/, /^окт/, /^ноя/, /^дек/];
const DATETIME = /Дата и время:\s*(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/iu;
const pad2 = v => String(v).padStart(2, "0");

export const isTtcRows = rows =>
  rows.some(r => /Транстелеком/i.test(r.text)) && rows.some(r => /ИТОГО/i.test(r.text));

// Перед ценой касса печатает код (жирный «0»), и тысячи цены — через пробел («2 679.00»):
// где кончается код, видно только по арифметике — цена × кол-во = сумма.
function priceFrom(head, qty, sum) {
  const tokens = head.split(" ");
  for (let k = 0; k < tokens.length; k++) {
    const price = toNumber(tokens.slice(k).join(""));
    if (price != null && Math.abs(price * qty - sum) <= 0.011) return price;
  }
  return null;
}

// «… ИТОГО:» — сумма в той же строке или в следующей (жирный крупный шрифт переносится).
function amountAfter(rows, label) {
  const i = rows.findIndex(r => label.test(r.text));
  if (i < 0) return { index: -1, amount: null };
  const sameRow = cleanText(rows[i].text.replace(/^.*:/, ""));
  return { index: i, amount: toNumber(sameRow || rows[i + 1]?.text) };
}

function parseDatetime(text) {
  const m = text.match(DATETIME);
  if (!m) return null;
  const [, day, monthName, year, hh, mm, ss = "00"] = m;
  const month = MONTHS.findIndex(re => re.test(monthName.toLowerCase()));
  if (month < 0) return null;
  return `${year}-${pad2(month + 1)}-${pad2(day)}T${pad2(hh)}:${mm}:${ss}`;
}

export function parseTtcRows(rows) {
  const all = rows.map(r => r.text).join(" ");
  // Тип операции — в шапке («Кассовый чек / Продажа» | «… / Возврат продажи»), до первой позиции:
  // в подвале бывает реклама, слово «возврат» там ничего не значит.
  const start = rows.findIndex(r => /Номер чека/i.test(r.text)) + 1;
  const binIndex = rows.findIndex(r => /БИН/i.test(r.text));
  const header = rows.slice(0, start > 0 ? start : binIndex + 1).map(r => r.text).join(" ");
  if (/Возврат/i.test(header)) throw new ReceiptError(RECEIPT_ERRORS.refund, "Чек возврата");

  const fiscalId = all.match(/Фискальный признак:\s*(\d+)/i)?.[1];
  const registryId = all.match(/РНМ:\s*(\d+)/i)?.[1];
  const datetime = parseDatetime(all);
  const { index: totalIndex, amount: total } = amountAfter(rows, /ИТОГО/i);
  if (!fiscalId || !registryId || !datetime || total == null) {
    throw new ReceiptError(RECEIPT_ERRORS.format, "В чеке нет фискальных данных, даты или итога");
  }

  // Шапка — до строки с БИН: юрлицо продавца (филиал, ТОО, ИП), переносится на несколько строк.
  const merchantRaw = rows.slice(0, Math.max(binIndex, 1)).map(r => r.text).join(" ");

  const body = rows.slice(start > 0 ? start : binIndex + 1, totalIndex);

  const parsed = [];
  const adjustments = [];
  let nameParts = [];
  body.forEach(({ text }) => {
    const price = text.match(PRICE_ROW);
    if (price) {
      const [, head, qtyRaw, unit, sumRaw] = price;
      const qty = toNumber(qtyRaw), sum = toNumber(sumRaw);
      const [, barcode, firstName] = nameParts[0]?.match(BARCODE_NAME) || [];
      parsed.push({
        name: [firstName ?? nameParts[0], ...nameParts.slice(1)].filter(Boolean).join(" "),
        qty, unit: normalizeUnit(unit), price: priceFrom(head, qty, sum), sum,
        gtin: barcode && !STORE_CODE.test(barcode) ? barcode : null,
      });
      nameParts = [];
      return;
    }
    if (CODES_ROW.test(text)) {
      const ntin = text.match(/NTIN:\s*(\d+)/i)?.[1];
      if (ntin && parsed.length) parsed[parsed.length - 1].ntin = ntin;
      return;
    }
    if (VAT_ROW.test(text) || NUMBER_ROW.test(text)) return;
    const modifier = text.match(MODIFIER_ROW);
    if (modifier) {
      const [, name, word, amount] = modifier;
      adjustments.push({ name: cleanText(name), sum: money((DISCOUNT_WORD.test(word) ? -1 : 1) * toNumber(amount)) });
      nameParts = [];
      return;
    }
    nameParts.push(text);
  });

  const items = parsed.map(makeItem);
  assertItems(items);

  return {
    source: RECEIPT_SOURCES.ttc,
    externalId: `${RECEIPT_SOURCES.ttc}:${fiscalId}:${registryId}`,
    ...resolveMerchant(merchantRaw),
    date: datetime.slice(0, 10),
    datetime,
    total,
    currency: "KZT",
    url: null,
    items,
    adjustments,
  };
}
