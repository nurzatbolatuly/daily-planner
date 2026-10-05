import { C } from "../../../constants/theme";
import { chip, chipRow } from "./sharedUi";

// «＋ Человек / ＋ Гость / ＋ Без имени» (§12.2): новый участник группы. flexWrap, а не
// горизонтальный скролл (§12.0).
export function AddMemberChips({ onAddPerson, onAddGuest, onAddUnnamed, style }) {
  return (
    <div style={{ ...chipRow, ...style }}>
      {[["＋ Человек", onAddPerson], ["＋ Гость", onAddGuest], ["＋ Без имени", onAddUnnamed]].map(([label, fn]) => (
        <button key={label} onClick={fn} style={{ ...chip(), color:C.green }}>{label}</button>
      ))}
    </div>
  );
}
