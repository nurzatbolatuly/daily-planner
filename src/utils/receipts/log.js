// Трассировка прикрепления чека по этапам — фильтр консоли «[receipt]». В dev — всегда, в проде —
// после localStorage.setItem("debug:receipt", "1") (без пересборки, чтобы смотреть у пользователя).
function enabled() {
  if (process.env.NODE_ENV !== "production") return true;
  try { return localStorage.getItem("debug:receipt") === "1"; } catch { return false; }
}

export function receiptLog(stage, data) {
  if (enabled()) console.info(`[receipt] ${stage}`, ...(data === undefined ? [] : [data]));
}
