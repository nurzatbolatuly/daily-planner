import { roundTo } from "../format";
import { RECEIPT_MERCHANTS, RECEIPT_SERVICE_ITEMS, RECEIPT_UNITS } from "../../constants/receipts";

// Ошибка разбора чека: code — для текста в UI (docs/receipts.md §3.4), не сообщение.
export class ReceiptError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ReceiptError";
    this.code = code;
  }
}

export const RECEIPT_ERRORS = {
  unsupportedLink: "unsupported_link",
  unsupportedFile: "unsupported_file",
  refund: "refund",           // чек возврата — пока не прикрепляется
  empty: "empty",             // 0 позиций: формат источника изменился
  format: "format",           // нет обязательных полей
  upstream: "upstream",       // ОФД не отдал чек: нет такого, ещё не дошёл до ОФД или сервис лежит
  network: "network",         // нет связи / таймаут
  alreadyAttached: "already_attached",  // чек уже прикреплён к другому расходу (unique external_id)
  expenseOnly: "expense_only",          // чек — только к расходу (save_receipt)
};

// Табуляции (Kaspi: «…молочко 5 штук по 70 гр\t»), неразрывные пробелы, повторы — в один пробел.
export const cleanText = s => String(s ?? "").replace(/[\s ]+/g, " ").trim();

// «0.684», 1, «1 018 ₸», «5 772», «11537.00», «2,5» → число; иначе null.
export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = cleanText(v).replace(/[\s₸]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export const money = n => roundTo(n, 2);

export const normalizeUnit = raw => RECEIPT_UNITS[cleanText(raw).toLowerCase()] ?? null;

export const isServiceItem = name => RECEIPT_SERVICE_ITEMS.some(re => re.test(cleanText(name)));

// Юрлицо из чека → магазин (§7.6). Неизвестный продавец — как в чеке, без кавычек и «ТОО».
export function resolveMerchant(raw) {
  const text = cleanText(raw);
  const known = RECEIPT_MERCHANTS.find(m => m.match.test(text));
  if (known) return { merchant: known.name, merchantRaw: text, splitName: !!known.splitName };
  const merchant = text.replace(/^(ТОО|АО|ИП|ТОВАРИЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ)\s+/i, "").replace(/["«»]/g, "").trim();
  return { merchant: merchant || text, merchantRaw: text, splitName: false };
}

// Позиция в общей модели (§4). name на этапе 1 — очищенное сырое имя; читаемое название и
// признаки товара — этап 2 (names.js / attributes.js).
export function makeItem({ name, qty, unit, price, sum, gtin = null, ntin = null }) {
  const rawName = cleanText(name);
  return {
    name: rawName,
    rawName,
    qty,
    unit,
    price,
    sum: money(sum),
    gtin: cleanText(gtin) || null,
    ntin: cleanText(ntin) || null,
    isService: isServiceItem(rawName),
  };
}

// Сумма позиций + корректировки чека (скидка на весь чек, «Вернуться» у Арбуза) = к оплате.
export const itemsTotal = (items, adjustments = []) =>
  money([...items, ...adjustments].reduce((s, x) => s + x.sum, 0));

// Общая проверка результата любого адаптера.
export function assertItems(items) {
  if (!items.length) throw new ReceiptError(RECEIPT_ERRORS.empty, "В чеке не найдено ни одной позиции");
  const broken = items.find(i => i.qty == null || i.price == null || i.sum == null || !i.unit || !i.name);
  if (broken) throw new ReceiptError(RECEIPT_ERRORS.format, `Не удалось разобрать позицию «${broken.name}»`);
}

// Первая ссылка в тексте: вставляют и голую ссылку, и текст из «Поделиться» («Чек: https://…»),
// и ссылку без протокола или без «/» перед «?» (consumer.oofd.kz?i=…). Домен — с буквенной зоной,
// чтобы «14.07.2026» или «5.772» не приняло за адрес.
export function extractUrl(text) {
  const m = cleanText(text).match(/(https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?]\S*)?/i);
  if (!m) return null;
  const raw = m[0].replace(/[),.;»"']+$/, "");
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}
