import { useState } from "react";
import { BottomSheet } from "../../../components/BottomSheet";
import { GuestNameInput } from "./GuestNameInput";
import { sheetBtn, hintText } from "./sharedUi";

// Шторка «имя гостя»: «＋ Гость» в счёте, «Выделить человека», плательщик и отправитель
// перевода. allowEmpty — можно без имени («Компашка N», отправитель «без имени»).
export function GuestNameSheet({
  title = "Гость", hint = "Только имя — в «Люди» и «Долги» не попадёт.", members, exclude,
  submitLabel = "Добавить", allowEmpty = false, emptyLabel = "Без имени", onSubmit, onClose,
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const submit = () => { if (trimmed) onSubmit(trimmed); };

  return (
    <BottomSheet open onClose={onClose} title={title}>
      {hint && <p style={{ ...hintText, margin:"0 0 10px", fontSize:12 }}>{hint}</p>}
      <GuestNameInput value={name} onChange={setName} onSubmit={submit} onPick={onSubmit} members={members} exclude={exclude} autoFocus/>
      <button onClick={submit} disabled={!trimmed} style={{ ...sheetBtn("primary", !trimmed), marginBottom: allowEmpty ? 10 : 0 }}>
        {submitLabel}
      </button>
      {allowEmpty && <button onClick={() => onSubmit("")} style={sheetBtn("secondary")}>{emptyLabel}</button>}
    </BottomSheet>
  );
}
