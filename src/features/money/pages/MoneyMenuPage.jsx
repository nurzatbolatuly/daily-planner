import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";

const MENU_ITEMS = [
  { label: "Категории",          key: "menuCats" },
  { label: "Регулярные платежи", key: "menuRec"  },
];

export function MoneyMenuPage({ navigate }) {
  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: C.monHeader, padding: "14px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>Меню</p>
      </div>
      <div style={{ padding: "12px 16px" }}>
        {MENU_ITEMS.map(item => (
          <div key={item.key} onClick={() => navigate(item.key)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 16px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
            <span style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>{item.label}</span>
            <Ico n="chevR" s={18} c={C.dim}/>
          </div>
        ))}
      </div>
    </div>
  );
}
