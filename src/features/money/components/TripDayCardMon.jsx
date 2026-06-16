import { useState } from "react";
import { C } from "../../../constants/theme";
import { TRIP_LABELS } from "../../../constants/money";
import { todayStr } from "../../../utils/date";
import { getSym, fmtAmt, toBase } from "../../../utils/format";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { Ico } from "../../../components/Ico";
import { TripExpenseFormMon } from "./TripExpenseFormMon";

export function TripDayCardMon({ day, dayIndex, onUpdate, prevDay, rates = {}, onAddRate }) {
  const [collapsed, setCollapsed] = useState(day.date < todayStr());
  const [editExpId, setEditExpId] = useState(null);
  const [addingExp, setAddingExp] = useState(false);
  const [newPlace, setNewPlace] = useState("");

  const d = new Date(day.date);
  const dayLabel = `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
  const isToday = day.date === todayStr();
  const isPast = day.date < todayStr();
  const allDone = day.expenses.length > 0 && day.expenses.every(e => e.status === "paid");
  const dayTotal = day.expenses.reduce((s, e) => s + toBase(e.amount, e.currency, rates), 0);
  const dayPaid = day.expenses.reduce((s, e) => s + toBase(e.paidAmount || 0, e.currency, rates), 0);
  const sym = getSym(BASE_CUR);

  const saveExp = (exp) => {
    const exps = editExpId
      ? day.expenses.map(e => e.id === editExpId ? exp : e)
      : [...day.expenses, exp];
    onUpdate({...day, expenses: exps});
    setEditExpId(null);
    setAddingExp(false);
  };

  const addPlace = () => {
    if (!newPlace.trim()) return;
    onUpdate({...day, places: [...(day.places||[]), {id: crypto.randomUUID(), name:newPlace.trim(), done:false}]});
    setNewPlace("");
  };

  const copyFromPrev = () => {
    if (!prevDay) return;
    const newExps = prevDay.expenses.map(e => ({...e, id: crypto.randomUUID(), status:"unpaid", paidAmount:0}));
    onUpdate({...day, expenses: [...day.expenses, ...newExps]});
  };

  return (
    <div style={{ borderRadius:16, background:C.monCard, marginBottom:10, border:`1px solid ${allDone?"rgba(76,175,80,0.3)":C.border}`, overflow:"hidden" }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{ display:"flex", alignItems:"center",margin:"0px 0px 10px 0px", padding:"14px 16px", cursor:"pointer", background:isToday?"rgba(76,175,80,0.08)":"transparent" }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:15, fontWeight:700, color:isToday?C.green:isPast?C.mid:"#fff" }}>{dayLabel}</span>
            {isToday && <span style={{ fontSize:10, fontWeight:700, color:C.green, background:"rgba(76,175,80,0.15)", padding:"2px 7px", borderRadius:10 }}>СЕГОДНЯ</span>}
            {allDone && <span style={{ fontSize:10, fontWeight:700, color:C.emerald, background:"rgba(52,211,153,0.15)", padding:"2px 7px", borderRadius:10 }}>✓ DONE</span>}
          </div>
          {day.location && <p style={{ margin:"2px 0 0", fontSize:13, color:C.mid }}>{day.location}</p>}
        </div>
        <div style={{ textAlign:"right", marginRight:12 }}>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:"#fff" }}>{sym}{fmtAmt(dayTotal,0)}</p>
          {dayPaid > 0 && <p style={{ margin:0, fontSize:11, color:C.green }}>{sym}{fmtAmt(dayPaid,0)} оплачено</p>}
        </div>
        <Ico n={collapsed?"chevD":"chevU"} s={18} c={C.dim}/>
      </div>

      {!collapsed && (
        <div style={{ padding:"0 16px 16px" }}>
          <input value={day.location||""} onChange={e => onUpdate({...day, location:e.target.value})} placeholder="Место / Город" style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:14, outline:"none", marginBottom:10, boxSizing:"border-box" }}/>
          <textarea value={day.note||""} onChange={e => onUpdate({...day, note:e.target.value})} placeholder="Заметки на день..." style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:13, outline:"none", resize:"none", minHeight:52, marginBottom:10, boxSizing:"border-box" }}/>

          <div style={{ marginBottom:10 }}>
            <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:600, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>Места для посещения</p>
            {(day.places||[]).map(pl => (
              <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <button onClick={() => onUpdate({...day, places:day.places.map(p => p.id===pl.id ? {...p, done:!p.done} : p)})} style={{ width:20, height:20, borderRadius:10, border:`2px solid ${pl.done?C.green:"rgba(255,255,255,0.2)"}`, background:pl.done?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}>
                  {pl.done && <Ico n="check" s={11} c="#fff"/>}
                </button>
                <span style={{ flex:1, fontSize:13, color:pl.done?C.dim:C.main, textDecoration:pl.done?"line-through":"none" }}>{pl.name}</span>
                <button onClick={() => onUpdate({...day, places:day.places.filter(p => p.id!==pl.id)})} style={{ background:"none", border:"none", cursor:"pointer", padding:2, display:"flex" }}><Ico n="x" s={14} c="rgba(244,67,54,0.4)"/></button>
              </div>
            ))}
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <input value={newPlace} onChange={e => setNewPlace(e.target.value)} onKeyDown={e => e.key==="Enter" && addPlace()} placeholder="Добавить место..." style={{ flex:1, background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:"#fff", fontSize:13, outline:"none" }}/>
              <button onClick={addPlace} style={{ background:C.green, border:"none", borderRadius:8, padding:"6px 14px", color:"#fff", cursor:"pointer", fontSize:16, fontWeight:700 }}>+</button>
            </div>
          </div>

          <div style={{ marginBottom:8 }}>
            <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:600, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>Расходы</p>
            {day.expenses.map(exp => {
              if (editExpId === exp.id) return <TripExpenseFormMon key={exp.id} exp={exp} onSave={saveExp} onCancel={() => setEditExpId(null)} rates={rates} onAddRate={onAddRate}/>;
              const stColor = exp.status==="paid" ? C.green : exp.status==="partial" ? C.amber : "rgba(255,255,255,0.3)";
              return (
                <div key={exp.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:10, background:"rgba(255,255,255,0.04)", marginBottom:4, border:`1px solid ${C.border}` }}>
                  <div style={{ width:8, height:8, borderRadius:4, background:stColor, marginTop:6, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:14, color:exp.status==="paid"?C.dim:C.main, fontWeight:500, textDecoration:exp.status==="paid"?"line-through":"none" }}>{exp.label}</span>
                      {exp.isCash && <span style={{ fontSize:10, color:C.dim, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 5px" }}>CASH</span>}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:2, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, color:C.dim }}>{TRIP_LABELS[exp.cat]||exp.cat}</span>
                      {exp.status==="partial" && <span style={{ fontSize:12, color:C.amber }}>{getSym(exp.currency)}{fmtAmt(exp.paidAmount)} оплачено</span>}
                      {exp.note && <span style={{ fontSize:12, color:C.dim, fontStyle:"italic" }}>{exp.note}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:600, color:C.main }}>{getSym(exp.currency)}{fmtAmt(exp.amount)}</p>
                  </div>
                  <button onClick={() => setEditExpId(exp.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, display:"flex" }}><Ico n="edit" s={14} c={C.dim}/></button>
                  <button onClick={() => onUpdate({...day, expenses:day.expenses.filter(e => e.id!==exp.id)})} style={{ background:"none", border:"none", cursor:"pointer", padding:2, display:"flex" }}><Ico n="trash" s={14} c="rgba(244,67,54,0.4)"/></button>
                </div>
              );
            })}
          </div>

          {addingExp
            ? <TripExpenseFormMon onSave={saveExp} onCancel={() => setAddingExp(false)} rates={rates} onAddRate={onAddRate}/>
            : (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setAddingExp(true)} style={{ flex:1, padding:"9px", borderRadius:10, background:"rgba(76,175,80,0.1)", border:"1px solid rgba(76,175,80,0.3)", color:C.green, fontSize:13, cursor:"pointer", fontWeight:600 }}>+ Добавить расход</button>
                {dayIndex > 0 && prevDay && <button onClick={copyFromPrev} style={{ padding:"9px 12px", borderRadius:10, background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`, color:C.dim, fontSize:12, cursor:"pointer" }}>Копировать с пред.</button>}
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}
