import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { ACC_ICONS } from "../../../constants/icons";
import { getSym, fmtAmt } from "../../../utils/format";
import { todayStr } from "../../../utils/date";
import { supa, supaUpsert, supabase } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { Toggle } from "../../../components/Toggle";
import { ColorPickerComp } from "../../../components/ColorPickerComp";
import { CurrencyPage } from "../../../components/CurrencyPage";

export function AccPage({ onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [icon, setIcon] = useState(edit?.icon || "wallet");
  const [color, setColor] = useState(edit?.color || C.green);
  const [cur, setCur] = useState(edit?.currency || BASE_CUR);
  const [bal, setBal] = useState(edit?.balance != null ? String(edit.balance) : "");
  const [inTotal, setInTotal] = useState(edit?.in_total !== false);
  const [avgRate, setAvgRate] = useState(edit?.avg_rate ? String(edit.avg_rate) : "");
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!edit;

  if (showCur) return <CurrencyPage value={cur} onSelect={setCur} onBack={() => setShowCur(false)}/>;
  const iconKeys = Object.keys(ACC_ICONS);

  const save = async () => {
    const e = {}; if (!name.trim()) e.name = "Enter name";
    setErrors(e); if (Object.keys(e).length > 0) return;
    setSaving(true);
    const newBal = parseFloat(bal) || 0;
    const acc = { id: edit?.id || crypto.randomUUID(), name: name.trim(), icon, color, currency: cur, balance: newBal, in_total: inTotal, avg_rate: parseFloat(avgRate) || null };
    try {
      await supaUpsert("accounts", acc);
      if (isEdit) {
        const diff = newBal - edit.balance;
        if (diff !== 0) {
          await supabase.from("transactions").insert({
            id: crypto.randomUUID(),
            type: diff > 0 ? "income" : "expense",
            amount: Math.abs(diff),
            currency: acc.currency,
            account_id: acc.id,
            date: todayStr(),
            note: "Balance adjustment",
            category_id: null,
          });
        }
      }
      onBack(true);
    } catch(e) { console.error(e); setSaving(false); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff", textAlign:"left" }}>{isEdit?"Edit Account":"New Account"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, padding:"16px", borderRadius:16, background:C.monCard }}>
          <CatIcon k={icon} size={52} color={color}/>
          <div><p style={{ margin:0, fontSize:18, fontWeight:700, color:"#fff" }}>{name||"Account"}</p><p style={{ margin:0, fontSize:14, color:C.green }}>{getSym(cur)}{fmtAmt(parseFloat(bal)||0)}</p></div>
        </div>
        <div style={{ marginBottom:20 }}>
          <FieldLabel>Balance</FieldLabel>
          <input
            value={bal}
            onChange={e => setBal(e.target.value)}
            type="number"
            placeholder="0"
            style={{ width:"100%", background:"none", border:"none", borderBottom:"1px solid rgba(255,255,255,0.2)", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", marginBottom:12, boxSizing:"border-box" }}
          />
          {isEdit
            ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize:13, color:C.dim }}>Currency</span>
                <div>
                  <span style={{ fontSize:15, fontWeight:700, color:C.dim }}>{cur}</span>
                  <span style={{ fontSize:11, color:C.dim, marginLeft:8 }}>Cannot change</span>
                </div>
              </div>
            )
            : (
              <button
                onClick={() => setShowCur(true)}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"12px 14px", borderRadius:12, background:"rgba(76,175,80,0.1)", border:`1px solid rgba(76,175,80,0.3)`, cursor:"pointer", boxSizing:"border-box" }}
              >
                <span style={{ fontSize:13, color:C.mid }}>Currency</span>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:16, fontWeight:700, color:C.green }}>{cur}</span>
                  <Ico n="chevD" s={14} c={C.green}/>
                </div>
              </button>
            )
          }
        </div>
        {(isEdit ? edit.currency : cur) !== BASE_CUR && (
          <div style={{ marginBottom:16 }}>
            <FieldLabel>Курс (1 {isEdit ? edit.currency : cur} = ? ₸)</FieldLabel>
            <div style={{ display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid rgba(255,255,255,0.2)", paddingBottom:8 }}>
              <input
                value={avgRate}
                onChange={e => setAvgRate(e.target.value)}
                type="number"
                placeholder="напр. 478"
                style={{ flex:1, background:"none", border:"none", outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0" }}
              />
              <span style={{ fontSize:16, fontWeight:700, color:C.dim }}>₸</span>
            </div>
            <p style={{ margin:"6px 0 0", fontSize:11, color:C.dim }}>
              Используется для расчёта общего баланса в ₸. Обновляется автоматически при переводах.
            </p>
          </div>
        )}
        <div style={{ marginBottom:16 }}>
          <FieldLabel error={errors.name}>Name</FieldLabel>
          <input value={name} onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }} placeholder="Account name" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", boxSizing:"border-box" }}/>
          {errors.name && <p style={{ color:C.red, fontSize:12, marginTop:4 }}>{errors.name}</p>}
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel>Icon</FieldLabel>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {iconKeys.map(k => <button key={k} onClick={() => setIcon(k)} style={{ width:50, height:50, borderRadius:25, border:icon===k?"3px solid #fff":"3px solid transparent", background:"transparent", cursor:"pointer", padding:0 }}><CatIcon k={k} size={44} color={color}/></button>)}
          </div>
        </div>
        <div style={{ marginBottom:20 }}><FieldLabel>Color</FieldLabel><ColorPickerComp value={color} onChange={setColor}/></div>
        <div style={{ padding:"14px 16px", borderRadius:12, background:C.monCard, marginBottom:24 }}>
          <Toggle value={!inTotal} onChange={v => setInTotal(!v)} label="Exclude from total balance"/>
        </div>
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Saving...":"Save"}</button>
        {isEdit && <button onClick={async () => { await supa.delete("accounts", `id=eq.${edit.id}`); onBack(true); }} style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>Delete account</button>}
      </div>
    </div>
  );
}
