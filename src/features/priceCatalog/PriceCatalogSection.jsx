import { useCallback, useMemo, useState } from "react";
import { C } from "../../constants/theme";
import { Spinner } from "../../components/Spinner";
import { usePriceCatalogData } from "./hooks/usePriceCatalogData";
import { CatalogListPage } from "./pages/CatalogListPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { PriceEntryFormPage } from "./pages/PriceEntryFormPage";
import { PriceCatsListPage } from "./pages/PriceCatsListPage";
import { PriceCatPage } from "./pages/PriceCatPage";

// Самостоятельный мини-раздел (свой внутренний стек), встраивается как один экран
// в screenMap MoneyManagerSection — см. ключ "priceCatalog". Данные (категории/товары/
// цены) — отдельный домен, не пересекается с useMoneyData (см. SKILL.md).
export function PriceCatalogSection({ onBack }) {
  const data = usePriceCatalogData();
  const [stack, setStack] = useState([]);
  const screen = stack[stack.length - 1] || null;

  const navigate = useCallback((name, d) => setStack(s => [...s, { name, data: d }]), []);
  const goBack = useCallback((doReload = false) => { if (doReload) data.reload(); setStack(s => s.slice(0, -1)); }, [data]);
  const goToRoot = useCallback(() => { data.reload(); setStack([]); }, [data]);

  const sources = useMemo(() => [...new Set(data.entries.map(e => e.source))].sort((a, b) => a.localeCompare(b, "ru")), [data.entries]);
  const catById = useMemo(() => Object.fromEntries(data.categories.map(c => [c.id, c])), [data.categories]);

  if (data.loading) return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))" }}>
      <Spinner color={C.green}/>
    </div>
  );

  if (data.loadError) return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, color: C.errorLight, textAlign: "center" }}>{data.loadError}</p>
      <button onClick={data.reload} style={{ padding: "12px 28px", borderRadius: 30, background: C.greenDim, border: `1px solid ${C.green}`, color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
        Повторить
      </button>
    </div>
  );

  if (screen) {
    const { name, data: d } = screen;
    const screenMap = {
      product: (d) => {
        const product = data.products.find(p => p.id === d.id) || d;
        return (
          <ProductDetailPage
            product={product}
            category={catById[product.category_id]}
            entries={data.entries.filter(e => e.product_id === product.id)}
            navigate={navigate}
            onBack={goBack}
          />
        );
      },
      addProduct: () => <ProductFormPage categories={data.categories} onBack={goBack}/>,
      editProduct: (d) => <ProductFormPage categories={data.categories} edit={d} onBack={goBack} onDelete={goToRoot}/>,
      addEntry: (d) => <PriceEntryFormPage product={d.product} sources={sources} prefillSource={d.source} onBack={goBack}/>,
      editEntry: (d) => <PriceEntryFormPage product={d.product} sources={sources} edit={d.entry} onBack={goBack}/>,
      cats: () => <PriceCatsListPage categories={data.categories} navigate={navigate} onBack={() => goBack(false)}/>,
      addCat: () => <PriceCatPage onBack={goBack}/>,
      editCat: (d) => <PriceCatPage edit={d} onBack={goBack}/>,
    };
    const render = screenMap[name];
    if (render) return render(d);
  }

  return (
    <CatalogListPage
      products={data.products}
      categories={data.categories}
      entries={data.entries}
      navigate={navigate}
      onBack={onBack}
    />
  );
}
