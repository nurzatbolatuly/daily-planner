import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { TRIP_LABELS } from "../../../constants/money";
import { getSym, fmtAmt, toBase } from "../../../utils/format";
import { supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { TripDayCardMon } from "../components/TripDayCardMon";

export function TripDetailPageMon({ plan, onBack }) {
  const [days, setDays] = useState(plan.days || []);
  const sym = getSym(BASE_CUR);

  const saveDay = async (idx, day) => {
    const nd = [...days]; nd[idx] = day; setDays(nd);
    try { await supa.update("trip_plans", { days: nd }, `id=eq.${plan.id}`); } catch(e) { console.error(e); }
  };

  const allExp = days.flatMap(d => d.expenses || []);
  const totalAll = allExp.reduce((s,e) => s + toBase(e.amount, e.currency), 0);
  const totalPaid = allExp.reduce((s,e) => s + toBase(e.paidAmount || 0, e.currency), 0);
  const byCat = {};
  allExp.forEach(e => { if (!byCat[e.cat]) byCat[e.cat] = 0; byCat[e.cat] += toBase(e.amount, e.currency); });
  const byCur = {};
  allExp.filter(e => e.status !== "paid").forEach(e => {
    const needed = e.status === "partial" ? (e.amount - (e.paidAmount||0)) : e.amount;
    if (!byCur[e.currency]) byCur[e.currency] = {cash:0, card:0};
    if (e.isCash) byCur[e.currency].cash += needed;
    else byCur[e.currency].card += needed;
  });

  const exportCSV = () => {
    const rows = [["Date","Location","Name","Category","Amount","Currency","Status","Cash","Note"]];
    days.forEach(d => d.expenses.forEach(e => rows.push([d.date, d.location||"", e.label, TRIP_LABELS[e.cat]||e.cat, e.amount, e.currency, e.status, e.isCash?"Yes":"No", e.note||""])));
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${plan.name.replace(/\s+/g,"_")}.csv`; a.click();
  };

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{plan.name}</span>
        <button onClick={exportCSV} style={{ background:"none", border:"none", cursor:"pointer", display:"flex" }}><Ico n="download" s={20} c={C.mid}/></button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 80px" }}>
        <div style={{ borderRadius:16, background:C.monCard, padding:"16px", marginBottom:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
            {[{l:"Total",v:`${sym}${fmtAmt(totalAll,0)}`,c:"#fff"},{l:"Paid",v:`${sym}${fmtAmt(totalPaid,0)}`,c:C.green},{l:"Remaining",v:`${sym}${fmtAmt(totalAll-totalPaid,0)}`,c:"#f87171"}].map((s,i) => (
              <div key={i} style={{ textAlign:"center", padding:"10px", borderRadius:10, background:"rgba(255,255,255,0.04)" }}>
                <p style={{ margin:0, fontSize:10, color:C.dim, marginBottom:3 }}>{s.l}</p>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:s.c }}>{s.v}</p>
              </div>
            ))}
          </div>
          {Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat,amt]) => (
            <div key={cat} style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:13, color:C.mid }}>{TRIP_LABELS[cat]||cat}</span>
              <span style={{ fontSize:13, color:C.main, fontWeight:500 }}>{sym}{fmtAmt(amt,0)}</span>
            </div>
          ))}
          {Object.keys(byCur).length > 0 && (
            <>
              <div style={{ height:1, background:C.border, margin:"10px 0 8px" }}/>
              <p style={{ margin:"0 0 6px", fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>Need to pay</p>
              {Object.entries(byCur).map(([cur,v]) => (
                <div key={cur} style={{ marginBottom:6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.main }}>{cur}</span>
                    <span style={{ fontSize:13, color:C.main }}>{getSym(cur)}{fmtAmt(v.cash+v.card,0)}</span>
                  </div>
                  <div style={{ display:"flex", gap:12 }}>
                    {v.cash > 0 && <span style={{ fontSize:12, color:C.dim }}>💵 {getSym(cur)}{fmtAmt(v.cash,0)}</span>}
                    {v.card > 0 && <span style={{ fontSize:12, color:C.dim }}>💳 {getSym(cur)}{fmtAmt(v.card,0)}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {days.map((day,i) => (
          <TripDayCardMon key={day.date} day={day} dayIndex={i} onUpdate={d => saveDay(i,d)} prevDay={i>0?days[i-1]:null}/>
        ))}
      </div>
    </div>
  );
}
