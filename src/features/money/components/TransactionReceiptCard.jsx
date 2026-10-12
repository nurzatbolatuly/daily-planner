import { useTransactionReceipt } from "../hooks/useTransactionReceipt";
import { ReceiptField } from "./ReceiptField";

// Чек транзакции только для просмотра — в форме общей группы (docs/receipts.md §13): после
// «Сделать общим» транзакцию правит SharedEntryFormPage, а не TxPage, и без этой карточки чек
// пропал бы из интерфейса. Монтировать только при transactionId: внутри — загрузка из БД.
export function TransactionReceiptCard({ transactionId }) {
  const receipt = useTransactionReceipt(transactionId);
  return <ReceiptField view={receipt.view} loading={false} readOnly transactionId={transactionId}/>;
}
