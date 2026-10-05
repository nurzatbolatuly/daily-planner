import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BILLS_CATEGORY_ID, FX_LOSS_CATEGORY } from "../../../constants/money";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { AccSelect } from "../../../components/AccSelect";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { Ico } from "../../../components/Ico";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, getPrecision } from "../../../utils/format";
import { splitBill, splitWithFees } from "../../../utils/splitCalc";
import { BillFeesEditor } from "../components/BillFeesEditor";
import { memberLabel } from "../../../utils/sharedExpenses";
import { buildBillSave, buildEntryDelete, fmtEventDate, membersForPeople } from "../../../utils/sharedSave";
import { SharedCoverageList } from "../components/SharedCoverageList";
import { PersonPicker } from "../components/PersonPicker";
import { GuestNameSheet } from "../components/GuestNameSheet";
import { SPLIT_REASON_TEXT, emptyRow, initialRows, toShare, includedHeads, splitRowsFor, methodCheck, defaultWeights, methodOfEntry, feeHeadsOf, feesFromEntry, feesTotalOf } from "../components/coverageRows";
import { SplitMethodPicker } from "../components/SplitMethodPicker";
import { fieldInput, chip, chipRow, errorText } from "../components/sharedUi";

// Покупка в группе Tricount — зеркале Tricount (docs/shared-expenses.md §5.1, §12.4): сумма, кто
// платил и кто в доле — галками, как в Tricount. Видно, сколько на каждого; себя можно снять
// (вы не участвуете — ваша доля 0). Деление — то же, что в тусе (splitBill: вверх до точности
// валюты, остаток — плательщику). Долг по-прежнему считается с группой целиком (mirrorBalance):
// перераспределение долгов делает Tricount (§5.1a).
// Возврата (§5.16) в Tricount нет: вернули деньги — правится сумма покупки и состав (решение
// 05.10.2026); правка пересчитывает транзакцию, баланс счёта и доли одним сохранением.

const HIDDEN_CAT_IDS = new Set([BILLS_CATEGORY_ID, FX_LOSS_CATEGORY.id]);
// Поля участника, изменение которых нужно записать (upsert в save_shared_entry).
const MEMBER_FIELDS = ["label", "heads", "person_id", "guest_name", "sort_order"];
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

