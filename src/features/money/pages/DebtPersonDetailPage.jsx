import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { fmtAmtAuto, getSym, ratesFromAccounts } from "../../../utils/format";
import { supabase } from "../../../lib/supabase";
import { computeNetByPerson, personHistory } from "../../../utils/debtLedger";
import { PageHeader } from "../../../components/PageHeader";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { DebtHistory } from "../components/DebtHistory";
import { ReturnModal } from "../components/ReturnModal";
import { ForgiveModal } from "../components/ForgiveModal";

const sym = getSym(BASE_CUR);

export function DebtPersonDetailPage({ person, debtEvents = [], accounts = [], transactions = [], navigate, onReload, onBack }) {
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const net = useMemo(() => computeNetByPerson(debtEvents, rates)[person.id]?.net || 0, [debtEvents, rates, person.id]);
  const history = useMemo(() => personHistory(debtEvents, person.id), [debtEvents, person.id]);

  const [returnOpen, setReturnOpen] = useState(false);
  const [forgiveOpen, setForgiveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Событие с transaction_id двигало реальные деньги (сплит расхода, "взял в долг",
  // возврат) — правим/удаляем через саму транзакцию (TxPage), чтобы баланс счёта
  // и долг менялись вместе одним и тем же атомарным путём, а не дублировать эту
  // логику здесь.
  const openLinkedTx = (event) => {
    const tx = transactions.find(t => t.id === event.transaction_id);
    if (tx) navigate?.("editTx", tx);
  };

  // Off-book запись (transaction_id нет — ручное "Мне должны" из DebtFormPage,
  // остаток при прощении) — деньги не двигались, можно удалить прямо здесь.
  const deleteEvent = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from("debt_events").delete().eq("id", deleteTarget.id);
      setDeleteTarget(null);
      await onReload();
    } catch (e) { console.error("Delete debt event:", e); }
    setDeleting(false);
  };

  const label = net === 0 ? "В расчёте" : net > 0 ? "Должен вам" : "Вы должны";
  const color = net === 0 ? C.dim : net > 0 ? C.green : C.errorLight;

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={person.name} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ background:C.monCard, borderRadius:16, padding:"18px", marginBottom:16, textAlign:"center" }}>
          <p style={{ margin:0, fontSize:12, color:C.dim }}>{label}</p>
          <p style={{ margin:"4px 0 0", fontSize:28, fontWeight:800, color }}>{sym}{fmtAmtAuto(Math.abs(net))}</p>
        </div>

        {net !== 0 && (
          <div style={{ display:"flex", gap:10, marginBottom:20 }}>
            <button onClick={() => setReturnOpen(true)}
              style={{ flex:1, padding:13, borderRadius:12, background:C.green, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>
              Возврат
            </button>
            <button onClick={() => setForgiveOpen(true)}
              style={{ flex:1, padding:13, borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.dim, fontSize:14, fontWeight:600, cursor:"pointer" }}>
              Простить
            </button>
          </div>
        )}

        <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:C.dim }}>История</p>
        <DebtHistory events={history} onOpenTx={openLinkedTx} onDelete={setDeleteTarget}/>
      </div>

      <ReturnModal
        open={returnOpen} onClose={() => setReturnOpen(false)}
        person={person} net={net} accounts={accounts}
        onDone={async () => { setReturnOpen(false); await onReload(); }}
      />
      <ForgiveModal
        open={forgiveOpen} onClose={() => setForgiveOpen(false)}
        person={person} net={net} history={history} rates={rates}
        onDone={async () => { setForgiveOpen(false); await onReload(); }}
      />
      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteEvent}
        title="Удалить запись?"
        message="Запись будет удалена без движения денег по счетам. Отменить нельзя."
        confirmLabel={deleting ? "Удаление..." : "Удалить"}
      />
    </div>
  );
}
