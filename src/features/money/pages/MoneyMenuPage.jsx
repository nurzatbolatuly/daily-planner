import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";

export function MoneyMenuPage({ navigate, onBack }) {
  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Меню" onBack={onBack}/>
      <div style={{ flex:1, padding:"12px 16px" }}>
        {[{label:"Категории",key:"menuCats"},{label:"Регулярные платежи",key:"menuRec"}].map(item => (
          <div key={item.key} onClick={() => navigate(item.key)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 16px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
            <span style={{ fontSize:16, color:"#fff", fontWeight:500 }}>{item.label}</span>
            <Ico n="chevR" s={18} c={C.dim}/>
          </div>
        ))}
      </div>
    </div>
  );
}
