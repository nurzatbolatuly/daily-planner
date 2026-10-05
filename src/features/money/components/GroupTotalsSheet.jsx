import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { fmtAmtAuto } from "../../../utils/format";

const KIND_TEXT = { person: "из «Люди»", guest: "гость", unnamed: "без имени", group: "Tricount" };

// Разбивка общих итогов по людям, гостям и квартирам (docs/shared-expenses.md §12.1). Суммы —
// в базовой валюте по текущим курсам; тап — карточка человека или экран группы.
export function GroupTotalsSheet({ totals, baseSym, onOpenPerson, onOpenGroup, onClose }) {
  return (
    <BottomSheet open onClose={onClose} title="Кто кому должен">
      {totals.rows.map(r => {
        const net = r.owedToMe - r.iOwe;
        const groupsText = r.items.map(i => i.group.name + (i.group.archived ? " (архив)" : "")).join(", ");
        const open = () => (r.personId ? onOpenPerson(r.personId) : onOpenGroup(r.items[0].group.id));
        return (
          <button key={r.key} onClick={open}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px", borderRadius:12, marginBottom:6, background:C.monCard, border:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" }}>
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ display:"block", fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
              <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {KIND_TEXT[r.kind]}{r.kind !== "group" ? ` · ${groupsText}` : ""}
              </span>
            </span>
            <span style={{ textAlign:"right", flexShrink:0 }}>
              <span style={{ display:"block", fontSize:14, fontWeight:700, color: net >= 0 ? C.green : C.errorLight, whiteSpace:"nowrap" }}>{baseSym}{fmtAmtAuto(Math.abs(net))}</span>
              <span style={{ display:"block", fontSize:11, color:C.dim }}>{net >= 0 ? "мне должны" : "я должен"}</span>
            </span>
            <Ico n="chevR" s={14} c={C.dim}/>
          </button>
        );
      })}
      <p style={{ margin:"8px 0 0", fontSize:11, color:C.dim, lineHeight:1.4 }}>
        Суммы в {baseSym} по текущим курсам. Долги в группах не складываются с личными из «Долгов».
      </p>
    </BottomSheet>
  );
}
