import { useState, useEffect, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { TRIP_LABELS } from "../../../constants/money";
import { getSym, fmtAmtAuto, toBase, ratesFromAccounts } from "../../../utils/format";
import { supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { TripDayCardMon } from "../components/TripDayCardMon";

export function TripDetailPageMon({ plan, accounts, navigate, onBack }) {
  const [days, setDays] = useState(plan.days || []);
  const sym = getSym(BASE_CUR);
  const rates = ratesFromAccounts(accounts);

  // Локальный стейт обновляем сразу, запись в БД дебаунсим (раньше supa.update
  // всего jsonb-массива летел на каждый символ). pendingRef хранит несохранённые
  // дни, flush() сбрасывает их в БД — вызывается перед уходом со страницы.
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const flush = () => {
    clearTimeout(timerRef.current);
    if (pendingRef.current) { const nd = pendingRef.current; pendingRef.current = null; supa.update("trip_plans", { days: nd }, `id=eq.${plan.id}`).catch(e => console.error(e)); }
  };
  const saveDay = (idx, day) => {
    setDays(prev => {
      const nd = prev.map((d,i) => i === idx ? day : d);
      pendingRef.current = nd;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 500);
      return nd;
    });
  };
  // Подстраховка: сбросить несохранённое при размонтировании.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);

  const back = () => { flush(); onBack(true); };

  const allExp = days.flatMap(d => d.expenses || []);
  const totalAll = allExp.reduce((s,e) => s + toBase(e.amount, e.currency, rates), 0);
  const totalPaid = allExp.reduce((s,e) => s + toBase(e.paidAmount || 0, e.currency, rates), 0);
  const byCat = {};
  allExp.forEach(e => { if (!byCat[e.cat]) byCat[e.cat] = 0; byCat[e.cat] += toBase(e.amount, e.currency, rates); });
  // Свод по каждой использованной валюте в её родной валюте (без toBase — валюты не складываем).
  // Ключи = только валюты, встретившиеся в расходах (вкл. ₸, если есть расходы в ₸).
  const byCurFull = {};
  allExp.forEach(e => {
    const c = e.currency;
    if (!byCurFull[c]) byCurFull[c] = { total:0, paid:0 };
    byCurFull[c].total += e.amount;
    byCurFull[c].paid += e.paidAmount || 0;
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
        <button onClick={back} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{plan.name}</span>
        <button onClick={() => { flush(); navigate("editTrip", { ...plan, days }); }} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", marginRight:14 }}><Ico n="edit" s={20} c={C.mid}/></button>
        <button onClick={exportCSV} style={{ background:"none", border:"none", cursor:"pointer", display:"flex" }}><Ico n="download" s={20} c={C.mid}/></button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 80px" }}>
        <div style={{ borderRadius:16, background:C.monCard, padding:"16px", marginBottom:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
            {[{l:"Total",v:`${sym}${fmtAmtAuto(totalAll)}`,c:"#fff"},{l:"Paid",v:`${sym}${fmtAmtAuto(totalPaid)}`,c:C.green},{l:"Remaining",v:`${sym}${fmtAmtAuto(totalAll-totalPaid)}`,c:"#f87171"}].map((s,i) => (
              <div key={i} style={{ textAlign:"center", padding:"10px", borderRadius:10, background:"rgba(255,255,255,0.04)" }}>
                <p style={{ margin:0, fontSize:10, color:C.dim, marginBottom:3 }}>{s.l}</p>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:s.c }}>{s.v}</p>
              </div>
            ))}
          </div>
          {Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat,amt]) => (
            <div key={cat} style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:13, color:C.mid }}>{TRIP_LABELS[cat]||cat}</span>
              <span style={{ fontSize:13, color:C.main, fontWeight:500 }}>{sym}{fmtAmtAuto(amt)}</span>
            </div>
          ))}
          {Object.keys(byCurFull).length > 0 && (
            <>
              <div style={{ height:1, background:C.border, margin:"10px 0 8px" }}/>
              <p style={{ margin:"0 0 8px", fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>By currency</p>
              {Object.entries(byCurFull).sort((a,b) => toBase(b[1].total,b[0],rates) - toBase(a[1].total,a[0],rates)).map(([cur,v]) => {
                const cs = getSym(cur);
                return (
                  <div key={cur} style={{ marginBottom:10 }}>
                    <p style={{ margin:"0 0 5px", fontSize:13, fontWeight:600, color:C.main }}>{cur}</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {[{l:"Total",v:`${cs}${fmtAmtAuto(v.total)}`,c:"#fff"},{l:"Paid",v:`${cs}${fmtAmtAuto(v.paid)}`,c:C.green},{l:"Remaining",v:`${cs}${fmtAmtAuto(v.total-v.paid)}`,c:"#f87171"}].map((s,i) => (
                        <div key={i} style={{ textAlign:"center", padding:"8px", borderRadius:10, background:"rgba(255,255,255,0.04)" }}>
                          <p style={{ margin:0, fontSize:10, color:C.dim, marginBottom:3 }}>{s.l}</p>
                          <p style={{ margin:0, fontSize:13, fontWeight:700, color:s.c }}>{s.v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        {days.map((day,i) => (
          <TripDayCardMon key={day.date} day={day} dayIndex={i} onUpdate={d => saveDay(i,d)} prevDay={i>0?days[i-1]:null} rates={rates}/>
        ))}
      </div>
    </div>
  );
}
