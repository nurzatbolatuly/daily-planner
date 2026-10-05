import { useState } from "react";
import { C } from "../../../constants/theme";
import { SHARED_MODES } from "../../../constants/money";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { fmtEventDate } from "../../../utils/sharedSave";
import { sheetBtn, hintText } from "./sharedUi";

// «Сделать общим» в TxPage (docs/shared-expenses.md §5.13): расход уже записан — привязываем его
// к счёту группы, не создавая новую транзакцию. Куда: новый вечер или открытый вечер.
// Недоступно, если транзакция уже связана с «Долгами» (сплит «Оплатил за других» или долг):
// иначе доли учлись бы дважды.
export function MakeSharedButton({ tx, debtEvents, groups, onPick }) {
  const [open, setOpen] = useState(false);
  const debtLinks = debtEvents.filter(e => e.transaction_id === tx.id);
  const blocked = debtLinks.length > 0;
  const reason = debtLinks.some(e => e.type === "paid_for_them")
    ? "Сначала уберите разделение с людьми — иначе доли учтутся дважды"
    : "Транзакция связана с «Долгами»";
  const evenings = groups
    .filter(g => g.mode === SHARED_MODES.event && !g.archived)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const pick = groupId => { setOpen(false); onPick(groupId); };

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={blocked}
        style={{ ...sheetBtn("secondary", blocked), marginTop:10, color:C.green }}>
        <Ico n="plus" s={15} c={C.green}/> Сделать общим
      </button>
      <p style={{ ...hintText, textAlign:"center", margin:"6px 0 0" }}>
        {blocked ? reason : "Разделить с друзьями — в расходы попадёт только ваша доля"}
      </p>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Куда добавить">
        <button onClick={() => pick(null)} style={{ ...sheetBtn("primary"), marginBottom:12 }}>
          <Ico n="plus" s={15} c="#fff"/> Новая туса
        </button>
        {evenings.map(g => (
          <button key={g.id} onClick={() => pick(g.id)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, marginBottom:6, background:C.monCard, border:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" }}>
            <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.name}</span>
            {g.date && <span style={{ fontSize:12, color:C.dim, flexShrink:0 }}>{fmtEventDate(g.date)}</span>}
            <Ico n="chevR" s={16} c={C.dim}/>
          </button>
        ))}
      </BottomSheet>
    </>
  );
}
