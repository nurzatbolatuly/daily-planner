import { RECEIPT_PACK_UNITS, RECEIPT_KINDS } from "../../constants/receipts";
import { roundTo } from "../format";
import { cleanText, toNumber } from "./normalize";

// Признаки товара из названия (docs/receipts.md §7.2, шаг 3). Каждая функция возвращает найденное
// и текст БЕЗ найденного — следующая работает с остатком. Без ИИ: ошибка правил — подсказка,
// которую пользователь правит один раз на товар.

// \b в JS не видит кириллицу — границы слова через явные классы букв.
const LETTER = "a-zа-яёәғқңөұүһі";
const NOT_LETTER_AFTER = `(?![${LETTER}])`;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT_ALT = Object.keys(RECEIPT_PACK_UNITS).sort((a, b) => b.length - a.length).join("|");

const PACK_RE = new RegExp(`${NUM}\\s*(${UNIT_ALT})${NOT_LETTER_AFTER}\\.?`, "iu");
// «5 штук по 70 гр» — упаковка из нескольких штук
const MULTIPACK_RE = new RegExp(String.raw`(\d+)\s*(штук|шт|дана)\.?\s*(?:по\s*)?${NUM}\s*(${UNIT_ALT})${NOT_LETTER_AFTER}\.?`, "iu");
const FAT_RE = new RegExp(String.raw`${NUM}\s*%`, "u");
const SORT_RE = new RegExp(String.raw`(\d+)\s*-?\s*(сорт|сұрып)${NOT_LETTER_AFTER}`, "iu");
const SIZE_RE = new RegExp(String.raw`(\d+)\s*[*xх×]\s*(\d+)${NOT_LETTER_AFTER}`, "iu");

const cut = (text, match) => cleanText(text.slice(0, match.index) + " " + text.slice(match.index + match[0].length));
const num = s => toNumber(s);
const packOf = (value, rawUnit) => {
  const u = RECEIPT_PACK_UNITS[rawUnit.toLowerCase()];
  return { qty: roundTo(num(value) * u.factor, 6), unit: u.unit };
};

// → { pack: { qty, unit, count? } | null, rest, raw } — qty в базовой единице (кг / л / шт);
// count — сколько штук в упаковке («5 × 70 г»: count 5, qty 0.35 кг). raw — число как в тексте,
// чтобы убрать из русской части Small голое «550», когда фасовка нашлась в казахской («550гр»).
export function parsePack(text) {
  const multi = text.match(MULTIPACK_RE);
  if (multi) {
    const [, count, , each, unit] = multi;
    const one = packOf(each, unit);
    return { pack: { qty: roundTo(one.qty * Number(count), 6), unit: one.unit, count: Number(count) }, rest: cut(text, multi), raw: each };
  }
  const m = text.match(PACK_RE);
  if (!m) return { pack: null, rest: text, raw: null };
  return { pack: packOf(m[1], m[2]), rest: cut(text, m), raw: m[1] };
}

// Подпись фасовки: до 1 кг/л — в граммах/миллилитрах («900 мл», «1 кг», «5 × 70 г»).
export function formatPack(pack) {
  if (!pack) return "";
  const one = (qty, unit) => {
    if (unit !== "шт" && qty < 1) return `${roundTo(qty * 1000, 3)} ${unit === "кг" ? "г" : "мл"}`;
    return `${roundTo(qty, 3)} ${unit}`;
  };
  return pack.count ? `${pack.count} × ${one(pack.qty / pack.count, pack.unit)}` : one(pack.qty, pack.unit);
}

// Вариант — то, чем отличаются товары одного вида и бренда: жирность, сорт, размер.
// → { variant: "20%" | "1 сорт" | "32×34" | "…" | null, rest }
export function parseVariant(text) {
  const parts = [];
  let rest = text;
  [
    [FAT_RE, m => `${String(m[1]).replace(",", ".")}%`],
    [SORT_RE, m => `${m[1]} сорт`],
    [SIZE_RE, m => `${m[1]}×${m[2]}`],
  ].forEach(([re, label]) => {
    const m = rest.match(re);
    if (!m) return;
    parts.push(label(m));
    rest = cut(rest, m);
  });
  return { variant: parts.join(" ") || null, rest };
}

