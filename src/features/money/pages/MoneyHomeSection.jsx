import { useState, useMemo, memo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { pad, todayStr } from "../../../utils/date";
import { getSym, fmtAmt, fmtBal, toBase, ratesFromAccounts, calcTotalBalance } from "../../../utils/format";
import { exportTransactionsXLSX } from "../../../utils/export";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { BottomSheet } from "../../../components/BottomSheet";
import { DonutChart } from "../components/DonutChart";

export const MoneyHomeSection = memo(function MoneyHomeSection({ data, navigate }) {
  const { accounts, transactions, expCats, incCats, monthPlans } = data;
  const [txType, setTxType] = useState("expense");
  const [period, setPeriod] = useState("month");
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selAccId, setSelAccId] = useState(null);
  const [showAccPicker, setShowAccPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const sym = getSym(BASE_CUR);
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);

  const totalBal = useMemo(() =>
    selAccId ? (accounts.find(a => a.id === selAccId)?.balance || 0) : calcTotalBalance(accounts),
    [accounts, selAccId]
  );

  const cats = txType === "expense" ? expCats : incCats;

  const typeTxs = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (selAccId && t.account_id !== selAccId) return false;
      const d = new Date(t.date);
      if (period === "day") return t.date === todayStr();
      if (period === "week") { const w = new Date(); w.setDate(w.getDate()-7); return d >= w; }
      if (period === "month") return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
      if (period === "year") return d.getFullYear() === viewYear;
      if (period === "range" && rangeStart && rangeEnd) return t.date >= rangeStart && t.date <= rangeEnd;
      return true;
    });
    return filtered.filter(t => t.type === txType);
  }, [transactions, selAccId, period, txType, viewMonth, viewYear, rangeStart, rangeEnd]);

  const catData = useMemo(() =>
    cats.map(c => ({ ...c, val: typeTxs.filter(t => t.category_id === c.id).reduce((s,t) => s + toBase(t.amount, t.currency, rates), 0) }))
      .filter(c => c.val > 0).sort((a,b) => b.val - a.val),
    [cats, typeTxs, rates]
  );

  const grandTotal = useMemo(() => catData.reduce((s,c) => s + c.val, 0), [catData]);

  const prevP = () => { if(period==="month"){if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1);}else setViewYear(y=>y-1); };
  const nextP = () => { if(period==="month"){if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1);}else setViewYear(y=>y+1); };
  const periodLabel = period==="month" ? `${RU_MONTHS[viewMonth]} ${viewYear}` : period==="year" ? String(viewYear) : period==="day" ? "Сегодня" : period==="week" ? "Эта неделя" : rangeStart&&rangeEnd ? `${rangeStart} — ${rangeEnd}` : "Период";
  const selAcc = accounts.find(a => a.id === selAccId);

  const exportCSV = () => {
    exportTransactionsXLSX({
      txs: typeTxs,
      catData,
      cats,
      accounts,
      txType,
      periodLabel,
      filename: "transactions.xlsx",
    });
  };

  return (
    <div style={{ paddingBottom:80 }}>
      {/* Header */}
      <div style={{ background:C.monHeader, padding:"14px 16px 0" }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:6 }}>
          <div style={{ width:30 }}/>
          <div style={{ flex:1, textAlign:"center" }}>
            <button onClick={() => setShowAccPicker(true)} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{selAcc?selAcc.name:"Все счета"}</span>
              <Ico n="chevD" s={14} c={C.mid}/>
            </button>
            <p style={{ margin:"2px 0 0", fontSize:32, fontWeight:800, color:"#fff", letterSpacing:-1 }}>{fmtBal(totalBal, BASE_CUR)}</p>
          </div>
          <button onClick={exportCSV} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, padding:4, display:"flex" }}><Ico n="report" s={22} c={C.mid}/></button>
        </div>
        <div style={{ display:"flex" }}>
          {[["expense","РАСХОДЫ"],["income","ДОХОДЫ"]].map(([v,l]) => (
            <button key={v} onClick={() => setTxType(v)} style={{ flex:1, padding:"12px 0", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:txType===v?"#fff":C.dim, borderBottom:txType===v?"2px solid #fff":"2px solid transparent" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Chart card */}
      <div style={{ margin:"12px 12px 0", background:C.monCard, borderRadius:20 }}>
        <div style={{ display:"flex", padding:"10px 12px 0", gap:2 }}>
          {[["day","День"],["week","Неделя"],["month","Месяц"],["year","Год"],["range","Период"]].map(([v,l]) => (
            <button key={v} onClick={() => { setPeriod(v); if(v==="range") setShowCalendar(true); }} style={{ flex:1, padding:"7px 2px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:500, background:"transparent", color:period===v?C.green:C.dim, borderBottom:period===v?`2px solid ${C.green}`:"2px solid transparent" }}>{l}</button>
          ))}
        </div>
        {(period==="month"||period==="year") && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px 0" }}>
            <button onClick={prevP} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevL" s={20}/></button>
            <button onClick={() => setShowCalendar(true)} style={{ background:"none", border:"none", cursor:"pointer" }}><span style={{ fontSize:13, color:C.mid, textDecoration:"underline" }}>{periodLabel}</span></button>
            <button onClick={nextP} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevR" s={20}/></button>
          </div>
        )}
        {period==="range"&&rangeStart&&rangeEnd && <div style={{ textAlign:"center", padding:"6px 0 0" }}><button onClick={() => setShowCalendar(true)} style={{ background:"none", border:"none", cursor:"pointer" }}><span style={{ fontSize:13, color:C.mid, textDecoration:"underline" }}>{rangeStart} — {rangeEnd}</span></button></div>}
        <div style={{ padding:"16px 16px 0", position:"relative" }}>
          <DonutChart segments={catData.map(c => ({val:c.val,color:c.color}))} total={grandTotal}/>
          <button onClick={() => navigate("addTx")} style={{ position:"absolute", bottom:12, right:16, width:50, height:50, borderRadius:25, background:C.yellow, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(200,150,30,0.45)", zIndex:5 }}><Ico n="plus" s={24} c="#fff"/></button>
        </div>
        {catData.map(c => {
          const pct = grandTotal > 0 ? Math.round(c.val/grandTotal*100) : 0;
          const pl = monthPlans.find(p => p.cat_id === c.id && p.type === txType);
          const planInBase = pl ? toBase(pl.plan, pl.plan_currency || BASE_CUR, rates) : 0;
          return (
            <div key={c.id} onClick={() => navigate("catTxs", { cat:c, txs:typeTxs.filter(t => t.category_id===c.id), periodLabel, txType })} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderTop:`1px solid ${C.border}`, cursor:"pointer" }}>
              <CatIcon k={c.icon} size={42} color={c.color}/>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:500, color:C.main }}>{c.name}</p>
                {pl && <div style={{ marginTop:3, height:3, borderRadius:2, background:"rgba(255,255,255,0.08)" }}><div style={{ height:3, borderRadius:2, width:`${Math.min(c.val/planInBase*100,100)}%`, background:c.val>planInBase?C.errorLight:c.color }}/></div>}
              </div>
              <span style={{ fontSize:13, color:C.dim, marginRight:6 }}>{pct}%</span>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ textAlign:"right" }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:600, color:C.main }}>{sym}{fmtAmt(c.val,0)}</p>
                  {pl && <p style={{ margin:0, fontSize:10, color:C.dim }}>из {getSym(pl.plan_currency || BASE_CUR)}{fmtAmt(pl.plan,0)}</p>}
                </div>
                <Ico n="chevR" s={16} c={C.dim}/>
              </div>
            </div>
          );
        })}
        {catData.length === 0 && <p style={{ textAlign:"center", padding:"24px", color:C.dim, fontSize:13 }}>Нет транзакций за этот период</p>}
      </div>

      {/* Account picker */}
      <BottomSheet open={showAccPicker} onClose={() => setShowAccPicker(false)} title="Счёт">
        {[{id:null,name:"Все счета",icon:"other",color:C.green},...accounts].map(a => (
          <div key={String(a.id)} onClick={() => { setSelAccId(a.id); setShowAccPicker(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:selAccId===a.id?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${selAccId===a.id?"rgba(76,175,80,0.4)":C.border}` }}>
            <CatIcon k={a.icon||"other"} size={40} color={a.color||C.green}/>
            <div style={{ flex:1 }}><p style={{ margin:0, fontSize:14, color:"#fff" }}>{a.name}</p>{a.id&&<p style={{ margin:0, fontSize:12, color: a.balance < 0 ? C.errorLight : C.dim }}>{fmtBal(a.balance,a.currency)}</p>}</div>
            <div style={{ width:22, height:22, borderRadius:11, border:`2px solid ${selAccId===a.id?C.green:"rgba(255,255,255,0.2)"}`, display:"flex", alignItems:"center", justifyContent:"center" }}>{selAccId===a.id && <div style={{ width:10, height:10, borderRadius:5, background:C.green }}/>}</div>
          </div>
        ))}
      </BottomSheet>

      {showCalendar && (
        period === "range"
          ? <CalendarPicker mode="range" value={rangeStart||todayStr()} valueEnd={rangeEnd} onChange={v => setRangeStart(v)} onChangeEnd={v => setRangeEnd(v)} onClose={() => setShowCalendar(false)}/>
          : <CalendarPicker mode="single" value={`${viewYear}-${pad(viewMonth+1)}-01`} onChange={v => { const d=new Date(v); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); setPeriod("month"); }} onClose={() => setShowCalendar(false)}/>
      )}
    </div>
  );
});
