import { RECEIPT_SOURCES } from "../../constants/receipts";
import { decodeNuxtData } from "./nuxtData";
import {
  ReceiptError, RECEIPT_ERRORS, cleanText, toNumber, normalizeUnit, resolveMerchant, makeItem, assertItems,
} from "./normalize";

// Kaspi ОФД (receipt.kaspi.kz/web/fiscal), docs/receipts.md §2.1. Данные чека — в __NUXT_DATA__
// страницы; HTML загружает прокси (этап 3), здесь только разбор.

const isRefund = data => /возврат/i.test(data.cartHeader || "") || /RETURN|REFUND/i.test(data.orderType || "");

// «2026-07-14 13:07:50.871000» → «2026-07-14T13:07:50»
const toDatetime = s => {
  const m = cleanText(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : null;
};

export function parseKaspiHtml(html, { url = null } = {}) {
  const root = decodeNuxtData(html);
  const data = Object.values(root?.data || {}).find(d => d && Array.isArray(d.cartItems));
  if (!data) throw new ReceiptError(RECEIPT_ERRORS.format, "На странице нет данных чека Kaspi");
  if (isRefund(data)) throw new ReceiptError(RECEIPT_ERRORS.refund, "Чек возврата");

  const param = type => cleanText(data.payParameters?.find(p => p.type === type)?.value) || null;
  const fiscalId = param("fpd");
  const registryId = param("kgd_registry_id");
  const datetime = toDatetime(data.saleDate);
  const total = toNumber(data.amount);
  if (!fiscalId || !registryId || !datetime || total == null) {
    throw new ReceiptError(RECEIPT_ERRORS.format, "В чеке Kaspi нет фискальных данных");
  }

  const items = data.cartItems.map(it => makeItem({
    name: it.item_name,
    qty: toNumber(it.quantity),
    unit: normalizeUnit(it.unit_name),
    price: toNumber(it.item_price),
    sum: toNumber(it.sum),
    gtin: it.secondary_params?.find(p => p.name === "GTIN")?.value,
    ntin: it.ntin_raw,
  }));
  assertItems(items);

  return {
    source: RECEIPT_SOURCES.kaspi,
    externalId: `${RECEIPT_SOURCES.kaspi}:${fiscalId}:${registryId}`,
    ...resolveMerchant(data.title),
    date: datetime.slice(0, 10),
    datetime,
    total,
    currency: "KZT",
    url,
    items,
    adjustments: [],
  };
}
