import { useState } from "react";
import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

export function CatsListPageMon({ expCats, incCats, navigate, onBack }) {
  const [tab, setTab] = useState("expense");

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Categories</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 80px" }}>
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
          {[["expense","EXPENSES"],["income","INCOME"]].map(([v,l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex:1, padding:"10px 0", background:"none", border:"none", cursor:"pointer", fontSize:12, fontWeight:700, color:tab===v?"#fff":C.dim, borderBottom:tab===v?"2px solid #fff":"2px solid transparent" }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
          {(tab === "expense" ? expCats : incCats).map(c => (
            <button key={c.id} onClick={() => navigate("editCat", {...c, catType:tab})} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 4px", borderRadius:14, background:C.monCard, border:"none", cursor:"pointer" }}>
              <CatIcon k={c.icon} size={52} color={c.color}/>
              <span style={{ fontSize:11, color:C.mid, textAlign:"center", lineHeight:1.2 }}>{c.name}</span>
            </button>
          ))}
          <button onClick={() => navigate("addCat", {catType:tab})} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 4px", borderRadius:14, background:C.monCard, border:"none", cursor:"pointer" }}>
            <div style={{ width:52, height:52, borderRadius:26, background:C.yellow, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Ico n="plus" s={24} c="#fff"/>
            </div>
            <span style={{ fontSize:11, color:C.dim }}>Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}
