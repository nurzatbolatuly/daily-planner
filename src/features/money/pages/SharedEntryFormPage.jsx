import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { BILLS_CATEGORY_ID, FX_LOSS_CATEGORY } from "../../../constants/money";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { AccSelect } from "../../../components/AccSelect";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { Toggle } from "../../../components/Toggle";
import { Ico } from "../../../components/Ico";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { useFormDraft } from "../../../hooks/useFormDraft";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, getPrecision, ratesFromAccounts } from "../../../utils/format";
import { splitBill, splitWithFees } from "../../../utils/splitCalc";
import { BillFeesEditor } from "../components/BillFeesEditor";
import { memberLabel } from "../../../utils/sharedExpenses";
import { buildBillSave, buildEntryDelete, treatedMeAdjustments, billAmounts, membersForPeople, fmtEventDate, newEventGroup, newMeMember } from "../../../utils/sharedSave";
import { SharedCoverageList } from "../components/SharedCoverageList";
import { SPLIT_REASON_TEXT, emptyRow, initialRows, toShare, splitRowsFor, methodCheck, defaultWeights, methodOfEntry, feeHeadsOf, feesFromEntry, feesTotalOf } from "../components/coverageRows";
import { SplitMethodPicker } from "../components/SplitMethodPicker";
import { SharedMemberSheet } from "../components/SharedMemberSheet";
import { SharedPayerPicker } from "../components/SharedPayerPicker";
import { PersonPicker } from "../components/PersonPicker";
import { GuestNameSheet } from "../components/GuestNameSheet";
import { fieldInput, errorText, hintText, chip } from "../components/sharedUi";

// Счёт в общей группе (docs/shared-expenses.md §12.2). Платил я или участник (§5.7). Чек может
// быть в любой валюте, счёт списания — тоже (§5.18): тогда вводится, сколько реально списалось.
// linkTx — «Сделать общим» (§5.13): сумма, валюта, счёт, категория и дата берутся из уже
// записанной транзакции и не меняются; copyFrom — «Доплатил с другого счёта» (§5.19): тот же
// состав, название и категория, новая сумма и счёт.
// Без group — новая группа «Туса с друзьями» создаётся вместе с первым счётом одним сохранением
// (RPC save_shared_entry); название пользователь вводит сам. «Платил другой, я должен свою
// долю» (§5.12) — тот же счёт: «Платил: участник», в составе только я.
// С entry — правка/удаление существующего счёта.
// Деление — utils/splitCalc.splitBill, данные для RPC и балансы счетов — utils/sharedSave.

// Системные категории ставит само приложение (оплата платежей, курсовая разница) — в выборе не нужны.
const HIDDEN_CAT_IDS = new Set([BILLS_CATEGORY_ID, FX_LOSS_CATEGORY.id]);

// Поля участника, изменение которых нужно записать (upsert в save_shared_entry).
const MEMBER_FIELDS = ["label", "heads", "person_id", "guest_name", "sort_order"];

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

// Ключ черновика: shared.draft.<groupId|new> (§12.0).
const draftKey = group => `shared.draft.${group?.id || "new"}`;

function validateBill({ needName, name, amount, categoryId, payerId, meId, members, rows, split, sym, money, accountAmount, methodError }) {
  const e = {};
  if (money.needsAccountAmount && !(Number(accountAmount) > 0)) e.accountAmount = "Сколько списалось со счёта";
  const included = id => rows[id]?.included;
  if (needName && !name.trim()) e.name = "Введите название";
  if (!(Number(amount) > 0)) e.amount = "Введите сумму";
  if (!categoryId) e.category = "Выберите категорию";
  if (!payerId) e.payer = "Выберите, кто платил";
  if (payerId === meId && !members.some(m => m.id !== meId && included(m.id))) e.coverage = "Отметьте, за кого вы платили";
  else if (payerId && payerId !== meId && !included(meId)) e.coverage = "Отметьте себя — иначе этот счёт вас не касается";
  else if (methodError) e.coverage = methodError;
  else if (!split.valid) e.coverage = SPLIT_REASON_TEXT[split.reason]?.(`${sym}${fmtAmtAuto(split.gap)}`) || "Проверьте доли";
  return e;
}

