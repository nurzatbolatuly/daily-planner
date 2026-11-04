import { useCallback, useMemo } from "react";
import { LoadingScreen, LoadErrorScreen } from "../../components/LoadingScreen";
import { useScreenStack } from "../../hooks/useScreenStack";
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
  const { screen, navigate, goBack, reset } = useScreenStack(data.reload);
  const goToRoot = useCallback(() => reset(true), [reset]);

  const sources = useMemo(() => [...new Set(data.entries.map(e => e.source))].sort((a, b) => a.localeCompare(b, "ru")), [data.entries]);
  const catById = useMemo(() => Object.fromEntries(data.categories.map(c => [c.id, c])), [data.categories]);

  if (data.loading) return <LoadingScreen/>;
  if (data.loadError) return <LoadErrorScreen message={data.loadError} onRetry={data.reload}/>;

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
            products={data.products}
            allEntries={data.entries}
            navigate={navigate}
            onBack={goBack}
          />
        );
      },
      addProduct: () => <ProductFormPage categories={data.categories} attributesSupported={data.attributesSupported} onBack={goBack}/>,
      editProduct: (d) => <ProductFormPage categories={data.categories} attributesSupported={data.attributesSupported} edit={d} onBack={goBack} onDelete={goToRoot}/>,
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
