import { useState, useEffect } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmt, fmtM } from "../../../utils/format";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

function getSavedOrder(accounts) {
  try {
    const ids = JSON.parse(localStorage.getItem("accountOrder") || "null");
    if (!ids) return accounts;
    return [...accounts].sort((a, b) => {
      const ai = ids.indexOf(a.id), bi = ids.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } catch {
    return accounts;
  }
}

export function MoneyAccountsSection({ data, navigate }) {
  const { accounts } = data;
  const [ordered, setOrdered] = useState(() => getSavedOrder(accounts));
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  useEffect(() => {
    setOrdered(getSavedOrder(accounts));
  }, [accounts]);

  const sym = getSym(BASE_CUR);
  const total = accounts.filter(a => a.in_total).reduce((s, a) => {
    if (a.currency === BASE_CUR) return s + a.balance;
    return s + (a.avg_rate ? a.balance * a.avg_rate : 0);
  }, 0);

  const handleDrop = targetId => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const fi = ordered.findIndex(a => a.id === dragId);
    const ti = ordered.findIndex(a => a.id === targetId);
    if (fi < 0 || ti < 0) return;
    const next = [...ordered];
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    setOrdered(next);
    setDragId(null);
    setDragOverId(null);
    localStorage.setItem("accountOrder", JSON.stringify(next.map(a => a.id)));
  };

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ position:"sticky", top:0, zIndex:10, background:C.monHeader, padding:"14px 16px", textAlign:"center", backdropFilter:"blur(16px)" }}>
        <p style={{ margin:"0 0 4px", fontSize:12, color:C.dim }}>Total balance</p>
        <p style={{ margin:0, fontSize:32, fontWeight:800, color:"#fff", letterSpacing:-1 }}>{sym}{fmtAmt(total,0)}</p>
        <div style={{ display:"flex", justifyContent:"center", gap:24, marginTop:16, marginBottom:8 }}>
          {[["transfer","Transfer",()=>navigate("transfer")],["clock","History",()=>navigate("trHistory")]].map(([ic,l,fn]) => (
            <button key={l} onClick={fn} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer" }}>
              <div style={{ width:52, height:52, borderRadius:26, background:C.greenDim, display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n={ic} s={22} c={C.green}/></div>
              <span style={{ fontSize:11, color:C.mid }}>{l}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px" }}>
        {ordered.map(acc => (
          <div
            key={acc.id}
            draggable
            onDragStart={() => setDragId(acc.id)}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            onDragOver={e => { e.preventDefault(); setDragOverId(acc.id); }}
            onDrop={() => handleDrop(acc.id)}
            onClick={() => navigate("editAcc", acc)}
            style={{
              display:"flex", alignItems:"center", gap:12, padding:"16px 14px",
              borderRadius:16, marginBottom:10, background:C.monCard, cursor:"pointer",
              opacity: dragId === acc.id ? 0.4 : 1,
              transform: dragOverId === acc.id && dragId !== acc.id ? "scaleX(1.01)" : "none",
              transition: "opacity 0.15s, transform 0.1s",
              border: `1px solid ${dragOverId === acc.id && dragId !== acc.id ? "rgba(76,175,80,0.4)" : "transparent"}`,
            }}
          >
            <div
              draggable={false}
              style={{ color:"rgba(255,255,255,0.2)", cursor:"grab", flexShrink:0, touchAction:"none", padding:"4px 2px" }}
              onClick={e => e.stopPropagation()}
            >
              <Ico n="drag" s={18}/>
            </div>
            <CatIcon k={acc.icon} size={50} color={acc.color}/>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:15, fontWeight:600, color:"#fff" }}>{acc.name}</p>
              {acc.currency !== BASE_CUR && acc.avg_rate != null && (
                <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>
                  Avg rate: 1 {acc.currency} = {getSym(BASE_CUR)}{fmtAmt(acc.avg_rate,2)}
                </p>
              )}
              {!acc.in_total && <p style={{ margin:0, fontSize:11, color:C.dim }}>Not in total</p>}
            </div>
            <p style={{ margin:0, fontSize:16, fontWeight:700, color:"#fff" }}>{fmtM(acc.balance, acc.currency)}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("addAcc")}
        style={{ position:"fixed", bottom:90, right:20, width:56, height:56, borderRadius:28, background:C.yellow, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(200,150,30,0.4)", zIndex:20 }}
      >
        <Ico n="plus" s={26} c="#fff"/>
      </button>
    </div>
  );
}
