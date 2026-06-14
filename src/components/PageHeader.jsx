import { C } from "../constants/theme";
import { Ico } from "./Ico";

export function PageHeader({ title, onBack, right }) {
  return (
    <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
        <Ico n="back" s={22}/>
      </button>
      <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff", textAlign:"left" }}>{title}</span>
      {right ?? <div style={{ width:30 }}/>}
    </div>
  );
}
