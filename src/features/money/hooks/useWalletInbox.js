import { useState, useEffect, useCallback, useMemo } from "react";
import * as api from "../../../lib/walletApi";

const EMPTY = { available: false, items: [], cards: [], merchants: [], tokens: [] };

// Apple Pay → «Входящие» (docs/apple-pay-inbox.md §9). Отдельно от useMoneyData: очередь
// перезагружается сама при возврате в приложение (после покупки), без перезагрузки всех данных.
// Наружу — данные и именованные мутации (instruction.md §18), сеттеров нет.
export function useWalletInbox() {
  const [state, setState] = useState(EMPTY);
  const [loadError, setLoadError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setState(await api.fetchWalletState());
      setLoadError(null);
    } catch (e) {
      console.error("Load wallet inbox:", e);
      setLoadError("Не удалось загрузить покупки Apple Pay");
    }
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  // Мутация → перезагрузка очереди. Ошибку пробрасываем: показывает форма (useSave).
  const withReload = useCallback(fn => async (...args) => {
    const result = await fn(...args);
    await reload();
    return result;
  }, [reload]);

  const actions = useMemo(() => ({
    issueToken: withReload(api.issueToken),
    revokeToken: withReload(api.revokeToken),
    dismiss: withReload(api.dismissInbox),
    link: withReload(api.linkInboxTx),
    updateCard: withReload(api.updateCard),
    removeCard: withReload(api.deleteCard),
    removeMerchant: withReload(api.deleteMerchant),
    fetchTokens: api.fetchTokens,
  }), [withReload]);

  return { ...state, loadError, reload, ...actions };
}
