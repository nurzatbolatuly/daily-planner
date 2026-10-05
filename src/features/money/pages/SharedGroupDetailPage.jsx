import { useMemo, useRef, useState } from "react";
import { C } from "../../../constants/theme";
import { SHARED_ENTRY_KINDS as K, SHARED_ADJUST_REASONS as R, SHARED_TRANSFER_METHODS as M } from "../../../constants/money";
import { PageHeader } from "../../../components/PageHeader";
import { Spinner } from "../../../components/Spinner";
import { Ico } from "../../../components/Ico";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, getPrecision, pluralRu } from "../../../utils/format";
import { memberBalances, memberStatus, memberLabel, groupSummary, myShareOf, memberDebtLines, adjustLabel, groupHeadcount } from "../../../utils/sharedExpenses";
import { fmtEventDate, treatedMeAdjustments, buildEntryDelete } from "../../../utils/sharedSave";
import { buildTreatSave, buildAdjustmentsDelete } from "../../../utils/sharedTransferSave";
import { tricountTargets } from "../../../utils/sharedMirrorSave";
import { SharedEntryRow } from "../components/SharedEntryRow";
import { SharedMemberDebtSheet } from "../components/SharedMemberDebtSheet";
import { SaveGuestSheet } from "../components/SaveGuestSheet";
import { CloseGroupSheet } from "../components/CloseGroupSheet";
import { RenameMemberSheet } from "../components/RenameMemberSheet";
import { MoveToTricountSheet } from "../components/MoveToTricountSheet";
import { sheetBtn } from "../components/sharedUi";

const STATUS_TEXT = { partial: "вернул частично", open: "не вернул" };

const sectionTitle = text => <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:C.dim }}>{text}</p>;
const rowBox = { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, background:C.rowBg, border:`1px solid ${C.border}` };
const actionBtn = { padding:"8px 14px", borderRadius:20, border:"none", background:C.green, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 };

// Корректировки без перевода («угощаю») хранятся по строке на счёт с общим batch_id — показываем пачкой.
// «Угостили меня» (treated_me без перевода) — часть счёта, видна на его строке и правится в нём.
function treatBatches(entries) {
  const map = new Map();
  entries.filter(e => e.kind === K.adjust && !e.transfer_id && e.reason !== R.treated_me).forEach(e => {
    const key = e.batch_id || e.id;
    map.set(key, [...(map.get(key) || []), e]);
  });
  return [...map.values()];
}

