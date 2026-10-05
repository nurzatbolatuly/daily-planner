import { useMemo, useRef, useState } from "react";
import { C } from "../../../constants/theme";
import { SHARED_ENTRY_KINDS as K, SHARED_TRANSFER_METHODS as M } from "../../../constants/money";
import { RU_MONTHS } from "../../../constants/locale";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, getPrecision } from "../../../utils/format";
import { memberLabel, mirrorBalance, mirrorBalanceByMonth, groupMonthSummary, billMemberDebt } from "../../../utils/sharedExpenses";
import { fmtEventDate, buildEntryDelete } from "../../../utils/sharedSave";
import { shiftMonth } from "../../../utils/sharedMirrorSave";
import { SharedEntryRow } from "../components/SharedEntryRow";
import { ReconcileSheet } from "../components/ReconcileSheet";
import { RepeatMonthSheet } from "../components/RepeatMonthSheet";
import { sheetBtn } from "../components/sharedUi";

// Квартира — зеркало Tricount (docs/shared-expenses.md §12.4): мой накопительный баланс с группой
// (с раскладкой по месяцам), лента месяца с покупками и переводами.
const rowBox = { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, background:C.rowBg, border:`1px solid ${C.border}` };
const navBtn = { background:"none", border:"none", cursor:"pointer", display:"flex", padding:8 };
const monthLabel = key => `${RU_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const shiftKey = (key, n) => shiftMonth(`${key}-01`, n).slice(0, 7);

export function SharedMirrorPage({ group, members: allMembers, entries: allEntries, people, accounts, expCats, navigate, onReload, onBack }) {
  const members = useMemo(() => allMembers.filter(m => m.group_id === group.id), [allMembers, group.id]);
  const entries = useMemo(() => allEntries.filter(e => e.group_id === group.id), [allEntries, group.id]);
  const meId = members.find(m => m.is_me)?.id;
  const precision = getPrecision(group.currency);
  const sym = getSym(group.currency);
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;
  const signed = n => `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;

  const balance = useMemo(() => mirrorBalance(entries, meId, { precision }), [entries, meId, precision]);
  const months = useMemo(() => mirrorBalanceByMonth(entries, meId, { precision }), [entries, meId, precision]);
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const summary = useMemo(() => groupMonthSummary(entries, month, meId, { precision }), [entries, month, meId, precision]);
  const prevMonthBills = useMemo(() => entries.filter(e => e.kind === K.bill && e.date?.slice(0, 7) === shiftKey(month, -1)), [entries, month]);

  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [deleteReconcile, setDeleteReconcile] = useState(null);
  const [undoMove, setUndoMove] = useState(null);

  const deleteRef = useRef(null);
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить сверку" });
  deleteRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry: deleteReconcile, accounts, transactions: [] }) });
    setDeleteReconcile(null);
    await onReload();
  };

  // Покупка, перенесённая с тусы («Записать в Tricount»): пара с переводом method 'group'.
  const isMoved = e => !!e.batch_id && allEntries.some(x => x.batch_id === e.batch_id && x.method === M.group);
  const undoMoveRef = useRef(null);
  const { save: execUndoMove, saving: undoingMove, saveError: undoMoveError } = useSave(() => undoMoveRef.current(), { errorMsg: "Не удалось отменить" });
  undoMoveRef.current = async () => {
    await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry: undoMove, entries: allEntries, accounts, transactions: [] }) });
    setUndoMove(null);
    await onReload();
  };
  const labelOf = m => memberLabel(m, { people, members });
  const memberById = id => members.find(m => m.id === id);
  const catOf = id => expCats.find(c => c.id === id);
  const titleOf = e => e.title || catOf(e.category_id)?.name || "Покупка";
  const payerOf = e => (e.payer_member_id === meId ? "я" : labelOf(memberById(e.payer_member_id) || {}));
  const open = e => navigate("editSharedEntry", { entryId: e.id });
  const reload = async () => { setReconcileOpen(false); setRepeatOpen(false); await onReload(); };

  const billRow = e => {
    const acc = e.payer_member_id === meId && accounts.find(a => a.id === e.account_id);
    const moved = isMoved(e);
    return (
      <SharedEntryRow key={e.id} cat={catOf(e.category_id)} sym={sym} title={titleOf(e)}
        sub={[moved ? "перенесено с тусы" : e.payer_member_id === meId ? acc?.name || "я, без счёта" : `платил ${payerOf(e)}`, fmtEventDate(e.date)].join(" · ")}
        amount={Number(e.amount_group)} hint={`моя доля ${fmt(billMemberDebt(e, meId))}`} onClick={() => (moved ? setUndoMove(e) : open(e))}/>
    );
  };

  const feedRow = item => {
    if (item.kind === K.bill) return billRow(item);
    if (item.kind === K.transfer) {
      const out = item.from_member_id === meId;
      const other = memberById(out ? item.to_member_id : item.from_member_id);
      const acc = accounts.find(a => a.id === item.account_id);
      return (
        <div key={item.id} onClick={() => open(item)} style={{ ...rowBox, cursor:"pointer" }}>
          <Ico n="transfer" s={18} c={out ? C.errorLight : C.green}/>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{out ? "→" : "←"} {other ? labelOf(other) : "?"}</p>
            <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>{[item.method === "offset" ? "зачёт с личным долгом" : acc?.name || "наличные", fmtEventDate(item.date)].join(" · ")}</p>
          </div>
          <span style={{ fontSize:14, fontWeight:700, color: out ? "#fff" : C.green, whiteSpace:"nowrap", flexShrink:0 }}>{fmt(Number(item.amount_group))}</span>
        </div>
      );
    }
    const isOpening = item.kind === K.opening;
    return (
      <div key={item.id} style={rowBox}>
        <Ico n={isOpening ? "back" : "check"} s={16} c={C.dim}/>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:14, fontWeight:600 }}>{isOpening ? "Перенесено из Tricount" : "Сверка с Tricount"}</p>
          <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>{fmtEventDate(item.date)} · в баланс, не в статистику</p>
        </div>
        <span style={{ fontSize:14, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 }}>{signed(Number(item.amount_group))}</span>
        {isOpening ? (
          <button onClick={() => navigate("editSharedGroup", { groupId: group.id })} aria-label="Изменить начальный баланс" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
            <Ico n="edit" s={16} c={C.dim}/>
          </button>
        ) : (
          <button onClick={() => setDeleteReconcile(item)} aria-label="Удалить сверку" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
            <Ico n="trash" s={16} c={C.dim}/>
          </button>
        )}
      </div>
    );
  };

  const balanceText = balance === 0 ? "рассчитались" : balance < 0 ? "я должен" : "мне должны";
  const halfBtn = { ...sheetBtn("secondary"), flex:1, minWidth:0, padding:"12px 8px", fontSize:14 };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={group.name} onBack={() => onBack(false)} right={
        <button onClick={() => navigate("editSharedGroup", { groupId: group.id })} aria-label="Настройки группы" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="edit" s={20} c={C.mid}/>
        </button>
      }/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        {group.archived && <p style={{ margin:"0 0 12px", fontSize:12, color:C.dim, textAlign:"center" }}>В архиве · вернуть можно в настройках</p>}

        <div style={{ background:C.monCard, borderRadius:16, padding:16, marginBottom:20 }}>
          <button onClick={() => setBreakdownOpen(o => !o)} aria-expanded={breakdownOpen}
            style={{ width:"100%", display:"flex", alignItems:"baseline", gap:8, background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left", color:"#fff" }}>
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ display:"block", fontSize:11, color:C.dim }}>Мой баланс · за всё время</span>
              <span style={{ display:"block", marginTop:4, fontSize:24, fontWeight:800, color: balance < 0 ? C.errorLight : balance > 0 ? C.green : "#fff" }}>{fmt(Math.abs(balance))}</span>
            </span>
            <span style={{ fontSize:13, color:C.mid, flexShrink:0 }}>{balanceText}</span>
          </button>
          {breakdownOpen && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
              {months.length === 0 && <p style={{ margin:0, fontSize:12, color:C.dim }}>Записей пока нет</p>}
              {[...months].reverse().map(m => (
                <div key={m.month} style={{ marginBottom:10 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700 }}>{monthLabel(m.month)} · итог {signed(m.closing)}</p>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim, lineHeight:1.5 }}>
                    {[m.carriedIn && `перенесено ${signed(m.carriedIn)}`, m.adjust && `начальный / сверки ${signed(m.adjust)}`,
                      m.share && `доля ${signed(m.share)}`, m.paid && `оплатил ${signed(m.paid)}`, m.transfers && `переводы ${signed(m.transfers)}`]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button onClick={() => setReconcileOpen(true)} style={halfBtn}>Сверить с Tricount</button>
            <button onClick={() => navigate("addMirrorTransfer", { groupId: group.id })} style={{ ...sheetBtn("primary"), flex:1, minWidth:0, padding:"12px 8px", fontSize:14 }}>Перевести</button>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <button onClick={() => setMonth(k => shiftKey(k, -1))} aria-label="Предыдущий месяц" style={navBtn}><Ico n="back" s={18} c={C.mid}/></button>
          <span style={{ fontSize:15, fontWeight:700 }}>{monthLabel(month)}</span>
          <button onClick={() => setMonth(k => shiftKey(k, 1))} aria-label="Следующий месяц" style={{ ...navBtn, transform:"rotate(180deg)" }}><Ico n="back" s={18} c={C.mid}/></button>
        </div>
        <p style={{ margin:"0 0 12px", fontSize:13, color:C.dim, textAlign:"center" }}>Моя доля за месяц: <b style={{ color:"#fff" }}>{fmt(summary.myShare)}</b></p>

        {summary.items.length === 0 && <p style={{ margin:"8px 0 14px", fontSize:13, color:C.dim, textAlign:"center" }}>В этом месяце записей нет</p>}
        {summary.items.map(feedRow)}

        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          <button onClick={() => navigate("addSharedPurchase", { groupId: group.id })} style={{ ...halfBtn, color:C.green }}>＋ Покупка</button>
        </div>
        {prevMonthBills.length > 0 && (
          <button onClick={() => setRepeatOpen(true)}
            style={{ display:"block", margin:"14px auto 0", background:"none", border:"none", color:C.green, fontSize:14, fontWeight:600, cursor:"pointer" }}>
            Повторить из прошлого месяца ›
          </button>
        )}
      </div>

      {reconcileOpen && <ReconcileSheet group={group} balance={balance} fmt={fmt} sym={sym} onSaved={reload} onClose={() => setReconcileOpen(false)}/>}
      {repeatOpen && (
        <RepeatMonthSheet group={group} bills={prevMonthBills} meId={meId} accounts={accounts} titleOf={titleOf} payerOf={payerOf} sym={sym}
          onSaved={reload} onClose={() => setRepeatOpen(false)}/>
      )}
      <ConfirmSheet
        open={!!undoMove} onClose={() => setUndoMove(null)} onConfirm={execUndoMove}
        title="Отменить перенос с тусы?" message="Запись удалится отсюда, а долг снова появится в тусе."
        confirmLabel={undoingMove ? "Отмена..." : "Отменить"} disabled={undoingMove} error={undoMoveError}
      />
      <ConfirmSheet
        open={!!deleteReconcile} onClose={() => setDeleteReconcile(null)} onConfirm={execDelete}
        title="Удалить сверку?" message="Баланс с группой вернётся к расчёту без этой поправки."
        confirmLabel={deleting ? "Удаление..." : "Удалить"} disabled={deleting} error={deleteError}
      />
    </div>
  );
}
