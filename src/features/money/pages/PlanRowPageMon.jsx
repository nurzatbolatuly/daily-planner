import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { supaUpsert, supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";

export function PlanRowPageMon({ expCats, incCats, onBack, edit }) {
  const [type, setType] = useState(edit?.type || "expense");
  const [catId, setCatId] = useState(edit?.cat_id || "");
  const [plan, setPlan] = useState(edit?.plan ? String(edit.plan) : "");
  const [errors, setErrors] = useState({});

  const save = async () => {
    const e = {};
    if (!catId) e.cat = "Select category";
    if (!plan) e.plan = "Enter amount";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const p = {
      id: edit?.id || crypto.randomUUID(),
      cat_id: catId,
      type,
      plan: parseFloat(plan),
    };
    try {
      await supaUpsert("month_plans", p);
      onBack(true);
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{edit ? "Edit plan row" : "Add plan row"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:20 }}>
          {[["expense","Expense"],["income","Income"]].map(([v,l]) => (
            <button key={v} onClick={() => { setType(v); setCatId(""); }} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:type===v?C.monCard2:"transparent", color:type===v?C.green:C.dim }}>
              {l}
            </button>
          ))}
        </div>
        <FieldLabel error={errors.plan}>Plan amount ({BASE_CUR})</FieldLabel>
        <input
          value={plan}
          onChange={e => { setPlan(e.target.value); setErrors(p => ({...p, plan:""})); }}
          type="number"
          placeholder="0"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.plan?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", marginBottom:errors.plan?4:20, boxSizing:"border-box" }}
        />
        {errors.plan && <p style={{ color:C.red, fontSize:12, marginBottom:12 }}>{errors.plan}</p>}
        <FieldLabel error={errors.cat}>Category</FieldLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
          {(type === "expense" ? expCats : incCats).map(c => (
            <button key={c.id} onClick={() => { setCatId(c.id); setErrors(p => ({...p, cat:""})); }} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 4px", borderRadius:10, background:catId===c.id?c.color:"transparent", border:"none", cursor:"pointer" }}>
              <CatIcon k={c.icon} size={46} color={catId===c.id?"rgba(0,0,0,0.25)":c.color}/>
              <span style={{ fontSize:10, color:catId===c.id?"#fff":C.mid, textAlign:"center" }}>{c.name}</span>
            </button>
          ))}
        </div>
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
