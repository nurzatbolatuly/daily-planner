import { useState } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { SHARED_SPLIT_METHODS } from "./coverageRows";
import { RadioOption } from "./RadioOption";

const METHOD_HINT = {
  equal:   "Каждому одинаково",
  percent: "У каждого свой процент, в сумме 100%",
  parts:   "Пропорционально: у кого 2 части — платит вдвое больше",
  amount:  "Каждому точная сумма, в сумме — весь счёт",
};

// Способ деления (docs/shared-expenses.md §8.1) — компактная кнопка-селект справа в заголовке
// состава: «Поровну ▾». Тап — шторка с вариантами, как в Tricount.
export function SplitMethodPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = SHARED_SPLIT_METHODS.find(m => m.id === value) || SHARED_SPLIT_METHODS[0];
  const pick = id => { setOpen(false); onChange(id); };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Как делить" aria-haspopup="dialog"
        style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 10px", borderRadius:16, border:`1px solid ${C.border}`,
                 background:C.fieldBg, color:C.green, fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0, marginBottom:6 }}>
        {current.label}
        <span style={{ display:"flex", transform:"rotate(90deg)" }}><Ico n="chevR" s={12} c={C.green}/></span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Как делить">
        {SHARED_SPLIT_METHODS.map(m => (
          <RadioOption key={m.id} checked={value === m.id} label={m.label} hint={METHOD_HINT[m.id]} onSelect={() => pick(m.id)}/>
        ))}
      </BottomSheet>
    </>
  );
}
