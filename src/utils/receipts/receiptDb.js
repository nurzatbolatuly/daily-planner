import { ReceiptError, RECEIPT_ERRORS } from "./normalize";

// Лёгкая часть данных для RPC чеков — без названий товаров (receiptSave.js), в основном бандле.

export const buildReceiptDelete = transactionId => ({ transaction_id: transactionId });

// Ошибка RPC → понятная ReceiptError; прочие — как есть (сеть, права).
export function receiptDbError(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`;
  if (error?.code === "23505" && /receipts_external_id_key/.test(text)) {
    return new ReceiptError(RECEIPT_ERRORS.alreadyAttached, "Чек уже прикреплён к другому расходу");
  }
  if (/receipt_requires_expense/.test(text)) {
    return new ReceiptError(RECEIPT_ERRORS.expenseOnly, "Чек можно прикрепить только к расходу");
  }
  return error;
}
