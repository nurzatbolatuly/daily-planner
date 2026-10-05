import { C } from "../../../constants/theme";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { Ico } from "../../../components/Ico";
import { fmtEventDate } from "../../../utils/sharedSave";
import { fieldInput, segmentWrap, segmentBtn, hintText } from "./sharedUi";

// Поля группы Tricount (docs/shared-expenses.md §5.1c) в создании и настройках: начальный баланс
// из Tricount на дату старта.
//   opening: { side: "owe" | "owed", amount, date }
export function MirrorSettingsFields({ opening, onOpeningChange, sym, onPickDate }) {
  return (
    <>
      <FieldLabel>Начальный баланс в Tricount</FieldLabel>
      <div style={{ ...segmentWrap, marginBottom:10 }}>
        <button onClick={() => onOpeningChange({ side: "owe" })} style={segmentBtn(opening.side === "owe")}>Я должен</button>
        <button onClick={() => onOpeningChange({ side: "owed" })} style={segmentBtn(opening.side === "owed")}>Мне должны</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:6 }}>
        <NumInput value={opening.amount} onChange={amount => onOpeningChange({ amount })} placeholder="0" prefix={sym} aria-label="Начальный баланс"
          style={{ ...fieldInput(), flex:1, minWidth:0 }}/>
        <button onClick={onPickDate} aria-label="Дата начального баланса"
          style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", borderRadius:10, background:C.fieldBg, border:`1px solid ${C.border}`, color:"#fff", fontSize:13, cursor:"pointer", flexShrink:0 }}>
          <Ico n="calendar" s={14} c={C.dim}/> {fmtEventDate(opening.date)}
        </button>
      </div>
      <p style={hintText}>Если в Tricount уже есть долги прошлых месяцев — внесите итог, покупки задним числом не нужны. В статистику не попадёт.</p>
    </>
  );
}
