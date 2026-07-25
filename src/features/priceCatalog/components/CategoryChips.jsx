import { C } from "../../../constants/theme";

// Категории каталога цен — только название (без иконки/цвета, в отличие от
// категорий Финансов). allLabel — необязательный первый пилл "Все" (value="all").
export function CategoryChips({ categories, value, onChange, allLabel }) {
  return (
    <div style={{ display:"flex", flexWrap: allLabel ? "nowrap" : "wrap", gap:8, overflowX: allLabel ? "auto" : "visible", paddingBottom: allLabel ? 4 : 0 }}>
      {allLabel && (
        <button onClick={() => onChange("all")} style={{ flexShrink:0, padding:"8px 14px", borderRadius:20, cursor:"pointer", border:"none", background:value==="all"?C.green:"rgba(255,255,255,0.06)", color:value==="all"?"#fff":C.mid, fontSize:13, fontWeight:600 }}>
          Все
        </button>
      )}
      {categories.map(c => (
        <button key={c.id} onClick={() => onChange(c.id)} style={{ flexShrink:0, padding:"8px 14px", borderRadius:20, cursor:"pointer", border:`1px solid ${value===c.id?C.green:C.border}`, background:value===c.id?C.green:"rgba(255,255,255,0.06)", color:value===c.id?"#fff":C.mid, fontSize:13, fontWeight:600 }}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
