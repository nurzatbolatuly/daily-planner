import { C } from "../../../constants/theme";
import { FieldLabel } from "../../../components/FieldLabel";
import { PAY_PLACE_MAX } from "../../../utils/billItems";
import { chip, chipRow } from "./sharedUi";

// «Где платить» (v42) — у платежей и кредитов. Свободный текст + подсказки из того, что
// пользователь уже вводил (payPlaceSuggestions) — без зашитого списка банков.
export function PayPlaceField({ value, onChange, suggestions = [], style }) {
  const q = value.trim().toLocaleLowerCase();
  const visible = suggestions.filter(s => {
    const k = s.toLocaleLowerCase();
    return k !== q && (!q || k.includes(q));
  });

  return (
    <div style={{ marginBottom:24, ...style }}>
      <FieldLabel>Где платить (необязательно)</FieldLabel>
      <input value={value} onChange={e => onChange(e.target.value)} maxLength={PAY_PLACE_MAX}
        placeholder="Kaspi, eGov, автосписание…" enterKeyHint="done"
        style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:16, padding:"4px 0", boxSizing:"border-box" }}/>
      {visible.length > 0 && (
        <div style={{ ...chipRow, marginTop:10 }}>
          {visible.map(s => (
            <button key={s} type="button" onClick={() => onChange(s)} style={{ ...chip(false), padding:"6px 12px", fontSize:12 }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
