import { useState, useCallback } from "react";

// errorMsg — строка или (error) => строка: текст под причину (напр. экран входа).
export function useSave(fn, { onSuccess, errorMsg = "Не удалось сохранить" } = {}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const save = useCallback(async (...args) => {
    setSaving(true);
    setSaveError(null);
    try {
      await fn(...args);
      setSaving(false);
      onSuccess?.();
    } catch(e) {
      console.error(e);
      setSaveError(typeof errorMsg === "function" ? errorMsg(e) : errorMsg);
      setSaving(false);
    }
  }, [fn, onSuccess, errorMsg]);

  return { save, saving, saveError, setSaveError };
}
