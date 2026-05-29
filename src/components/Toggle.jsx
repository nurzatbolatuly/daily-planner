import { C } from "../constants/theme";

export function Toggle({ value, onChange, label }) {
  return (
    <div onClick={() => onChange(!value)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
      {label && <span style={{ fontSize:14, color:C.mid }}>{label}</span>}
      <div style={{ width:44, height:24, borderRadius:12, background:value?C.green:"rgba(255,255,255,0.15)", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
        <div style={{ width:20, height:20, borderRadius:10, background:"#fff", position:"absolute", top:2, left:value?22:2, transition:"left 0.2s" }}/>
      </div>
    </div>
  );
}
