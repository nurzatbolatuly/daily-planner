import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BALANCE_ADJUSTMENT_NOTE } from "../../../constants/money";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { AccSelect } from "../../../components/AccSelect";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { Ico } from "../../../components/Ico";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, getPrecision, roundTo, ratesFromAccounts } from "../../../utils/format";
import { memberLabel, mirrorBalance, offsetOptions } from "../../../utils/sharedExpenses";
import { buildEntryDelete, fmtEventDate } from "../../../utils/sharedSave";
import { buildTransferSave, contactOf, linkableTransactions, personalNetFor } from "../../../utils/sharedTransferSave";
import { LinkTxPicker } from "../components/LinkTxPicker";
import { OffsetChoice } from "../components/OffsetChoice";
import { fieldInput, chip, chipRow, segmentWrap, segmentBtn, hintText, errorText } from "../components/sharedUi";

// Перевод в квартире (docs/shared-expenses.md §5.1, §5.1a): вношу ровно то, что подсказал Tricount
// («Я → Дима 73 000», «Асхат → Я 25 000»). Перевод меняет мой баланс с ГРУППОЙ, кто прислал —
// только подпись: переплат и недоплат конкретного человека нет (§9 — только для вечера).
// Зачёт (§10) делается здесь же, в момент расчёта по подсказке Tricount: «я → Дима 13 000», а
// лично Дима должен мне 20 000 → зачесть, деньги не двигаются.
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

