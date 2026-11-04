// Единый способ генерации client-side ID (первичные ключи — text в tables.sql).
// crypto.randomUUID() требует secure context (HTTPS или localhost) — недоступен,
// если открывать приложение с телефона по локальному IP через обычный http.
// Фолбэк — UUID v4 из crypto.getRandomValues(): он есть и вне secure context,
// поэтому ID везде криптостойкие (❌ Math.random — предсказуем, CodeQL js/insecure-randomness).
const hex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // версия 4
  b[8] = (b[8] & 0x3f) | 0x80; // вариант RFC 4122
  const h = Array.from(b, x => hex[x]);
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}
