import { useState } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { ColorPickerComp } from "../../../components/ColorPickerComp";
import { FieldLabel } from "../../../components/FieldLabel";
import { supa, supaUpsert } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { fmtAmtAuto, getSym } from "../../../utils/format";
import { BASE_CUR } from "../../../constants/currencies";
import { findActiveByName, newPersonRecord, nextPersonColor } from "../../../utils/people";

const sym = getSym(BASE_CUR);

// Добавить / переименовать / скрыть / вернуть / удалить человека из «Люди» (docs/shared-expenses.md §7.5).
// Монтировать только когда нужна (`{target && <PersonEditSheet/>}`) — состояние формы берётся
// из person при монтировании.
//   person — null для нового; people — весь список (проверка дубликата имени);
//   usage — personUsage(): удалить можно только неиспользуемого, иначе — скрыть;
//   net — личный долг (в базовой валюте), чтобы предупредить при скрытии;
//   onDone(result) — после успешной записи: "saved" | "archived" | "restored" | "deleted".
export function PersonEditSheet({ person, people, usage, net = 0, onClose, onDone }) {
  const isNew = !person;
  const [name, setName] = useState(person?.name || "");
  const [color, setColor] = useState(person?.color || nextPersonColor(people));
  const [nameError, setNameError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { save: run, saving, saveError } = useSave(async ([action, result]) => {
    await action();
    onDone(result);
  });

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError("Введите имя");
    const dup = findActiveByName(people, trimmed);
    if (dup && dup.id !== person?.id) return setNameError("Человек с таким именем уже есть");
    run([
      () => isNew
        ? supaUpsert("debt_people", { ...newPersonRecord(newId(), trimmed, people), color })
        : supa.update("debt_people", { name: trimmed, color }, `id=eq.${person.id}`),
      "saved",
    ]);
  };
  const setArchived = archived =>
    run([() => supa.update("debt_people", { archived }, `id=eq.${person.id}`), archived ? "archived" : "restored"]);
  const remove = () => run([() => supa.delete("debt_people", `id=eq.${person.id}`), "deleted"]);

  const usedIn = usage && [
    usage.debts && `записей долгов: ${usage.debts}`,
    usage.groups && `общих групп: ${usage.groups}`,
    usage.transfers && `переводов в группах: ${usage.transfers}`,
  ].filter(Boolean).join(", ");

  const btn = (bg, color) => ({ width:"100%", padding:14, borderRadius:30, border:"none", background:bg, color, fontSize:15, fontWeight:600, cursor:saving ? "default" : "pointer", opacity:saving ? 0.6 : 1, marginBottom:10 });

  return (
    <>
      <BottomSheet open={!confirmDelete} onClose={onClose} title={isNew ? "Новый человек" : person.name}>
        <FieldLabel error={nameError}>Имя</FieldLabel>
        <input value={name} autoFocus={isNew} onChange={e => { setName(e.target.value); setNameError(""); }}
          onKeyDown={e => e.key === "Enter" && save()} enterKeyHint="done" placeholder="Имя"
          style={{ width:"100%", boxSizing:"border-box", background:C.fieldBg, border:`1px solid ${nameError ? C.errorBorder : C.border}`, borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:16, outline:"none", marginBottom:nameError ? 4 : 16 }}/>
        {nameError && <p style={{ margin:"0 0 12px", fontSize:12, color:C.errorLight }}>{nameError}</p>}

        <FieldLabel>Цвет</FieldLabel>
        <div style={{ marginBottom:20 }}><ColorPickerComp value={color} onChange={setColor}/></div>

        {saveError && <p style={{ margin:"0 0 10px", fontSize:13, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={btn(saving ? C.savingDisabled : C.green, "#fff")}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>

        {!isNew && person.archived && (
          <button onClick={() => setArchived(false)} disabled={saving} style={btn(C.fieldBg, C.mid)}>
            Вернуть в список
          </button>
        )}

        {!isNew && !person.archived && (
          <>
            <button onClick={() => setArchived(true)} disabled={saving} style={btn(C.fieldBg, C.mid)}>
              Скрыть
            </button>
            <p style={{ margin:"-4px 0 12px", fontSize:11, color:C.dim, lineHeight:1.4, textAlign:"center" }}>
              {net !== 0
                ? `Открытый долг ${sym}${fmtAmtAuto(Math.abs(net))} останется в «Долгах», пропадёт только из выбора.`
                : "Пропадёт из выбора и списков, история сохранится. Можно вернуть в «Люди → Скрытые»."}
            </p>
          </>
        )}

        {!isNew && (usage?.canDelete ? (
          <button onClick={() => setConfirmDelete(true)} disabled={saving} style={btn(C.errorTint, C.red)}>
            Удалить
          </button>
        ) : (
          <p style={{ margin:"4px 0 0", fontSize:11, color:C.dim, lineHeight:1.4, textAlign:"center" }}>
            Удалить нельзя — есть история ({usedIn}). Её удаление стёрло бы долги, поэтому только «Скрыть».
          </p>
        ))}
      </BottomSheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Удалить «${person?.name}»?`}
        message="Человек нигде не используется — удаление ничего не затронет. Отменить нельзя."
        confirmLabel={saving ? "Удаление..." : "Удалить"}
        disabled={saving}
        error={saveError}
      />
    </>
  );
}
