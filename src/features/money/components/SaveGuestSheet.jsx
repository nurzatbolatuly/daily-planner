import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { FieldLabel } from "../../../components/FieldLabel";
import { Ico } from "../../../components/Ico";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { fmtAmtAuto, getSym } from "../../../utils/format";
import { findActiveByName, newPersonRecord } from "../../../utils/people";
import { guestOccurrences } from "../../../utils/sharedExpenses";
import { fmtEventDate } from "../../../utils/sharedSave";
import { buildGuestToPersonSave } from "../../../utils/sharedGroupSave";
import { fieldInput, sheetBtn, hintText } from "./sharedUi";

// У группы Tricount личного долга нет — долг с группой целиком (balance === null).
const balanceText = (balance, sym) => (balance === null ? "Tricount"
  : balance > 0 ? `должен мне ${sym}${fmtAmtAuto(balance)}`
  : balance < 0 ? `я должен ${sym}${fmtAmtAuto(-balance)}` : "рассчитались");

// «Сохранить в Люди» (docs/shared-expenses.md §7.2): гость становится человеком из «Люди».
// Одно имя ещё не значит один человек, поэтому показываем все вечера с этим именем; по умолчанию
// отмечен только текущий участник — иначе долги двух разных Асанов молча склеились бы.
// Человек с таким именем уже есть в «Люди» → привязываем к нему, а не создаём дубликат.
export function SaveGuestSheet({ member, groups, members, entries, people, onSaved, onClose }) {
  const [name, setName] = useState(member.guest_name || "");
  const [selected, setSelected] = useState(() => new Set([member.id]));

  const occurrences = useMemo(
    () => guestOccurrences(member.guest_name, { groups, members, entries }),
    [member.guest_name, groups, members, entries]);
  const existing = findActiveByName(people, name);
  const trimmed = name.trim();

  const toggle = id => setSelected(s => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const saveRef = useRef(null);
  const { save, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить в «Люди»" });
  saveRef.current = async () => {
    const person = existing ? null : newPersonRecord(newId(), trimmed, people);
    await supaRpc("save_shared_entry", { p: buildGuestToPersonSave({
      person,
      personId: existing?.id || person.id,
      members: occurrences.filter(o => selected.has(o.member.id)).map(o => o.member),
    }) });
    await onSaved();
  };

  const canSave = !!trimmed && selected.size > 0 && !saving;

  return (
    <BottomSheet open onClose={onClose} title="Сохранить в «Люди»">
      <FieldLabel>Имя</FieldLabel>
      <input value={name} onChange={e => setName(e.target.value)} style={{ ...fieldInput(), marginBottom:6 }}/>
      <p style={hintText}>
        {existing
          ? `В «Люди» уже есть «${existing.name}» — участники будут привязаны к нему.`
          : "Появится в «Люди»: долги будут видны в его карточке, и можно будет делать зачёт."}
      </p>

      {occurrences.length > 1 && (
        <>
          <FieldLabel>Это один и тот же человек?</FieldLabel>
          <p style={{ ...hintText, margin:"0 0 8px" }}>Отметьте группы, где был именно он.</p>
        </>
      )}
      {occurrences.map(({ member: m, group, balance }) => {
        const on = selected.has(m.id);
        const sym = getSym(group.currency);
        return (
          <button key={m.id} onClick={() => toggle(m.id)} role="checkbox" aria-checked={on}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", textAlign:"left",
                     background: on ? C.greenTint : C.rowBg, border:`1px solid ${on ? C.greenBorder : C.border}` }}>
            <span style={{ width:22, height:22, flexShrink:0, borderRadius:6, border:`2px solid ${on ? C.green : C.dim}`, background: on ? C.green : "transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {on && <Ico n="check" s={13} c="#fff"/>}
            </span>
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ display:"block", fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {group.name}{m.id === member.id ? " · этот" : ""}
              </span>
              <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {[group.date && fmtEventDate(group.date), balanceText(balance, sym)].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        );
      })}

      {saveError && <p style={{ margin:"8px 0 0", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      <button onClick={save} disabled={!canSave} style={{ ...sheetBtn("primary", !canSave), marginTop:12 }}>
        {saving ? "Сохранение..." : existing ? "Привязать" : "Сохранить"}
      </button>
    </BottomSheet>
  );
}
