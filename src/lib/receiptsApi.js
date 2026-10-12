import { supabase, supaRpc } from "./supabase";
import { buildReceiptDelete, receiptDbError } from "../utils/receipts/receiptDb";

// Чеки в БД (tables.sql v33, docs/receipts.md §5). Не в useMoneyData: чек нужен только форме
// конкретной транзакции — грузится лениво по transaction_id, как loan_payments в LoanDetailPage.

// Чек транзакции с позициями или null.
export async function fetchTransactionReceipt(transactionId) {
  const { data, error } = await supabase
    .from("receipts")
    .select("*, receipt_items(*)")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Кому уже принадлежит чек (external_id уникален) — до сохранения, чтобы ответить в предпросмотре,
// а не ошибкой unique при «Сохранить» (§14). → { transaction_id, transactions: {date, amount, currency} } | null
export async function findReceiptOwner(externalId) {
  const { data, error } = await supabase
    .from("receipts")
    .select("transaction_id, transactions(date, amount, currency)")
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Каталог для сопоставления позиций чека (этап 5): товары с признаками и ссылки «строка чека → товар».
// Без него в предпросмотре нельзя: пустой каталог создал бы дубли всех товаров.
export async function fetchCatalogIndex() {
  const [products, links, categories] = await Promise.all([
    supabase.from("price_products").select("id, name, category_id, kind, brand, variant, pack_qty, pack_unit, pack_count, gtin, ntin, name_confirmed"),
    supabase.from("price_product_links").select("product_id, source, match_key"),
    supabase.from("price_categories").select("id, name").order("name"),
  ]);
  const failed = [products, links, categories].find(r => r.error);
  if (failed) throw failed.error;
  return { products: products.data || [], links: links.data || [], categories: categories.data || [] };
}

const rpc = async (fn, p) => {
  try {
    await supaRpc(fn, { p });
  } catch (e) {
    throw receiptDbError(e);
  }
};

// buildReceiptSave тянет названия товаров (этап 2) — грузится только при сохранении чека.
// plan — позиции ↔ товары каталога из предпросмотра (catalogMatch.planReceipt + правки).
export async function saveReceipt(transactionId, receipt, plan = null) {
  const { buildReceiptSave } = await import("../utils/receipts/receiptSave");
  return rpc("save_receipt", buildReceiptSave(transactionId, receipt, { plan }));
}
export const deleteReceipt = transactionId => rpc("delete_receipt", buildReceiptDelete(transactionId));
