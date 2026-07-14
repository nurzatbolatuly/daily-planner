import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { todayStr } from "../../../utils/date";
import { round2 } from "../../../utils/format";
import { supaRpc } from "../../../lib/supabase";
import { DEBT_RETURN_NOTE_PREFIX } from "../../../constants/money";
import { useSave } from "../../../hooks/useSave";
import { BottomSheet } from "../../../components/BottomSheet";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { AccSelect } from "../../../components/AccSelect";

// Частичный или полный возврат долга — реальное движение денег, поэтому
// пишется атомарно через RPC save_debt_return (транзакция + баланс + debt_event).
// Направление определяется знаком net: net>0 (должны нам) → доход на счёт,
// net<0 (должны мы) → расход со счёта.
export function ReturnModal({ open, onClose, person, net, accounts, onDone }) {
  const theyOweMe = net > 0;
  const [amount, setAmount] = useState(String(round2(Math.abs(net))));
  const [accId, setAccId] = useState("");
  const [error, setError] = useState("");

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить возврат" });

  saveRef.current = async () => {
    const acc = accounts.find(a => a.id === accId);
    const amt = parseFloat(amount) || 0;
    const delta = theyOweMe ? amt : -amt;
    const date = todayStr();
    const tx = {
      id: crypto.randomUUID(),
      type: theyOweMe ? "income" : "expense",
      amount: amt,
      currency: acc.currency,
      category_id: null,
      account_id: accId,
      date,
      note: `${DEBT_RETURN_NOTE_PREFIX} — ${person.name}`,
    };
    const debtEvent = {
      id: crypto.randomUUID(),
      person_id: person.id,
      type: "return",
      amount: theyOweMe ? -amt : amt,
      currency: acc.currency,
      date,
      note: "",
      transaction_id: tx.id,
      account_id: accId,
    };
    await supaRpc("save_debt_return", { p_tx: tx, p_account_id: accId, p_new_balance: round2(acc.balance + delta), p_debt_event: debtEvent });
    onDone();
  };

  const save = () => {
    if (!amount || parseFloat(amount) <= 0) { setError("Укажите сумму"); return; }
    if (!accId) { setError("Выберите счёт"); return; }
    setError("");
    execSave();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={theyOweMe ? `${person.name} возвращает долг` : `Вернуть долг: ${person.name}`}>
      <FieldLabel error={error}>Сумма</FieldLabel>
      <NumInput
        value={amount} onChange={setAmount} placeholder="0"
        style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${error ? "rgba(244,67,54,0.5)" : C.border}`, borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:18, fontWeight:700, outline:"none", marginBottom:14 }}
      />
      <AccSelect accounts={accounts} value={accId} onChange={setAccId} label="Счёт"/>
      {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
      <button onClick={save} disabled={saving}
        style={{ width:"100%", padding:15, borderRadius:30, background: saving ? C.savingDisabled : C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
        {saving ? "Сохранение..." : "Подтвердить"}
      </button>
    </BottomSheet>
  );
}
