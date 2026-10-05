import { C } from "../../../constants/theme";
import { FieldLabel } from "../../../components/FieldLabel";
import { chip, chipRow, segmentWrap, segmentBtn, hintText } from "./sharedUi";

// «Платил: Я / участник» в форме счёта (docs/shared-expenses.md §5.7, §12.2). Участник-плательщик
// выбирается из участников группы; если их ещё нет — подсказка добавить в «Кого покрыл».
//   payerId: meId — платил я; null — выбран «участник», но кто именно — ещё нет.
export function SharedPayerPicker({ members, meId, payerId, labelOf, onChange, error }) {
  const others = members.filter(m => m.id !== meId);
  const iPaid = payerId === meId;

  return (
    <div style={{ marginBottom:16 }}>
      <FieldLabel error={error}>Платил</FieldLabel>
      <div style={{ ...segmentWrap, marginBottom: iPaid ? 0 : 10 }}>
        <button onClick={() => onChange(meId)} style={segmentBtn(iPaid)}>Я</button>
        <button onClick={() => { if (iPaid) onChange(others[0]?.id ?? null); }} style={segmentBtn(!iPaid)}>Участник</button>
      </div>
      {!iPaid && (others.length > 0 ? (
        <div style={chipRow}>
          {others.map(m => (
            <button key={m.id} onClick={() => onChange(m.id)}
              style={{ ...chip(m.id === payerId), maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {labelOf(m)}
            </button>
          ))}
        </div>
      ) : (
        <p style={{ ...hintText, margin:0, color:C.mid }}>Добавьте участника в «Кого покрыл» ниже — его можно будет выбрать.</p>
      ))}
    </div>
  );
}
