import { useState } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { NumInput } from "../../../components/NumInput";
import { FieldLabel } from "../../../components/FieldLabel";
import { Ico } from "../../../components/Ico";
import { roundTo } from "../../../utils/format";
import { fieldInput, hintText, sheetBtn } from "./sharedUi";

// «За кого» в переводе (docs/shared-expenses.md §5.14): один платёж гасит несколько долгов —
// в этой группе и в других вечерах того же человека. Сумма распределяется по порядку (старые
// первыми), каждую часть можно поправить; Σ частей должна совпасть с суммой платежа.
//   parts: [{ key, label, groupName, debt, amount, removable }];
//   options: [{ key, label, groupName, debt }] — кого можно добавить (все кандидаты, кроме первого).
export function TransferPartsEditor({ parts, options, total, precision, fmt, sym, error, onChangeAmount, onToggle }) {
  const [open, setOpen] = useState(false);
  const selected = new Set(parts.map(p => p.key));
  const sum = roundTo(parts.reduce((s, p) => s + (Number(p.amount) || 0), 0), precision);
  const gap = roundTo(total - sum, precision);
  const isBatch = parts.length > 1;

  return (
    <div style={{ marginBottom:16 }}>
      {isBatch && (
        <>
          <FieldLabel error={error}>За кого</FieldLabel>
          {parts.map(p => {
            const rest = roundTo(p.debt - (Number(p.amount) || 0), precision);
            return (
              <div key={p.key} style={{ padding:"10px 12px", borderRadius:12, marginBottom:6, background:C.rowBg, border:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {p.label}{p.groupName ? <span style={{ color:C.dim, fontWeight:400 }}> · {p.groupName}</span> : null}
                  </span>
                  {p.removable && (
                    <button onClick={() => onToggle(p.key)} aria-label={`Убрать ${p.label}`} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4, flexShrink:0 }}>
                      <Ico n="trash" s={15} c={C.dim}/>
                    </button>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
                  <span style={{ flex:1, minWidth:0, fontSize:11, color: rest < 0 ? C.amber : C.dim }}>
                    долг {fmt(p.debt)} · {rest === 0 ? "закроется ✓" : rest > 0 ? `останется ${fmt(rest)}` : `переплата ${fmt(-rest)}`}
                  </span>
                  <NumInput value={String(p.amount ?? "")} onChange={v => onChangeAmount(p.key, v)} prefix={sym} aria-label={`Часть: ${p.label}${p.groupName ? ` · ${p.groupName}` : ""}`}
                    style={{ ...fieldInput(), width:"45%", padding:"8px 10px", textAlign:"right" }}/>
                </div>
              </div>
            );
          })}
          <p style={{ ...hintText, margin:"2px 0 8px", color: gap === 0 ? C.green : C.amber }}>
            {gap === 0 ? `Распределено ${fmt(total)} ✓` : gap > 0 ? `Не распределено ${fmt(gap)}` : `Распределено больше на ${fmt(-gap)}`}
          </p>
        </>
      )}

      {options.length > 0 && (
        <button onClick={() => setOpen(true)}
          style={{ display:"block", background:"none", border:"none", padding:0, color:C.green, fontSize:13, fontWeight:600, cursor:"pointer" }}>
          ＋ Этим же платежом закрыть ещё долг
        </button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="За кого ещё">
        <p style={{ ...hintText, margin:"0 0 10px", fontSize:12 }}>Долги в этой группе и в других группах того же человека.</p>
        {options.map(o => {
          const on = selected.has(o.key);
          return (
            <button key={o.key} onClick={() => onToggle(o.key)} role="checkbox" aria-checked={on}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", textAlign:"left",
                       background: on ? C.greenTint : C.rowBg, border:`1px solid ${on ? C.greenBorder : C.border}` }}>
              <span style={{ width:22, height:22, flexShrink:0, borderRadius:6, border:`2px solid ${on ? C.green : C.dim}`, background: on ? C.green : "transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {on && <Ico n="check" s={13} c="#fff"/>}
              </span>
              <span style={{ flex:1, minWidth:0 }}>
                <span style={{ display:"block", fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.label}</span>
                <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.groupName}</span>
              </span>
              <span style={{ fontSize:13, fontWeight:700, color:"#fff", whiteSpace:"nowrap", flexShrink:0 }}>{fmt(o.debt)}</span>
            </button>
          );
        })}
        <button onClick={() => setOpen(false)} style={{ ...sheetBtn("primary"), marginTop:8 }}>Готово</button>
      </BottomSheet>
    </div>
  );
}
