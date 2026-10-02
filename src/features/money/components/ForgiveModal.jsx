import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { todayStr } from "../../../utils/date";
import { fmtAmtAuto, getSym, round2 } from "../../../utils/format";
import { newId } from "../../../utils/id";
import { supaUpsert } from "../../../lib/supabase";
import { buildForgiveEvents } from "../../../utils/debtLedger";
import { useSave } from "../../../hooks/useSave";
import { BottomSheet } from "../../../components/BottomSheet";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";

const sym = getSym(BASE_CUR);

// Полное или частичное прощение долга — деньги не двигаются, пишутся только
// forgive-записи в debt_events (распределение по расходам — debtLedger.buildForgiveEvents).
// Сумма в базовой валюте (как и NET), по умолчанию — весь остаток.
export function ForgiveModal({ open, onClose, person, net, history, rates, onDone }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Простить долг: ${person.name}`}>
      {/* Форма монтируется при каждом открытии — сумма по умолчанию всегда от актуального NET */}
      {open && <ForgiveForm person={person} net={net} history={history} rates={rates} onDone={onDone}/>}
    </BottomSheet>
  );
}

function ForgiveForm({ person, net, history, rates, onDone }) {
  const max = round2(Math.abs(net));
  const [amount, setAmount] = useState(String(max));
  const [error, setError] = useState("");

  const amt = round2(parseFloat(amount) || 0);
  const left = round2(Math.max(max - amt, 0));
  const isFull = amt === max;

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось простить долг" });

  saveRef.current = async () => {
    const rows = buildForgiveEvents({ history, net, amount: amt, rates, personId: person.id, date: todayStr(), newId });
    if (rows.length) await supaUpsert("debt_events", rows);
    await onDone();
  };

  const save = () => {
    if (amt <= 0) { setError("Укажите сумму"); return; }
    if (amt > max) { setError(`Не больше ${sym}${fmtAmtAuto(max)}`); return; }
    setError("");
    execSave();
  };

  const onChange = (v) => { setAmount(v); if (error) setError(""); };

  return (
    <>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8 }}>
        <FieldLabel error={error}>Сумма</FieldLabel>
        {!isFull && (
          <button onClick={() => onChange(String(max))}
            style={{ background:"none", border:"none", padding:"0 0 6px", color:C.green, fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 }}>
            Вся сумма
          </button>
        )}
      </div>
      <NumInput
        value={amount} onChange={onChange} placeholder="0" autoFocus
        style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${error ? "rgba(244,67,54,0.5)" : C.border}`, borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:18, fontWeight:700, outline:"none", marginBottom:8 }}
      />
      <p style={{ margin:"0 0 20px", fontSize:13, color:C.mid, lineHeight:1.5 }}>
        {isFull ? "Долг будет закрыт полностью." : `Останется: ${sym}${fmtAmtAuto(left)}.`} Списывается без создания транзакции, отменить нельзя.
      </p>
      {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
      <button onClick={save} disabled={saving}
        style={{ width:"100%", padding:14, borderRadius:30, background:"rgba(244,67,54,0.15)", border:"1px solid rgba(244,67,54,0.4)", color:C.red, opacity: saving ? 0.6 : 1, fontSize:15, fontWeight:600, cursor: saving ? "default" : "pointer" }}>
        {saving ? "Списание..." : amt > 0 && amt <= max ? `Простить ${sym}${fmtAmtAuto(amt)}` : "Простить"}
      </button>
    </>
  );
}
