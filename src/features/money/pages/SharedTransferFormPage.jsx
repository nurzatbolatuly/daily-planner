import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { SHARED_ENTRY_KINDS as K, BALANCE_ADJUSTMENT_NOTE } from "../../../constants/money";
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
import { memberLabel, perHeadOf, offsetOptions } from "../../../utils/sharedExpenses";
import { buildEntryDelete, fmtEventDate } from "../../../utils/sharedSave";
import { buildTransferSave, buildBatchTransferSave, transferClosing, debtWithout, contactOf, linkableTransactions, transferCandidates, defaultBatchParts, personalNetFor } from "../../../utils/sharedTransferSave";
import { ClosingChoice } from "../components/ClosingChoice";
import { ContactField } from "../components/ContactField";
import { LinkTxPicker } from "../components/LinkTxPicker";
import { TransferPartsEditor } from "../components/TransferPartsEditor";
import { OffsetChoice } from "../components/OffsetChoice";
import { chip, chipRow, segmentWrap, segmentBtn, fieldInput, hintText, errorText } from "../components/sharedUi";

// Перевод в группе (docs/shared-expenses.md §12.5): участник → я («Получено») или я → участник
// («Вернуть»). Сравнивается с долгом — варианты закрытия (§9), одно сохранение: перевод +
// корректировка. Счёт необязателен (наличные). «От кого / Кому» — кто реально прислал или кому
// отдал (§5.10), по умолчанию контакт участника. Уже записанную операцию можно привязать
// (§5.13), одним платежом закрыть несколько долгов — пачка с общим batch_id (§5.14), правится и
// удаляется целиком; для пачки варианты закрытия (§9) не предлагаются. Если отправитель — человек
// из «Люди» со встречным личным долгом, перевод можно провести зачётом (§10): деньги не двигаются.
const MAX_QUICK_HEADS = 3;

const keyOf = (groupId, memberId) => `${groupId}:${memberId}`;

