import { C } from "../../../constants/theme";

// Вариант выбора с радиокнопкой: заголовок + необязательная подсказка. Закрытие долга (§9),
// закрытие вечера и удаление группы (§7.6).
export function RadioOption({ checked, label, hint, onSelect }) {
  return (
    <button onClick={onSelect} role="radio" aria-checked={checked}
      style={{ width:"100%", display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
      <span style={{ width:18, height:18, marginTop:1, flexShrink:0, borderRadius:9, border:`2px solid ${checked ? C.green : C.dim}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {checked && <span style={{ width:8, height:8, borderRadius:4, background:C.green }}/>}
      </span>
      <span style={{ minWidth:0 }}>
        <span style={{ display:"block", fontSize:14, color:"#fff" }}>{label}</span>
        {hint && <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim, lineHeight:1.4 }}>{hint}</span>}
      </span>
    </button>
  );
}
