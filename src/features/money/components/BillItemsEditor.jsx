import { useState } from "react";
import { C } from "../../../constants/theme";
import { NumInput } from "../../../components/NumInput";
import { FieldLabel } from "../../../components/FieldLabel";
import { Ico } from "../../../components/Ico";
import { newId } from "../../../utils/id";
import { fmtAmtAuto } from "../../../utils/format";
import { billItemsTotal, billItemsProgress } from "../../../utils/billItems";
import { fieldInput, hintText } from "./sharedUi";

// «Состав» ежемесячного платежа (v42): несколько мелких трат, объединённых в одну строку.
//   items: [{ id, name, amount (строка ввода) }] — контролируется родителем (BillFormPage).
//   Итог считает родитель через billItemsTotal — здесь только ввод и подсказка.
export function BillItemsEditor({ items, onChange, sym }) {
  const [focusId, setFocusId] = useState(null);
  const patch = (id, p) => onChange(items.map(i => (i.id === id ? { ...i, ...p } : i)));
  const add = () => {
    const id = newId();
    setFocusId(id);
    onChange([...items, { id, name: "", amount: "" }]);
  };

  const total = billItemsTotal(items);
  const { sum, missing } = billItemsProgress(items);

  return (
    <div style={{ marginBottom:24 }}>
      <FieldLabel>Состав (необязательно)</FieldLabel>
      {items.map(i => (
        <div key={i.id} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
          <input value={i.name} onChange={e => patch(i.id, { name: e.target.value })}
            autoFocus={i.id === focusId} placeholder="Spotify" aria-label="Название позиции"
            style={{ ...fieldInput(), flex:1, minWidth:0, padding:"10px 12px" }}/>
          <NumInput value={i.amount} onChange={v => patch(i.id, { amount: v })} placeholder="0" prefix={sym}
            aria-label={`Сумма: ${i.name || "позиция"}`}
            style={{ ...fieldInput(), width:"34%", maxWidth:130, padding:"10px 12px", textAlign:"right" }}/>
          <button onClick={() => onChange(items.filter(x => x.id !== i.id))} aria-label={`Убрать: ${i.name || "позиция"}`}
            style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:6, flexShrink:0 }}>
            <Ico n="trash" s={16} c={C.dim}/>
          </button>
        </div>
      ))}
      <button onClick={add}
        style={{ display:"block", background:"none", border:"none", padding:"6px 0", color:C.green, fontSize:13, fontWeight:600, cursor:"pointer" }}>
        ＋ Позиция
      </button>
      <p style={{ ...hintText, margin:"4px 0 0" }}>
        {items.length === 0
          ? "Объединяете несколько мелких трат в один платёж? Перечислите их — состав будет виден в списке и в истории."
          : total != null
            ? `Сумма платежа считается из позиций: ${sym}${fmtAmtAuto(total)}`
            : `Указано ${sym}${fmtAmtAuto(sum)}, без суммы: ${missing} — итог введите выше вручную.`}
      </p>
    </div>
  );
}
