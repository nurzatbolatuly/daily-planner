import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { pad } from "../../../utils/date";
import { getSym, fmtAmt, toBase, ratesFromAccounts } from "../../../utils/format";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

export function MoneyPlansSection({ data, navigate, plansTab, setPlansTab }) {
  const { accounts, transactions, expCats, incCats, monthPlans, tripPlans } = data;
  const [planMonth, setPlanMonth] = useState(new Date().getMonth());
  const [planYear, setPlanYear] = useState(new Date().getFullYear());
  const [expanded, setExpanded] = useState({});
  const toggle = id => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const sym = getSym(BASE_CUR);
  const rates = ratesFromAccounts(accounts);
  const planMonthKey = `${planYear}-${pad(planMonth+1)}`;
  const monthRows = monthPlans.filter(p => p.month === planMonthKey);
  const planBase = p => toBase(p.plan, p.plan_currency || BASE_CUR, rates);
  const txsM = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === planMonth && d.getFullYear() === planYear; });
  const getActual = (catId, type) => txsM.filter(t => t.type === type && t.category_id === catId).reduce((s,t) => s + toBase(t.amount, t.currency, rates), 0);
  const totalPlanExp = monthRows.filter(p => p.type === "expense").reduce((s,p) => s + planBase(p), 0);
  const totalPlanInc = monthRows.filter(p => p.type === "income").reduce((s,p) => s + planBase(p), 0);
  const totalActExp = txsM.filter(t => t.type === "expense").reduce((s,t) => s + toBase(t.amount, t.currency, rates), 0);
  const totalActInc = txsM.filter(t => t.type === "income").reduce((s,t) => s + toBase(t.amount, t.currency, rates), 0);
  const prevM = () => { if(planMonth===0){setPlanMonth(11);setPlanYear(y=>y-1);}else setPlanMonth(m=>m-1); };
  const nextM = () => { if(planMonth===11){setPlanMonth(0);setPlanYear(y=>y+1);}else setPlanMonth(m=>m+1); };

  const exportPlanCSV = () => {
    const rows = [["Category","Type","Plan","Currency","PlanBase","Actual","Remaining"]];
    monthRows.forEach(mp => { const allC=[...expCats,...incCats]; const cat=allC.find(c=>c.id===mp.cat_id); const actual=getActual(mp.cat_id,mp.type); const pb=planBase(mp); rows.push([cat?.name||"",mp.type,mp.plan,mp.plan_currency||BASE_CUR,pb.toFixed(2),actual.toFixed(2),(pb-actual).toFixed(2)]); });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`plan_${planYear}-${pad(planMonth+1)}.csv`; a.click();
  };

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", textAlign:"center" }}><p style={{ margin:0, fontSize:17, fontWeight:600, color:"#fff" }}>Plans</p></div>
      <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", margin:"12px 16px", borderRadius:10, padding:3 }}>
        {[["month","Monthly"],["trips","Trips"]].map(([v,l]) => (
          <button key={v} onClick={() => setPlansTab(v)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:plansTab===v?C.monCard2:"transparent", color:plansTab===v?C.green:C.dim }}>{l}</button>
        ))}
      </div>
      {plansTab === "month" && (
        <div style={{ padding:"0 16px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <button onClick={prevM} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevL" s={20}/></button>
            <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{RU_MONTHS[planMonth]} {planYear}</span>
            <button onClick={nextM} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevR" s={20}/></button>
            <button onClick={exportPlanCSV} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", marginLeft:8 }}><Ico n="download" s={18} c={C.mid}/></button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
            {[{l:"Inc Plan",v:`${sym}${fmtAmt(totalPlanInc,0)}`,c:"#34d399"},{l:"Exp Plan",v:`${sym}${fmtAmt(totalPlanExp,0)}`,c:"#f87171"},{l:"Remainder",v:`${sym}${fmtAmt(totalPlanInc-totalPlanExp,0)}`,c:"#60a5fa"}].map((c,i) => (
              <div key={i} style={{ background:C.monCard, borderRadius:12, padding:"12px 8px", textAlign:"center" }}>
                <p style={{ margin:"0 0 4px", fontSize:9, color:C.dim }}>{c.l}</p>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:c.c }}>{c.v}</p>
              </div>
            ))}
          </div>
          {/* Таблица планов — горизонтальный скролл на узких экранах */}
          <div style={{ background:C.monCard, borderRadius:16, overflow:"hidden", marginBottom:12 }}>
            <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
              <div style={{ minWidth:380 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1.8fr 55px 1fr 1fr 1fr", padding:"10px 14px", background:"rgba(255,255,255,0.05)" }}>
                  {["Category","Type","Plan","Fact","Rest"].map(h => <p key={h} style={{ margin:0, fontSize:10, fontWeight:700, color:C.dim, textAlign:"center" }}>{h}</p>)}
                </div>
                {monthRows.length === 0 && (
                  <p style={{ margin:0, padding:"18px 14px", fontSize:12, color:C.dim, textAlign:"center" }}>Нет строк плана за этот месяц</p>
                )}
                {monthRows.map(mp => {
                  const allC = [...expCats,...incCats]; const cat = allC.find(c => c.id === mp.cat_id);
                  const actual = getActual(mp.cat_id, mp.type); const pb = planBase(mp); const rest = pb - actual;
                  const cur = mp.plan_currency || BASE_CUR;
                  const its = (mp.items || []).filter(it => it.amount);
                  const isOpen = !!expanded[mp.id];
                  return (
                    <div key={mp.id} style={{ borderTop:`1px solid ${C.border}` }}>
                      <div onClick={() => toggle(mp.id)} style={{ display:"grid", gridTemplateColumns:"1.8fr 55px 1fr 1fr 1fr", padding:"12px 14px", cursor:"pointer", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                          <CatIcon k={cat?.icon||"other"} size={28} color={cat?.color||"#607d8b"}/>
                          <span style={{ fontSize:12, color:C.main, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cat?.name||"—"}</span>
                          {its.length > 0 && <Ico n={isOpen?"chevU":"chevD"} s={13} c={C.dim}/>}
                        </div>
                        <p style={{ margin:0, fontSize:11, textAlign:"center", color:mp.type==="income"?"#34d399":"#f87171" }}>{mp.type==="income"?"Inc":"Exp"}</p>
                        <p style={{ margin:0, fontSize:12, textAlign:"center", color:C.mid }}>{cur===BASE_CUR ? `${sym}${fmtAmt(mp.plan,0)}` : `${getSym(cur)}${fmtAmt(mp.plan,0)}`}</p>
                        <p style={{ margin:0, fontSize:12, textAlign:"center", color:C.main }}>{sym}{fmtAmt(actual,0)}</p>
                        <p style={{ margin:0, fontSize:12, textAlign:"center", fontWeight:600, color:rest>=0?"#34d399":"#f87171" }}>{sym}{fmtAmt(rest,0)}</p>
                      </div>
                      {isOpen && (
                        <div style={{ padding:"0 14px 12px" }}>
                          {its.map(it => (
                            <div key={it.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0 3px 34px" }}>
                              <span style={{ fontSize:12, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginRight:8 }}>• {it.label || "—"}</span>
                              <span style={{ fontSize:12, color:C.mid, flexShrink:0 }}>{getSym(cur)}{fmtAmt(it.amount,0)}</span>
                            </div>
                          ))}
                          {its.length === 0 && <p style={{ margin:"3px 0 0 34px", fontSize:12, color:C.dim }}>Без разбивки</p>}
                          <button onClick={() => navigate("editPlan", mp)} style={{ marginTop:8, marginLeft:34, padding:"6px 14px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>Редактировать</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ display:"grid", gridTemplateColumns:"1.8fr 55px 1fr 1fr 1fr", padding:"12px 14px", borderTop:`1px solid rgba(255,255,255,0.1)`, background:"rgba(255,255,255,0.04)" }}>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.mid, gridColumn:"span 2" }}>Total</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, textAlign:"center", color:C.mid }}>{sym}{fmtAmt(totalPlanExp,0)}</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, textAlign:"center", color:C.main }}>{sym}{fmtAmt(totalActExp,0)}</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, textAlign:"center", color:(totalActInc-totalActExp)>=0?"#34d399":"#f87171" }}>{sym}{fmtAmt(totalActInc-totalActExp,0)}</p>
                </div>
              </div>
            </div>
          </div>
          <button onClick={() => navigate("addPlan", { month: planMonthKey })} style={{ width:"100%", padding:"13px", borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer" }}>+ Add plan row</button>
        </div>
      )}
      {plansTab === "trips" && (
        <div style={{ padding:"0 16px" }}>
          {tripPlans.length === 0 && <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>No trip plans yet</p>}
          {tripPlans.map(tp => {
            const allExp = (tp.days||[]).flatMap(d => d.expenses||[]);
            const total = allExp.reduce((s,e) => s + toBase(e.amount, e.currency, rates), 0);
            const paid = allExp.reduce((s,e) => s + toBase(e.paidAmount||0, e.currency, rates), 0);
            return (
              <div key={tp.id} onClick={() => navigate("tripDetail", tp)} style={{ background:C.monCard, borderRadius:16, padding:"16px", marginBottom:12, cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <div><p style={{ margin:0, fontSize:17, fontWeight:700, color:"#fff" }}>{tp.name}</p><p style={{ margin:"3px 0 0", fontSize:12, color:C.dim }}>{tp.start_date} → {tp.end_date} · {(tp.days||[]).length} days</p></div>
                  <div style={{ textAlign:"right" }}><p style={{ margin:0, fontSize:15, fontWeight:700, color:"#fff" }}>{sym}{fmtAmt(total,0)}</p><p style={{ margin:0, fontSize:11, color:C.green }}>{sym}{fmtAmt(paid,0)} paid</p></div>
                </div>
                {total > 0 && <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,0.08)" }}><div style={{ height:4, borderRadius:2, width:`${Math.min(paid/total*100,100)}%`, background:C.green }}/></div>}
              </div>
            );
          })}
          <button onClick={() => navigate("addTrip")} style={{ width:"100%", padding:"13px", borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer" }}>+ New trip plan</button>
        </div>
      )}
    </div>
  );
}
