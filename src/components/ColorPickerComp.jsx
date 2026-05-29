import { PALETTE } from "../constants/money";
import { Ico } from "./Ico";

export function ColorPickerComp({ value, onChange }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
      {PALETTE.map(c => (
        <button key={c} onClick={() => onChange(c)} style={{ width:32, height:32, borderRadius:16, background:c, border:value===c?"3px solid #fff":"3px solid transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {value===c && <Ico n="check" s={12} c={c==="#ffffff"?"#000":"#fff"}/>}
        </button>
      ))}
    </div>
  );
}
