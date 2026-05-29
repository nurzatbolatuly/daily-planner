import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { pad, todayStr } from "../../../utils/date";
import { getSym, fmtAmt, fmtM, toBase, fmtDateShort } from "../../../utils/format";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { DonutChart } from "../components/DonutChart";

export function MoneyHomeSection({ data, navigate }) {
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
  const [filterCats, setFilterCats] = useState([]);
  const [showFilter, setShowFilter] = useState(false);
  const sym = getSym(BASE_CUR);

  const totalBal = (() => {
    const accs = selAccId ? accounts.filter(a => a.id === selAccId) : accounts.filter(a => a.in_total);
    return accs.reduce((s, a) => {
      if (a.currency === BASE_CUR) return s + a.balance;
      return s + (a.avg_rate ? a.balance * a.avg_rate : 0);
    }, 0);
  })();

  const filterTxs = txs => txs.filter(t => {
    if (selAccId && t.account_id !== selAccId) return false;
    if (filterCats.length > 0 && !filterCats.includes(t.category_id)) return false;
    const d = new Date(t.date);
    if (period === "day") return t.date === todayStr();
    if (period === "week") { const w = new Date(); w.setDate(w.getDate()-7); return d >= w; }
    if (period === "month") return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
    if (period === "year") return d.getFullYear() === viewYear;
    if (period === "range" && rangeStart && rangeEnd) return t.date >= rangeStart && t.date <= rangeEnd;
    return true;
  });

  const periodTxs = filterTxs(transactions);
  const typeTxs = periodTxs.filter(t => t.type === txType);
  const cats = txType === "expense" ? expCats : incCats;
  const catData = cats.map(c => ({ ...c, val: typeTxs.filter(t => t.category_id === c.id).reduce((s,t) => s + toBase(t.amount, t.currency), 0) })).filter(c => c.val > 0).sort((a,b) => b.val - a.val);
  const grandTotal = catData.reduce((s,c) => s + c.val, 0);

  const grouped = {};
  typeTxs.forEach(t => { if (!grouped[t.date]) grouped[t.date]=[]; grouped[t.date].push(t); });
  const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a));

  const prevP = () => { if(period==="month"){if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1);}else setViewYear(y=>y-1); };
  const nextP = () => { if(period==="month"){if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1);}else setViewYear(y=>y+1); };
  const periodLabel = period==="month" ? `${RU_MONTHS[viewMonth]} ${viewYear}` : period==="year" ? String(viewYear) : period==="day" ? "Today" : period==="week" ? "This week" : rangeStart&&rangeEnd ? `${rangeStart} — ${rangeEnd}` : "Period";
  const selAcc = accounts.find(a => a.id === selAccId);

  const exportCSV = () => {
    const rows = [["Date","Type","Category","Account","Amount","Currency","Note"]];
    typeTxs.forEach(t => { const cat=cats.find(c=>c.id===t.category_id); const acc=accounts.find(a=>a.id===t.account_id); rows.push([t.date,t.type,cat?.name||"",acc?.name||"",t.amount,t.currency,t.note||""]); });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="transactions.csv"; a.click();
  };

  return (
    <div style={{ paddingBottom:80 }}>
      {/* Header */}
      <div style={{ background:C.monHeader, padding:"14px 16px 0" }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:6 }}>
          <div style={{ width:30 }}/>
          <div style={{ flex:1, textAlign:"center" }}>
            <button onClick={() => setShowAccPicker(true)} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{selAcc?selAcc.name:"Total"}</span>
              <Ico n="chevD" s={14} c={C.mid}/>
            </button>
            <p style={{ margin:"2px 0 0", fontSize:32, fontWeight:800, color:"#fff", letterSpacing:-1 }}>{sym}{fmtAmt(totalBal,0)}</p>
          </div>
          <button onClick={exportCSV} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, padding:4, display:"flex" }}><Ico n="report" s={22} c={C.mid}/></button>
        </div>
        <div style={{ display:"flex" }}>
          {[["expense","EXPENSES"],["income","INCOME"]].map(([v,l]) => (
            <button key={v} onClick={() => setTxType(v)} style={{ flex:1, padding:"12px 0", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:txType===v?"#fff":C.dim, borderBottom:txType===v?"2px solid #fff":"2px solid transparent" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Chart card */}
      <div style={{ margin:"12px 12px 0", background:C.monCard, borderRadius:20 }}>
        <div style={{ display:"flex", padding:"10px 12px 0", gap:2 }}>
          {[["day","Day"],["week","Week"],["month","Month"],["year","Year"],["range","Period"]].map(([v,l]) => (
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
          return (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
              <CatIcon k={c.icon} size={42} color={c.color}/>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:500, color:C.main }}>{c.name}</p>
                {pl && <div style={{ marginTop:3, height:3, borderRadius:2, background:"rgba(255,255,255,0.08)" }}><div style={{ height:3, borderRadius:2, width:`${Math.min(c.val/pl.plan*100,100)}%`, background:c.val>pl.plan?"#f87171":c.color }}/></div>}
              </div>
              <span style={{ fontSize:13, color:C.dim, marginRight:6 }}>{pct}%</span>
              <div style={{ textAlign:"right" }}>
                <p style={{ margin:0, fontSize:14, fontWeight:600, color:C.main }}>{sym}{fmtAmt(c.val,0)}</p>
                {pl && <p style={{ margin:0, fontSize:10, color:C.dim }}>of {sym}{fmtAmt(pl.plan,0)}</p>}
              </div>
            </div>
          );
        })}
        {catData.length === 0 && <p style={{ textAlign:"center", padding:"24px", color:C.dim, fontSize:13 }}>No transactions for this period</p>}
      </div>

      {/* Filter button */}
      <div style={{ padding:"10px 12px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <button onClick={() => setShowFilter(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:20, background:filterCats.length>0?C.greenDim:"rgba(255,255,255,0.06)", border:`1px solid ${filterCats.length>0?"rgba(76,175,80,0.4)":C.border}`, color:filterCats.length>0?C.green:C.mid, fontSize:13, cursor:"pointer" }}>
          <Ico n="filter" s={15} c={filterCats.length>0?C.green:C.mid}/>
          {filterCats.length>0?`Filters (${filterCats.length})`:"Filter"}
        </button>
        <span style={{ fontSize:13, fontWeight:600, color:C.mid }}>{sym}{fmtAmt(grandTotal,0)}</span>
      </div>

      {/* TX list */}
      <div style={{ padding:"10px 12px 0" }}>
        {sortedDates.map(date => (
          <div key={date} style={{ marginBottom:12 }}>
            <p style={{ fontSize:12, fontWeight:600, color:C.dim, margin:"0 0 6px" }}>{fmtDateShort(date)}</p>
            {grouped[date].map(tx => {
              const cat = cats.find(c => c.id === tx.category_id);
              const acc = accounts.find(a => a.id === tx.account_id);
              return (
                <div key={tx.id} onClick={() => navigate("editTx", tx)} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:14, marginBottom:4, background:C.monCard, cursor:"pointer" }}>
                  <CatIcon k={cat?.icon||"other"} size={44} color={cat?.color||"#607d8b"}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:500, color:C.main }}>{cat?.name||"—"}</p>
                    <p style={{ margin:0, fontSize:12, color:C.dim, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{acc?.name||"—"}{tx.note?` · ${tx.note}`:""}</p>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:600, color:tx.type==="income"?"#34d399":"#fff" }}>{tx.type==="income"?"+":""}{getSym(tx.currency)}{fmtAmt(tx.amount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Account picker */}
      {showAccPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={() => setShowAccPicker(false)}>
          <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px 40px", maxHeight:"70vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 16px" }}/>
            <p style={{ fontSize:16, fontWeight:600, color:"#fff", marginBottom:12 }}>Select account</p>
            {[{id:null,name:"Total — all accounts",icon:"other",color:C.green},...accounts].map(a => (
              <div key={String(a.id)} onClick={() => { setSelAccId(a.id); setShowAccPicker(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:selAccId===a.id?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${selAccId===a.id?"rgba(76,175,80,0.4)":C.border}` }}>
                <CatIcon k={a.icon||"other"} size={40} color={a.color||C.green}/>
                <div style={{ flex:1 }}><p style={{ margin:0, fontSize:14, color:"#fff" }}>{a.name}</p>{a.id&&<p style={{ margin:0, fontSize:12, color:C.dim }}>{fmtM(a.balance,a.currency)}</p>}</div>
                <div style={{ width:22, height:22, borderRadius:11, border:`2px solid ${selAccId===a.id?C.green:"rgba(255,255,255,0.2)"}`, display:"flex", alignItems:"center", justifyContent:"center" }}>{selAccId===a.id && <div style={{ width:10, height:10, borderRadius:5, background:C.green }}/>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      {showFilter && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={() => setShowFilter(false)}>
          <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px 40px", maxHeight:"70vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 12px" }}/>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <p style={{ fontSize:16, fontWeight:600, color:"#fff", margin:0 }}>Filter by category</p>
              {filterCats.length > 0 && <button onClick={() => setFilterCats([])} style={{ background:"none", border:"none", color:"#f87171", fontSize:13, cursor:"pointer" }}>Clear all</button>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {cats.map(c => { const sel = filterCats.includes(c.id); return (
                <button key={c.id} onClick={() => setFilterCats(prev => sel?prev.filter(x=>x!==c.id):[...prev,c.id])} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"10px 4px", borderRadius:12, background:sel?c.color:"rgba(255,255,255,0.04)", border:`2px solid ${sel?c.color:C.border}`, cursor:"pointer" }}>
                  <CatIcon k={c.icon} size={44} color={sel?"rgba(0,0,0,0.25)":c.color}/>
                  <span style={{ fontSize:11, color:sel?"#fff":C.mid, textAlign:"center" }}>{c.name}</span>
                </button>
              ); })}
            </div>
            <button onClick={() => setShowFilter(false)} style={{ width:"100%", marginTop:16, padding:"14px", borderRadius:30, background:C.green, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>Apply</button>
          </div>
        </div>
      )}

      {showCalendar && (
        period === "range"
          ? <CalendarPicker mode="range" value={rangeStart||todayStr()} valueEnd={rangeEnd} onChange={v => setRangeStart(v)} onChangeEnd={v => setRangeEnd(v)} onClose={() => setShowCalendar(false)}/>
          : <CalendarPicker mode="single" value={`${viewYear}-${pad(viewMonth+1)}-01`} onChange={v => { const d=new Date(v); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); setPeriod("month"); }} onClose={() => setShowCalendar(false)}/>
      )}
    </div>
  );
}
