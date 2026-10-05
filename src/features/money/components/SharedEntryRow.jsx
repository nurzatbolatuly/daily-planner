import { C } from "../../../constants/theme";
import { CatIcon } from "../../../components/CatIcon";
import { fmtAmtAuto } from "../../../utils/format";

// Строка ленты группы (§12.3). Этап 5 — счета; переводы и корректировки добавятся на этапе 6.
//   title — что, sub — вторая строка («Kaspi · 3 октября»), amount — сумма справа, hint — под ней.
export function SharedEntryRow({ cat, title, sub, amount, hint, sym, onClick }) {
  return (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:C.rowBg, border:`1px solid ${C.border}` }}>
      <CatIcon k={cat?.icon || "other"} size={36} color={cat?.color || C.dim}/>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</p>
        {sub && <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub}</p>}
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <p style={{ margin:0, fontSize:14, fontWeight:700, color:"#fff", whiteSpace:"nowrap" }}>{sym}{fmtAmtAuto(amount)}</p>
        {hint && <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, whiteSpace:"nowrap" }}>{hint}</p>}
      </div>
    </div>
  );
}
