// entries отсортированы по (date, created_at) — новее в конце, старее в начале.
const byDateAsc = (a, b) => a.date === b.date ? new Date(a.created_at) - new Date(b.created_at) : a.date < b.date ? -1 : 1;

export function groupByProduct(entries) {
  const map = {};
  entries.forEach(e => { (map[e.product_id] ||= []).push(e); });
  return map;
}

// Для каждого источника товара — последняя цена + % изменения к предыдущей записи
// этого же источника. Источники отсортированы по последней цене (дешевле — выше).
export function sourceSummaries(entries) {
  const bySource = {};
  entries.forEach(e => { (bySource[e.source] ||= []).push(e); });

  const summaries = Object.entries(bySource).map(([source, list]) => {
    const sorted = [...list].sort(byDateAsc);
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    const delta = prev && prev.price > 0 ? (latest.price - prev.price) / prev.price * 100 : null;
    return { source, latest, prev, delta, history: sorted.slice().reverse(), count: sorted.length };
  });

  return summaries.sort((a, b) => a.latest.price - b.latest.price);
}

// Самый дешёвый источник. Сравнивает цену за единицу, только если у ВСЕХ источников
// одна и та же единица измерения (иначе сравнение некорректно — сравниваем по цене за раз).
export function cheapestSource(summaries) {
  if (summaries.length === 0) return null;
  const sameUnit = summaries.every(s => s.latest.unit === summaries[0].latest.unit);
  const unitPrice = s => sameUnit && s.latest.qty > 0 ? s.latest.price / s.latest.qty : s.latest.price;
  return summaries.reduce((min, s) => unitPrice(s) < unitPrice(min) ? s : min, summaries[0]);
}

export const UNITS = ["шт", "кг", "г", "л", "мл"];

// ── Товары из чеков (docs/receipts.md §7, этап 5) ─────────────────────────────────────────────

// Цена за единицу записи: «Молоко 900 мл · ₸493» → 547.78 за л. qty = 1 — цена как есть.
export const unitPriceOf = entry => (Number(entry.qty) > 0 ? Number(entry.price) / Number(entry.qty) : Number(entry.price));

// Признаки товара одной строкой: «Творог · Молочный Бидончик · 5% · 500 г».
export const productAttrsLabel = (product, formatPack) => [
  product.kind,
  product.brand,
  product.variant,
  product.pack_unit && formatPack({ qty: Number(product.pack_qty), unit: product.pack_unit, ...(product.pack_count ? { count: product.pack_count } : {}) }),
].filter(Boolean).join(" · ");

// «Другие варианты» — товары того же вида, у каждого самая выгодная последняя цена за единицу.
// Сравнивать можно только в одной единице: у вариантов в другой единице цена за единицу не показывается.
export function otherVariants(product, products, entries) {
  if (!product.kind) return [];
  const byProduct = groupByProduct(entries);
  const kind = product.kind.toLowerCase();
  return products
    .filter(p => p.id !== product.id && p.kind && p.kind.toLowerCase() === kind)
    .map(p => {
      const best = cheapestSource(sourceSummaries(byProduct[p.id] || []));
      return { product: p, best: best?.latest || null, unitPrice: best ? unitPriceOf(best.latest) : null };
    })
    .sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
}
