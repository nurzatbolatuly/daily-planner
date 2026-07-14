import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, round2, ratesFromAccounts } from "../../../utils/format";
import { supaUpsert } from "../../../lib/supabase";
import { computeNetByPerson, personHistory } from "../../../utils/debtLedger";
import { PageHeader } from "../../../components/PageHeader";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { DebtHistory } from "../components/DebtHistory";
import { ReturnModal } from "../components/ReturnModal";

const sym = getSym(BASE_CUR);

export function DebtPersonDetailPage({ person, debtEvents = [], accounts = [], onReload, onBack }) {
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const net = useMemo(() => computeNetByPerson(debtEvents, rates)[person.id]?.net || 0, [debtEvents, rates, person.id]);
  const history = useMemo(() => personHistory(debtEvents, person.id), [debtEvents, person.id]);

  const [returnOpen, setReturnOpen] = useState(false);
  const [confirmForgive, setConfirmForgive] = useState(false);
  const [forgiving, setForgiving] = useState(false);

  const label = net === 0 ? "В расчёте" : net > 0 ? "Должен вам" : "Вы должны";
  const color = net === 0 ? C.dim : net > 0 ? C.green : C.errorLight;

  const forgive = async () => {
    setForgiving(true);
    try {
      await supaUpsert("debt_events", {
        id: crypto.randomUUID(),
        person_id: person.id,
        type: "forgive",
        amount: round2(-net),
        currency: BASE_CUR,
        date: todayStr(),
        note: "",
        transaction_id: null,
        account_id: null,
      });
      await onReload();
    } catch (e) { console.error("Forgive debt:", e); }
    setForgiving(false);
  };

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
            <button onClick={() => setConfirmForgive(true)}
              style={{ flex:1, padding:13, borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.dim, fontSize:14, fontWeight:600, cursor:"pointer" }}>
              Простить
            </button>
          </div>
        )}

        <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:C.dim }}>История</p>
        <DebtHistory events={history}/>
      </div>

      <ReturnModal
        open={returnOpen} onClose={() => setReturnOpen(false)}
        person={person} net={net} accounts={accounts}
        onDone={async () => { setReturnOpen(false); await onReload(); }}
      />
      <ConfirmSheet
        open={confirmForgive}
        onClose={() => setConfirmForgive(false)}
        onConfirm={() => { setConfirmForgive(false); forgive(); }}
        title="Простить долг?"
        message={`Остаток ${sym}${fmtAmtAuto(Math.abs(net))} будет списан без создания транзакции. Отменить нельзя.`}
        confirmLabel={forgiving ? "Списание..." : "Простить"}
      />
    </div>
  );
}
