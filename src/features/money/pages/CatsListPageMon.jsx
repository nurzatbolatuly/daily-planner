import { useState } from "react";
import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { CatIcon } from "../../../components/CatIcon";
import { Ico } from "../../../components/Ico";
import { supaUpsert } from "../../../lib/supabase";

export function CatsListPageMon({ expCats, incCats, dispatch, navigate, onBack }) {
  const [tab, setTab] = useState("expense");
  const [reorder, setReorder] = useState(false);

  const cats    = tab === "expense" ? expCats : incCats;
  const setCats  = tab === "expense" ? dispatch.setExpCats : dispatch.setIncCats;
  const table   = tab === "expense" ? "exp_categories" : "inc_categories";

  // Переставить категорию на одну позицию назад/вперёд: меняем sort_order местами
  // с соседом, оптимистично обновляем стор, при ошибке откатываемся через reload.
  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= cats.length) return;
    const a = cats[idx], b = cats[j];
    const ao = a.sort_order ?? idx, bo = b.sort_order ?? j;
    const next = cats
      .map(c => c.id === a.id ? { ...a, sort_order: bo }
              : c.id === b.id ? { ...b, sort_order: ao } : c)
      .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
    setCats(next);
    try {
      await supaUpsert(table, [{ ...a, sort_order: bo }, { ...b, sort_order: ao }]);
    } catch (e) { console.error(e); dispatch.reload(); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader
        title="Категории"
        onBack={onBack}
        right={<button onClick={() => setReorder(r => !r)} style={{ background:"none", border:"none", cursor:"pointer", color:C.green, fontSize:14, fontWeight:600 }}>{reorder ? "Готово" : "Сортировка"}</button>}
      />
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 80px" }}>
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
          {[["expense","РАСХОДЫ"],["income","ДОХОДЫ"]].map(([v,l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex:1, padding:"10px 0", background:"none", border:"none", cursor:"pointer", fontSize:12, fontWeight:700, color:tab===v?"#fff":C.dim, borderBottom:tab===v?"2px solid #fff":"2px solid transparent" }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
          {cats.map((c, i) => (
            reorder ? (
              <div key={c.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 4px", borderRadius:14, background:C.monCard }}>
                <CatIcon k={c.icon} size={52} color={c.color}/>
                <span style={{ fontSize:11, color:C.mid, textAlign:"center", lineHeight:1.2 }}>{c.name}</span>
                <div style={{ display:"flex", gap:4, marginTop:2 }}>
                  <button onClick={() => move(i,-1)} disabled={i===0} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:6, color:i===0?C.dim:"#fff", cursor:i===0?"default":"pointer", fontSize:13, padding:"2px 7px" }}>◀</button>
                  <button onClick={() => move(i,1)} disabled={i===cats.length-1} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:6, color:i===cats.length-1?C.dim:"#fff", cursor:i===cats.length-1?"default":"pointer", fontSize:13, padding:"2px 7px" }}>▶</button>
                </div>
              </div>
            ) : (
              <button key={c.id} onClick={() => navigate("editCat", {...c, catType:tab})} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 4px", borderRadius:14, background:C.monCard, border:"none", cursor:"pointer" }}>
                <CatIcon k={c.icon} size={52} color={c.color}/>
                <span style={{ fontSize:11, color:C.mid, textAlign:"center", lineHeight:1.2 }}>{c.name}</span>
              </button>
            )
          ))}
          {!reorder && (
            <button onClick={() => navigate("addCat", {catType:tab})} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 4px", borderRadius:14, background:C.monCard, border:"none", cursor:"pointer" }}>
              <div style={{ width:52, height:52, borderRadius:26, background:C.yellow, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Ico n="plus" s={24} c="#fff"/>
              </div>
              <span style={{ fontSize:11, color:C.dim }}>Добавить</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
