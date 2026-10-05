import { useMemo } from "react";
import { C } from "../../../constants/theme";
import { guestNameSuggestions } from "../../../utils/sharedExpenses";
import { fieldInput, chip, chipRow } from "./sharedUi";

// Имя гостя с подсказками из прошлых вечеров (docs/shared-expenses.md §7.2): повторно вводить
// не нужно — тап по подсказке сразу выбирает имя (onPick). Подсказки — guestNameSuggestions
// по уже загруженным shared_members, отдельной таблицы нет.
//   members — все участники всех групп; exclude — имена, уже занятые в этой группе.
export function GuestNameInput({ value, onChange, onSubmit, onPick, members, exclude, autoFocus, placeholder = "Например, Асан" }) {
  const suggestions = useMemo(() => guestNameSuggestions(members, value, { exclude }), [members, value, exclude]);
  return (
    <>
      <input value={value} autoFocus={autoFocus} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onSubmit?.()}
        enterKeyHint="done" autoComplete="off" placeholder={placeholder} style={{ ...fieldInput(), marginBottom:10 }}/>
      {suggestions.length > 0 && (
        <>
          <p style={{ margin:"0 0 6px", fontSize:11, color:C.dim }}>Были в прошлых группах</p>
          <div style={{ ...chipRow, marginBottom:12 }}>
            {suggestions.map(n => (
              <button key={n} onClick={() => (onPick || onChange)(n)} style={chip()}>{n}</button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
