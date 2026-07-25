import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { getSym, fmtAmtAuto } from "../../../utils/format";
import { BASE_CUR } from "../../../constants/currencies";
import { groupByProduct, sourceSummaries, cheapestSource } from "../utils/priceCatalogUtils";
import { CategoryChips } from "../components/CategoryChips";

const sym = getSym(BASE_CUR);

export function CatalogListPage({ products, categories, entries, navigate, onBack }) {
  const [query, setQuery] = useState("");
  const [catId, setCatId] = useState("all");

  const byProduct = useMemo(() => groupByProduct(entries), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(p => {
      if (catId !== "all" && p.category_id !== catId) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, catId]);

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader
        title="Каталог цен"
        onBack={onBack}
        right={<button onClick={() => navigate("cats")} style={{ background:"none", border:"none", cursor:"pointer", color:C.green, fontSize:13, fontWeight:600 }}>Категории</button>}
      />
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 100px" }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск товара..."
          style={{ width:"100%", boxSizing:"border-box", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:16, marginBottom:12 }}
        />

        {categories.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <CategoryChips categories={categories} value={catId} onChange={setCatId} allLabel="Все"/>
          </div>
        )}

        {products.length === 0 && (
          <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>Пока нет ни одного товара</p>
        )}
        {products.length > 0 && filtered.length === 0 && (
          <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>Ничего не найдено</p>
        )}

        {filtered.map(p => {
          const cat = catById[p.category_id];
          const summaries = sourceSummaries(byProduct[p.id] || []);
          const cheapest = cheapestSource(summaries);
          return (
            <div key={p.id} onClick={() => navigate("product", p)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"14px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, color:"#fff", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</p>
                <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>{cat?.name || "Без категории"}</p>
              </div>
              {cheapest && (
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:C.green, flexShrink:0 }}>от {sym}{fmtAmtAuto(cheapest.latest.price)}</p>
              )}
              <Ico n="chevR" s={16} c={C.dim}/>
            </div>
          );
        })}

        <button
          onClick={() => navigate("addProduct")}
          style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
        >
          <Ico n="plus" s={16} c={C.green}/> Добавить товар
        </button>
      </div>
    </div>
  );
}
