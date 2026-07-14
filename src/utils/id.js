// Единый способ генерации client-side ID (первичные ключи — text в tables.sql).
// crypto.randomUUID() требует secure context (HTTPS или localhost) — недоступен,
// если открывать приложение с телефона по локальному IP через обычный http.
// Фолбэк — ручная генерация UUID v4 на Math.random: для первичного ключа этого
// достаточно, криптостойкость тут не нужна.
export function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}
