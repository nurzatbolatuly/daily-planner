import { useState } from "react";
import { C } from "../../../constants/theme";
import { FieldLabel } from "../../../components/FieldLabel";
import { PersonPicker } from "./PersonPicker";
import { GuestNameSheet } from "./GuestNameSheet";
import { chip, chipRow } from "./sharedUi";

// Кто это: человек из «Люди», гость (имя) или «без имени» (docs/shared-expenses.md §3).
// «От кого / Кому» в переводе (§5.10).
//   value: { personId, name } — personId важнее name; оба пусты — без имени.
export function ContactField({ label, value, onChange, people, setPeople, members, allowEmpty = false, emptyLabel = "Без имени", placeholder = "Не выбран", error }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);

  const person = value.personId ? people.find(p => p.id === value.personId) : null;
  const isGuest = !person && !!value.name;
  const isEmpty = !person && !isGuest;
  const shown = person?.name || value.name || (allowEmpty ? emptyLabel : placeholder);

  const pickPerson = personId => { setPickerOpen(false); onChange({ personId, name: null }); };

  return (
    <div style={{ marginBottom:16 }}>
      <FieldLabel error={error}>{label}</FieldLabel>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"12px 14px", borderRadius:10, marginBottom:8,
                    background:C.fieldBg, border:`1px solid ${error ? C.errorBorder : C.border}` }}>
        <span style={{ flex:1, minWidth:0, fontSize:16, fontWeight:600, color: isEmpty && !allowEmpty ? C.dim : "#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {shown}
        </span>
        {(person || isGuest) && <span style={{ fontSize:11, color:C.dim, flexShrink:0 }}>{person ? "из «Люди»" : "гость"}</span>}
      </div>
      <div style={chipRow}>
        <button onClick={() => setPickerOpen(true)} style={chip(!!person)}>Из «Люди»</button>
        <button onClick={() => setGuestOpen(true)} style={chip(isGuest)}>Гость</button>
        {allowEmpty && <button onClick={() => onChange({ personId: null, name: null })} style={chip(isEmpty)}>{emptyLabel}</button>}
      </div>

      <PersonPicker
        open={pickerOpen} onClose={() => setPickerOpen(false)} title={label}
        people={people} selectedIds={person ? [person.id] : []}
        onPick={pickPerson}
        onCreated={p => { setPeople(prev => [...prev, p]); pickPerson(p.id); }}
      />
      {guestOpen && (
        <GuestNameSheet title={label} members={members} submitLabel="Готово"
          onClose={() => setGuestOpen(false)}
          onSubmit={name => { setGuestOpen(false); onChange({ personId: null, name }); }}/>
      )}
    </div>
  );
}
