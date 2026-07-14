import { C } from "../../../constants/theme";
import { DEBT_EVENT_TYPES } from "../../../constants/money";
import { fmtAmtAuto, fmtDateShort, getSym } from "../../../utils/format";

const TYPE_LABEL = Object.fromEntries(DEBT_EVENT_TYPES.map(t => [t.key, t.label]));

// Лента событий ledger'а долга одного человека. events уже отсортированы
// вызывающей стороной (utils/debtLedger.personHistory) — компонент только рендерит.
export function DebtHistory({ events }) {
  if (!events.length) {
    return <p style={{ textAlign:"center", padding:"24px 0", color:C.dim, fontSize:13 }}>Нет событий</p>;
  }
  return (
    <div>
      {events.map(e => {
        const positive = e.amount >= 0;
        return (
          <div key={e.id} style={{ display:"flex", alignItems:"center", padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, color:"#fff" }}>{TYPE_LABEL[e.type] || e.type}</p>
              <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {fmtDateShort(e.date)}{e.note ? ` · ${e.note}` : ""}
              </p>
            </div>
            <span style={{ fontSize:15, fontWeight:700, color: positive ? C.green : C.errorLight, flexShrink:0, marginLeft:10 }}>
              {positive ? "+" : "−"}{getSym(e.currency)}{fmtAmtAuto(Math.abs(e.amount))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
