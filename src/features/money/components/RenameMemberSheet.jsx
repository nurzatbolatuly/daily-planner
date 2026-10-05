import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { buildGroupSettingsSave } from "../../../utils/sharedGroupSave";
import { fieldInput, sheetBtn, hintText } from "./sharedUi";

// Переименовать участника прямо с экрана тусы («Компашка 1» → «Компашка Асана»). Пусто —
// автоподпись (имя контакта или «Компашка N»). Пишется save_shared_members, как в настройках группы.
export function RenameMemberSheet({ member, placeholder, onSaved, onClose }) {
  const [name, setName] = useState(member.label || "");
  const saveRef = useRef(null);
  const { save, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось переименовать" });
  saveRef.current = async () => {
    await supaRpc("save_shared_members", { p: buildGroupSettingsSave({ groupId: member.group_id, members: [{ ...member, label: name.trim() || null }] }) });
    await onSaved();
  };
  const unchanged = (name.trim() || null) === (member.label || null);

  return (
    <BottomSheet open onClose={onClose} title="Название участника">
      <input value={name} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && !unchanged && save()}
        placeholder={placeholder} aria-label="Название участника" enterKeyHint="done" style={{ ...fieldInput(), marginBottom:6 }}/>
      <p style={hintText}>Пусто — подпись по контакту: «{placeholder}». Видно во всех счетах этой группы.</p>
      {saveError && <p style={{ margin:"0 0 8px", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      <button onClick={save} disabled={saving || unchanged} style={sheetBtn("primary", saving || unchanged)}>{saving ? "Сохранение..." : "Сохранить"}</button>
    </BottomSheet>
  );
}