export function SharedTransferFormPage({ group, memberId, direction: initialDirection = "in", edit = null, groups = [], members: allMembers, entries: allEntries, people, setPeople, accounts, transactions, debtEvents = [], onBack }) {
  const members = useMemo(() => allMembers.filter(m => m.group_id === group.id), [allMembers, group.id]);
  const entries = useMemo(() => allEntries.filter(e => e.group_id === group.id), [allEntries, group.id]);
  // «Я» в каждой группе свой — нужен для частей пачки из других вечеров.
  const meIds = useMemo(() => Object.fromEntries(allMembers.filter(m => m.is_me).map(m => [m.group_id, m.id])), [allMembers]);
  const meId = meIds[group.id];
  const otherOf = e => (e.from_member_id === meIds[e.group_id] ? e.to_member_id : e.from_member_id);
  const member = members.find(m => m.id === (edit ? otherOf(edit) : memberId));

  // Правка пачки: долги считаются без всех её частей и их корректировок.
  const editBatch = useMemo(() => (edit?.batch_id ? allEntries.filter(e => e.kind === K.transfer && e.batch_id === edit.batch_id) : []), [allEntries, edit]);
  const baseAll = useMemo(() => {
    if (editBatch.length < 2) return allEntries;
    const ids = new Set(editBatch.map(e => e.id));
    return allEntries.filter(e => !ids.has(e.id) && !ids.has(e.transfer_id));
  }, [allEntries, editBatch]);
  const label = member ? memberLabel(member, { people, members }) : "";
  const sym = getSym(group.currency);
  const precision = getPrecision(group.currency);
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;
  const accountsInCur = useMemo(() => accounts.filter(a => a.currency === group.currency), [accounts, group.currency]);

  const debt = useMemo(
    () => debtWithout(baseAll.filter(e => e.group_id === group.id), member?.id, meId, edit, precision).debt,
    [baseAll, group.id, member, meId, edit, precision]);
  const [direction, setDirection] = useState(edit ? (edit.to_member_id === meId ? "in" : "out") : initialDirection);
  const [amount, setAmount] = useState(() => {
    if (edit) return String(edit.amount);
    const owed = initialDirection === "in" ? debt : -debt;
    return owed > 0 ? String(owed) : "";
  });
  const [accountId, setAccountId] = useState(edit ? edit.account_id || "" : accountsInCur[0]?.id || "");
  const [date, setDate] = useState(edit?.date || todayStr());
  const [optionId, setOptionId] = useState(() => {
    const adj = edit && entries.find(e => e.transfer_id === edit.id);
    return adj ? { rounding: "rounding", forgive: "forgive", overpaid_them: "rounding", treated_me: "enough" }[adj.reason] : null;
  });
  const [headsCovered, setHeadsCovered] = useState(edit?.heads_covered || null);
  const [sender, setSender] = useState(() => (edit ? { personId: edit.sender_person_id, name: edit.sender_name } : contactOf(member)));
  const [linkTx, setLinkTx] = useState(() => (edit?.linked_tx_snapshot ? transactions.find(t => t.id === edit.transaction_id) || null : null));
  const [extraKeys, setExtraKeys] = useState(() => editBatch.filter(e => e.id !== edit.id).map(e => keyOf(e.group_id, otherOf(e))));
  // null — распределение по умолчанию (allocateTransfer); объект — пользователь правил части.
  const [partAmounts, setPartAmounts] = useState(() => (editBatch.length > 1
    ? Object.fromEntries(editBatch.map(e => [keyOf(e.group_id, otherOf(e)), String(e.amount)])) : null));
  const [partsError, setPartsError] = useState("");
  const [offset, setOffset] = useState(edit?.method === "offset");
  const [showCal, setShowCal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [amountError, setAmountError] = useState("");

  const closing = useMemo(
    () => transferClosing({ entries, memberId: member?.id, meId, edit, amount, direction, precision }),
    [entries, member, meId, edit, amount, direction, precision]);
  const selectedOption = closing.options.some(o => o.id === optionId) ? optionId : closing.options[0]?.id;

  // «за 1 / за 2 / за всех» (§8.3) — только когда он возвращает мне и в счетах он не один.
  const perHead = useMemo(() => perHeadOf(entries, member?.id, meId, { precision }), [entries, member, meId, precision]);
  const maxHeads = Math.max(1, ...entries.flatMap(e => (e.shares || []).filter(s => s.member_id === member?.id).map(s => Number(s.heads) || 1)));
  const owedNow = direction === "in" ? debt : -debt;
  const quick = owedNow > 0 ? [
    ...(direction === "in" && maxHeads > 1
      ? Array.from({ length: Math.min(maxHeads - 1, MAX_QUICK_HEADS) }, (_, i) => ({ heads: i + 1, label: `за ${i + 1}`, value: Math.min(perHead.perHead * (i + 1), owedNow) }))
      : []),
    { heads: direction === "in" && maxHeads > 1 ? maxHeads : null, label: direction === "in" && maxHeads > 1 ? "за всех" : "весь долг", value: owedNow },
  ] : [];
  // Пачка (§5.14): первый — этот участник, дальше — выбранные кандидаты.
  const candidates = useMemo(
    () => (member ? transferCandidates({ groups, members: allMembers, entries: baseAll, group, sender, direction }) : []),
    [groups, allMembers, baseAll, group, sender, direction, member]);
  const labelIn = m => memberLabel(m, { people, members: allMembers.filter(x => x.group_id === m.group_id) });
  const mainKey = member ? keyOf(group.id, member.id) : "";
  const picked = member ? [
    { key: mainKey, member, group, debt: Math.max(owedNow, 0) },
    ...extraKeys.map(k => {
      const c = candidates.find(x => keyOf(x.group.id, x.member.id) === k);
      if (c) return { key: k, ...c };
      const [gid, mid] = k.split(":");
      return { key: k, member: allMembers.find(m => m.id === mid), group: groups.find(g => g.id === gid), debt: 0 };
    }).filter(p => p.member && p.group),
  ] : [];
  const useBatch = picked.length > 1 || editBatch.length > 1;
  const autoParts = defaultBatchParts(Number(amount) || 0, picked, precision);
  const parts = picked.map((p, i) => ({ ...p, amount: partAmounts ? partAmounts[p.key] ?? "0" : String(autoParts[i].amount) }));
  const partsSum = roundTo(parts.reduce((x, p) => x + (Number(p.amount) || 0), 0), precision);
  const toggleExtra = key => { setExtraKeys(ks => (ks.includes(key) ? ks.filter(k => k !== key) : [...ks, key])); setPartAmounts(null); setPartsError(""); };
  const changePart = (key, v) => { setPartAmounts(Object.fromEntries(parts.map(p => [p.key, p.key === key ? v : p.amount]))); setPartsError(""); };

  // Привязка уже записанной операции (§5.13): новая — пока не сохранена, можно отвязать.
  const isNewLink = !!linkTx && !edit?.linked_tx_snapshot;
  const linkCandidates = useMemo(() => (accountId && Number(amount) > 0 && !linkTx ? linkableTransactions({
    transactions, accountId, type: direction === "in" ? "income" : "expense", amount: Number(amount), date,
    sharedEntries: allEntries, debtEvents, excludeNote: BALANCE_ADJUSTMENT_NOTE,
  }) : []), [transactions, accountId, direction, amount, date, allEntries, debtEvents, linkTx]);
  const link = t => { setLinkTx(t); setDate(t.date); };

  const pickQuick = q => { setAmount(String(roundTo(q.value, precision))); setHeadsCovered(q.heads); setAmountError(""); };

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить перевод" });
  // Зачёт (§10): отправитель — человек, у него встречный личный долг; не для пачки и привязки.
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const personNet = useMemo(() => personalNetFor(sender.personId, debtEvents, { rates, currency: group.currency, excludeEventId: edit?.debt_event_id }),
    [sender.personId, debtEvents, rates, group.currency, edit]);
  const offsetPerson = sender.personId ? people.find(x => x.id === sender.personId) : null;
  // Зачёт возможен только против встречного долга в нужную сторону (offsetOptions). Галка «Зачесть»
  // может остаться от другого направления или отправителя — без этой проверки она тайно записала бы
  // зачёт, который увеличивает личный долг вместо того, чтобы его гасить.
  const offsetLimit = offsetOptions({ direction, amount: 0, personNet, precision });
  const canOffset = !!offsetPerson && !useBatch && !linkTx && offsetLimit.available;
  const offsetActive = offset && canOffset;
  const chooseOffset = (on, capped) => { setOffset(on); if (on && capped != null) setAmount(String(capped)); setAmountError(""); };

  const senderLabel = (sender.personId && people.find(x => x.id === sender.personId)?.name) || sender.name || label;
  saveRef.current = async () => {
    const linkForm = isNewLink ? linkTx : undefined;
    const p = useBatch
      ? buildBatchTransferSave({
          form: { direction, accountId, date, sender, linkTx: linkForm, meIds, parts: parts.map(x => ({ member: x.member, group: x.group, amount: Number(x.amount) || 0 })) },
          edit: editBatch.length ? editBatch : edit ? [edit] : [], entries: allEntries, accounts, transactions, newId, senderLabel,
        })
      : buildTransferSave({
          form: { direction, amount: Number(amount), accountId, date, optionId: selectedOption, headsCovered, sender, linkTx: linkForm,
                  offset: offsetActive ? { personId: sender.personId, sign: direction === "out" ? -1 : 1 } : null },
          group, meId, member, memberName: label, entries, edit, accounts, transactions, newId, precision,
        });
    await supaRpc("save_shared_entry", { p });
    onBack(true);
  };

  const deleteRef = useRef(null);
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить перевод" });
  deleteRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry: edit, entries: allEntries, accounts, transactions }) });
    onBack(true);
  };

  const save = () => {
    if (!(Number(amount) > 0)) return setAmountError("Введите сумму");
    if (useBatch && partsSum !== roundTo(Number(amount), precision)) return setPartsError("Сумма частей не равна платежу");
    if (offsetActive && Number(amount) > offsetLimit.max) return setAmountError(`Зачесть можно не больше ${fmt(offsetLimit.max)}`);
    execSave();
  };

  // Участник удалён (или ссылка на старую запись) — объясняем вместо пустого экрана.
  if (!member) {
    return (
      <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff" }}>
        <PageHeader title="Перевод" onBack={() => onBack(false)}/>
        <p style={{ margin:0, padding:"40px 24px", textAlign:"center", fontSize:14, color:C.dim, lineHeight:1.5 }}>
          Участник не найден — возможно, его удалили из группы.
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Перевод" : direction === "in" ? "Получено" : "Вернуть"} onBack={() => onBack(false)} right={edit && (
        <button onClick={() => setConfirmDelete(true)} aria-label="Удалить перевод" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="trash" s={20} c={C.errorLight}/>
        </button>
      )}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <p style={{ margin:"0 0 12px", fontSize:13, color:C.dim }}>{group.name}</p>

        <div style={{ ...segmentWrap, marginBottom:16 }}>
          {[["in", `${label} → мне`], ["out", `Я → ${label}`]].map(([v, l]) => (
            <button key={v} onClick={() => { setDirection(v); setOptionId(null); setHeadsCovered(null); setExtraKeys([]); setPartAmounts(null); }}
              disabled={!!linkTx} style={{ ...segmentBtn(direction === v), cursor: linkTx ? "default" : "pointer" }}>
              {l}
            </button>
          ))}
        </div>

        <ContactField label={direction === "in" ? "От кого" : "Кому"} value={sender} onChange={setSender}
          people={people} setPeople={setPeople} members={allMembers} allowEmpty emptyLabel="Без имени"/>
        {(maxHeads > 1 || (!member.person_id && !member.guest_name)) && (
          <p style={{ ...hintText, marginTop:-8 }}>Долг лежит на участнике целиком — вернуть за компашку может любой из неё.</p>
        )}

        {quick.length > 0 && !useBatch && !linkTx && (
          <>
            <div style={{ ...chipRow, marginBottom:6 }}>
              {quick.map(q => (
                <button key={q.label} onClick={() => pickQuick(q)} style={chip(Number(amount) === roundTo(q.value, precision))}>
                  {q.label} · {fmt(q.value)}
                </button>
              ))}
            </div>
            {direction === "in" && perHead.breakdown.length > 1 && (
              <p style={{ margin:"0 0 6px", fontSize:11, color:C.dim }}>
                за 1: {perHead.breakdown.map(b => `${b.title || "счёт"} ${fmtAmtAuto(b.perHead)}`).join(" · ")}
              </p>
            )}
            {direction === "in" && perHead.extras > 0 && (
              <p style={{ margin:"0 0 6px", fontSize:11, color:C.amber }}>+ личное {fmt(perHead.extras)} — не входит в «за 1»</p>
            )}
            <div style={{ height:10 }}/>
          </>
        )}

        <FieldLabel error={amountError}>Сумма</FieldLabel>
        <NumInput value={amount} onChange={v => { setAmount(v); setHeadsCovered(null); setAmountError(""); setPartAmounts(null); }} placeholder="0" prefix={sym}
          disabled={!!linkTx} style={{ ...fieldInput(amountError), fontSize:22, fontWeight:700, marginBottom: amountError ? 4 : 16, opacity: linkTx ? 0.6 : 1 }}/>
        {amountError && <p style={errorText}>{amountError}</p>}

        <TransferPartsEditor
          parts={parts.map((x, i) => ({ key: x.key, label: labelIn(x.member), groupName: x.group.id === group.id ? "" : x.group.name, debt: x.debt, amount: x.amount, removable: i > 0 }))}
          options={candidates.filter(c => keyOf(c.group.id, c.member.id) !== mainKey).map(c => ({ key: keyOf(c.group.id, c.member.id), label: labelIn(c.member), groupName: c.group.name, debt: c.debt }))}
          total={Number(amount) || 0} precision={precision} fmt={fmt} sym={sym} error={partsError}
          onChangeAmount={changePart} onToggle={toggleExtra}
        />

        {Number(amount) > 0 && !useBatch && (
          <ClosingChoice closing={closing} direction={direction} fmt={fmt} value={selectedOption} onChange={setOptionId}/>
        )}

        {canOffset && (
          <OffsetChoice personName={offsetPerson.name} personNet={personNet} direction={direction} amount={amount}
            value={offsetActive} onChange={chooseOffset} fmt={fmt} precision={precision}/>
        )}

        {!linkTx && !offsetActive && (
          <AccSelect accounts={accountsInCur} value={accountId} onChange={setAccountId}
            label={direction === "in" ? "Куда пришли деньги" : "С какого счёта"} allowNone noneLabel="Наличными / без счёта"/>
        )}
        {!offsetActive && (linkTx || (accountId && Number(amount) > 0)) && (
          <LinkTxPicker candidates={linkCandidates} linked={linkTx} canUnlink={isNewLink} fmt={fmt}
            onLink={link} onUnlink={() => setLinkTx(null)}/>
        )}

        <FieldLabel>Дата</FieldLabel>
        <button onClick={() => setShowCal(true)} disabled={!!linkTx}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12, background:C.fieldBg, border:`1px solid ${C.border}`, color:"#fff", fontSize:14, cursor: linkTx ? "default" : "pointer", opacity: linkTx ? 0.6 : 1, marginBottom:16 }}>
          <Ico n="calendar" s={16} c={C.dim}/> {fmtEventDate(date)}{date === todayStr() ? " · сегодня" : ""}
        </button>

        <p style={{ margin:"0 0 8px", fontSize:11, color:C.dim, lineHeight:1.4 }}>
          Перевод — не расход и не доход: в категории не попадёт, меняет только баланс счёта и долг.
        </p>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", margin:"12px 0 0" }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:15, borderRadius:30, background: saving ? C.savingDisabled : C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:16 }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {showCal && <CalendarPicker mode="single" value={date} onChange={v => { setDate(v); setShowCal(false); }} onClose={() => setShowCal(false)}/>}

      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={execDelete}
        title="Удалить перевод?"
        message={[
          editBatch.length > 1 && `Платёж закрывал ${editBatch.length} долга — удалится целиком.`,
          edit?.method === "offset" && "Зачёт отменится — личный долг вернётся к прежней сумме.",
          edit?.transaction_id && (edit.linked_tx_snapshot
            ? "Операция останется на счёте, ей вернётся прежняя категория."
            : "Операция удалится со счёта, баланс вернётся."),
          "Округление или прощение, сохранённые вместе с переводом, тоже удалятся — долг пересчитается.",
        ].filter(Boolean).join(" ")}
        confirmLabel={deleting ? "Удаление..." : "Удалить"} disabled={deleting} error={deleteError}
      />
    </div>
  );
}
