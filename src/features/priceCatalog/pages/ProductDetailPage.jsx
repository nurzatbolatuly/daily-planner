import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { getSym, fmtAmtAuto, fmtDateShort } from "../../../utils/format";
import { BASE_CUR } from "../../../constants/currencies";
import { sourceSummaries, cheapestSource, unitPriceOf, productAttrsLabel, otherVariants } from "../utils/priceCatalogUtils";
import { formatPack } from "../../../utils/receipts/attributes";

const sym = getSym(BASE_CUR);

function unitLabel(entry) {
  return entry.qty && Number(entry.qty) !== 1 ? `${fmtAmtAuto(entry.qty)} ${entry.unit}` : entry.unit;
}

// Цена за единицу: «₸548 / л»
const perUnit = entry => `${sym}${fmtAmtAuto(Math.round(unitPriceOf(entry)))} / ${entry.unit}`;

export function ProductDetailPage({ product, category, entries, products = [], allEntries = [], navigate, onBack }) {
  const [expanded, setExpanded] = useState(null);

  const summaries = useMemo(() => sourceSummaries(entries), [entries]);
  const cheapest = useMemo(() => cheapestSource(summaries), [summaries]);
  const variants = useMemo(() => otherVariants(product, products, allEntries), [product, products, allEntries]);
  const attrs = productAttrsLabel(product, formatPack);

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader
        title={product.name}
        onBack={onBack}
        right={<button onClick={() => navigate("editProduct", product)} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, display:"flex" }}><Ico n="edit" s={20}/></button>}
      />
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ marginBottom:20 }}>
          <span style={{ display:"inline-block", padding:"5px 12px", borderRadius:20, background:"rgba(255,255,255,0.06)", fontSize:13, color:C.mid, fontWeight:600 }}>
            {category?.name || "Без категории"}
          </span>
          {attrs && <p style={{ margin:"10px 0 0", fontSize:13, color:C.mid }}>{attrs}</p>}
        </div>

        {summaries.length === 0 && (
          <p style={{ textAlign:"center", padding:"30px 0", color:C.dim, fontSize:14 }}>Пока нет ни одной цены</p>
        )}

        {summaries.map(s => {
          const isOpen = expanded === s.source;
          const isCheapest = summaries.length > 1 && cheapest?.source === s.source;
          return (
            <div key={s.source} style={{ borderRadius:14, background:C.monCard, marginBottom:8, overflow:"hidden" }}>
              <div onClick={() => setExpanded(isOpen ? null : s.source)} style={{ display:"flex", alignItems:"center", gap:10, padding:"14px", cursor:"pointer" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <p style={{ margin:0, fontSize:15, color:"#fff", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.source}</p>
                    {isCheapest && <span style={{ flexShrink:0, fontSize:10, fontWeight:700, color:C.green, background:"rgba(76,175,80,0.15)", padding:"2px 7px", borderRadius:8 }}>ДЕШЕВЛЕ</span>}
                  </div>
                  <p style={{ margin:"3px 0 0", fontSize:12, color:C.dim }}>{fmtDateShort(s.latest.date)} · {unitLabel(s.latest)}</p>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <p style={{ margin:0, fontSize:16, fontWeight:700, color:"#fff" }}>{sym}{fmtAmtAuto(s.latest.price)}</p>
                  {s.delta !== null && Math.abs(s.delta) >= 1 && (
                    <p style={{ margin:"2px 0 0", fontSize:11, fontWeight:600, color:s.delta > 0 ? C.errorLight : C.emerald }}>
                      {s.delta > 0 ? "↑" : "↓"} {Math.abs(Math.round(s.delta))}%
                    </p>
                  )}
                </div>
                <Ico n={isOpen ? "chevU" : "chevD"} s={16} c={C.dim}/>
              </div>

              {isOpen && (
                <div style={{ padding:"0 14px 14px" }}>
                  {s.history.map(e => (
                    <div key={e.id} onClick={() => navigate("editEntry", { product, entry: e })}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 10px", borderRadius:10, background:"rgba(255,255,255,0.04)", marginBottom:6, cursor:"pointer" }}>
                      <div>
                        <p style={{ margin:0, fontSize:13, color:C.main }}>
                          {fmtDateShort(e.date)}
                          {e.receipt_id && <span style={{ marginLeft:6, fontSize:10, fontWeight:700, color:C.blue, background:C.infoTint, padding:"1px 6px", borderRadius:6 }}>из чека</span>}
                        </p>
                        {e.note && <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>{e.note}</p>}
                      </div>
                      <p style={{ margin:0, fontSize:13, fontWeight:600, color:C.mid }}>{sym}{fmtAmtAuto(e.price)} · {unitLabel(e)}</p>
                    </div>
                  ))}
                  <button onClick={() => navigate("addEntry", { product, source: s.source })}
                    style={{ width:"100%", padding:10, borderRadius:10, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:13, fontWeight:600, cursor:"pointer", marginTop:2 }}>
                    + Новая цена в «{s.source}»
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {variants.length > 0 && (
          <div style={{ marginTop:20 }}>
            <p style={{ margin:"0 0 8px", fontSize:13, color:C.dim }}>Другие варианты · {product.kind}</p>
            {variants.map(v => (
              <div key={v.product.id} onClick={() => navigate("product", v.product)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, background:C.monCard, marginBottom:6, cursor:"pointer" }}>
                <p style={{ flex:1, minWidth:0, margin:0, fontSize:14, color:C.main, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.product.name}</p>
                {v.best && <p style={{ margin:0, fontSize:13, fontWeight:600, color:C.mid, flexShrink:0 }}>{perUnit(v.best)}</p>}
                <Ico n="chevR" s={14} c={C.dim}/>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate("addEntry", { product })}
          style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
        >
          <Ico n="plus" s={16} c={C.green}/> Добавить цену
        </button>
      </div>
    </div>
  );
}
