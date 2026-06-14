import { useState, useCallback } from "react";

export function useSave(fn, { onSuccess, errorMsg = "Не удалось сохранить" } = {}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const save = useCallback(async (...args) => {
    setSaving(true);
    setSaveError(null);
    try {
      await fn(...args);
      onSuccess?.();
    } catch(e) {
      console.error(e);
      setSaveError(errorMsg);
      setSaving(false);
    }
  }, [fn, onSuccess, errorMsg]);

  return { save, saving, saveError, setSaveError };
}
