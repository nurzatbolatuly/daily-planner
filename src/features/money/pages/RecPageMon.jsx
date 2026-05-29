import { useState } from "react";
import { C } from "../../../constants/theme";
import { supaUpsert, supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { AccSelect } from "../../../components/AccSelect";

export function RecPageMon({ accounts, expCats, onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [day, setDay] = useState(edit?.day || 1);
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [catId, setCatId] = useState(edit?.cat_id || "");
  const [accId, setAccId] = useState(edit?.acc_id || accounts[0]?.id || "");
  const [errors, setErrors] = useState({});

  const selAcc = accounts.find(a => a.id === accId);

  const save = async () => {
    const e = {};
    if (!name.trim()) e.name = "Enter name";
    if (!amt) e.amt = "Enter amount";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const rec = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      day: parseInt(day),
      amount: parseFloat(amt),
      cat_id: catId,
      acc_id: accId,
      last_fired: edit?.last_fired || "",
    };
    try {
      await supaUpsert("recurring", rec);
      onBack(true);
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{edit ? "Edit Reminder" : "Create Reminder"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Payment Name</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
          placeholder="Name"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:16, padding:"4px 0", marginBottom:errors.name?4:16, boxSizing:"border-box" }}
        />
        {errors.name && <p style={{ color:C.red, fontSize:12, marginBottom:12 }}>{errors.name}</p>}
        <AccSelect accounts={accounts} value={accId} onChange={v => setAccId(v)} label="Account"/>
        <div style={{ display:"flex", gap:16, marginBottom:16 }}>
          <div style={{ flex:1 }}>
            <FieldLabel>Day of month</FieldLabel>
            <input
              type="number"
              min="1"
              max="31"
              value={day}
              onChange={e => setDay(e.target.value)}
              style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ flex:2 }}>
            <FieldLabel error={errors.amt}>Amount {selAcc ? `(${selAcc.currency})` : ""}</FieldLabel>
            <input
              type="number"
              value={amt}
              onChange={e => { setAmt(e.target.value); setErrors(p => ({...p, amt:""})); }}
              placeholder="0"
              style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.amt?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", boxSizing:"border-box" }}
            />
          </div>
        </div>
        <FieldLabel>Category</FieldLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
          {expCats.map(c => (
            <button key={c.id} onClick={() => setCatId(c.id)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 4px", borderRadius:10, background:catId===c.id?c.color:"transparent", border:"none", cursor:"pointer" }}>
              <CatIcon k={c.icon} size={46} color={catId===c.id?"rgba(0,0,0,0.25)":c.color}/>
              <span style={{ fontSize:10, color:catId===c.id?"#fff":C.mid, textAlign:"center" }}>{c.name}</span>
            </button>
          ))}
        </div>
        <button onClick={save} style={{ width:"100%", padding:"15px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>Save</button>
        {edit && (
          <button
            onClick={async () => { await supa.delete("recurring", `id=eq.${edit.id}`); onBack(true); }}
            style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
