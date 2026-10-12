import { RECEIPT_SOURCES } from "../../constants/receipts";
import {
  ReceiptError, RECEIPT_ERRORS, cleanText, toNumber, money, normalizeUnit, resolveMerchant, makeItem, assertItems,
} from "./normalize";

// Казахтелеком ОФД (consumer.oofd.kz), docs/receipts.md §2.2. JSON из
// /api/consumer-proxy/api/tickets/get-by-url загружает прокси (этап 3), здесь только разбор.

// Тип операции по протоколу ККМ: 2 — продажа, 3 — возврат продажи.
const OPERATION_SELL = 2;
const OPERATION_SELL_RETURN = 3;

// Скидка/надбавка: { discount: true|false, name, sum } — знак для суммы позиции.
const modifierDelta = m => (m?.sum ? (m.discount ? -1 : 1) * m.sum : 0);

export function parseOofdTicket(json, { url = null } = {}) {
  const ticket = json?.ticket;
  if (!ticket || !Array.isArray(ticket.items)) throw new ReceiptError(RECEIPT_ERRORS.format, "В ответе oofd.kz нет чека");
  if (ticket.operationType === OPERATION_SELL_RETURN) throw new ReceiptError(RECEIPT_ERRORS.refund, "Чек возврата");
  if (ticket.operationType !== OPERATION_SELL) throw new ReceiptError(RECEIPT_ERRORS.format, "Неизвестный тип операции чека");

  const fiscalId = cleanText(ticket.fiscalId || ticket.offlineFiscalId) || null;
  const registryId = cleanText(json.kkmFnsId) || null;
  const datetime = cleanText(ticket.transactionDate).slice(0, 19) || null;
  const total = toNumber(ticket.totalSum);
  if (!fiscalId || !registryId || !datetime || total == null) {
    throw new ReceiptError(RECEIPT_ERRORS.format, "В чеке oofd.kz нет фискальных данных");
  }

  // Строка без commodity — скидка/надбавка к ПРЕДЫДУЩЕМУ товару («Коррекция округления»):
  // сворачиваем её в сумму товара, чтобы sum позиции = фактически оплачено (§2.2).
  const rows = [];
  const adjustments = [];
  ticket.items.forEach(it => {
    const delta = modifierDelta(it.discount) + modifierDelta(it.markup);
    const c = it.commodity;
    if (c) {
      rows.push({
        name: c.name,
        qty: toNumber(c.quantity),
        unit: normalizeUnit(json.measureUnits?.[c.measureUnitCode]),
        price: toNumber(c.price),
        sum: (toNumber(c.sum) ?? 0) + delta,
        gtin: c.barcode,
        ntin: c.ntin,
      });
    } else if (delta) {
      const target = rows[rows.length - 1];
      if (target) target.sum += delta;
      else adjustments.push({ name: cleanText(it.discount?.name || it.markup?.name), sum: money(delta) });
    }
  });

  // Скидка/надбавка на весь чек — не позиция, а корректировка (Σ позиций + корректировки = итог).
  [ticket.discount, ticket.markup].forEach(m => {
    if (m?.sum) adjustments.push({ name: cleanText(m.name) || (m.discount ? "Скидка" : "Надбавка"), sum: money(modifierDelta(m)) });
  });

  const items = rows.map(makeItem);
  assertItems(items);

  return {
    source: RECEIPT_SOURCES.oofd,
    externalId: `${RECEIPT_SOURCES.oofd}:${fiscalId}:${registryId}`,
    ...resolveMerchant(json.orgTitle),
    date: datetime.slice(0, 10),
    datetime,
    total,
    currency: "KZT",
    url,
    items,
    adjustments,
  };
}
