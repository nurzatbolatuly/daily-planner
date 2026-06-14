import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { todayStr, monthKey } from "../../../utils/date";
import { fmtM } from "../../../utils/format";
import { PageHeader } from "../../../components/PageHeader";

export function RecListPageMon({ recurring, accounts, expCats, navigate, onBack }) {
  const mk = monthKey(todayStr());
  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Регулярные платежи" onBack={onBack}/>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 80px" }}>
        {[...recurring].sort((a,b) => a.day - b.day).map(r => {
          const cat = expCats.find(c => c.id === r.cat_id);
          const acc = accounts.find(a => a.id === r.acc_id);
          const fired = r.last_fired === mk;
          return (
            <div key={r.id} onClick={() => navigate("editRec", r)} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px", borderRadius:14, marginBottom:8, background:C.monCard, cursor:"pointer" }}>
              <div style={{ width:42, height:42, borderRadius:21, background:"rgba(76,175,80,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
                <span style={{ fontSize:15, fontWeight:800, color:C.green }}>{r.day}</span>
                {fired && <div style={{ position:"absolute", top:-2, right:-2, width:10, height:10, borderRadius:5, background:C.green, border:`2px solid ${C.monCard}` }}/>}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:14, color:C.main }}>{r.name}</p>
                <p style={{ margin:0, fontSize:12, color:C.dim }}>{cat?.name||"—"} · {acc?.name||"—"}{fired?" · оплачено":""}</p>
              </div>
              <p style={{ margin:0, fontSize:14, fontWeight:600, color:C.main }}>{fmtM(r.amount, acc?.currency || BASE_CUR)}</p>
            </div>
          );
        })}
        <button onClick={() => navigate("addRec")} style={{ width:"100%", marginTop:4, padding:"14px", borderRadius:12, background:C.green, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>
          + Добавить платёж
        </button>
      </div>
    </div>
  );
}
