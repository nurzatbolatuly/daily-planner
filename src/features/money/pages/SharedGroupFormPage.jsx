import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { SHARED_ENTRY_KINDS as K, SHARED_MODES } from "../../../constants/money";
import { BASE_CUR } from "../../../constants/currencies";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { Spinner } from "../../../components/Spinner";
import { Ico } from "../../../components/Ico";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, getPrecision, ratesFromAccounts } from "../../../utils/format";
import { memberLabel, memberUsage, memberBalances, mirrorBalance } from "../../../utils/sharedExpenses";
import { fmtEventDate, newMirrorGroup, newMeMember, membersForPeople } from "../../../utils/sharedSave";
import { buildGroupSettingsSave, buildArchiveSave, regroupAmounts } from "../../../utils/sharedGroupSave";
import { buildMirrorGroupSave, openingSave } from "../../../utils/sharedMirrorSave";
import { SharedMemberEditSheet } from "../components/SharedMemberEditSheet";
import { AddMemberChips } from "../components/AddMemberChips";
import { PersonPicker } from "../components/PersonPicker";
import { GuestNameSheet } from "../components/GuestNameSheet";
import { CloseGroupSheet } from "../components/CloseGroupSheet";
import { DeleteGroupSheet } from "../components/DeleteGroupSheet";
import { MirrorSettingsFields } from "../components/MirrorSettingsFields";
import { fieldInput, sheetBtn, hintText, errorText } from "../components/sharedUi";

// Настройки группы (docs/shared-expenses.md §7.5–§7.6): название, дата, участники (добавить,
// переименовать, сменить контакт, «× N» по умолчанию, удалить неиспользуемого), архив, удаление.
// Настройки и участники пишутся одним вызовом save_shared_members (v26). Режим не меняется
// никогда. Смена валюты пересчитывает amount_group всех записей один раз по текущим курсам
// (regroupAmounts) — в том же вызове, с предпросмотром, как изменятся долги.
// Tricount (mirror, этап 10): начальный баланс (opening). Без group и с
// createMode="mirror" — создание новой квартиры: группа, соседи и начальный баланс одним вызовом.

const MEMBER_FIELDS = ["label", "heads", "person_id", "guest_name", "sort_order"];
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
const ENTRY_KIND_TITLE = { [K.transfer]: "перевод", [K.adjust]: "корректировка" };

