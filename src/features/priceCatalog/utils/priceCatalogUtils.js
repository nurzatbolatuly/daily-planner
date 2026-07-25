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
