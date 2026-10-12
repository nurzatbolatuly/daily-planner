// Данные Nuxt SSR из <script id="__NUXT_DATA__"> (страница чека Kaspi, docs/receipts.md §2.1).
// Формат devalue: плоский массив, вложенные значения — индексы в нём; массив, начинающийся со
// строки, — типизированное значение ["Date", …], ["Reactive", idx] и т.п.

const SPECIAL = { "-1": undefined, "-2": undefined, "-3": NaN, "-4": Infinity, "-5": -Infinity, "-6": -0 };

export function decodeNuxtData(html) {
  const m = String(html).match(/<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let flat;
  try {
    flat = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(flat)) return null;

  const cache = new Map();
  const hydrate = index => {
    if (index in SPECIAL) return SPECIAL[index];
    if (cache.has(index)) return cache.get(index);
    const value = flat[index];
    if (value === null || typeof value !== "object") return value;

    if (Array.isArray(value)) {
      if (typeof value[0] === "string") return hydrateTyped(value);
      const out = [];
      cache.set(index, out);
      value.forEach(i => out.push(hydrate(i)));
      return out;
    }
    const out = {};
    cache.set(index, out);
    Object.entries(value).forEach(([k, i]) => { out[k] = hydrate(i); });
    return out;
  };

  const hydrateTyped = ([type, ...args]) => {
    switch (type) {
      case "Date": return new Date(args[0]);
      case "Set": return new Set(args.map(hydrate));
      case "Map": {
        const map = new Map();
        for (let i = 0; i < args.length; i += 2) map.set(hydrate(args[i]), hydrate(args[i + 1]));
        return map;
      }
      case "null": {
        const obj = Object.create(null);
        for (let i = 0; i < args.length; i += 2) obj[args[i]] = hydrate(args[i + 1]);
        return obj;
      }
      case "BigInt": return Number(args[0]);   // в чеках не встречается; точность не нужна
      // Обёртки Nuxt (Reactive, ShallowReactive, Ref, ShallowRef, EmptyRef…) — значение внутри.
      default: return args.length ? hydrate(args[0]) : undefined;
    }
  };

  return hydrate(0);
}
