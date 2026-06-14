import { C } from "../constants/theme";
import { CatIcon } from "./CatIcon";

export function CategoryPicker({ cats, value, onChange, multi = false, cols = "repeat(auto-fill, minmax(64px, 1fr))" }) {
  const isSelected = (id) => multi ? value.includes(id) : value === id;
  const toggle = (id) => {
    if (multi) {
      onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
    } else {
      onChange(id);
    }
  };
  return (
    <div style={{ display:"grid", gridTemplateColumns:cols, gap:10 }}>
      {cats.map(c => {
        const sel = isSelected(c.id);
        return (
          <button key={c.id} onClick={() => toggle(c.id)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"10px 4px", borderRadius:12, background:sel ? c.color : multi ? "rgba(255,255,255,0.04)" : "transparent", border: multi ? `2px solid ${sel ? c.color : C.border}` : "none", cursor:"pointer" }}>
            <CatIcon k={c.icon} size={44} color={sel ? "rgba(0,0,0,0.25)" : c.color}/>
            <span style={{ fontSize:11, color:sel ? "#fff" : C.mid, textAlign:"center", wordBreak:"break-word" }}>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
