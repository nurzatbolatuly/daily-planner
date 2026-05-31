import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { EXP_ICONS, INC_ICONS } from "../../../constants/icons";
import { supaUpsert, supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { ColorPickerComp } from "../../../components/ColorPickerComp";
import { CurrencyPage } from "../../../components/CurrencyPage";

export function CatPageMon({ expCats, incCats, onBack, edit, catType }) {
  const [name, setName] = useState(edit?.name || "");
  const [icon, setIcon] = useState(edit?.icon || "other");
  const [color, setColor] = useState(edit?.color || C.green);
  const [plan, setPlan] = useState(edit?.plan || "");
  const [planCur, setPlanCur] = useState(edit?.plan_currency || BASE_CUR);
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});

  if (showCur) return <CurrencyPage value={planCur} onSelect={v => { setPlanCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const iconKeys = Object.keys(catType === "income" ? INC_ICONS : EXP_ICONS);

  const save = async () => {
    const e = {};
    if (!name.trim()) e.name = "Enter name";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const list = catType === "expense" ? expCats : incCats;
    const cat = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      icon,
      color,
      plan: parseFloat(plan) || 0,
      plan_currency: planCur,
      sort_order: edit?.sort_order ?? (Math.max(0, ...list.map(c => c.sort_order ?? 0)) + 1),
    };
    try {
      await supaUpsert(catType === "expense" ? "exp_categories" : "inc_categories", cat);
      onBack(true);
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{edit ? "Edit Category" : "New Category"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, paddingBottom:16, borderBottom:`1px solid ${C.border}` }}>
          <CatIcon k={icon} size={52} color={color}/>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
            placeholder="Category name"
            style={{ flex:1, background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:20, fontWeight:600, padding:"4px 0" }}
          />
        </div>
        {errors.name && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{errors.name}</p>}
        <div style={{ marginBottom:16 }}>
          <FieldLabel>{catType === "expense" ? "Projected expense" : "Projected income"}</FieldLabel>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <input
              value={plan}
              onChange={e => setPlan(e.target.value)}
              type="number"
              placeholder="0"
              style={{ width:120, background:"none", border:"none", borderBottom:"1px solid rgba(255,255,255,0.2)", outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0" }}
            />
            <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:15, fontWeight:600, cursor:"pointer" }}>
              {planCur} ▾
            </button>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel>Icons</FieldLabel>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
            {iconKeys.map(k => (
              <button key={k} onClick={() => setIcon(k)} style={{ width:52, height:52, borderRadius:26, border:icon===k?"3px solid #fff":"3px solid transparent", background:"transparent", cursor:"pointer", padding:0, margin:"0 auto" }}>
                <CatIcon k={k} size={46} color={color}/>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:28 }}>
          <FieldLabel>Color</FieldLabel>
          <ColorPickerComp value={color} onChange={setColor}/>
        </div>
        <button onClick={save} style={{ width:"100%", padding:"15px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>Save</button>
        {edit && (
          <button
            onClick={async () => {
              await supa.delete(catType === "expense" ? "exp_categories" : "inc_categories", `id=eq.${edit.id}`);
              onBack(true);
            }}
            style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
