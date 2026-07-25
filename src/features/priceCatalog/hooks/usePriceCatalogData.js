import { useState, useEffect, useCallback } from "react";
import { supa } from "../../../lib/supabase";

// Ленивая загрузка — хук монтируется только при заходе в «Каталог цен»,
// не тянет данные при старте Финансов (см. usePriceCatalogData vs useMoneyData
// в SKILL.md/instruction.md). Отдаёт только данные + reload — без голых сеттеров,
// формы каталога пишут в БД напрямую и вызывают onBack(true) → reload().
export function usePriceCatalogData() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [cats, prods, ents] = await Promise.all([
        supa.select("price_categories", "order=name.asc"),
        supa.select("price_products", "order=name.asc"),
        supa.select("price_entries", "order=date.asc"),
      ]);
      setCategories(cats || []);
      setProducts(prods || []);
      setEntries(ents || []);
    } catch (e) {
      console.error("Load price catalog:", e);
      setLoadError("Не удалось загрузить каталог цен. Проверьте соединение.");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  return { categories, products, entries, loading, loadError, reload: load };
}
