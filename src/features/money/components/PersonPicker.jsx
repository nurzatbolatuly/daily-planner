import { useState, useRef, useEffect } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { supaUpsert } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { pickablePeople, findActiveByName, newPersonRecord } from "../../../utils/people";
import { PersonRow } from "./PersonRow";
import { sheetBtn } from "./sharedUi";

// Выбор человека из «Люди» + создание нового прямо из шторки.
//   Одиночный выбор (DebtFormPage, «От кого») и переключение по одному (SplitToggle) — onPick(id).
//   multiple — отметить сразу нескольких и подтвердить «Добавить (N)» → onConfirm(ids)
//   (участники групп). selectedIds в этом режиме — уже добавленные: отмечены и не снимаются.
// Скрытые люди не показываются (кроме уже выбранных). Ввод имени существующего человека
// выбирает его, а не создаёт дубликат.
export function PersonPicker({ open, onClose, title = "Выбрать человека", people, selectedIds = [], onPick, onCreated, multiple = false, onConfirm }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState([]);
  useEffect(() => { if (open) setPicked([]); }, [open]);

  const choose = id => {
    if (!multiple) { onPick(id); return; }
    if (selectedIds.includes(id)) return;
    setPicked(ps => (ps.includes(id) ? ps.filter(x => x !== id) : [...ps, id]));
  };

  const createRef = useRef(null);
  const { save: create, saving, saveError } = useSave(() => createRef.current(), { errorMsg: "Не удалось добавить человека" });
  createRef.current = async () => {
    const existing = findActiveByName(people, name);
    if (existing) {
      if (!selectedIds.includes(existing.id) && !picked.includes(existing.id)) choose(existing.id);
    } else {
      const person = newPersonRecord(newId(), name, people);
      await supaUpsert("debt_people", person);
      onCreated(person);
      if (multiple) setPicked(ps => [...ps, person.id]);
    }
    setName("");
  };

  const canCreate = !!name.trim() && !saving;
  const submit = () => { if (canCreate) create(); };
  const shownSelected = multiple ? [...selectedIds, ...picked] : selectedIds;

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {pickablePeople(people, selectedIds).map(p => (
        <PersonRow key={p.id} person={p} selected={shownSelected.includes(p.id)} onClick={() => choose(p.id)}
          right={multiple && selectedIds.includes(p.id) ? <span style={{ fontSize:11, color:C.dim, marginRight:6 }}>уже добавлен</span> : null}/>
      ))}
      <div style={{ display:"flex", gap:8, marginTop:10 }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Новый человек" enterKeyHint="done"
          style={{ flex:1, minWidth:0, background:C.fieldBg, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:"#fff", fontSize:16, outline:"none" }}/>
        <button onClick={submit} disabled={!canCreate} aria-label="Добавить человека"
          style={{ padding:"10px 16px", borderRadius:10, background:C.green, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", opacity:canCreate ? 1 : 0.5 }}>
          {saving ? "…" : "+"}
        </button>
      </div>
      {saveError && <p style={{ margin:"8px 0 0", fontSize:12, color:C.errorLight }}>{saveError}</p>}
      {multiple && (
        <button onClick={() => onConfirm(picked)} disabled={!picked.length}
          style={{ ...sheetBtn("primary", !picked.length), marginTop:14 }}>
          {picked.length ? `Добавить (${picked.length})` : "Отметьте людей"}
        </button>
      )}
    </BottomSheet>
  );
}
