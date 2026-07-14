import { useState, useEffect, useCallback, memo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmtAuto, fmtBal, fmtGrams, isCommodity, calcTotalBalance } from "../../../utils/format";
import { getSavedOrder } from "../../../utils/accountOrder";
import { ACC_PURPOSES } from "../../../constants/money";
import { useDragReorder } from "../../../hooks/useDragReorder";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

export const MoneyAccountsSection = memo(function MoneyAccountsSection({ data, navigate }) {
  const { accounts } = data;
  const [ordered, setOrdered] = useState(() => getSavedOrder(accounts));
  useEffect(() => {
    setOrdered(getSavedOrder(accounts));
    // Удаляем из localStorage id счетов, которых больше не существует
    try {
      const stored = JSON.parse(localStorage.getItem("accountOrder") || "null");
      if (stored) {
        const existingIds = new Set(accounts.map(a => a.id));
        const cleaned = stored.filter(id => existingIds.has(id));
        if (cleaned.length !== stored.length)
          localStorage.setItem("accountOrder", JSON.stringify(cleaned));
      }
    } catch {}
  }, [accounts]);

  const total = calcTotalBalance(accounts);

  const handleAccReorder = useCallback((reordered) => {
    setOrdered(reordered);
    localStorage.setItem("accountOrder", JSON.stringify(reordered.map(a => a.id)));
  }, []);

  const { dragId, dragOverId, getDragHandlers } = useDragReorder({
    items: ordered, onReorder: handleAccReorder, dataAttr: "accid",
  });

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ position:"sticky", top:0, zIndex:10, background:C.monHeader, padding:"14px 16px", textAlign:"center", backdropFilter:"blur(16px)" }}>
        <p style={{ margin:"0 0 4px", fontSize:12, color:C.dim }}>Общий баланс</p>
        <p style={{ margin:0, fontSize:32, fontWeight:800, color:"#fff", letterSpacing:-1 }}>{fmtBal(total, BASE_CUR)}</p>
        <div style={{ display:"flex", justifyContent:"center", gap:24, marginTop:16, marginBottom:8 }}>
          {[["transfer","Перевод",()=>navigate("transfer")],["clock","История",()=>navigate("trHistory")]].map(([ic,l,fn]) => (
            <button key={l} onClick={fn} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer" }}>
              <div style={{ width:52, height:52, borderRadius:26, background:C.greenDim, display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n={ic} s={22} c={C.green}/></div>
              <span style={{ fontSize:11, color:C.mid }}>{l}</span>
            </button>
          ))}
        </div>
      </div>

      {accounts.length === 0 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 24px", gap:16 }}>
          <div style={{ width:64, height:64, borderRadius:20, background:C.monCard, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <CatIcon k="wallet" size={28} color={C.dim}/>
          </div>
          <p style={{ margin:0, fontSize:16, fontWeight:600, color:C.mid, textAlign:"center" }}>Нет счетов</p>
          <p style={{ margin:0, fontSize:13, color:C.dim, textAlign:"center" }}>Добавьте первый счёт, чтобы начать отслеживать финансы</p>
          <button onClick={() => navigate("addAcc")} style={{ marginTop:8, padding:"13px 28px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>+ Добавить счёт</button>
        </div>
      )}

      <div style={{ padding:"16px" }}>
        {ACC_PURPOSES.map(p => {
          const group = ordered.filter(a => (a.purpose || "daily") === p.key);
          if (group.length === 0) return null;
          return (
            <div key={p.key}>
              <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>{p.label}</p>
              {group.map(acc => (
                <div
                  key={acc.id}
                  data-accid={acc.id}
                  onClick={() => navigate("accDetail", acc)}
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
                    {...getDragHandlers(acc.id)}
                    style={{ color:"rgba(255,255,255,0.2)", cursor:"grab", flexShrink:0, touchAction:"none", padding:"4px 2px", userSelect:"none" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <Ico n="drag" s={18}/>
                  </div>
                  <CatIcon k={acc.icon} size={50} color={acc.color}/>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0, fontSize:15, fontWeight:600, color:"#fff" }}>{acc.name}</p>
                    {isCommodity(acc.currency) ? (
                      acc.avg_rate != null && (
                        <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>
                          {fmtGrams(acc.balance)} · {fmtAmtAuto(acc.avg_rate)} ₸/г
                        </p>
                      )
                    ) : (
                      acc.currency !== BASE_CUR && acc.avg_rate != null && (
                        <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>
                          1 {getSym(acc.currency)} = {getSym(BASE_CUR)}{fmtAmtAuto(acc.avg_rate)}
                        </p>
                      )
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {!acc.in_total && <Ico n="eyeOff" s={14} c={C.dim}/>}
                    <p style={{ margin:0, fontSize:16, fontWeight:700, color: acc.balance < 0 ? C.errorLight : "#fff" }}>
                      {isCommodity(acc.currency)
                        ? (acc.avg_rate
                            ? fmtBal(acc.balance * acc.avg_rate, BASE_CUR)
                            : fmtGrams(acc.balance))
                        : fmtBal(acc.balance, acc.currency)
                      }
                    </p>
                  </div>
                </div>
              ))}
              <div style={{ height:8 }}/>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => navigate("addAcc")}
        style={{ position:"fixed", bottom:"calc(76px + env(safe-area-inset-bottom, 0px))", right:20, width:56, height:56, borderRadius:28, background:C.yellow, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(200,150,30,0.4)", zIndex:20 }}
      >
        <Ico n="plus" s={26} c="#fff"/>
      </button>
    </div>
  );
});
