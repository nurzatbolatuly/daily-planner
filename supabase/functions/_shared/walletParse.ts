// Разбор того, что присылает команда iOS «Транзакция» (docs/apple-pay-inbox.md §3, §5.3–5.4).
// Чистые функции без Deno/Node API — их же проверяют тесты Vitest (src/utils/__tests__).
import currencies from "./currencies.json" with { type: "json" };

export type Parsed = { amount: number | null; currency: string | null };

const MAX_AMOUNT = 1e9;
const CODES = new Set(currencies.list.map(c => c.code));

// Символы для поиска валюты в строке суммы. Без металлов («г») и коротких буквенных символов
// («R», «с», «Fr»): они встречаются в словах и дали бы ложную валюту. Длинные — первыми:
// «CA$» не должен распознаться как «$». Псевдонимы — как iOS пишет валюту в чужом регионе
// («US$5.00»); во фронтовом справочнике их нет — это формат iOS, не валюта.
const IOS_ALIASES = [{ sym: "US$", code: "USD" }];
const SYMBOLS = [...currencies.list.filter(c => c.group !== "metal" && !/^\p{L}{1,2}$/u.test(c.sym)), ...IOS_ALIASES]
  .map(c => ({ sym: c.sym.toLowerCase(), code: c.code }))
  .sort((a, b) => b.sym.length - a.sym.length);

// Символ засчитывается, только если перед ним нет буквы: иначе «US$» нашёлся бы как «S$».
function hasSymbol(text: string, sym: string): boolean {
  for (let i = text.indexOf(sym); i >= 0; i = text.indexOf(sym, i + 1)) {
    if (i === 0 || !/\p{L}/u.test(text[i - 1])) return true;
  }
  return false;
}

// Пробелы-разделители тысяч, которые ставит iOS: обычный, неразрывный, узкий неразрывный, тонкий.
const SPACES = /[\s   ]+/g;

export function detectCurrency(text: string): string | null {
  const iso = text.toUpperCase().match(/(?<![A-Z])[A-Z]{3}(?![A-Z])/g)?.find(c => CODES.has(c));
  if (iso) return iso;
  const lower = text.toLowerCase();
  return SYMBOLS.find(s => hasSymbol(lower, s.sym))?.code ?? null;
}

// «1 234,50» / «1,234.50» / «12,99» / «1.234» / «1'234.5» → число. Десятичный разделитель —
// последний из «,» «.», если после него 1–2 цифры; иначе все разделители — тысячи.
export function parseNumber(text: string): number | null {
  const m = text.replace(SPACES, "").match(/-?\d[\d.,']*/);
  if (!m) return null;
  let s = m[0].replace(/'/g, "").replace(/[.,]+$/, "");
  const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const decimals = last >= 0 ? s.length - last - 1 : 0;
  if (last >= 0 && decimals >= 1 && decimals <= 2) {
    s = s.slice(0, last).replace(/[.,]/g, "") + "." + s.slice(last + 1);
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Сумма из поля Amount: число или строка с форматированием локали. Нет / ноль / отрицательная /
// неправдоподобная → amount: null (покупка всё равно попадёт во «Входящие», сумму введут руками).
export function parseAmount(raw: unknown): Parsed {
  if (typeof raw === "number") {
    return { amount: raw > 0 && raw <= MAX_AMOUNT ? Math.round(raw * 100) / 100 : null, currency: null };
  }
  if (typeof raw !== "string" || !raw.trim()) return { amount: null, currency: null };
  const text = raw.replace(SPACES, " ").trim();
  const currency = detectCurrency(text);
  const n = parseNumber(text);
  const amount = n !== null && n > 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : null;
  return { amount, currency };
}

// Организационно-правовые формы — не часть названия продавца.
const LEGAL = /(?<![\p{L}\p{N}])(тоо|ип|ао|оао|ооо|too|llp|llc|ltd|jsc|inc|gmbh)(?![\p{L}\p{N}])/gu;

// Ключ правила «продавец → категория»: регистр, ё/е, кавычки, ТОО/ИП, знаки, номер точки в конце.
// Никакого «умного» слияния: другой ключ — пользователь один раз выберет категорию.
export function merchantKey(name: unknown, max = 200): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(LEGAL, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/(\s+\d+)+$/, "")
    .slice(0, max)
    .trim();
}

// Строка из команды: обрезать пробелы и длину (БД проверяет те же пределы CHECK-ом).
export const cleanText = (v: unknown, max: number) => String(v ?? "").replace(SPACES, " ").trim().slice(0, max);

// Время покупки с телефона. Нет, не разбирается или далеко от «сейчас» (сбитые часы) → null:
// БД поставит время приёма.
export function parseOccurredAt(v: unknown, now: Date): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) return null;
  const day = 24 * 3600 * 1000;
  if (t > now.getTime() + day || t < now.getTime() - 30 * day) return null;
  return new Date(t).toISOString();
}

// Сумма для уведомления: «2 500 ₸», «12,99 $».
export function formatMoney(amount: number, code: string | null): string {
  const sym = currencies.list.find(c => c.code === code)?.sym ?? code ?? "";
  const precision = (currencies.precision as Record<string, number>)[code ?? ""] ?? currencies.defaultPrecision;
  const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: precision }).format(amount).replace(/ /g, " ");
  return sym ? `${num} ${sym}` : num;
}