export function SharedPurchaseFormPage({ group, entry = null, feesSupported = true, members: allMembers, entries: allEntries, accounts, transactions, expCats, people, setPeople, onBack, onSaved }) {
  const savedMembers = useMemo(() => allMembers.filter(m => m.group_id === group.id).sort(byOrder), [allMembers, group.id]);
  const groupEntries = useMemo(() => allEntries.filter(e => e.group_id === group.id), [allEntries, group.id]);
  const sym = getSym(group.currency);
  const precision = getPrecision(group.currency);
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;
  const accountsInCur = useMemo(() => accounts.filter(a => a.currency === group.currency), [accounts, group.currency]);
  const cats = useMemo(() => expCats.filter(c => !HIDDEN_CAT_IDS.has(c.id)), [expCats]);

  const [members, setMembers] = useState(savedMembers);
  const meId = members.find(m => m.is_me)?.id;
  const [rows, setRows] = useState(() => initialRows(savedMembers, entry));
  const [method, setMethod] = useState(() => methodOfEntry(entry));
  const [fees, setFees] = useState(() => feesFromEntry(entry));
  const [title, setTitle] = useState(entry?.title || "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [payerId, setPayerId] = useState(entry?.payer_member_id || meId);
  const [accountId, setAccountId] = useState(() => (entry ? entry.account_id || "" : accountsInCur[0]?.id || ""));
  const [categoryId, setCategoryId] = useState(entry?.category_id || "");
  const [date, setDate] = useState(entry?.date || todayStr());
  const [errors, setErrors] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const iPaid = payerId === meId;
  const value = Number(amount) || 0;
  const savedById = useMemo(() => new Map(allMembers.map(m => [m.id, m])), [allMembers]);
  const isUnsaved = m => !savedById.has(m.id);
  const isChanged = m => isUnsaved(m) || MEMBER_FIELDS.some(k => (savedById.get(m.id)[k] ?? null) !== (m[k] ?? null));
  const labelOf = m => memberLabel(m, { people, members });
  const clearError = key => setErrors(e => ({ ...e, [key]: "" }));
  const patchRow = (id, patch) => { setRows(r => ({ ...r, [id]: { ...r[id], ...patch } })); clearError("coverage"); };

  const split = useMemo(() => splitWithFees(value, splitRowsFor(method, members, rows), fees,
    { remainderMemberId: payerId, precision, feeHeads: feeHeadsOf(members, rows) }),
    [value, method, members, rows, fees, payerId, precision]);
  const feeAmounts = Object.fromEntries(split.shares.map(s => [s.member_id, s.fee]));
  const amounts = Object.fromEntries(split.shares.map(s => [s.member_id, s.amount]));
  const myShare = amounts[meId] || 0;
  // Как запись изменит мой баланс с группой (+ мне должны больше, − я должен больше).
  const balanceEffect = (iPaid ? value : 0) - myShare;

  // Смена способа деления: проценты/части/суммы получают значения по умолчанию из текущего состава.
  const changeMethod = next => {
    const equal = splitBill(Math.max(value - feesTotalOf(fees), 0), splitRowsFor("equal", members, rows), { remainderMemberId: payerId, precision });
    setRows(r => defaultWeights(next, members, r, Object.fromEntries(equal.shares.map(x => [x.member_id, x.amount]))));
    setMethod(next);
    clearError("coverage");
  };
  const addMember = fields => {
    const m = { id: newId(), group_id: group.id, is_me: false, label: null, heads: 1, person_id: null, guest_name: null,
                sort_order: Math.max(0, ...members.map(x => x.sort_order ?? 0)) + 1, ...fields };
    setMembers(ms => [...ms, m]);
    setRows(r => ({ ...r, [m.id]: emptyRow() }));
    clearError("coverage");
  };
  // Несколько людей из «Люди» разом: новые — участниками, уже участники — снова в состав.
  const addPeople = personIds => {
    setPickerOpen(false);
    const { added, existingIds } = membersForPeople(personIds, members, group.id, newId);
    setMembers(ms => [...ms, ...added]);
    setRows(r => ({ ...r, ...Object.fromEntries([...added.map(m => [m.id, emptyRow()]), ...existingIds.map(id => [id, { ...r[id], included: true }])]) }));
    clearError("coverage");
  };

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить" });
  saveRef.current = async () => {
    const p = buildBillSave({
      form: { title: title.trim(), date, currency: group.currency, amount: value, accountAmount: value, amountGroup: value,
              accountId, categoryId, payerId, fees, splitPeople: includedHeads(members, rows), shares: split.shares.map(s => toShare(s, rows, method)) },
      group, members: members.filter(isChanged), meId, edit: entry, entries: groupEntries, accounts, transactions, newId,
    });
    await supaRpc("save_shared_entry", { p });
    onSaved();
  };

  const deleteRef = useRef(null);
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить" });
  deleteRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry, accounts, transactions }) });
    onBack(true);
  };

  const save = () => {
    const e = {};
    if (!(value > 0)) e.amount = "Введите сумму";
    if (!categoryId) e.category = "Выберите категорию";
    const check = methodCheck(method, members, rows);
    if (!members.some(m => rows[m.id]?.included)) e.coverage = "Отметьте, кто в доле";
    else if (check.error) e.coverage = check.error;
    else if (!split.valid) e.coverage = SPLIT_REASON_TEXT[split.reason]?.(fmt(split.gap)) || "Проверьте доли";
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    execSave();
  };

  const headerTitle = entry ? "Покупка" : "Новая покупка";
  const othersTotal = split.valid ? value - myShare : 0;

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={headerTitle} onBack={() => onBack(false)} right={entry && (
        <button onClick={() => setConfirmDelete(true)} aria-label="Удалить" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="trash" s={20} c={C.errorLight}/>
        </button>
      )}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <p style={{ margin:"0 0 12px", fontSize:13, color:C.dim }}>{group.name}</p>


        <FieldLabel error={errors.amount}>Сумма покупки</FieldLabel>
        <NumInput value={amount} onChange={v => { setAmount(v); clearError("amount"); }} placeholder="0" prefix={sym}
          style={{ ...fieldInput(errors.amount), fontSize:22, fontWeight:700, marginBottom: errors.amount ? 4 : 16 }}/>
        {errors.amount && <p style={errorText}>{errors.amount}</p>}

        <FieldLabel>Кто платил</FieldLabel>
        <div style={{ ...chipRow, marginBottom:16 }}>
          {members.map(m => (
            <button key={m.id} onClick={() => setPayerId(m.id)} style={{ ...chip(payerId === m.id), maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {labelOf(m)}
            </button>
          ))}
        </div>

        {iPaid && (
          <AccSelect accounts={accountsInCur} value={accountId} onChange={setAccountId}
            label="С какого счёта" allowNone noneLabel="Без счёта (наличные мимо учёта)"/>
        )}

        <FieldLabel>Что</FieldLabel>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Например, продукты" style={{ ...fieldInput(), marginBottom:16 }}/>

        <FieldLabel error={errors.category}>Категория</FieldLabel>
        <div style={{ marginBottom:16 }}>
          <CategoryPicker cats={cats} value={categoryId} onChange={id => { setCategoryId(id); clearError("category"); }}/>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <FieldLabel error={errors.coverage}>Кто в доле</FieldLabel>
          <SplitMethodPicker value={method} onChange={changeMethod}/>
        </div>
        <SharedCoverageList tapToToggle method={method} total={split.base} feeAmounts={feeAmounts} onWeight={(id, v) => patchRow(id, { weight: v })}
          members={members} rows={rows} amounts={amounts} labelOf={labelOf} sym={sym} payerId={payerId}
          onToggle={id => patchRow(id, { included: !rows[id].included })}
          onOpen={() => {}}
          onAddPerson={() => setPickerOpen(true)}
          onAddGuest={() => setGuestOpen(true)}
          onAddUnnamed={() => addMember({})}
        />
        {errors.coverage && <p style={{ ...errorText, margin:"10px 0 0" }}>{errors.coverage}</p>}
        <BillFeesEditor fees={fees} supported={feesSupported} onChange={f => { setFees(f); clearError("coverage"); }} sym={sym}/>

        {value > 0 && split.valid && (
          <div style={{ marginTop:16, padding:"12px 14px", borderRadius:12, background:C.monCard }}>
            <p style={{ margin:0, fontSize:13, color:C.dim }}>
              {rows[meId]?.included ? <>Ваша доля <b style={{ color:"#fff" }}>{fmt(myShare)}</b></> : "Вы не участвуете — ваша доля 0"}
              {iPaid && othersTotal > 0 && <> · за остальных <b style={{ color:C.green }}>{fmt(othersTotal)}</b></>}
            </p>
            <p style={{ margin:"4px 0 0", fontSize:12, color:C.dim }}>
              Баланс с группой {balanceEffect >= 0 ? "+" : "−"}{fmt(Math.abs(balanceEffect))} — кто кому переведёт, посчитает Tricount
            </p>
          </div>
        )}

        <FieldLabel>Дата</FieldLabel>
        <button onClick={() => setShowCal(true)}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12, background:C.fieldBg, border:`1px solid ${C.border}`, color:"#fff", fontSize:14, cursor:"pointer", margin:"16px 0" }}>
          <Ico n="calendar" s={16} c={C.dim}/> {fmtEventDate(date)}{date === todayStr() ? " · сегодня" : ""}
        </button>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", margin:"8px 0 0" }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:15, borderRadius:30, background: saving ? C.savingDisabled : C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:8 }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {showCal && <CalendarPicker mode="single" value={date} onChange={d => { setDate(d); setShowCal(false); }} onClose={() => setShowCal(false)}/>}

      <PersonPicker
        open={pickerOpen} onClose={() => setPickerOpen(false)} title="Человек из «Люди»"
        people={people} selectedIds={members.filter(m => m.person_id && rows[m.id]?.included).map(m => m.person_id)}
        multiple onConfirm={addPeople}
        onCreated={person => setPeople(prev => [...prev, person])}
      />
      {guestOpen && (
        <GuestNameSheet members={allMembers} exclude={members.map(m => m.guest_name).filter(Boolean)}
          onClose={() => setGuestOpen(false)} onSubmit={n => { setGuestOpen(false); addMember({ guest_name: n }); }}/>
      )}

      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={execDelete}
        title="Удалить покупку?"
        message={`${entry?.transaction_id ? "Операция удалится со счёта, баланс вернётся. " : ""}Баланс с группой пересчитается.`}
        confirmLabel={deleting ? "Удаление..." : "Удалить"} disabled={deleting} error={deleteError}
      />
    </div>
  );
}
