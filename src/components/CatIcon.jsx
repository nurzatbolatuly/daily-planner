import { EXP_ICONS, INC_ICONS, ACC_ICONS } from "../constants/icons";
import { C } from "../constants/theme";

const ALL_ICONS = { ...EXP_ICONS, ...INC_ICONS, ...ACC_ICONS };

export function CatIcon({ k, size = 28, color = C.green }) {
  const entry = ALL_ICONS[k] || EXP_ICONS.other;

  // Объектный формат { vb, svg }: рендерим через CSS-маску.
  // Маска красит форму SVG в белый по альфа-каналу — не зависит от
  // viewBox, fill/stroke, трансформаций и лишних элементов.
  if (typeof entry === "object" && entry !== null) {
    const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${entry.vb || "0 0 24 24"}">${entry.svg}</svg>`;
    const mask = `url("data:image/svg+xml,${encodeURIComponent(full)}") center / contain no-repeat`;
    return (
      <div style={{ width:size, height:size, borderRadius:size/2, background:color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <div style={{ width:size*0.6, height:size*0.6, background:"#fff", WebkitMask:mask, mask }}/>
      </div>
    );
  }

  // Строковый формат (Lucide, stroke-based, координаты 0-24)
  return (
    <div style={{ width:size, height:size, borderRadius:size/2, background:color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <svg width={size*0.65} height={size*0.65} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {(entry || "").split("M").filter(Boolean).map((p, i) => <path key={i} d={`M${p}`}/>)}
      </svg>
    </div>
  );
}
