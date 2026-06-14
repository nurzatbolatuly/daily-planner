import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmt } from "../../../utils/format";
import { supaUpsert, supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { CurrencyPage } from "../../../components/CurrencyPage";

const SAVINGS_PURPOSES = ["investment", "savings", "reserve"];

export function PlanRowPageMon({ expCats, incCats, accounts = [], onBack, edit, month, prefillCatId, prefillAccId, prefillType }) {
  const [type,    setType]    = useState(edit?.type || prefillType || "expense");
  const [catId,   setCatId]   = useState(edit?.cat_id  || prefillCatId  || "");
  const [accId,   setAccId]   = useState(edit?.acc_id  || prefillAccId  || "");
  const [planCur, setPlanCur] = useState(edit?.plan_currency || BASE_CUR);
  const [items,   setItems]   = useState(() => {
    if (edit?.items?.length) return edit.items.map(it => ({ id: it.id || crypto.randomUUID(), label: it.label || "", amount: it.amount != null ? String(it.amount) : "" }));
    if (edit?.plan) return [{ id: crypto.randomUUID(), label: "", amount: String(edit.plan) }];
    return [{ id: crypto.randomUUID(), label: "", amount: "" }];
  });
  const [showCur, setShowCur] = useState(false);
  const [errors,  setErrors]  = useState({});

  if (showCur) return <CurrencyPage value={planCur} onSelect={v => { setPlanCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const savingsAccounts = accounts.filter(a => SAVINGS_PURPOSES.includes(a.purpose));

  const switchType = (v) => { setType(v); setCatId(""); setAccId(""); setErrors({}); };

  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const setItem = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, { id: crypto.randomUUID(), label: "", amount: "" }]);
  const delItem = (id) => setItems(prev => prev.length === 1 ? prev : prev.filter(it => it.id !== id));

  const save = async () => {
    const e = {};
    if (type === "savings" && !accId) e.acc = "Select account";
    if (type !== "savings" && !catId)  e.cat = "Select category";
    const cleanItems = items
      .map(it => ({ id: it.id, label: it.label.trim(), amount: parseFloat(it.amount) || 0 }))
      .filter(it => it.amount > 0);
    if (!cleanItems.length) e.items = "Add at least one item with amount";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const p = {
      id:            edit?.id || crypto.randomUUID(),
      cat_id:        type !== "savings" ? catId : null,
      acc_id:        type === "savings" ? accId : null,
      type,
      plan:          cleanItems.reduce((s, it) => s + it.amount, 0),
      plan_currency: planCur,
      month:         edit?.month || month,
      items:         cleanItems,
    };
    try {
      await supaUpsert("month_plans", p);
      onBack(true);
    } catch(e) { console.error(e); }
  };

  const inputBox = { background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{edit ? "Edit plan row" : "Add plan row"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        {/* Type tabs */}
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:20 }}>
          {[["expense","Expense"],["income","Income"],["savings","Savings"]].map(([v,l]) => (
            <button key={v} onClick={() => switchType(v)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:type===v?C.monCard2:"transparent", color:type===v?C.green:C.dim }}>
              {l}
            </button>
          ))}
        </div>

        {/* Plan items */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <FieldLabel error={errors.items}>Plan items</FieldLabel>
          <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:15, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
            {planCur} ▾
          </button>
        </div>
        {items.map(it => (
          <div key={it.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <input value={it.label} onChange={e => setItem(it.id, { label:e.target.value })} placeholder={type === "savings" ? "Goal (e.g. emergency fund)" : "Item (e.g. groceries)"} style={{ ...inputBox, flex:1, minWidth:0 }}/>
            <input value={it.amount} onChange={e => { setItem(it.id, { amount:e.target.value }); setErrors(p => ({...p, items:""})); }} type="number" placeholder="0" style={{ ...inputBox, width:92, fontWeight:600, textAlign:"right" }}/>
            <button onClick={() => delItem(it.id)} disabled={items.length===1} style={{ background:"none", border:"none", cursor:items.length===1?"default":"pointer", padding:4, display:"flex", opacity:items.length===1?0.3:1 }}>
              <Ico n="x" s={16} c="rgba(244,67,54,0.6)"/>
            </button>
          </div>
        ))}
        {errors.items && <p style={{ color:C.red, fontSize:12, marginBottom:8 }}>{errors.items}</p>}
        <button onClick={addItem} style={{ width:"100%", padding:"10px", borderRadius:10, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:12 }}>+ Add item</button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", borderRadius:10, background:"rgba(255,255,255,0.04)", marginBottom:24 }}>
          <span style={{ fontSize:13, color:C.dim }}>Total</span>
          <span style={{ fontSize:18, fontWeight:700, color:"#fff" }}>{getSym(planCur)}{fmtAmt(total,0)}</span>
        </div>

        {/* Category picker (expense / income) */}
        {type !== "savings" && (
          <>
            <FieldLabel error={errors.cat}>Category</FieldLabel>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
              {(type === "expense" ? expCats : incCats).map(c => (
                <button key={c.id} onClick={() => { setCatId(c.id); setErrors(p => ({...p, cat:""})); }} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 4px", borderRadius:10, background:catId===c.id?c.color:"transparent", border:"none", cursor:"pointer" }}>
                  <CatIcon k={c.icon} size={46} color={catId===c.id?"rgba(0,0,0,0.25)":c.color}/>
                  <span style={{ fontSize:10, color:catId===c.id?"#fff":C.mid, textAlign:"center" }}>{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Account picker (savings) */}
        {type === "savings" && (
          <>
            <FieldLabel error={errors.acc}>Account</FieldLabel>
            {savingsAccounts.length === 0 && (
              <p style={{ color:C.dim, fontSize:13, marginBottom:24 }}>No investment / savings / reserve accounts found. Set the account purpose in account settings.</p>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
              {savingsAccounts.map(a => {
                const sel = accId === a.id;
                return (
                  <button key={a.id} onClick={() => { setAccId(a.id); setErrors(p => ({...p, acc:""})); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:12, background:sel?"rgba(76,175,80,0.12)":"rgba(255,255,255,0.04)", border:`1px solid ${sel?"rgba(76,175,80,0.4)":C.border}`, cursor:"pointer" }}>
                    <CatIcon k={a.icon} size={36} color={a.color}/>
                    <div style={{ flex:1, textAlign:"left" }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:"#fff" }}>{a.name}</p>
                      <p style={{ margin:0, fontSize:11, color:C.dim }}>{a.purpose} · {a.currency}</p>
                    </div>
                    {sel && <Ico n="check" s={18} c={C.green}/>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button onClick={save} style={{ width:"100%", padding:"15px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>Save</button>
        {edit && (
          <button
            onClick={async () => { await supa.delete("month_plans", `id=eq.${edit.id}`); onBack(true); }}
            style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