// Экран вечера (event, docs/shared-expenses.md §12.3): кто кому должен, счета, переводы.
export function SharedGroupDetailPage({ group, groups, members: allMembers, entries: allEntries, people, accounts, expCats, navigate, onReload, onBack }) {
  const members = useMemo(() => allMembers.filter(m => m.group_id === group?.id), [allMembers, group]);
  const entries = useMemo(() => allEntries.filter(e => e.group_id === group?.id), [allEntries, group]);
  const precision = getPrecision(group?.currency);
  const sym = getSym(group?.currency);
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;

  const balances = useMemo(() => memberBalances(entries, members, { precision }), [entries, members, precision]);
  const summary = useMemo(() => groupSummary(entries, members, { precision }), [entries, members, precision]);
  const meId = members.find(m => m.is_me)?.id;

  const [sheetMemberId, setSheetMemberId] = useState(null);
  const [treatMemberId, setTreatMemberId] = useState(null);
  const [undoBatch, setUndoBatch] = useState(null);
  const [saveGuestId, setSaveGuestId] = useState(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [moveId, setMoveId] = useState(null);
  const [undoMove, setUndoMove] = useState(null);

  const treatRef = useRef(null);
  const { save: execTreat, saving: treating, saveError: treatError } = useSave(() => treatRef.current(), { errorMsg: "Не удалось сохранить" });
  treatRef.current = async () => {
    await supaRpc("save_shared_entry", { p: buildTreatSave({ group, memberId: treatMemberId, meId, entries, date: todayStr(), newId, precision }) });
    setTreatMemberId(null);
    await onReload();
  };
  const undoMoveRef = useRef(null);
  const { save: execUndoMove, saving: undoingMove, saveError: undoMoveError } = useSave(() => undoMoveRef.current(), { errorMsg: "Не удалось отменить" });
  undoMoveRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry: undoMove, entries: allEntries, accounts: [], transactions: [] }) });
    setUndoMove(null);
    await onReload();
  };
  const undoRef = useRef(null);
  const { save: execUndo, saving: undoing, saveError: undoError } = useSave(() => undoRef.current(), { errorMsg: "Не удалось отменить" });
  undoRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildAdjustmentsDelete(undoBatch) });
    setUndoBatch(null);
    await onReload();
  };

  // Группа только что создана и стор ещё перезагружается.
  if (!group) return <div style={{ background:C.monBg, minHeight:"calc(100dvh - var(--app-header-h))" }}><Spinner color={C.green}/></div>;

  const labelOf = m => memberLabel(m, { people, members });
  // Куда можно перенести долг человека («Записать в Tricount»): его группы Tricount той же валюты.
  const moveTargets = m => tricountTargets(m, { groups, members: allMembers, currency: group.currency });
  const memberById = id => members.find(m => m.id === id);
  const catOf = id => expCats.find(c => c.id === id);
  const titleOf = e => e.title || catOf(e.category_id)?.name || "Счёт";

  const participants = members
    .filter(m => !m.is_me && balances[m.id] && (balances[m.id].accrued || balances[m.id].balance))
    .map(m => ({ m, ...balances[m.id], status: memberStatus(balances[m.id]) }));
  const iOwe = participants.filter(p => p.balance < 0 && p.status !== "advance").sort((a, b) => a.balance - b.balance);
  const owedToMe = participants.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);
  const settled = participants.filter(p => p.balance === 0);
  const advances = participants.filter(p => p.status === "advance");

  const bills = entries.filter(e => e.kind === K.bill);
  const headcount = groupHeadcount(entries, members);
  const allSettled = summary.participants > 0 && summary.settled === summary.participants;
  const hasOpenDebts = summary.owedToMe > 0 || summary.iOwe > 0;
  const transfers = entries.filter(e => e.kind === K.transfer);
  // Часть одного платежа на несколько долгов (§5.14): показываем весь платёж — части могут быть
  // и в других вечерах.
  const batchTotal = t => {
    if (!t.batch_id) return null;
    const parts = allEntries.filter(e => e.kind === K.transfer && e.batch_id === t.batch_id);
    return parts.length > 1 ? parts.reduce((x, e) => x + Number(e.amount_group), 0) : null;
  };
  const batches = treatBatches(entries);

  const openTransfer = (memberId, direction) => {
    setSheetMemberId(null);
    navigate("addSharedTransfer", { groupId: group.id, memberId, direction });
  };

  const debtorRow = ({ m, balance, status }) => (
    <div key={m.id} style={rowBox}>
      <div onClick={() => setSheetMemberId(m.id)} style={{ flex:1, minWidth:0, cursor:"pointer" }}>
        <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: balance === 0 ? C.dim : "#fff" }}>{labelOf(m)}</p>
        <p style={{ margin:"2px 0 0", fontSize:12, color: balance === 0 ? C.green : C.dim }}>
          {balance === 0 ? "закрыто ✓" : status === "advance" ? `аванс ${fmt(-balance)}` : `${fmt(Math.abs(balance))} · ${balance < 0 ? "я должен" : STATUS_TEXT[status] || ""}`}
        </p>
      </div>
      {balance > 0 && <button onClick={() => openTransfer(m.id, "in")} style={actionBtn}>Получено</button>}
      {balance < 0 && status !== "advance" && <button onClick={() => openTransfer(m.id, "out")} style={actionBtn}>Вернуть</button>}
    </div>
  );

  const sheetMember = memberById(sheetMemberId);
  const treatMember = memberById(treatMemberId);
  const saveGuestMember = memberById(saveGuestId);

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={group.name} onBack={() => onBack(false)} right={
        <button onClick={() => navigate("editSharedGroup", { groupId: group.id })} aria-label="Настройки группы" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="edit" s={20} c={C.mid}/>
        </button>
      }/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>

        <div style={{ background:C.monCard, borderRadius:16, padding:16, marginBottom:20, display:"flex", gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:11, color:C.dim }}>
              {[group.date && fmtEventDate(group.date), headcount > 0 && `${headcount} ${pluralRu(headcount, ["человек", "человека", "человек"])}`, "моя доля"].filter(Boolean).join(" · ")}
            </p>
            <p style={{ margin:"4px 0 0", fontSize:22, fontWeight:800 }}>{fmt(summary.myShare)}</p>
          </div>
          {(summary.owedToMe > 0 || summary.iOwe > 0) && (
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <p style={{ margin:0, fontSize:11, color:C.dim }}>{summary.owedToMe > 0 ? "Мне должны" : "Я должен"}</p>
              <p style={{ margin:"4px 0 0", fontSize:22, fontWeight:800, color: summary.owedToMe > 0 ? C.green : C.errorLight }}>
                {fmt(summary.owedToMe > 0 ? summary.owedToMe : summary.iOwe)}
              </p>
            </div>
          )}
        </div>

        {group.archived && (
          <p style={{ margin:"-8px 0 16px", fontSize:12, color:C.dim, textAlign:"center" }}>В архиве · вернуть можно в настройках</p>
        )}
        {!group.archived && allSettled && (
          <button onClick={() => setCloseOpen(true)} style={{ ...sheetBtn("secondary"), color:C.green, margin:"-8px 0 16px" }}>
            Рассчитались ✓ · В архив
          </button>
        )}

        {iOwe.length > 0 && <>{sectionTitle("Я должен")}{iOwe.map(debtorRow)}<div style={{ height:14 }}/></>}
        {(owedToMe.length > 0 || settled.length > 0 || advances.length > 0) && (
          <>{sectionTitle("Мне должны")}{[...owedToMe, ...advances, ...settled].map(debtorRow)}<div style={{ height:14 }}/></>
        )}

        {sectionTitle("Счета")}
        {bills.length === 0 && <p style={{ margin:"8px 0 14px", fontSize:13, color:C.dim }}>Добавьте первый счёт</p>}
        {bills.map(b => {
          const acc = accounts.find(a => a.id === b.account_id);
          const payer = b.payer_member_id !== meId && memberById(b.payer_member_id);
          const treatedMe = payer && treatedMeAdjustments(entries, b.id).length > 0;
          return (
            <SharedEntryRow key={b.id} cat={catOf(b.category_id)} sym={getSym(b.currency || group.currency)}
              title={titleOf(b)}
              sub={[payer ? `платил ${labelOf(payer)}` : acc?.name || "без счёта", fmtEventDate(b.date)].join(" · ")}
              amount={Number(b.amount)}
              hint={treatedMe ? "угостили меня" : `моя доля ${fmt(myShareOf(b, meId, entries, { precision }))}`}
              onClick={() => navigate("editSharedEntry", { entryId: b.id })}
            />
          );
        })}
        <button onClick={() => navigate("addSharedBill", { groupId: group.id })}
          style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed ${C.greenBorderStrong}`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <Ico n="plus" s={16} c={C.green}/> Счёт
        </button>

        {(transfers.length > 0 || batches.length > 0) && <div style={{ height:20 }}/>}
        {transfers.length > 0 && sectionTitle("Переводы")}
        {transfers.map(t => {
          const incoming = t.to_member_id === meId;
          const other = memberById(incoming ? t.from_member_id : t.to_member_id);
          const adj = entries.filter(e => e.transfer_id === t.id);
          const adjSum = adj.reduce((s, a) => s + Number(a.amount_group), 0);
          const acc = accounts.find(a => a.id === t.account_id);
          return (
            <div key={t.id} onClick={() => (t.method === M.group ? setUndoMove(t) : navigate("editSharedEntry", { entryId: t.id }))} style={{ ...rowBox, cursor:"pointer" }}>
              <Ico n="transfer" s={18} c={incoming ? C.green : C.errorLight}/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {incoming ? "←" : "→"} {other ? labelOf(other) : "?"}
                </p>
                <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {[t.method === M.offset ? "зачёт с личным долгом" : t.method === M.group ? t.note || "записано в Tricount" : acc?.name || "наличные", fmtEventDate(t.date), batchTotal(t) && `часть платежа ${fmt(batchTotal(t))}`, adj.length ? `${adjustLabel(adj[0])} ${adjSum < 0 ? "−" : "+"}${fmtAmtAuto(Math.abs(adjSum))}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span style={{ fontSize:14, fontWeight:700, color: incoming ? C.green : "#fff", whiteSpace:"nowrap", flexShrink:0 }}>{fmt(Number(t.amount))}</span>
            </div>
          );
        })}

        {batches.map(batch => {
          const m = memberById(batch[0].member_id);
          const sum = batch.reduce((s, a) => s + Number(a.amount_group), 0);
          return (
            <div key={batch[0].id} style={rowBox}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {adjustLabel(batch[0])} · {m ? labelOf(m) : "?"}
                </p>
                <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>{fmtEventDate(batch[0].date)} · в мою долю</p>
              </div>
              <span style={{ fontSize:14, fontWeight:700, whiteSpace:"nowrap" }}>{fmt(Math.abs(sum))}</span>
              <button onClick={() => setUndoBatch(batch)} aria-label="Отменить" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
                <Ico n="trash" s={16} c={C.dim}/>
              </button>
            </div>
          );
        })}

        {!group.archived && hasOpenDebts && (
          <button onClick={() => setCloseOpen(true)} style={{ ...sheetBtn("secondary"), marginTop:28 }}>Закрыть группу</button>
        )}
      </div>

      {closeOpen && (
        <CloseGroupSheet group={group} members={members} entries={entries} labelOf={labelOf} fmt={fmt}
          onSaved={async () => { setCloseOpen(false); await onReload(); }} onClose={() => setCloseOpen(false)}/>
      )}

      {sheetMember && (
        <SharedMemberDebtSheet
          label={labelOf(sheetMember)} groupName={group.name}
          balance={balances[sheetMember.id]?.balance || 0}
          lines={memberDebtLines(entries, sheetMember.id, meId)}
          fmt={fmt} titleOf={titleOf}
          onTransfer={direction => openTransfer(sheetMember.id, direction)}
          onTreat={() => { setSheetMemberId(null); setTreatMemberId(sheetMember.id); }}
          onSaveToPeople={sheetMember.guest_name && !sheetMember.person_id ? () => { setSheetMemberId(null); setSaveGuestId(sheetMember.id); } : null}
          onRename={() => { setSheetMemberId(null); setRenameId(sheetMember.id); }}
          onMoveToTricount={moveTargets(sheetMember).length ? () => { setSheetMemberId(null); setMoveId(sheetMember.id); } : null}
          onClose={() => setSheetMemberId(null)}
        />
      )}

      {memberById(moveId) && (
        <MoveToTricountSheet tusa={group} tusaMember={memberById(moveId)} tusaMeId={meId} label={labelOf(memberById(moveId))}
          debt={balances[moveId]?.balance || 0} targets={moveTargets(memberById(moveId))} members={allMembers} sym={sym} fmt={fmt}
          onSaved={async () => { setMoveId(null); await onReload(); }} onClose={() => setMoveId(null)}/>
      )}
      <ConfirmSheet
        open={!!undoMove} onClose={() => setUndoMove(null)} onConfirm={execUndoMove}
        title="Отменить запись в Tricount?" message="Покупка в группе Tricount удалится, а долг снова появится в этой тусе."
        confirmLabel={undoingMove ? "Отмена..." : "Отменить"} disabled={undoingMove} error={undoMoveError}
      />

      {memberById(renameId) && (
        <RenameMemberSheet member={memberById(renameId)} placeholder={memberLabel({ ...memberById(renameId), label: null }, { people, members })}
          onSaved={async () => { setRenameId(null); await onReload(); }} onClose={() => setRenameId(null)}/>
      )}

      {saveGuestMember && (
        <SaveGuestSheet member={saveGuestMember} groups={groups} members={allMembers} entries={allEntries} people={people}
          onSaved={async () => { setSaveGuestId(null); await onReload(); }}
          onClose={() => setSaveGuestId(null)}/>
      )}

      <ConfirmSheet
        open={!!treatMember} onClose={() => setTreatMemberId(null)} onConfirm={execTreat} tone="confirm"
        title={treatMember ? `Угощаю: ${labelOf(treatMember)}` : ""}
        message={treatMember ? `Долг ${fmt(balances[treatMember.id]?.balance || 0)} закроется и добавится к вашей доле в категориях этих счетов. Отменить можно в ленте группы.` : ""}
        confirmLabel={treating ? "Сохранение..." : "Угощаю"} disabled={treating} error={treatError}
      />
      <ConfirmSheet
        open={!!undoBatch} onClose={() => setUndoBatch(null)} onConfirm={execUndo}
        title="Отменить «угощаю»?"
        message="Участник снова будет должен эту сумму, ваша доля в категориях уменьшится."
        confirmLabel={undoing ? "Отмена..." : "Отменить угощение"} disabled={undoing} error={undoError}
      />
    </div>
  );
}
