import { newId } from "../id";
import { describeItem } from "./names";
import { rawMatchKey, planItemAttrs, planItemName, productFields, priceEntryOf, categoryChosenByUser } from "./catalogMatch";

// Данные для RPC чеков (tables.sql v33–v34, docs/receipts.md §5, §7). Клиент считает, RPC записывает.

// Разобранный чек (модель §4) → p для save_receipt.
// plan — план позиций из предпросмотра (catalogMatch.planReceipt + правки пользователя): товары,
// ссылки и записи цен каталога. Без плана — только чек и позиции, каталог не трогается.
export function buildReceiptSave(transactionId, receipt, { plan = null, id = newId() } = {}) {
  const products = [];
  const productUpdates = [];
  const links = new Map();      // match_key → ссылка: строка чека встречается дважды (бедро ×2) — одна
  const entries = new Map();    // одна цена товара на чек: бедро ×2 по ₸1 479/кг — одна запись, не две
  const created = new Map();    // новый товар один на чек: две строки с одним кодом/именем — один товар

  const items = receipt.items.map((item, position) => {
    const row = {
      id: newId(), position, raw_name: item.rawName, qty: item.qty, unit: item.unit, price: item.price, sum: item.sum,
      gtin: item.gtin, ntin: item.ntin, is_service: item.isService,
    };
    const pi = plan?.[position];
    if (!pi) return { ...row, name: describeItem(item, { splitName: receipt.splitName }).name, product_id: null, in_catalog: false };
    const name = planItemName(pi);
    if (item.isService || !pi.inCatalog) return { ...row, name, product_id: null, in_catalog: false };

    const attrs = planItemAttrs(pi);
    let productId = pi.match.productId;
    if (productId) {
      // найденный товар: дописать коды; поправлен пользователем — признаки и имя, подтверждён
      // категория: выбрал пользователь — заменить; унаследована по виду — только если у товара пусто (v35)
      productUpdates.push({
        id: productId, gtin: item.gtin, ntin: item.ntin, confirm: !!pi.edits, ...(pi.edits ? productFields(attrs) : {}),
        category_id: pi.categoryId || null, category_mode: categoryChosenByUser(pi) ? "set" : "fill",
      });
    } else {
      const key = item.gtin ? `gtin:${item.gtin}` : item.ntin ? `ntin:${item.ntin}` : rawMatchKey(item.rawName);
      productId = created.get(key);
      if (!productId) {
        productId = newId();
        created.set(key, productId);
        products.push({ id: productId, category_id: pi.categoryId || null, gtin: item.gtin, ntin: item.ntin, ...productFields(attrs), name_confirmed: !!pi.edits });
      }
    }
    const matchKey = rawMatchKey(item.rawName);
    links.set(matchKey, { id: newId(), product_id: productId, source: receipt.merchant, match_key: matchKey });
    // Каталог хранит цену товара в магазине на дату, а не каждую покупку. Разная цена одного товара
    // в одном чеке (скидка на одну строку) — разные записи.
    const price = priceEntryOf(item, attrs.pack);
    const entryKey = `${productId}|${price.price}|${price.qty}|${price.unit}`;
    if (!entries.has(entryKey)) entries.set(entryKey, { id: newId(), product_id: productId, source: receipt.merchant, ...price, date: receipt.date, note: "" });
    return { ...row, name, product_id: productId, in_catalog: true };
  });

  return {
    receipt: {
      id,
      transaction_id: transactionId,
      source: receipt.source,
      external_id: receipt.externalId,
      merchant: receipt.merchant,
      merchant_raw: receipt.merchantRaw || null,
      date: receipt.date,
      datetime: receipt.datetime || null,
      total: receipt.total,
      currency: receipt.currency,
      url: receipt.url || null,
      adjustments: receipt.adjustments || [],
    },
    items,
    products,
    product_updates: productUpdates,
    links: [...links.values()],
    entries: [...entries.values()],
  };
}

export { buildReceiptDelete, receiptDbError } from "./receiptDb";
