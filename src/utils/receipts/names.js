import { RECEIPT_ABBREVIATIONS, RECEIPT_PACKAGING_WORDS } from "../../constants/receipts";
import { cleanText } from "./normalize";
import { parsePack, formatPack, parseVariant, findBrand, removeBrand, tidyBrand, findKind } from "./attributes";

// Название позиции чека → читаемое + признаки товара (docs/receipts.md §7.2). Без ИИ.
// Результат — подсказка: пока пользователь не подтвердил товар, в предпросмотре «проверьте» (этап 5).

const LETTER = "a-zа-яёәғқңөұүһі";
const escape = s => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// Слово/сокращение из словаря: с начала слова; с точкой на конце — может стоять вплотную к
// следующему («Смет.пр.700г»), без точки — только целым словом («дом», но не «домашний»).
const wordPattern = key => new RegExp(
  `(^|[^${LETTER}])${escape(key)}${key.endsWith(".") ? "" : `(?![${LETTER}])`}`, "giu");

const ABBREVIATIONS = RECEIPT_ABBREVIATIONS.map(([key, full]) => [wordPattern(key), full]);
const PACKAGING = RECEIPT_PACKAGING_WORDS.map(wordPattern);

export const expandAbbreviations = text =>
  cleanText(ABBREVIATIONS.reduce((s, [re, full]) => s.replace(re, (_, before) => `${before} ${full} `), text));

const removePackaging = text => cleanText(PACKAGING.reduce((s, re) => s.replace(re, (_, before) => `${before} `), text));

// Small: «каз. название - рус. краткое - бренд» (§2.2). Бренд «.» — нет бренда.
// → { name: русская часть, brand, others: остальные части (в них ищется фасовка) }
export function splitLanguages(rawName) {
  const parts = cleanText(rawName).split(/\s+-\s+/);
  if (parts.length !== 3) return { name: cleanText(rawName), brand: null, others: [] };
  return { name: parts[1], brand: tidyBrand(parts[2]), others: [parts[0]] };
}

// Хвост «, кг» / « кг» у весового товара Арбуза («Лук репчатый, кг») — единица продажи, не название.
const stripSaleUnit = text => text.replace(/,?\s+кг\.?$|,\s*кг\.?$/iu, "");

// Висящая пунктуация после вырезания признаков: «Кефир , 1 л» → «Кефир», «Яйца высшая,» → «Яйца высшая».
const tidy = text => cleanText(text.replace(/\s+([,.])/g, "$1").replace(/(^[\s,.\-–]+|[\s,.\-–]+$)/g, "").replace(/,(?=\S)/g, ", "));

// Читаемое название по одному шаблону для всех магазинов: «Вид … «Бренд» вариант, фасовка».
export function buildDisplayName({ core, brand, variant, pack }) {
  const head = [core, brand && `«${brand}»`, variant].filter(Boolean).join(" ");
  return pack ? `${head}, ${formatPack(pack)}` : head;
}

// Позиция чека → { name, core, kind, brand, variant, pack }. core — название без бренда/варианта/фасовки
// («Лапша гнезда с томатом 5 мм»): из него и признаков name собирается заново при правке товара.
// options.splitName — название в формате Small (по магазину, RECEIPT_MERCHANTS);
// options.knownBrands — бренды подтверждённых товаров каталога (этап 5): «Молочный бидончик»
// в Арбузе узнаётся целиком, хотя правило заглавных букв нашло бы только «Молочный».
export function describeItem(item, { splitName = false, knownBrands = [] } = {}) {
  const split = splitName ? splitLanguages(item.rawName) : { name: cleanText(item.rawName), brand: null, others: [] };
  // Служебная позиция (пакет, доставка) — не товар каталога: только читаемое имя.
  if (item.isService) return { name: split.name, core: split.name, kind: null, brand: null, variant: null, pack: null };
  let text = cleanText(split.name.replace(/\\/g, "/"));
  if (item.unit === "кг") text = stripSaleUnit(text);

  // Фасовка: у весового товара её нет. Если в русской части нет, а в казахской есть — берём
  // оттуда и убираем из русской голое число («Паста 550 томатная» + «…550гр…»).
  let pack = null;
  if (item.unit !== "кг") {
    const own = parsePack(text);
    if (own.pack) {
      ({ pack, rest: text } = own);
    } else {
      const other = split.others.map(parsePack).find(p => p.pack);
      if (other) {
        pack = other.pack;
        // голое число целиком (в т.ч. вплотную после сокращения: «сунел.120»), не часть «3.120»
        let removed = false;
        text = cleanText(text.replace(/\d+(?:[.,]\d+)?/g, n => (!removed && n === other.raw ? ((removed = true), " ") : n)));
      }
    }
  }

  const { variant, rest: noVariant } = parseVariant(text);
  text = removePackaging(expandAbbreviations(noVariant));

  let brand = split.brand;
  const known = brand && knownBrands.find(b => b.toLowerCase().replace(/[\s-]+/g, " ") === brand.toLowerCase().replace(/[\s-]+/g, " "));
  if (known) brand = known;
  if (brand) text = removeBrand(text, brand);
  else ({ brand, rest: text } = findBrand(text, knownBrands));

  const { kind, core } = findKind(tidy(text) || cleanText(split.name));
  return { name: buildDisplayName({ core, brand, variant, pack }), core, kind, brand: brand || null, variant, pack };
}