export function SharedGroupFormPage({ group: savedGroup, createMode = null, data, people, setPeople, cats, onBack, onDeleted, onCreated }) {
  const isCreate = !savedGroup && createMode === SHARED_MODES.mirror;
  // При создании работаем с ещё не сохранённой группой — весь остальной код тот же.
  const [draftGroup] = useState(() => (isCreate
    ? newMirrorGroup(newId(), { name: "", currency: BASE_CUR })
    : null));
  const group = savedGroup || draftGroup;
  const isMirror = group?.mode === SHARED_MODES.mirror;
  const savedMembers = useMemo(() => (savedGroup ? data.members.filter(m => m.group_id === savedGroup.id).sort(byOrder) : []), [data.members, savedGroup]);
  const groupEntries = useMemo(() => (savedGroup ? data.entries.filter(e => e.group_id === savedGroup.id) : []), [data.entries, savedGroup]);
  const existingOpening = groupEntries.find(e => e.kind === K.opening) || null;

  const [name, setName] = useState(group?.name || "");
  const [date, setDate] = useState(group?.date || null);
  const [members, setMembers] = useState(() => (isCreate ? [newMeMember(newId(), draftGroup.id)] : savedMembers));
  const [opening, setOpening] = useState(() => {
    const v = Number(existingOpening?.amount_group) || 0;
    return { side: v > 0 ? "owed" : "owe", amount: v ? String(Math.abs(v)) : "", date: existingOpening?.date || todayStr() };
  });
  const [showOpeningCal, setShowOpeningCal] = useState(false);
  const [deletedIds, setDeletedIds] = useState([]);
  const [nameError, setNameError] = useState("");
  const [editId, setEditId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [currency, setCurrency] = useState(group?.currency || null);
  const [showCur, setShowCur] = useState(false);
  const rates = useMemo(() => ratesFromAccounts(data.accounts), [data.accounts]);
  const regrouped = useMemo(() => (savedGroup && currency !== savedGroup.currency
    ? regroupAmounts(groupEntries, { from: savedGroup.currency, to: currency, rates, accounts: data.accounts }) : []),
    [savedGroup, currency, groupEntries, rates, data.accounts]);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить" });
  const restoreRef = useRef(null);
  const { save: execRestore, saving: restoring, saveError: restoreError } = useSave(() => restoreRef.current(), { errorMsg: "Не удалось вернуть из архива" });

  // Группа удалена или стор перезагружается.
  if (!group) return <div style={{ background:C.monBg, minHeight:"calc(100dvh - var(--app-header-h))" }}><Spinner color={C.green}/></div>;

  const savedById = new Map(savedMembers.map(m => [m.id, m]));
  const isChanged = m => !savedById.has(m.id) || MEMBER_FIELDS.some(k => (savedById.get(m.id)[k] ?? null) !== (m[k] ?? null));
  const changedMembers = members.filter(isChanged);
  const groupChanged = name.trim() !== group.name || date !== (group.date || null);
  const currencyChanged = !isCreate && currency !== group.currency;
  const openingValue = (opening.side === "owe" ? -1 : 1) * (Number(opening.amount) || 0);
  const openingChanged = isMirror && (openingValue !== (Number(existingOpening?.amount_group) || 0)
    || (!!openingValue && opening.date !== existingOpening?.date));
  const dirty = isCreate || groupChanged || currencyChanged || openingChanged || changedMembers.length > 0 || deletedIds.length > 0;

  const sym = getSym(isCreate ? currency : group.currency);
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;
  const labelOf = m => memberLabel(m, { people, members });
  const catName = id => cats.find(c => c.id === id)?.name;
  const entryTitle = e => ENTRY_KIND_TITLE[e.kind] || e.title || catName(e.category_id) || "счёт";
  const usageTitles = m => [...new Set(memberUsage(m.id, groupEntries).map(entryTitle))];
  const groupGuestNames = members.map(m => m.guest_name).filter(Boolean);

  const patchMember = (id, patch) => setMembers(ms => ms.map(m => (m.id === id ? { ...m, ...patch } : m)));
  const addMember = fields => setMembers(ms => [...ms, {
    id: newId(), group_id: group.id, is_me: false, label: null, heads: 1, person_id: null, guest_name: null,
    sort_order: Math.max(0, ...ms.map(x => x.sort_order ?? 0)) + 1, ...fields,
  }]);
  const deleteMember = id => {
    setEditId(null);
    setMembers(ms => ms.filter(m => m.id !== id));
    if (savedById.has(id)) setDeletedIds(ids => [...ids, id]);
  };
  const addPeople = personIds => {
    setPickerOpen(false);
    setMembers(ms => [...ms, ...membersForPeople(personIds, ms, group.id, newId).added]);
  };

  saveRef.current = async () => {
    const edited = { ...group, name: name.trim(), date };
    if (isCreate) {
      await supaRpc("save_shared_entry", { p: buildMirrorGroupSave({
        group: { ...edited, currency }, members, opening: { amount: openingValue, date: opening.date }, newId,
      }) });
      onCreated(group.id);
      return;
    }
    const openingPart = openingChanged
      ? openingSave({ group: { ...group, currency }, amount: openingValue, date: opening.date, existing: existingOpening, newId })
      : { entries: [], deleteEntryIds: [] };
    await supaRpc("save_shared_members", { p: buildGroupSettingsSave({
      group: groupChanged ? edited : null,
      groupId: group.id, members: changedMembers, deleteIds: deletedIds,
      currency: currencyChanged ? currency : null, amounts: regrouped,
      entries: openingPart.entries, deleteEntryIds: openingPart.deleteEntryIds,
    }) });
    onBack(true);
  };
  restoreRef.current = async () => {
    await supaRpc("save_shared_entry", { p: buildArchiveSave({ group, members: savedMembers, entries: groupEntries, archived: false }) });
    onBack(true);
  };

  const save = () => {
    if (!name.trim()) return setNameError("Введите название");
    execSave();
  };
  const patchOpening = patch => setOpening(o => ({ ...o, ...patch }));
  const back = () => (dirty ? setConfirmExit(true) : onBack(false));
  // Предпросмотр смены валюты: долги до и после пересчёта (у квартиры — мой баланс с группой).
  const debtPreview = currencyChanged ? (() => {
    const amountById = new Map(regrouped.map(r => [r.id, r.amount_group]));
    const regroupedEntries = groupEntries.map(e => ({ ...e, amount_group: amountById.get(e.id) }));
    const meId = savedMembers.find(m => m.is_me)?.id;
    if (isMirror) {
      const before = mirrorBalance(groupEntries, meId, { precision: getPrecision(group.currency) });
      return before ? [{ key: "me", label: "Мой баланс", before, after: mirrorBalance(regroupedEntries, meId, { precision: getPrecision(currency) }) }] : [];
    }
    const before = memberBalances(groupEntries, savedMembers, { precision: getPrecision(group.currency) });
    const after = memberBalances(regroupedEntries, savedMembers, { precision: getPrecision(currency) });
    return savedMembers.filter(m => before[m.id]?.balance)
      .map(m => ({ key: m.id, label: labelOf(m), before: before[m.id].balance, after: after[m.id].balance }));
  })() : [];
  const editMember = members.find(m => m.id === editId);
  const memberSub = m => [
    m.person_id ? "из «Люди»" : m.guest_name ? "гость" : !m.is_me && "без контакта",
    m.heads > 1 && `× ${m.heads} по умолчанию`,
  ].filter(Boolean).join(" · ");

  if (showCur) return <CurrencyPage value={currency} onSelect={setCurrency} onBack={() => setShowCur(false)}/>;

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={isCreate ? "Новая группа Tricount" : "Настройки"} onBack={back}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>

        {group.archived && (
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:12, background:C.monCard, marginBottom:16 }}>
            <span style={{ flex:1, minWidth:0, fontSize:13, color:C.mid }}>Группа в архиве</span>
            <button onClick={execRestore} disabled={restoring}
              style={{ padding:"8px 14px", borderRadius:20, border:"none", background:C.green, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 }}>
              {restoring ? "…" : "Вернуть"}
            </button>
          </div>
        )}
        {restoreError && <p style={errorText}>{restoreError}</p>}

        <FieldLabel error={nameError}>Название</FieldLabel>
        <input value={name} onChange={e => { setName(e.target.value); setNameError(""); }} placeholder={isMirror ? "Например, Квартира" : "Например, Шашлыки на даче"}
          style={{ ...fieldInput(nameError), marginBottom:16 }}/>

        {date && (
          <>
            <FieldLabel>Дата</FieldLabel>
            <button onClick={() => setShowCal(true)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12, background:C.fieldBg, border:`1px solid ${C.border}`, color:"#fff", fontSize:14, cursor:"pointer", marginBottom:6 }}>
              <Ico n="calendar" s={16} c={C.dim}/> {fmtEventDate(date)}
            </button>
            <p style={hintText}>Только подпись и порядок в списке — даты счетов не меняются.</p>
          </>
        )}

        <div style={{ display:"flex", gap:12, padding:"12px 14px", borderRadius:12, background:C.rowBg, border:`1px solid ${C.border}`, marginBottom:20 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:11, color:C.dim }}>Режим</p>
            <p style={{ margin:"2px 0 0", fontSize:14 }}>{isMirror ? "Tricount · долг с группой целиком" : "Туса с друзьями · долги с каждым участником"}</p>
          </div>
          <button onClick={() => setShowCur(true)} aria-label="Валюта группы"
            style={{ textAlign:"right", flexShrink:0, background:"none", border:"none", padding:0, cursor:"pointer", color:"#fff" }}>
            <p style={{ margin:0, fontSize:11, color:C.dim }}>Валюта</p>
            <p style={{ margin:"2px 0 0", fontSize:14, color:C.green, fontWeight:700 }}>{currency} ›</p>
          </button>
        </div>
        {currencyChanged && (
          <div style={{ marginTop:-12, marginBottom:20, padding:"10px 12px", borderRadius:12, background:C.warnTint, border:`1px solid ${C.warnBorder}` }}>
            <p style={{ margin:0, fontSize:13, color:C.mid, lineHeight:1.4 }}>
              Долги пересчитаются по сегодняшнему курсу один раз, дальше снова зафиксированы. Счета и переводы останутся в своей валюте.
            </p>
            {debtPreview.map(({ key, label, before, after }) => (
              <p key={key} style={{ margin:"6px 0 0", fontSize:12, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {label}: {getSym(group.currency)}{fmtAmtAuto(Math.abs(before))} → {getSym(currency)}{fmtAmtAuto(Math.abs(after))}
              </p>
            ))}
          </div>
        )}

        {isMirror && (
          <MirrorSettingsFields opening={opening} onOpeningChange={patchOpening} sym={sym} onPickDate={() => setShowOpeningCal(true)}/>
        )}

        <FieldLabel>{isMirror ? "Соседи" : "Участники"}</FieldLabel>
        {members.map(m => {
          const sub = memberSub(m);
          return (
            <div key={m.id} onClick={() => setEditId(m.id)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:C.rowBg, border:`1px solid ${C.border}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{labelOf(m)}</p>
                {sub && <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub}</p>}
              </div>
              <Ico n="chevR" s={16} c={C.dim}/>
            </div>
          );
        })}
        <AddMemberChips onAddPerson={() => setPickerOpen(true)} onAddGuest={() => setGuestOpen(true)} onAddUnnamed={() => addMember({})} style={{ marginTop:8 }}/>
        <p style={{ ...hintText, marginTop:8 }}>
          {isMirror ? "Те, кто платит за общее. Доли остальных считает Tricount — здесь только «кто платил»." : "Новые участники в уже внесённых счетах не появляются."}
        </p>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", margin:"16px 0 0" }}>{saveError}</p>}
        <button onClick={save} disabled={saving || !dirty}
          style={{ width:"100%", padding:15, borderRadius:30, background: saving ? C.savingDisabled : C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor: dirty ? "pointer" : "default", opacity: dirty ? 1 : 0.5, marginTop:12 }}>
          {saving ? "Сохранение..." : isCreate ? "Создать" : "Сохранить"}
        </button>

        {!isCreate && (
          <>
            <div style={{ height:28 }}/>
            {!group.archived && (
              <button onClick={() => setCloseOpen(true)} style={{ ...sheetBtn("secondary"), marginBottom:10 }}>В архив</button>
            )}
            <button onClick={() => setDeleteOpen(true)} style={sheetBtn("danger")}>Удалить группу</button>
          </>
        )}
      </div>

      {showCal && <CalendarPicker mode="single" value={date} onChange={d => { setDate(d); setShowCal(false); }} onClose={() => setShowCal(false)}/>}
      {showOpeningCal && <CalendarPicker mode="single" value={opening.date} onChange={d => { patchOpening({ date: d }); setShowOpeningCal(false); }} onClose={() => setShowOpeningCal(false)}/>}

      {editMember && (
        <SharedMemberEditSheet
          member={editMember} title={labelOf(editMember)} autoLabel={memberLabel({ ...editMember, label: null }, { people, members })}
          usageTitles={savedById.has(editMember.id) ? usageTitles(editMember) : []}
          people={people} setPeople={setPeople} allMembers={data.members}
          onChange={patch => patchMember(editMember.id, patch)}
          onDelete={() => deleteMember(editMember.id)}
          onClose={() => setEditId(null)}
        />
      )}

      <PersonPicker
        open={pickerOpen} onClose={() => setPickerOpen(false)} title="Человек из «Люди»"
        people={people} selectedIds={members.map(m => m.person_id).filter(Boolean)}
        multiple onConfirm={addPeople}
        onCreated={person => setPeople(prev => [...prev, person])}
      />
      {guestOpen && (
        <GuestNameSheet members={data.members} exclude={groupGuestNames}
          onClose={() => setGuestOpen(false)} onSubmit={n => { setGuestOpen(false); addMember({ guest_name: n }); }}/>
      )}

      {closeOpen && (
        <CloseGroupSheet group={group} members={savedMembers} entries={groupEntries} labelOf={labelOf} fmt={fmt}
          onSaved={() => onBack(true)} onClose={() => setCloseOpen(false)}/>
      )}
      {deleteOpen && (
        <DeleteGroupSheet group={group} data={data} cats={cats} labelOf={labelOf}
          onArchive={() => { setDeleteOpen(false); setCloseOpen(true); }}
          onDeleted={onDeleted} onClose={() => setDeleteOpen(false)}/>
      )}

      <ConfirmSheet
        open={confirmExit} onClose={() => setConfirmExit(false)} onConfirm={() => onBack(false)}
        title="Выйти без сохранения?" message="Изменения в настройках и участниках не сохранятся."
        confirmLabel="Выйти"
      />
    </div>
  );
}