export function SharedEntryFormPage({ group: existingGroup = null, entry = null, feesSupported = true, linkTx = null, copyFrom = null, groups = [], members: allMembers = [], entries: allEntries = [], accounts, transactions, expCats, people, setPeople, onBack, onSaved, onPayRest }) {
  const isNewGroup = !existingGroup;
  // Привязанная транзакция: новая привязка или уже привязанный счёт при правке.
  const linked = linkTx || (entry?.linked_tx_snapshot ? transactions.find(t => t.id === entry.transaction_id) || null : null);
  const groupCurrency = existingGroup?.currency || linkTx?.currency || BASE_CUR;
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const prefill = linkTx || copyFrom;
  const groupEntries = useMemo(() => (existingGroup ? allEntries.filter(e => e.group_id === existingGroup.id) : []), [allEntries, existingGroup]);

  const [groupId, setGroupId] = useState(() => existingGroup?.id || newId());
  const [members, setMembers] = useState(() => existingGroup
    ? allMembers.filter(m => m.group_id === existingGroup.id).sort(byOrder)
    : [newMeMember(newId(), groupId)]);
  const meId = members.find(m => m.is_me)?.id;
  const [rows, setRows] = useState(() => initialRows(members, entry, copyFrom));
  const [method, setMethod] = useState(() => methodOfEntry(entry));
  // «Доплатил с другого счёта» сборы не копирует — они уже учтены в первой части чека.
  const [fees, setFees] = useState(() => feesFromEntry(entry));
  const [payerId, setPayerId] = useState(() => (entry ? entry.payer_member_id : meId));
  const [treatedMe, setTreatedMe] = useState(() => !!entry && treatedMeAdjustments(groupEntries, entry.id).length > 0);

  const [date, setDate] = useState(entry?.date || prefill?.date || todayStr());
  const [name, setName] = useState(existingGroup?.name || "");
  const [title, setTitle] = useState(entry?.title || copyFrom?.title || linkTx?.note || "");
  const [currency, setCurrency] = useState(entry?.currency || linkTx?.currency || copyFrom?.currency || groupCurrency);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : linkTx ? String(linkTx.amount) : "");
  const [accountId, setAccountId] = useState(() => (entry ? entry.account_id || ""
    : linkTx ? linkTx.account_id
    : (accounts.find(a => a.currency === currency && a.id !== copyFrom?.account_id) || accounts.find(a => a.id !== copyFrom?.account_id))?.id || ""));
  const [accountAmount, setAccountAmount] = useState(entry?.account_amount != null && entry.currency !== accounts.find(a => a.id === entry.account_id)?.currency ? String(entry.account_amount) : "");
  const [venueTotal, setVenueTotal] = useState(entry?.venue_total ? String(entry.venue_total) : "");
  const [categoryId, setCategoryId] = useState(entry?.category_id || linkTx?.category_id || copyFrom?.category_id || "");
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});

  const [openMemberId, setOpenMemberId] = useState(null);
  const [splitOutId, setSplitOutId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const savedById = useMemo(() => new Map(allMembers.map(m => [m.id, m])), [allMembers]);
  const isUnsaved = m => !savedById.has(m.id);
  const isChanged = m => isUnsaved(m) || MEMBER_FIELDS.some(k => (savedById.get(m.id)[k] ?? null) !== (m[k] ?? null));
  const labelOf = m => memberLabel(m, { people, members });
  const cats = useMemo(() => expCats.filter(c => !HIDDEN_CAT_IDS.has(c.id)), [expCats]);

  // Черновик новой записи (§12.0): всё введённое, включая ещё не сохранённых участников.
  const draft = useFormDraft(draftKey(existingGroup), {
    groupId, members, unsavedIds: members.filter(isUnsaved).map(m => m.id), rows, method, fees, payerId, treatedMe,
    date, name, title, currency, amount, accountId, accountAmount, venueTotal, categoryId,
  }, { enabled: !entry && !prefill });
  // Восстановление: участники, удалённые из группы с тех пор, не возвращаются; счёт и категория —
  // только если ещё существуют.
  const restoreDraft = () => {
    const d = draft.accept();
    const ms = d.members.filter(m => d.unsavedIds.includes(m.id) || savedById.has(m.id));
    const ids = new Set(ms.map(m => m.id));
    setGroupId(d.groupId);
    setMembers(ms);
    setRows(Object.fromEntries(Object.entries(d.rows).filter(([id]) => ids.has(id))));
    setMethod(d.method || "equal");
    setFees(d.fees || []);
    setPayerId(ids.has(d.payerId) ? d.payerId : (d.payerId === null ? null : ms.find(m => m.is_me)?.id));
    setTreatedMe(d.treatedMe);
    setDate(d.date);
    setName(d.name);
    setTitle(d.title);
    setCurrency(d.currency || groupCurrency);
    setAmount(d.amount);
    setAccountId(accounts.some(a => a.id === d.accountId) ? d.accountId : "");
    setAccountAmount(d.accountAmount || "");
    setVenueTotal(d.venueTotal);
    setCategoryId(cats.some(c => c.id === d.categoryId) ? d.categoryId : "");
    setErrors({});
  };
  const back = () => (draft.dirty ? setConfirmExit(true) : onBack(false));
  const groupGuestNames = useMemo(() => members.map(m => m.guest_name).filter(Boolean), [members]);

  const iPaid = payerId === meId;
  const payer = members.find(m => m.id === payerId);
  const sym = getSym(currency);
  const precision = getPrecision(currency);
  const account = iPaid ? accounts.find(a => a.id === (linked ? linked.account_id : accountId)) || null : null;
  const money = billAmounts({ amount, currency, accountAmount: linked ? linked.amount : accountAmount, account, groupCurrency, rates });

  const split = useMemo(() => splitWithFees(
    Number(amount) || 0,
    splitRowsFor(method, members, rows),
    fees,
    { remainderMemberId: payerId || meId, precision, feeHeads: feeHeadsOf(members, rows) },
  ), [amount, method, members, rows, fees, payerId, meId, precision]);
  const feeAmounts = Object.fromEntries(split.shares.map(s => [s.member_id, s.fee]));
  const amounts = Object.fromEntries(split.shares.map(s => [s.member_id, s.amount]));
  const myShare = amounts[meId] || 0;

  const clearError = key => setErrors(e => ({ ...e, [key]: "" }));
  const patchRow = (id, patch) => { setRows(r => ({ ...r, [id]: { ...r[id], ...patch } })); clearError("coverage"); };

  // Смена способа деления: проценты/части/суммы получают значения по умолчанию из текущего состава.
  const changeMethod = next => {
    const equal = splitBill(Math.max((Number(amount) || 0) - feesTotalOf(fees), 0), splitRowsFor("equal", members, rows), { remainderMemberId: payerId || meId, precision });
    setRows(r => defaultWeights(next, members, r, Object.fromEntries(equal.shares.map(x => [x.member_id, x.amount]))));
    setMethod(next);
    clearError("coverage");
  };
  const addMember = (fields, row = {}) => {
    const m = { id: newId(), group_id: groupId, is_me: false, label: null, heads: 1, person_id: null, guest_name: null,
                sort_order: Math.max(0, ...members.map(x => x.sort_order ?? 0)) + 1, ...fields };
    setMembers(ms => [...ms, m]);
    setRows(r => ({ ...r, [m.id]: { ...emptyRow(m.heads), ...row } }));
    clearError("coverage");
    return m;
  };
  // Несколько людей из «Люди» разом: новые — участниками, уже участники — снова в состав.
  const addPeople = personIds => {
    setPickerOpen(false);
    const { added, existingIds } = membersForPeople(personIds, members, groupId, newId);
    setMembers(ms => [...ms, ...added]);
    setRows(r => ({ ...r, ...Object.fromEntries([...added.map(m => [m.id, emptyRow()]), ...existingIds.map(id => [id, { ...r[id], included: true }])]) }));
    clearError("coverage");
  };
  const removeMember = id => {
    setOpenMemberId(null);
    setMembers(ms => ms.filter(m => m.id !== id));
    setRows(({ [id]: _, ...rest }) => rest);
    if (payerId === id) setPayerId(null);
  };
  // «Выделить человека» (§5.9): новый участник × 1, у компашки на одного меньше — в этом счёте
  // и по умолчанию для новых. Уже внесённые счета не меняются (там heads хранится в shares).
  const splitOut = guestName => {
    const id = splitOutId;
    setSplitOutId(null);
    setOpenMemberId(null);
    setMembers(ms => ms.map(m => (m.id === id ? { ...m, heads: Math.max(1, (m.heads || 1) - 1) } : m)));
    patchRow(id, { heads: Math.max(1, rows[id].heads - 1) });
    addMember({ guest_name: guestName || null });
  };
  const changePayer = id => { setPayerId(id); clearError("payer"); clearError("coverage"); };
  const changeDate = d => { setDate(d); setShowCal(false); };

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить счёт" });
  saveRef.current = async () => {
    const group = existingGroup || newEventGroup(groupId, { name: name.trim(), date, currency: groupCurrency });
    const payload = buildBillSave({
      form: { title: title.trim(), date, currency, amount: money.amount, accountAmount: money.accountAmount, amountGroup: money.amountGroup,
              accountId, venueTotal, categoryId, payerId, treatedMe, linkTx, fees,
              shares: split.shares.map(s => toShare(s, rows, method)) },
      group, isNewGroup,
      members: members.filter(isChanged),
      meId, edit: entry, entries: groupEntries, accounts, transactions, newId,
    });
    await supaRpc("save_shared_entry", { p: payload });
    draft.clear();
    onSaved(group.id, isNewGroup);
  };

  const deleteRef = useRef(null);
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить счёт" });
  deleteRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry, accounts, transactions }) });
    onBack(true);
  };

  const save = () => {
    const e = validateBill({ needName: isNewGroup, name, amount, categoryId, payerId, meId, members, rows, split, sym, money, accountAmount,
      methodError: methodCheck(method, members, rows).error });
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    execSave();
  };

  const openMember = members.find(m => m.id === openMemberId);
  // Корректировки участников (угощаю, округление, прощение), отнесённые к этому счёту, удалятся
  // вместе с ним (§7.6). «Угостили меня» — часть самого счёта, о ней не предупреждаем.
  const ownTreats = new Set(entry ? treatedMeAdjustments(groupEntries, entry.id).map(a => a.id) : []);
  const billAdjustments = entry ? groupEntries.filter(e => e.bill_id === entry.id && !ownTreats.has(e.id)) : [];
  const deleteMessage = [
    entry?.transaction_id && (entry.linked_tx_snapshot
      ? "Расход останется на счёте обычной транзакцией на полную сумму."
      : "Расход удалится со счёта, деньги вернутся на баланс."),
    billAdjustments.length > 0 && "К счёту относятся корректировки (угощаю, округление или прощение) — они тоже удалятся, и долги станут прежними.",
    "Долги участников пересчитаются.",
  ].filter(Boolean).join(" ");

  const payerName = payer ? labelOf(payer) : "";
  const amountLabel = iPaid ? "Я заплатил" : payer ? `${payerName} заплатил` : "Сколько заплатил участник";
  const showSummary = split.valid && Number(amount) > 0 && (iPaid ? Object.keys(amounts).some(id => id !== meId) : payer && rows[meId]?.included);
  const groupSym = getSym(groupCurrency);
  const accSym = account ? getSym(account.currency) : "";
  // Моя доля в валюте группы — когда чек в другой валюте, показываем «≈».
  const myShareGroup = currency !== groupCurrency && money.amount ? myShare * money.amountGroup / money.amount : null;
  const linkedAcc = linked && accounts.find(a => a.id === linked.account_id);
  const headerTitle = isNewGroup ? "Новая группа" : entry ? "Счёт" : "Новый счёт";

  if (showCur) return <CurrencyPage value={currency} onSelect={v => { setCurrency(v); setAccountAmount(""); }} onBack={() => setShowCur(false)}/>;

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={headerTitle} onBack={back} right={entry && (
        <button onClick={() => setConfirmDelete(true)} aria-label="Удалить счёт" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="trash" s={20} c={C.errorLight}/>
        </button>
      )}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>

        {draft.offer && (
          <div role="status" style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:8, padding:"10px 12px", borderRadius:12, marginBottom:16, background:C.warnTint, border:`1px solid ${C.warnBorder}` }}>
            <span style={{ flex:"1 1 160px", minWidth:0, fontSize:13, color:C.mid }}>Есть несохранённый черновик</span>
            <button onClick={restoreDraft} style={{ ...chip(true), padding:"6px 12px" }}>Продолжить</button>
            <button onClick={draft.discard} style={{ ...chip(), padding:"6px 12px" }}>Удалить</button>
          </div>
        )}

        {linked && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:16, background:C.infoTint, border:`1px solid ${C.infoBorder}` }}>
            <Ico n="transfer" s={16} c={C.blue}/>
            <span style={{ flex:1, minWidth:0, fontSize:13, color:C.mid, lineHeight:1.4 }}>
              Привязано к транзакции {linkedAcc?.name || "—"} · {getSym(linked.currency)}{fmtAmtAuto(Number(linked.amount))} · {fmtEventDate(linked.date)}.
              Сумма, счёт, категория и дата — из неё.
            </span>
          </div>
        )}


        {isNewGroup && (
          <div style={{ marginBottom:16 }}>
            <FieldLabel error={errors.name}>Название группы</FieldLabel>
            <input value={name} onChange={e => { setName(e.target.value); clearError("name"); }} placeholder="Например, Шашлыки на даче"
              style={fieldInput(errors.name)}/>
          </div>
        )}
        {!isNewGroup && <p style={{ margin:"0 0 14px", fontSize:13, color:C.dim }}>{existingGroup.name}</p>}

        <FieldLabel>Дата</FieldLabel>
        <button onClick={() => setShowCal(true)} disabled={!!linked}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12, background:C.fieldBg, border:`1px solid ${C.border}`, color:"#fff", fontSize:14, cursor: linked ? "default" : "pointer", opacity: linked ? 0.6 : 1, marginBottom:16 }}>
          <Ico n="calendar" s={16} c={C.dim}/> {fmtEventDate(date)}{date === todayStr() ? " · сегодня" : ""}
        </button>

        {!linked && (
          <SharedPayerPicker members={members} meId={meId} payerId={payerId} labelOf={labelOf} onChange={changePayer} error={errors.payer}/>
        )}

        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8 }}>
          <FieldLabel error={errors.amount}>{amountLabel}</FieldLabel>
          {!linked && (
            <button onClick={() => setShowCur(true)} aria-label="Валюта чека"
              style={{ background:"none", border:"none", padding:"0 0 6px", color:C.green, fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
              {currency} ›
            </button>
          )}
        </div>
        <NumInput value={amount} onChange={v => { setAmount(v); clearError("amount"); }} placeholder="0" prefix={sym} disabled={!!linked}
          style={{ ...fieldInput(errors.amount), fontSize:22, fontWeight:700, marginBottom: errors.amount ? 4 : 16, opacity: linked ? 0.6 : 1 }}/>
        {errors.amount && <p style={errorText}>{errors.amount}</p>}

        {iPaid && !linked && (
          <AccSelect accounts={accounts} value={accountId} onChange={v => { setAccountId(v); setAccountAmount(""); clearError("accountAmount"); }}
            label="С какого счёта" allowNone noneLabel="Без счёта (наличные мимо учёта)"/>
        )}
        {money.needsAccountAmount && !linked && (
          <>
            <FieldLabel error={errors.accountAmount}>Списалось со счёта, {account.currency}</FieldLabel>
            <NumInput value={accountAmount} onChange={v => { setAccountAmount(v); clearError("accountAmount"); }} prefix={accSym}
              placeholder={money.estimate ? `≈ ${fmtAmtAuto(money.estimate)}` : "0"}
              style={{ ...fieldInput(errors.accountAmount), marginBottom:6 }}/>
            <p style={hintText}>
              Курс банка отличается от среднего — впишите сумму из выписки.
              {money.estimate > 0 && !accountAmount && (
                <> <button onClick={() => setAccountAmount(String(money.estimate))}
                  style={{ background:"none", border:"none", padding:0, color:C.green, fontSize:11, cursor:"pointer" }}>Подставить ≈ {accSym}{fmtAmtAuto(money.estimate)}</button></>
              )}
            </p>
          </>
        )}

        <FieldLabel>Что</FieldLabel>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Например, ужин" style={{ ...fieldInput(), marginBottom:16 }}/>

        <FieldLabel error={errors.category}>Категория</FieldLabel>
        <div style={{ marginBottom:16, pointerEvents: linked ? "none" : "auto", opacity: linked ? 0.6 : 1 }} aria-disabled={!!linked}>
          <CategoryPicker cats={cats} value={categoryId} onChange={id => { setCategoryId(id); clearError("category"); }}/>
        </div>
        {errors.category && <p style={{ ...errorText, marginTop:-8 }}>{errors.category}</p>}

        <FieldLabel>Весь счёт заведения (необязательно)</FieldLabel>
        <NumInput value={venueTotal} onChange={setVenueTotal} placeholder="Если платили не только вы" prefix={sym} style={{ ...fieldInput(), marginBottom:20 }}/>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <FieldLabel error={errors.coverage}>Кого покрыл</FieldLabel>
          <SplitMethodPicker value={method} onChange={changeMethod}/>
        </div>
        <SharedCoverageList method={method} total={split.base} feeAmounts={feeAmounts} onWeight={(id, v) => patchRow(id, { weight: v })}
          members={members} rows={rows} amounts={amounts} labelOf={labelOf} sym={sym} payerId={payerId}
          onToggle={id => patchRow(id, { included: !rows[id].included })}
          onOpen={setOpenMemberId}
          onAddPerson={() => setPickerOpen(true)}
          onAddGuest={() => setGuestOpen(true)}
          onAddUnnamed={() => addMember({})}
        />
        {errors.coverage && <p style={{ ...errorText, margin:"10px 0 0" }}>{errors.coverage}</p>}
        <BillFeesEditor fees={fees} supported={feesSupported} onChange={f => { setFees(f); clearError("coverage"); }} sym={sym}/>

        {!iPaid && (
          <div style={{ marginTop:16, padding:"12px 14px", borderRadius:12, background:C.segmentBg }}>
            <Toggle value={treatedMe} onChange={setTreatedMe} label="Угостили меня — возвращать не нужно"/>
            {treatedMe && <p style={{ ...hintText, margin:"8px 0 0" }}>Долга не будет, и в ваши расходы эта трата не попадёт — вы ничего не платили.</p>}
          </div>
        )}

        {showSummary && (
          <div style={{ marginTop:16, padding:"12px 14px", borderRadius:12, background:C.monCard, display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, color:C.dim }}>
              Ваша доля <b style={{ color:"#fff" }}>{sym}{fmtAmtAuto(treatedMe && !iPaid ? 0 : myShare)}</b>
              {myShareGroup != null && !(treatedMe && !iPaid) && <> ≈ {groupSym}{fmtAmtAuto(myShareGroup)}</>}
            </span>
            {iPaid
              ? <span style={{ fontSize:13, color:C.dim }}>вернут <b style={{ color:C.green }}>{sym}{fmtAmtAuto((Number(amount) || 0) - myShare)}</b></span>
              : !treatedMe && <span style={{ fontSize:13, color:C.dim, minWidth:0 }}>я должен <b style={{ color:C.errorLight }}>{sym}{fmtAmtAuto(myShare)}</b></span>}
          </div>
        )}

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", margin:"16px 0 0" }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:15, borderRadius:30, background: saving ? C.savingDisabled : C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:20 }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>

        {onPayRest && entry && iPaid && !linked && (
          <>
            <button onClick={() => onPayRest(entry)} disabled={draft.dirty}
              style={{ display:"block", margin:"16px auto 0", background:"none", border:"none", color:C.green, fontSize:14, fontWeight:600, cursor: draft.dirty ? "default" : "pointer", opacity: draft.dirty ? 0.5 : 1 }}>
              Доплатил с другого счёта ›
            </button>
            <p style={{ ...hintText, textAlign:"center", margin:"4px 0 0" }}>
              {draft.dirty ? "Сначала сохраните изменения" : "Второй счёт с тем же составом — например, часть наличными"}
            </p>
          </>
        )}

      </div>

      {showCal && <CalendarPicker mode="single" value={date} onChange={changeDate} onClose={() => setShowCal(false)}/>}

      {openMember && (
        <SharedMemberSheet
          label={labelOf(openMember)} row={rows[openMember.id]} sym={sym} isMe={openMember.is_me}
          nameValue={openMember.label || ""} namePlaceholder={memberLabel({ ...openMember, label: null }, { people, members })}
          onRename={label => setMembers(ms => ms.map(m => (m.id === openMember.id ? { ...m, label } : m)))}
          canRemove={!openMember.is_me && isUnsaved(openMember)}
          onChange={patch => patchRow(openMember.id, patch)}
          onRemove={() => removeMember(openMember.id)}
          onSplitOut={openMember.is_me || method !== "equal" ? null : () => setSplitOutId(openMember.id)} simple={method !== "equal"}
          onClose={() => setOpenMemberId(null)}
        />
      )}

      <PersonPicker
        open={pickerOpen} onClose={() => setPickerOpen(false)} title="Человек из «Люди»"
        people={people} selectedIds={members.filter(m => m.person_id && rows[m.id]?.included).map(m => m.person_id)}
        multiple onConfirm={addPeople}
        onCreated={person => setPeople(prev => [...prev, person])}
      />

      {guestOpen && (
        <GuestNameSheet members={allMembers} exclude={groupGuestNames}
          onClose={() => setGuestOpen(false)} onSubmit={n => { setGuestOpen(false); addMember({ guest_name: n }); }}/>
      )}
      {splitOutId && (
        <GuestNameSheet title="Выделить человека" hint="Кто будет возвращать сам? Можно без имени."
          members={allMembers} exclude={groupGuestNames} submitLabel="Выделить" allowEmpty
          onClose={() => setSplitOutId(null)} onSubmit={splitOut}/>
      )}

      <ConfirmSheet
        open={confirmExit} onClose={() => setConfirmExit(false)} onConfirm={() => onBack(false)}
        title="Выйти без сохранения?"
        message={entry ? "Изменения не сохранятся." : "Черновик останется — продолжить можно, открыв форму снова."}
        confirmLabel="Выйти"
      />
      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={execDelete}
        title="Удалить счёт?"
        message={deleteMessage}
        confirmLabel={deleting ? "Удаление..." : "Удалить"} disabled={deleting} error={deleteError}
      />
    </div>
  );
}
