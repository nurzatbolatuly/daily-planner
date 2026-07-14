import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";

const initials = name => (name || "?").trim().charAt(0).toUpperCase();

// Универсальная строка человека: пикер (selected+onClick) и сводка долгов (right) — один компонент.
export function PersonRow({ person, right, selected, onClick }) {
  return (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px", borderRadius:12, marginBottom:6, cursor: onClick ? "pointer" : "default", background: selected ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.03)", border:`1px solid ${selected ? "rgba(76,175,80,0.4)" : C.border}` }}>
      <div style={{ width:40, height:40, borderRadius:20, background: person.color || C.green, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{initials(person.name)}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:15, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{person.name}</p>
      </div>
      {right}
      {selected && <Ico n="check" s={18} c={C.green}/>}
    </div>
  );
}
