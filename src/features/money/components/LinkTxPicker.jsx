import { useState } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { fmtEventDate } from "../../../utils/sharedSave";
import { hintText } from "./sharedUi";

// «Уже записан? Выбрать транзакцию» (docs/shared-expenses.md §5.13): перевод уже внесён обычной
// операцией — привязываем её, а не создаём вторую. candidates — linkableTransactions (тот же счёт,
// тип и сумма, ±7 дней). Привязанная — карточкой; отвязать можно, пока запись не сохранена.
export function LinkTxPicker({ candidates, linked, canUnlink, fmt, onLink, onUnlink }) {
  const [open, setOpen] = useState(false);

  if (linked) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:16, background:C.infoTint, border:`1px solid ${C.infoBorder}` }}>
        <Ico n="transfer" s={16} c={C.blue}/>
        <span style={{ flex:1, minWidth:0, fontSize:13, color:C.mid, lineHeight:1.4, overflowWrap:"anywhere" }}>
          Привязано к операции {fmtEventDate(linked.date)} · {fmt(Number(linked.amount))}{linked.note ? ` · «${linked.note}»` : ""}
        </span>
        {canUnlink && (
          <button onClick={onUnlink} aria-label="Отвязать" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4, flexShrink:0 }}>
            <Ico n="trash" s={16} c={C.dim}/>
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display:"block", background:"none", border:"none", padding:0, margin:"-6px 0 16px", color:C.green, fontSize:13, fontWeight:600, cursor:"pointer" }}>
        Уже записан? Выбрать транзакцию ›
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Уже записанная операция">
        {candidates.length === 0 && (
          <p style={{ ...hintText, fontSize:13 }}>Нет операций на этом счёте на ту же сумму за ±7 дней, ещё не связанных с группами и «Долгами».</p>
        )}
        {candidates.map(t => (
          <button key={t.id} onClick={() => { setOpen(false); onLink(t); }}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, marginBottom:6, background:C.monCard, border:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" }}>
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ display:"block", fontSize:14, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.note || "Без комментария"}</span>
              <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim }}>{fmtEventDate(t.date)}</span>
            </span>
            <span style={{ fontSize:14, fontWeight:700, color:"#fff", whiteSpace:"nowrap", flexShrink:0 }}>{fmt(Number(t.amount))}</span>
          </button>
        ))}
        {candidates.length > 0 && <p style={{ ...hintText, margin:"8px 0 0" }}>Операция останется на счёте, но станет переводом: категория снимется, в статистику не попадёт.</p>}
      </BottomSheet>
    </>
  );
}
