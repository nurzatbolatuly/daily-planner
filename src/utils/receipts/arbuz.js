import { RECEIPT_SOURCES, ARBUZ_PAYABLE_LABEL } from "../../constants/receipts";
import {
  ReceiptError, RECEIPT_ERRORS, toNumber, normalizeUnit, resolveMerchant, makeItem, assertItems,
} from "./normalize";

// Накладная Арбуза (PDF), docs/receipts.md §2.3. На входе — строки из groupPdfRows.
// Таблица: № · Название · Цена, ₸ · Заказано / Отгружено · Сумма, ₸.

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
// «1 Лук репчатый, кг 95 ₸ 2 кг / 1.716 кг 163 ₸». Тысячи в накладной без пробелов (19478),
// поэтому число — без пробелов: иначе «…400 г 899 ₸» разошлось бы неоднозначно.
const ITEM_ROW = new RegExp(String.raw`^(\d+)\s+(.+?)\s+${NUM}\s*₸\s+${NUM}\s*(\S+)\s*/\s*${NUM}\s*(\S+)\s+${NUM}\s*₸$`, "u");
const NAME_COLUMN_MARGIN = 5;  // pt: строка левее колонки «Название» — заголовок секции («Arbuz Group»)

const amountAfter = (rows, label) => {
  const row = rows.find(r => label.test(r.text));
  return row ? toNumber(row.text.replace(label, "").replace(/[:₸]/g, "")) : null;
};

const findHeader = rows => rows.findIndex(r => /Название/.test(r.text) && /Отгружено/.test(r.text));

export const isArbuzRows = rows => findHeader(rows) >= 0 && rows.some(r => /arbuz/i.test(r.text));

export function parseArbuzRows(rows) {
  const headerIndex = findHeader(rows);
  if (headerIndex < 0) throw new ReceiptError(RECEIPT_ERRORS.unsupportedFile, "Не найдена таблица накладной");
  const nameX = rows[headerIndex].cells.find(c => /Название/.test(c.str))?.x ?? 0;

  const orderNo = rows.map(r => r.text.match(/^№\s*(\d+)/)).find(Boolean)?.[1];
  const date = rows.map(r => r.text.match(/^(\d{4}-\d{2}-\d{2})\b/)).find(Boolean)?.[1];
  const total = amountAfter(rows, ARBUZ_PAYABLE_LABEL);
  if (!orderNo || !date || total == null) {
    throw new ReceiptError(RECEIPT_ERRORS.format, "В накладной нет номера заказа, даты или суммы к оплате");
  }

  const tableEnd = rows.findIndex((r, i) => i > headerIndex && /^Итого/.test(r.text));
  const tableRows = rows.slice(headerIndex + 1, tableEnd < 0 ? rows.length : tableEnd);

  let merchantRaw = "Arbuz";
  const parsed = [];
  tableRows.forEach(r => {
    const m = r.text.match(ITEM_ROW);
    if (m) {
      const [, , name, price, , , shipped, shippedUnit, sum] = m;
      parsed.push({ name, qty: toNumber(shipped), unit: normalizeUnit(shippedUnit), price: toNumber(price), sum: toNumber(sum) });
    } else if (r.x < nameX - NAME_COLUMN_MARGIN) {
      merchantRaw = r.text;
    } else if (parsed.length) {
      // Название, перенесённое на следующую строку
      parsed[parsed.length - 1].name += ` ${r.text}`;
    }
  });

  // Количество — «Отгружено»: не привезённый товар (0) не покупка.
  const items = parsed.filter(p => p.qty !== 0).map(makeItem);
  assertItems(items);

  return {
    source: RECEIPT_SOURCES.arbuz,
    externalId: `${RECEIPT_SOURCES.arbuz}:${orderNo}`,
    ...resolveMerchant(merchantRaw),
    date,
    datetime: null,           // в накладной только дата и интервал доставки
    total,
    currency: "KZT",
    url: null,
    items,
    // «Итого» — сумма заказанного, «Вернуться» — возврат предоплаты за недовезённое; суммы
    // позиций уже по отгруженному и в сумме дают «Итого к оплате» — корректировок нет.
    adjustments: [],
  };
}
