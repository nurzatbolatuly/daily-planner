import { useState } from "react";
import { C } from "../constants/theme";
import { fmtBal } from "../utils/format";
import { getSavedOrder } from "../utils/accountOrder";
import { FieldLabel } from "./FieldLabel";
import { BottomSheet } from "./BottomSheet";
import { CatIcon } from "./CatIcon";
import { Ico } from "./Ico";

export function AccSelect({ accounts, value, onChange, onCurrencyChange, label, error }) {
  const [open, setOpen] = useState(false);
  const ordered = getSavedOrder(accounts);
  const sel = ordered.find(a => a.id===value);
  return (
    <>
      <FieldLabel error={error}>{label||"Account"}</FieldLabel>
      <div onClick={() => setOpen(true)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${error?"rgba(244,67,54,0.5)":C.border}`, cursor:"pointer", marginBottom:16 }}>
        {sel ? (
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <CatIcon k={sel.icon} size={32} color={sel.color}/>
            <div><p style={{ margin:0, fontSize:14, color:"#fff" }}>{sel.name}</p><p style={{ margin:0, fontSize:12, color:C.dim }}>{fmtBal(sel.balance, sel.currency)}</p></div>
          </div>
        ) : <span style={{ fontSize:14, color:C.dim }}>Select account</span>}
        <Ico n="chevD" s={16} c={C.dim}/>
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Select account">
        {ordered.map(a => (
          <div key={a.id} onClick={() => { onChange(a.id); onCurrencyChange?.(a.currency); setOpen(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:value===a.id?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${value===a.id?"rgba(76,175,80,0.4)":C.border}` }}>
            <CatIcon k={a.icon} size={40} color={a.color}/>
            <div style={{ flex:1 }}><p style={{ margin:0, fontSize:14, color:"#fff" }}>{a.name}</p><p style={{ margin:0, fontSize:12, color:C.dim }}>{fmtBal(a.balance, a.currency)}</p></div>
            {value===a.id && <Ico n="check" s={18} c={C.green}/>}
          </div>
        ))}
      </BottomSheet>
    </>
  );
}
