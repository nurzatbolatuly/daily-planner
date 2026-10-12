import { cleanText } from "./normalize";
import { describeItem, buildDisplayName } from "./names";

// Позиции чека ↔ товары каталога цен (docs/receipts.md §7.3–§7.5, этап 5). Чистые функции:
// план строится при предпросмотре, правится пользователем, в БД уходит через buildReceiptSave.

// Ключ ссылки «эта строка чека в этом магазине = этот товар».
export const rawMatchKey = rawName => `raw:${cleanText(rawName).toLowerCase()}`;

// Бренды подтверждённых товаров — подсказка правилам названий (§7.2): «Молочный бидончик» целиком.
export const knownBrandsOf = products =>
  [...new Set(products.filter(p => p.name_confirmed && p.brand).map(p => p.brand))];

export const productPack = p => (p?.pack_unit ? { qty: Number(p.pack_qty), unit: p.pack_unit, ...(p.pack_count ? { count: p.pack_count } : {}) } : null);
const samePack = (a, b) => !!a && !!b && Number(a.qty) === Number(b.qty) && a.unit === b.unit;
const same = (a, b) => cleanText(a).toLowerCase() === cleanText(b).toLowerCase();

// Порядок §7.3: GTIN → NTIN → ссылка «строка чека» → все 4 признака у ПОДТВЕРЖДЁННОГО товара.
// Частичное совпадение признаков не считается: ложное слияние двух товаров хуже дубля.
// → { productId, via, productName } | { productId: null, via: null }
export function matchItem(item, description, merchant, { products = [], links = [] }) {
  const found = (p, via) => ({ productId: p.id, via, productName: p.name, confirmed: !!p.name_confirmed, categoryId: p.category_id || null });
  const byGtin = item.gtin && products.find(p => p.gtin === item.gtin);
  if (byGtin) return found(byGtin, "gtin");
  const byNtin = item.ntin && products.find(p => p.ntin === item.ntin);
  if (byNtin) return found(byNtin, "ntin");
  const key = rawMatchKey(item.rawName);
  const link = links.find(l => l.source === merchant && l.match_key === key);
  const linked = link && products.find(p => p.id === link.product_id);
  if (linked) return found(linked, "link");
  const d = description;
  if (d.kind && d.brand && d.variant && d.pack) {
    const byAttrs = products.find(p => p.name_confirmed && same(p.kind, d.kind) && same(p.brand, d.brand)
      && same(p.variant, d.variant) && samePack(productPack(p), d.pack));
    if (byAttrs) return found(byAttrs, "attributes");
  }
  return { productId: null, via: null };
}

// Категория вида — самая частая среди товаров каталога этого вида (§7.7): назначили творогу
// «Молочные» один раз — все новые творожки получают её сами. → Map(вид в нижнем регистре → id)
export function categoriesByKind(products) {
  const counts = new Map();
  products.forEach(p => {
    if (!p.kind || !p.category_id) return;
    const kind = p.kind.toLowerCase();
    const byCat = counts.get(kind) || new Map();
    byCat.set(p.category_id, (byCat.get(p.category_id) || 0) + 1);
    counts.set(kind, byCat);
  });
  return new Map([...counts].map(([kind, byCat]) => [kind, [...byCat].sort((a, b) => b[1] - a[1])[0][0]]));
}

// Категория позиции, если пользователь её не выбирал: у найденного товара — его; иначе — по виду.
// → { categoryId, categorySource: "product" | "kind" | null }
export function inheritCategory(match, kind, byKind) {
  if (match.categoryId) return { categoryId: match.categoryId, categorySource: "product" };
  const byKindId = kind && byKind.get(kind.toLowerCase());
  return byKindId ? { categoryId: byKindId, categorySource: "kind" } : { categoryId: null, categorySource: null };
}

// План позиций чека для предпросмотра: описание (правила §7.2 с брендами каталога), найденный
// товар, галочка «в каталог» (по умолчанию все, кроме служебных), правки пользователя (edits).
// categorySource: "product" — категория найденного товара, "kind" — по виду, "manual" / "bulk" —
// выбрал пользователь (в позиции / «для товаров без категории»), null — без категории.
export function planReceipt(receipt, catalog = { products: [], links: [] }) {
  const knownBrands = knownBrandsOf(catalog.products);
  const byKind = categoriesByKind(catalog.products);
  return receipt.items.map(item => {
    const description = describeItem(item, { splitName: receipt.splitName, knownBrands });
    const match = item.isService ? { productId: null, via: null } : matchItem(item, description, receipt.merchant, catalog);
    return {
      description,
      match,
      inCatalog: !item.isService,
      edits: null,   // { core, kind, brand, variant, pack } — пользователь поправил товар
      ...(item.isService ? { categoryId: null, categorySource: null } : inheritCategory(match, description.kind, byKind)),
    };
  });
}

// Выбрала категорию сам пользователь — её надо записать и найденному товару (иначе только пустую).
export const categoryChosenByUser = pi => pi.categorySource === "manual" || pi.categorySource === "bulk";

// Признаки товара позиции: правка пользователя, иначе правила.
export const planItemAttrs = pi => pi.edits || pi.description;

// Название позиции: правка → из признаков; найденный товар → его имя в каталоге (одно на все
// чеки); иначе — правила.
export const planItemName = pi =>
  pi.edits ? buildDisplayName(pi.edits) : pi.match.productId ? pi.match.productName : pi.description.name;

// Статус для предпросмотра: служебная / в каталоге / новый товар (проверьте — пока не подтверждён).
export function planItemStatus(item, pi) {
  if (item.isService) return "service";
  if (!pi.inCatalog) return "skipped";
  if (pi.match.productId) return pi.edits || pi.match.confirmed ? "matched" : "matchedUnconfirmed";
  return pi.edits ? "new" : "newUnconfirmed";
}

// Поля товара каталога из признаков.
export const productFields = attrs => ({
  name: buildDisplayName(attrs),
  kind: attrs.kind || null,
  brand: attrs.brand || null,
  variant: attrs.variant || null,
  pack_qty: attrs.pack?.qty ?? null,
  pack_unit: attrs.pack?.unit ?? null,
  pack_count: attrs.pack?.count ?? null,
});

// Запись цены (§7.5): весовой — за 1 кг; с фасовкой — цена за упаковку + её объём (каталог
// сравнивает цену за единицу: price / qty); без фасовки — за штуку.
export function priceEntryOf(item, pack) {
  if (item.unit === "кг") return { price: item.price, qty: 1, unit: "кг" };
  if (pack) return { price: item.price, qty: pack.qty, unit: pack.unit };
  return { price: item.price, qty: 1, unit: item.unit };
}

// Товары каталога для «Это тот же товар, что…»: сначала того же вида, поиск по названию.
export function searchProducts(products, query, kind = null, limit = 20) {
  const q = cleanText(query).toLowerCase();
  const rank = p => (kind && same(p.kind, kind) ? 0 : 1);
  return products
    .filter(p => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ru"))
    .slice(0, limit);
}
