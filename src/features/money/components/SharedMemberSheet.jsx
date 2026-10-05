import { useState } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { NumInput } from "../../../components/NumInput";
import { Toggle } from "../../../components/Toggle";
import { FieldLabel } from "../../../components/FieldLabel";
import { fieldInput, sheetBtn, hintText } from "./sharedUi";
import { HeadsStepper } from "./HeadsStepper";

// Шторка участника в счёте (§12.2): сколько человек за ним в ЭТОМ счёте, поровну или фикс,
// личная позиция (§5.9), участвует ли. Изменения применяются сразу (onChange(patch)) — кнопка
// «Готово» только закрывает. canRemove — участник ещё не сохранён в БД (добавлен в этой форме
// по ошибке) → можно убрать. onSplitOut — «Выделить человека» из компашки (только при × 2+).
// simple — способ деления не «поровну» (проценты, части, суммы вводятся прямо в списке): здесь
// только «участвует» и «убрать». onRename — название участника («Компашка Асана»); пусто —
// автоподпись (namePlaceholder). Название — у участника, а не у счёта: видно во всех счетах.
export function SharedMemberSheet({ label, row, sym, isMe, canRemove, onChange, onRemove, onSplitOut, onClose, simple = false, nameValue = "", namePlaceholder = "", onRename }) {
  const [extraOpen, setExtraOpen] = useState(() => Number(row.extra) > 0);
  const fixed = row.mode === "fixed";

  return (
    <BottomSheet open onClose={onClose} title={label}>
      {!isMe && onRename && (
        <>
          <FieldLabel>Название</FieldLabel>
          <input value={nameValue} onChange={e => onRename(e.target.value || null)} placeholder={namePlaceholder} aria-label="Название участника"
            style={{ ...fieldInput(), marginBottom:16 }}/>
        </>
      )}
      <div style={{ padding:"10px 14px", borderRadius:12, background:C.segmentBg, marginBottom:16 }}>
        <Toggle value={row.included} onChange={v => onChange({ included: v })} label="Участвует в этом счёте"/>
      </div>

      {row.included && !simple && (
        <>
          <FieldLabel>Сколько человек</FieldLabel>
          <HeadsStepper value={row.heads} onChange={heads => onChange({ heads })}/>
          <p style={hintText}>
            {isMe ? "Например, «Я × 2», если вы платите ещё за кого-то." : "Компашка, за которую вернёт один человек. Только для этого счёта."}
          </p>

          <FieldLabel>Доля</FieldLabel>
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            {[["auto", "Поровну"], ["fixed", "Фикс сумма"]].map(([mode, title]) => (
              <button key={mode} onClick={() => onChange({ mode })}
                style={{ flex:1, padding:"10px 6px", borderRadius:10, border:"none", cursor:"pointer", fontSize:13, fontWeight:700,
                         background: row.mode === mode ? "rgba(96,165,250,0.18)" : C.fieldBg, color: row.mode === mode ? C.blue : C.dim }}>
                {title}
              </button>
            ))}
          </div>
          {fixed && (
            <NumInput value={row.value ?? ""} onChange={v => onChange({ value: v })} placeholder="0" prefix={sym}
              style={{ ...fieldInput(), marginBottom:12 }}/>
          )}
          <p style={hintText}>
            {fixed ? "Точная сумма за участника целиком. Остаток делят остальные." : "Остаток после фиксированных сумм делится поровну по количеству человек."}
          </p>

          {extraOpen ? (
            <>
              <FieldLabel>Личное — только для {isMe ? "вас" : "этого участника"}</FieldLabel>
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <NumInput value={row.extra ?? ""} onChange={v => onChange({ extra: v })} placeholder="0" prefix={sym}
                  style={{ ...fieldInput(), flex:"0 0 40%", minWidth:0 }}/>
                <input value={row.extraNote ?? ""} onChange={e => onChange({ extraNote: e.target.value })} placeholder="Что, например кальян"
                  style={{ ...fieldInput(), flex:1, minWidth:0 }}/>
              </div>
              <button onClick={() => { onChange({ extra: "", extraNote: "" }); setExtraOpen(false); }}
                style={{ background:"none", border:"none", padding:"4px 0", color:C.dim, fontSize:12, cursor:"pointer", marginBottom:6 }}>
                Убрать личное
              </button>
              <p style={hintText}>Сначала вычитается из счёта, остаток делится поровну, а личное добавляется сверху.</p>
            </>
          ) : (
            <button onClick={() => setExtraOpen(true)} style={{ ...sheetBtn("secondary"), marginBottom:16 }}>
              ＋ Личное — заказал только себе
            </button>
          )}

          {onSplitOut && row.heads > 1 && (
            <>
              <button onClick={onSplitOut} style={{ ...sheetBtn("secondary"), marginBottom:6 }}>Выделить человека</button>
              <p style={hintText}>Если кто-то из компашки будет возвращать деньги сам. Станет отдельным участником × 1, у компашки — на одного меньше.</p>
            </>
          )}
        </>
      )}

      <button onClick={onClose} style={{ ...sheetBtn("primary"), marginBottom: canRemove ? 10 : 0 }}>Готово</button>
      {canRemove && <button onClick={onRemove} style={sheetBtn("danger")}>Убрать из группы</button>}
    </BottomSheet>
  );
}
