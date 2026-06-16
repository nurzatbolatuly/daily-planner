import { useState } from "react";
import { C } from "../constants/theme";
import { MAIN_CURR, METAL_CURR, ALL_CURR } from "../constants/currencies";
import { Ico } from "./Ico";

export function CurrencyPage({ value, onSelect, onBack }) {
  const [q, setQ] = useState("");
  const otherCodes = new Set([...MAIN_CURR, ...METAL_CURR].map(c => c.code));
  const other = ALL_CURR.filter(c => !otherCodes.has(c.code));
  const fl = arr => q
    ? arr.filter(c => c.code.toLowerCase().includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase()))
    : arr;

  const row = (c, accent) => (
    <div
      key={c.code}
      onClick={() => { onSelect(c.code); onBack(); }}
      style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 12px", borderRadius:10, cursor:"pointer", background: value === c.code ? "rgba(76,175,80,0.12)" : "transparent", marginBottom:2 }}
    >
      <span style={{ width:46, fontSize:14, fontWeight:700, color: accent || C.dim }}>{c.code}</span>
      <span style={{ flex:1, fontSize:14, color:C.mid }}>{c.name}</span>
      {value === c.code && <Ico n="check" s={16} c={C.green}/>}
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ fontSize:17, fontWeight:600, color:"#fff" }}>Выбор валюты</span>
      </div>
      <div style={{ padding:"12px 16px" }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Поиск..."
          style={{ width:"100%", background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" }}
        />
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"0 16px 40px" }}>
        {!q && <p style={{ fontSize:12, fontWeight:700, color:C.green, marginBottom:8 }}>Основные</p>}
        {fl(MAIN_CURR).map(c => row(c, C.green))}

        {!q && fl(METAL_CURR).length > 0 && (
          <>
            <div style={{ height:1, background:C.border, margin:"8px 0" }}/>
            <p style={{ fontSize:12, fontWeight:700, color:"#f9a825", marginBottom:8 }}>Металлы</p>
            {METAL_CURR.map(c => row(c, "#f9a825"))}
          </>
        )}
        {q && fl(METAL_CURR).map(c => row(c, "#f9a825"))}

        {!q && (
          <>
            <div style={{ height:1, background:C.border, margin:"8px 0" }}/>
            <p style={{ fontSize:12, fontWeight:700, color:C.dim, marginBottom:8 }}>Все валюты</p>
          </>
        )}
        {fl(other).map(c => row(c, null))}
      </div>
    </div>
  );
}
