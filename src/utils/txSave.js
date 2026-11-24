import { round2 } from "./format";

// Изменение баланса счёта от транзакции: доход +, расход −. Одно место для TxPage и «Входящих».
export const txDelta = (type, amount) => (type === "income" ? 1 : -1) * (Number(amount) || 0);

// Параметры RPC save_tx для НОВОЙ транзакции: баланс считает клиент (instruction.md §4).
export const newTxRpcParams = (tx, account) => ({
  p_tx: tx,
  p_account_id: account.id,
  p_new_balance: round2(Number(account.balance) + txDelta(tx.type, tx.amount)),
});
