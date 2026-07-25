import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";

export function PriceCatsListPage({ categories, navigate, onBack }) {
  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Категории каталога" onBack={onBack}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        {categories.length === 0 && (
          <p style={{ textAlign:"center", padding:"20px 0", color:C.dim, fontSize:14 }}>Категорий пока нет</p>
        )}
        {categories.map(c => (
          <div key={c.id} onClick={() => navigate("editCat", c)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 16px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
            <span style={{ fontSize:15, color:"#fff", fontWeight:500 }}>{c.name}</span>
            <Ico n="chevR" s={16} c={C.dim}/>
          </div>
        ))}
        <button
          onClick={() => navigate("addCat")}
          style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
        >
          <Ico n="plus" s={16} c={C.green}/> Добавить категорию
        </button>
      </div>
    </div>
  );
}
