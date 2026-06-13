import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";

export function MoneyMenuPage({ navigate, onBack }) {
  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Menu</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, padding:"12px 16px" }}>
        {[{label:"Categories",key:"menuCats"},{label:"Recurring payments",key:"menuRec"}].map(item => (
          <div key={item.key} onClick={() => navigate(item.key)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 16px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
            <span style={{ fontSize:16, color:"#fff", fontWeight:500 }}>{item.label}</span>
            <Ico n="chevR" s={18} c={C.dim}/>
          </div>
        ))}
      </div>
    </div>
  );
}
