import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { AddButton } from "../../../components/AddButton";

export function PriceCatsListPage({ categories, navigate, onBack }) {
  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Категории каталога" onBack={onBack}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <AddButton onClick={() => navigate("addCat")} style={{ marginBottom:12 }}>Добавить категорию</AddButton>
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
      </div>
    </div>
  );
}
