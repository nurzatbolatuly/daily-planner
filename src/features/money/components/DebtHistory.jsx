import { C } from "../../../constants/theme";
import { DEBT_EVENT_TYPES } from "../../../constants/money";
import { fmtAmtAuto, fmtDateShort, getSym } from "../../../utils/format";
import { Ico } from "../../../components/Ico";

const TYPE_LABEL = Object.fromEntries(DEBT_EVENT_TYPES.map(t => [t.key, t.label]));

// Лента событий ledger'а долга одного человека. events уже отсортированы
// вызывающей стороной (utils/debtLedger.personHistory) — компонент только рендерит.
// Событие с transaction_id (сплит расхода, "взял в долг", возврат) — двигало реальные
// деньги, поэтому тап открывает саму транзакцию (правка/удаление там, чтобы баланс
// счёта и долг всегда правились вместе, одним и тем же кодом). Событие без
// transaction_id — запись off-book ("Мне должны" из DebtFormPage, остаток при
// прощении), деньги не двигались — можно удалить прямо здесь.
// Зачёт с общей группой (type offset, docs/shared-expenses.md §10) — половина записи группы:
// корзины нет, тап открывает перевод в группе (там правка и удаление обеих половин сразу).
export function DebtHistory({ events, onOpenTx, onOpenOffset, onDelete }) {
  if (!events.length) {
    return <p style={{ textAlign:"center", padding:"24px 0", color:C.dim, fontSize:13 }}>Нет событий</p>;
  }
  return (
    <div>
      {events.map(e => {
        const positive = e.amount >= 0;
        const isOffset = e.type === "offset";
        const linked = !!e.transaction_id || isOffset;
        const open = isOffset ? () => onOpenOffset?.(e) : () => onOpenTx?.(e);
        return (
          <div
            key={e.id}
            onClick={linked ? open : undefined}
            role={linked ? "button" : undefined}
            style={{ display:"flex", alignItems:"center", padding:"12px 0", borderBottom:`1px solid ${C.border}`, cursor: linked ? "pointer" : "default" }}
          >
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, color:"#fff" }}>{TYPE_LABEL[e.type] || e.type}</p>
              <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {fmtDateShort(e.date)}{e.note ? ` · ${e.note}` : ""}
              </p>
            </div>
            <span style={{ fontSize:15, fontWeight:700, color: positive ? C.green : C.errorLight, flexShrink:0, marginLeft:10 }}>
              {positive ? "+" : "−"}{getSym(e.currency)}{fmtAmtAuto(Math.abs(e.amount))}
            </span>
            {linked ? (
              <span style={{ marginLeft:8, display:"flex", flexShrink:0 }}><Ico n="chevR" s={16} c={C.dim}/></span>
            ) : (
              <button
                onClick={ev => { ev.stopPropagation(); onDelete?.(e); }} aria-label="Удалить запись"
                style={{ marginLeft:8, flexShrink:0, background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}
              >
                <Ico n="trash" s={16} c={C.dim}/>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
