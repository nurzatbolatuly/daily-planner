import { loadReceiptFromLink } from "./receiptProxy";
import { fetchCatalogIndex } from "./receiptsApi";
import { parsePdfReceipt } from "../utils/receipts";
import { planReceipt, planItemName, planItemStatus, searchProducts, productPack, categoriesByKind, inheritCategory } from "../utils/receipts/catalogMatch";
import { buildDisplayName } from "../utils/receipts/names";
import { formatPack } from "../utils/receipts/attributes";

// Всё, что нужно для ПРИКРЕПЛЕНИЯ чека: адаптеры ОФД, названия товаров, сопоставление с каталогом,
// прокси. Импортируется только через import() из ReceiptField — отдельный чанк, основной бандл не
// растёт (как pdf.js и ExcelJS).

export { loadReceiptFromLink, fetchCatalogIndex, planReceipt, searchProducts, buildDisplayName, formatPack, productPack, categoriesByKind, inheritCategory };

// PDF-накладная → чек. pdf.js — ещё один чанк, грузится только для PDF.
export async function loadReceiptFromPdf(file) {
  const { extractPdfPages } = await import("../utils/receipts/pdfText");
  return parsePdfReceipt(await extractPdfPages(file));
}

// Разобранный чек + план позиций → вид для предпросмотра (receiptView.js). У позиции — статус
// каталога (catalogMatch.planItemStatus), галочка, категория и откуда она; имя — как попадёт в чек и каталог.
export const receiptViewFromParsed = (receipt, plan, categories = []) => ({
  merchant: receipt.merchant,
  date: receipt.date,
  datetime: receipt.datetime,
  total: receipt.total,
  currency: receipt.currency,
  externalId: receipt.externalId,
  adjustments: receipt.adjustments || [],
  items: receipt.items.map((item, index) => ({
    key: String(index),
    index,
    name: planItemName(plan[index]),
    qty: item.qty, unit: item.unit, price: item.price, sum: item.sum, isService: item.isService,
    inCatalog: plan[index].inCatalog,
    status: planItemStatus(item, plan[index]),
    categoryName: categories.find(c => c.id === plan[index].categoryId)?.name || null,
    categorySource: plan[index].categorySource,
  })),
});
