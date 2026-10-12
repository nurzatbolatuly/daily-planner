import { fmtAmtAuto, getSym, pluralRu } from "../format";
import { itemsTotal } from "./normalize";

// Чек для экрана (блок «Чек» в TxPage, предпросмотр, карточка в SharedEntryFormPage) — одна форма
// и для только что разобранного чека (receiptLoader.js), и для сохранённого (receipts + receipt_items).
// Модуль лёгкий — в основном бандле; разбор и названия — только в ленивом чанке receiptLoader.

const ITEM_WORDS = ["позиция", "позиции", "позиций"];

// Строка receipts с вложенными receipt_items → вид.
export const receiptViewFromRow = row => ({
  merchant: row.merchant,
  date: row.date,
  datetime: row.datetime,
  total: Number(row.total),
  currency: row.currency,
  externalId: row.external_id,
  adjustments: row.adjustments || [],
  items: [...(row.receipt_items || [])]
    .sort((a, b) => a.position - b.position)
    .map(i => ({
      key: i.id, name: i.name, qty: Number(i.qty), unit: i.unit, price: Number(i.price), sum: Number(i.sum), isService: i.is_service,
    })),
});

export const fmtMoney = (n, currency) => `${n < 0 ? "−" : ""}${getSym(currency)}${fmtAmtAuto(n)}`;

// «Magnum GO · 7 позиций · ₸5 772» — свёрнутая карточка чека.
export const receiptSummary = view =>
  `${view.merchant} · ${view.items.length} ${pluralRu(view.items.length, ITEM_WORDS)} · ${fmtMoney(view.total, view.currency)}`;

// «2 шт × ₸899», «0.684 кг × ₸1 489»
export const itemQtyLabel = (item, currency) =>
  `${item.qty} ${item.unit}${item.qty !== 1 || item.unit !== "шт" ? ` × ${fmtMoney(item.price, currency)}` : ""}`;

// Σ позиций не сходится с итогом — формат источника изменился, показываем предупреждение (§3.4).
export const itemsMismatch = view => {
  const sum = itemsTotal(view.items, view.adjustments);
  return sum === view.total ? null : sum;
};

// Сверка с транзакцией (§3.1, п. 4): только в одной валюте; иначе сравнивать нечего.
export const amountMismatch = (view, amount, currency) => {
  const value = Number(amount);
  if (!view || currency !== view.currency || !value) return null;
  return value === view.total ? null : { receipt: view.total, transaction: value };
};

// «14.07.2026, 13:07»; у накладной Арбуза времени нет — только дата.
export const fmtReceiptDate = view => {
  const [y, m, d] = view.date.split("-");
  const time = view.datetime?.slice(11, 16);
  return `${d}.${m}.${y}${time ? `, ${time}` : ""}`;
};
