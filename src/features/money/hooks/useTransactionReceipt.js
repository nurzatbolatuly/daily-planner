import { useEffect, useMemo, useState } from "react";
import { fetchTransactionReceipt, saveReceipt, deleteReceipt } from "../../../lib/receiptsApi";
import { receiptViewFromRow } from "../../../utils/receipts/receiptView";

// Чек транзакции в форме (docs/receipts.md §3, §6). Сохранённый чек грузится лениво;
// прикрепить / убрать — черновик до «Сохранить», в БД пишет persist после save_tx.
// transactionId = null — новая транзакция, грузить нечего.
export function useTransactionReceipt(transactionId) {
  const [stored, setStored] = useState(null);
  const [loading, setLoading] = useState(!!transactionId);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);   // { parsed, view, plan } — прикрепить/заменить, { removed: true } — убрать

  useEffect(() => {
    if (!transactionId) return undefined;
    let cancelled = false;   // StrictMode: эффект в dev дважды
    setLoading(true);
    fetchTransactionReceipt(transactionId)
      .then(row => { if (!cancelled) setStored(row); })
      .catch(e => { if (!cancelled) { console.error("Load receipt:", e); setLoadError("Не удалось загрузить чек"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId]);

  const view = useMemo(() => {
    if (draft?.parsed) return draft.view;
    if (draft?.removed || !stored) return null;
    return receiptViewFromRow(stored);
  }, [draft, stored]);

  // allowed = false — транзакция больше не расход (сменили тип): сохранённый чек убирается.
  // Без изменений — ни одного запроса: формы без чеков не зависят от новых RPC.
  const persist = async (txId, { allowed = true } = {}) => {
    if (!allowed) {
      if (stored) await deleteReceipt(txId);
    } else if (draft?.parsed) {
      await saveReceipt(txId, draft.parsed, draft.plan);
    } else if (draft?.removed) {
      await deleteReceipt(txId);
    }
  };

  return {
    view,
    loading,
    loadError,
    needsPersist: allowed => (allowed ? !!draft : !!stored),
    attach: (parsed, view, plan) => setDraft({ parsed, view, plan }),
    remove: () => setDraft(stored ? { removed: true } : null),
    persist,
  };
}
