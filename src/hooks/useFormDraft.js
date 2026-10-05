import { useState, useEffect } from "react";

// Хранилище может быть недоступно (приватный режим, переполнено) — форма работает и без черновика.
const read = key => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const write = (key, json) => {
  try { localStorage.setItem(key, json); } catch { /* без черновика */ }
};
const remove = key => {
  try { localStorage.removeItem(key); } catch { /* без черновика */ }
};

// Черновик формы в localStorage (docs/shared-expenses.md §12.0): длинная форма заполняется на
// слабом интернете — обрыв или случайный «назад» не должны терять введённое.
//   value — сериализуемое состояние формы; enabled — вести ли черновик (новая запись, не правка).
// → { offer, dirty, accept, discard, clear }
//   offer — черновик, найденный при открытии (пока пользователь не решил — не перезаписывается);
//   dirty — форма изменена с момента открытия (для подтверждения выхода, работает и без черновика);
//   accept() → черновик для восстановления; discard() — удалить; clear() — после успешного сохранения.
export function useFormDraft(key, value, { enabled = true } = {}) {
  const json = JSON.stringify(value);
  const [initialJson] = useState(json);
  const [offer, setOffer] = useState(() => (enabled ? read(key) : null));
  const dirty = json !== initialJson;

  useEffect(() => {
    if (!enabled || offer) return;
    if (dirty) write(key, json);
    else remove(key);
  }, [key, json, dirty, enabled, offer]);

  return {
    offer,
    dirty,
    accept: () => { const d = offer; setOffer(null); return d; },
    discard: () => { remove(key); setOffer(null); },
    clear: () => remove(key),
  };
}