export function SharedMirrorTransferPage({ group, edit = null, members: allMembers, entries: allEntries, people, accounts, transactions, debtEvents = [], onBack }) {
  const members = useMemo(() => allMembers.filter(m => m.group_id === group.id).sort(byOrder), [allMembers, group.id]);
  const entries = useMemo(() => allEntries.filter(e => e.group_id === group.id), [allEntries, group.id]);
  const meId = members.find(m => m.is_me)?.id;
  const others = members.filter(m => !m.is_me);
  const sym = getSym(group.currency);
  const precision = getPrecision(group.currency);
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;
  const accountsInCur = useMemo(() => accounts.filter(a => a.currency === group.currency), [accounts, group.currency]);
  // Баланс без правимого перевода — от него считаются подсказка суммы и «после перевода».
  const balance = useMemo(() => mirrorBalance(edit ? entries.filter(e => e.id !== edit.id) : entries, meId, { precision }), [entries, edit, meId, precision]);

  const [direction, setDirection] = useState(edit ? (edit.from_member_id === meId ? "out" : "in") : balance < 0 ? "out" : "in");
  const [memberId, setMemberId] = useState(edit ? (edit.from_member_id === meId ? edit.to_member_id : edit.from_member_id) : others[0]?.id);
  const [amount, setAmount] = useState(edit ? String(edit.amount) : balance ? String(Math.abs(balance)) : "");
  const [accountId, setAccountId] = useState(edit ? edit.account_id || "" : accountsInCur[0]?.id || "");
  const [date, setDate] = useState(edit?.date || todayStr());
  const [linkTx, setLinkTx] = useState(() => (edit?.linked_tx_snapshot ? transactions.find(t => t.id === edit.transaction_id) || null : null));
  const [error, setError] = useState("");
  const [showCal, setShowCal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offset, setOffset] = useState(edit?.method === "offset");

  const member = members.find(m => m.id === memberId);
  const labelOf = m => memberLabel(m, { people, members });
  const value = Number(amount) || 0;
  const after = roundTo(balance + (direction === "out" ? value : -value), precision);
  const isNewLink = !!linkTx && !edit?.linked_tx_snapshot;
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const offsetPerson = member?.person_id ? people.find(x => x.id === member.person_id) : null;
  const personNet = useMemo(() => personalNetFor(member?.person_id, debtEvents, { rates, currency: group.currency, excludeEventId: edit?.debt_event_id }),
    [member, debtEvents, rates, group.currency, edit]);
  // Зачёт возможен только против встречного долга в нужную сторону (offsetOptions). Галка «Зачесть»
  // может остаться от другого направления или человека — без этой проверки она тайно записала бы
  // зачёт, который увеличивает личный долг вместо того, чтобы его гасить.
  const offsetLimit = offsetOptions({ direction, amount: 0, personNet, precision });
  const canOffset = !!offsetPerson && !linkTx && offsetLimit.available;
  const offsetActive = offset && canOffset;
  const linkCandidates = useMemo(() => (accountId && value > 0 && !linkTx ? linkableTransactions({
    transactions, accountId, type: direction === "in" ? "income" : "expense", amount: value, date,
    sharedEntries: allEntries, debtEvents, excludeNote: BALANCE_ADJUSTMENT_NOTE,
  }) : []), [transactions, accountId, direction, value, date, allEntries, debtEvents, linkTx]);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить перевод" });
  saveRef.current = async () => {
    await supaRpc("save_shared_entry", { p: buildTransferSave({
      form: { direction, amount: value, accountId, date, sender: contactOf(member), linkTx: isNewLink ? linkTx : undefined, noClosing: true,
              offset: offsetActive ? { personId: member.person_id, sign: direction === "out" ? -1 : 1 } : null },
      group, meId, member, memberName: labelOf(member), entries, edit, accounts, transactions, newId, precision,
    }) });
    onBack(true);
  };
  const deleteRef = useRef(null);
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить перевод" });
  deleteRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry: edit, entries: allEntries, accounts, transactions }) });
    onBack(true);
  };

  const save = () => {
    if (!member) return setError("Выберите, кому или от кого");
    if (!(value > 0)) return setError("Введите сумму");
    if (offsetActive && value > offsetLimit.max) return setError(`Зачесть можно не больше ${fmt(offsetLimit.max)}`);
    execSave();
  };
  const balanceText = b => (b === 0 ? "рассчитались" : b < 0 ? `я должен ${fmt(-b)}` : `мне должны ${fmt(b)}`);

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Перевод" onBack={() => onBack(false)} right={edit && (
        <button onClick={() => setConfirmDelete(true)} aria-label="Удалить перевод" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="trash" s={20} c={C.errorLight}/>
        </button>
      )}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <p style={{ margin:"0 0 12px", fontSize:13, color:C.dim }}>{group.name} · сейчас {balanceText(balance)}</p>

        <div style={{ ...segmentWrap, marginBottom:16 }}>
          {[["out", "Я перевёл"], ["in", "Мне перевели"]].map(([v, l]) => (
            <button key={v} onClick={() => setDirection(v)} disabled={!!linkTx} style={{ ...segmentBtn(direction === v), cursor: linkTx ? "default" : "pointer" }}>{l}</button>
          ))}
        </div>

        <FieldLabel>{direction === "out" ? "Кому" : "От кого"}</FieldLabel>
        <div style={{ ...chipRow, marginBottom:6 }}>
          {others.map(m => (
            <button key={m.id} onClick={() => { setMemberId(m.id); setError(""); }} style={{ ...chip(memberId === m.id), maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {labelOf(m)}
            </button>
          ))}
        </div>
        <p style={hintText}>Как подсказал Tricount. Меняет ваш баланс с группой, а не долг этого человека.</p>

        <FieldLabel>Сумма</FieldLabel>
        <NumInput value={amount} onChange={v => { setAmount(v); setError(""); }} placeholder="0" prefix={sym} disabled={!!linkTx}
          style={{ ...fieldInput(!!error), fontSize:22, fontWeight:700, marginBottom:6, opacity: linkTx ? 0.6 : 1 }}/>
        {value > 0 && <p style={{ ...hintText, color: after === 0 ? C.green : C.dim }}>После перевода: {balanceText(after)}{after === 0 ? " ✓" : ""}</p>}
        {error && <p style={errorText}>{error}</p>}

        {canOffset && (
          <OffsetChoice personName={offsetPerson.name} personNet={personNet} direction={direction} amount={amount}
            value={offsetActive} onChange={(on, capped) => { setOffset(on); if (on && capped != null) setAmount(String(capped)); setError(""); }}
            fmt={fmt} precision={precision}/>
        )}

        {!linkTx && !offsetActive && (
          <AccSelect accounts={accountsInCur} value={accountId} onChange={setAccountId}
            label={direction === "in" ? "Куда пришли деньги" : "С какого счёта"} allowNone noneLabel="Наличными / без счёта"/>
        )}
        {!offsetActive && (linkTx || (accountId && value > 0)) && (
          <LinkTxPicker candidates={linkCandidates} linked={linkTx} canUnlink={isNewLink} fmt={fmt}
            onLink={t => { setLinkTx(t); setDate(t.date); }} onUnlink={() => setLinkTx(null)}/>
        )}

        <FieldLabel>Дата</FieldLabel>
        <button onClick={() => setShowCal(true)} disabled={!!linkTx}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12, background:C.fieldBg, border:`1px solid ${C.border}`, color:"#fff", fontSize:14, cursor: linkTx ? "default" : "pointer", opacity: linkTx ? 0.6 : 1, marginBottom:16 }}>
          <Ico n="calendar" s={16} c={C.dim}/> {fmtEventDate(date)}{date === todayStr() ? " · сегодня" : ""}
        </button>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", margin:"12px 0 0" }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:15, borderRadius:30, background: saving ? C.savingDisabled : C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:8 }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {showCal && <CalendarPicker mode="single" value={date} onChange={d => { setDate(d); setShowCal(false); }} onClose={() => setShowCal(false)}/>}
      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={execDelete}
        title="Удалить перевод?"
        message={edit?.method === "offset" ? "Зачёт отменится — личный долг вернётся к прежней сумме." : edit?.linked_tx_snapshot ? "Операция останется на счёте, ей вернётся прежняя категория." : `${edit?.transaction_id ? "Операция удалится со счёта, баланс вернётся. " : ""}Баланс с группой пересчитается.`}
        confirmLabel={deleting ? "Удаление..." : "Удалить"} disabled={deleting} error={deleteError}
      />
    </div>
  );
}