// Сравнение брендов без регистра, дефисов и кавычек: «Chip-Chip» = «CHIP CHIP».
const brandKey = s => cleanText(s).toLowerCase().replace(/[«»"']/g, "").replace(/[\s-]+/g, " ");
const tokensOf = s => brandKey(s).split(" ").filter(Boolean);

// Убрать бренд из текста по словам (в тексте он может быть написан иначе, чем бренд).
export function removeBrand(text, brand) {
  if (!brand) return text;
  const words = cleanText(text).split(" ");
  const target = tokensOf(brand);
  const wordTokens = words.map(tokensOf);   // слово может само содержать дефис: «Сары-Булак» → 2 токена
  // Сколько слов с позиции start целиком покрывают бренд; 0 — не совпало.
  const matchLength = start => {
    let matched = 0;
    for (let j = start; j < words.length && matched < target.length; j++) {
      const wt = wordTokens[j];
      if (!wt.length) return 0;
      for (const token of wt) {
        if (token !== target[matched]) return 0;
        matched++;
      }
      if (matched === target.length) return j - start + 1;
    }
    return 0;
  };
  for (let i = 0; i < words.length; i++) {
    const len = matchLength(i);
    if (len) return cleanText([...words.slice(0, i), ...words.slice(i + len)].join(" "));
  }
  return text;
}

const LATIN_WORD = /^[A-Za-z][A-Za-z0-9&'.-]*$/;
const CAPITAL_WORD = /^[А-ЯЁӘҒҚҢӨҰҮҺІ][а-яёәғқңөұүһі]+(-[А-ЯЁӘҒҚҢӨҰҮҺІа-яёәғқңөұүһі][а-яёәғқңөұүһі]*)?$/;
const CONNECTOR = /^(и|&)$/i;

// Бренд из названия, если чек его не дал отдельно (Kaspi, Арбуз):
// 1. известный бренд каталога (подтверждённые пользователем) — самый длинный найденный;
// 2. в кавычках;
// 3. самая ранняя (не с первого слова — первое слово это вид) серия латинских слов
//    («Asia Rice», «Arbuz select») или слов с заглавной («Молочный Бидончик», «Умут и Ко»).
// → { brand | null, rest }
export function findBrand(text, knownBrands = []) {
  const key = ` ${brandKey(text)} `;
  const known = knownBrands
    .filter(b => key.includes(` ${brandKey(b)} `))
    .sort((a, b) => brandKey(b).length - brandKey(a).length)[0];
  if (known) return { brand: known, rest: removeBrand(text, known) };

  const quoted = text.match(/[«"]([^»"]+)[»"]/);
  if (quoted) return { brand: cleanText(quoted[1]), rest: cut(text, quoted) };

  const words = text.split(" ");
  for (let i = 1; i < words.length; i++) {
    const latin = LATIN_WORD.test(words[i]);
    if (!latin && !CAPITAL_WORD.test(words[i])) continue;
    let j = i + 1;
    while (j < words.length) {
      if (latin ? LATIN_WORD.test(words[j]) : CAPITAL_WORD.test(words[j])) j++;
      else if (!latin && CONNECTOR.test(words[j]) && CAPITAL_WORD.test(words[j + 1] || "")) j += 2;
      else break;
    }
    return { brand: words.slice(i, j).join(" "), rest: cleanText([...words.slice(0, i), ...words.slice(j)].join(" ")) };
  }
  return { brand: null, rest: text };
}

// Бренд из чека Small («МОЛОЧНЫЙ БИДОНЧИК ТВ»): обрезанный хвост в 1–2 буквы — мусор кассы,
// ВЕРХНИЙ РЕГИСТР — в «Заглавные».
export function tidyBrand(brand) {
  let words = cleanText(brand).replace(/^[.\-–]+$/, "").split(" ").filter(Boolean);
  if (words.length > 1 && words[words.length - 1].length <= 2) words = words.slice(0, -1);
  const text = words.join(" ");
  if (!text || /[a-zа-яёәғқңөұүһі]/.test(text)) return text || null;
  return text.toLowerCase().replace(/(^|[\s-])([a-zа-яёәғқңөұүһі])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Вид — многословный из словаря (с вариантами написания) или первое слово.
// → { kind, core } — core: название без бренда/признаков, начинается с вида.
export function findKind(text) {
  const lower = text.toLowerCase();
  for (const { kind, match } of RECEIPT_KINDS) {
    const alias = match.find(a => lower === a || lower.startsWith(`${a} `));
    if (alias) return { kind, core: cleanText(`${kind} ${text.slice(alias.length)}`) };
  }
  const core = capitalize(text);
  return { kind: core.split(" ")[0] || null, core };
}
