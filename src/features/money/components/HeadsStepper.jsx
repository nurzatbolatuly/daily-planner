import { C } from "../../../constants/theme";

export const MAX_HEADS = 50;

// «Сколько человек» за участником: − N +. Шторка участника в счёте и настройки группы.
export function HeadsStepper({ value, onChange, max = MAX_HEADS }) {
  const btn = disabled => ({ width:40, height:40, borderRadius:20, border:`1px solid ${C.border}`, background:C.fieldBg,
                             color: disabled ? C.dim : "#fff", fontSize:20, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 });
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:6 }}>
      <button onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} style={btn(value <= 1)} aria-label="Меньше">−</button>
      <span style={{ fontSize:20, fontWeight:700, minWidth:28, textAlign:"center" }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} style={btn(value >= max)} aria-label="Больше">+</button>
    </div>
  );
}
