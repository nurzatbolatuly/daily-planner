import { useState, useEffect, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { TRIP_LABELS } from "../../../constants/money";
import { getSym, fmtAmtAuto, toBase, ratesFromAccounts } from "../../../utils/format";
import { supa } from "../../../lib/supabase";
import { exportTripXLSX } from "../../../utils/export";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { TripDayCardMon } from "../components/TripDayCardMon";

export function TripDetailPageMon({ plan, accounts, navigate, onBack }) {
  const [days, setDays] = useState(plan.days || []);
  const [tripRates, setTripRates] = useState(plan.rates || {});
  const sym = getSym(BASE_CUR);

  const accountRates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  // Trip-specific rates override account rates (user explicitly set them for this trip)
  const rates = useMemo(() => ({ ...accountRates, ...tripRates }), [accountRates, tripRates]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);

  const handleAddRate = (cur, rate) => {
    const newRates = { ...tripRates, [cur]: rate };
    setTripRates(newRates);
    supa.update("trip_plans", { rates: newRates }, `id=eq.${plan.id}`).catch(e => console.error(e));
  };

  const back = () => { flush(); onBack(true); };

  const handleAddTx = (exp, dayDate) => {
    navigate("addTx", { type:"expense", amount:exp.amount, currency:exp.currency, note:exp.label, date:dayDate });
  };

  const allExp = days.flatMap(d => d.expenses || []);
  const totalAll = allExp.reduce((s,e) => s + toBase(e.amount, e.currency, rates), 0);
  const totalPaid = allExp.reduce((s,e) => s + toBase(e.paidAmount || 0, e.currency, rates), 0);
  const byCat = {};
  allExp.forEach(e => { if (!byCat[e.cat]) byCat[e.cat] = 0; byCat[e.cat] += toBase(e.amount, e.currency, rates); });
  const byCurFull = {};
  allExp.forEach(e => {
    const c = e.currency;
    if (!byCurFull[c]) byCurFull[c] = { total:0, paid:0 };
    byCurFull[c].total += e.amount;
    byCurFull[c].paid += e.paidAmount || 0;
  });

  const exportCSV = () => {
    exportTripXLSX({
      plan,
      days,
      rates,
      filename: `${plan.name.replace(/\s+/g, "_")}.xlsx`,
    });
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader
        title={plan.name}
        onBack={back}
        right={
          <div style={{ display:"flex", gap:4 }}>
            <button onClick={() => { flush(); navigate("editTrip", { ...plan, days, rates: tripRates }); }} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:6 }}><Ico n="edit" s={20} c={C.mid}/></button>
            <button onClick={exportCSV} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:6 }}><Ico n="download" s={20} c={C.mid}/></button>
          </div>
        }
      />
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 80px" }}>
        <div style={{ borderRadius:16, background:C.monCard, padding:"16px", marginBottom:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
            {[{l:"Итого",v:`${sym}${fmtAmtAuto(totalAll)}`,c:"#fff"},{l:"Оплачено",v:`${sym}${fmtAmtAuto(totalPaid)}`,c:C.green},{l:"Осталось",v:`${sym}${fmtAmtAuto(totalAll-totalPaid)}`,c:C.errorLight}].map((s,i) => (
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
              <p style={{ margin:"0 0 8px", fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>По валютам</p>
              {Object.entries(byCurFull).sort((a,b) => toBase(b[1].total,b[0],rates) - toBase(a[1].total,a[0],rates)).map(([cur,v]) => {
                const cs = getSym(cur);
                return (
                  <div key={cur} style={{ marginBottom:10 }}>
                    <p style={{ margin:"0 0 5px", fontSize:13, fontWeight:600, color:C.main }}>{cur}</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {[{l:"Итого",v:`${cs}${fmtAmtAuto(v.total)}`,c:"#fff"},{l:"Оплачено",v:`${cs}${fmtAmtAuto(v.paid)}`,c:C.green},{l:"Осталось",v:`${cs}${fmtAmtAuto(v.total-v.paid)}`,c:C.errorLight}].map((s,i) => (
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
          <TripDayCardMon
            key={day.date}
            day={day}
            dayIndex={i}
            onUpdate={d => saveDay(i,d)}
            prevDay={i>0?days[i-1]:null}
            rates={rates}
            onAddRate={handleAddRate}
            onAddTx={exp => handleAddTx(exp, day.date)}
          />
        ))}
      </div>
    </div>
  );
}
