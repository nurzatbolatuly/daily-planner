import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { FieldLabel } from "../../../components/FieldLabel";
import { ContactField } from "./ContactField";
import { HeadsStepper } from "./HeadsStepper";
import { fieldInput, sheetBtn, hintText } from "./sharedUi";

const MAX_USAGE_TITLES = 3;

// Участник в настройках группы (docs/shared-expenses.md §7.5): подпись, контакт, «× N» по
// умолчанию, удаление. Изменения применяются в форму сразу (onChange(patch)), пишутся кнопкой
// «Сохранить» формы. usageTitles — записи, где участник встречается: тогда удалять нельзя.
export function SharedMemberEditSheet({ member, title, autoLabel, usageTitles, people, setPeople, allMembers, onChange, onDelete, onClose }) {
  const isMe = member.is_me;
  const contact = { personId: member.person_id, name: member.guest_name };
  const usageText = usageTitles.slice(0, MAX_USAGE_TITLES).join(", ") + (usageTitles.length > MAX_USAGE_TITLES ? ` и ещё ${usageTitles.length - MAX_USAGE_TITLES}` : "");

  return (
    <BottomSheet open onClose={onClose} title={title}>
      {!isMe && (
        <>
          <FieldLabel>Название (необязательно)</FieldLabel>
          <input value={member.label || ""} onChange={e => onChange({ label: e.target.value || null })} placeholder={autoLabel}
            style={{ ...fieldInput(), marginBottom:16 }}/>

          <ContactField label="Контакт" value={contact} allowEmpty emptyLabel="Без имени"
            onChange={c => onChange({ person_id: c.personId || null, guest_name: c.personId ? null : c.name || null })}
            people={people} setPeople={setPeople} members={allMembers}/>
          <p style={{ ...hintText, marginTop:-8 }}>
            {member.person_id
              ? "Имя человека меняется в «Люди» — сразу везде."
              : "Только подпись и подстановка в «От кого». Долг лежит на участнике целиком."}
          </p>
        </>
      )}

      <FieldLabel>Сколько человек по умолчанию</FieldLabel>
      <HeadsStepper value={member.heads || 1} onChange={heads => onChange({ heads })}/>
      <p style={hintText}>Только для новых счетов — в уже внесённых количество не меняется.</p>

      <button onClick={onClose} style={{ ...sheetBtn("primary"), marginBottom: isMe ? 0 : 10 }}>Готово</button>
      {!isMe && (usageTitles.length === 0
        ? <button onClick={onDelete} style={sheetBtn("danger")}>Удалить участника</button>
        : <p style={{ ...hintText, margin:"4px 0 0", color:C.mid, textAlign:"center" }}>Есть в записях: {usageText}. Чтобы удалить, сначала уберите его из них.</p>)}
    </BottomSheet>
  );
}
