import { useState, useEffect } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { TRIP_CATS, TRIP_LABELS } from "../../../constants/money";
import { isCommodity } from "../../../utils/format";
import { newId } from "../../../utils/id";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { Toggle } from "../../../components/Toggle";
import { CurrencyPage } from "../../../components/CurrencyPage";

export function TripExpenseFormMon({ exp, onSave, onCancel, rates = {}, onAddRate }) {
  const [label, setLabel] = useState(exp?.label || "");
  const [cat, setCat] = useState(exp?.cat || "transport");
  const [amt, setAmt] = useState(exp?.amount ? String(exp.amount) : "");
  const [cur, setCur] = useState(exp?.currency || BASE_CUR);
  const [paidAmt, setPaidAmt] = useState(exp?.paidAmount ? String(exp.paidAmount) : "");
  const [status, setStatus] = useState(exp?.status || "unpaid");
  const [isCash, setIsCash] = useState(exp?.isCash || false);
  const [note, setNote] = useState(exp?.note || "");
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});
  const [missingRate, setMissingRate] = useState("");

  useEffect(() => { setMissingRate(""); }, [cur]);

  const isMissingRate = cur !== BASE_CUR && !isCommodity(cur) && rates[cur] === undefined;

  if (showCur) return <CurrencyPage value={cur} onSelect={v => { setCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const save = () => {
    const errs = {};
    if (!label.trim()) errs.label = "Введите название";
    if (!amt) errs.amt = "Введите сумму";
    if (status === "partial" && parseFloat(paidAmt) > parseFloat(amt)) errs.paidAmt = "Не может превышать общую сумму";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: exp?.id || newId(),
      label: label.trim(),
      cat,
      amount: parseFloat(amt),
      currency: cur,
      paidAmount: status==="partial" ? parseFloat(paidAmt)||0 : (status==="paid" ? parseFloat(amt) : 0),
      status,
      isCash,
      note,
    });
  };

  return (
    <div style={{ background:C.monCard2, borderRadius:16, padding:16, marginBottom:8, border:`1px solid ${C.border}` }}>
      <FieldLabel error={errors.label}>Название</FieldLabel>
      <input value={label} onChange={e => { setLabel(e.target.value); setErrors(p => ({...p, label:""})); }} placeholder="напр. Поезд в Неаполь" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.label?"rgba(244,67,54,0.4)":C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", marginBottom:12, boxSizing:"border-box" }}/>
      <FieldLabel>Категория</FieldLabel>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {TRIP_CATS.map(k => (
          <button key={k} onClick={() => setCat(k)} style={{ padding:"6px 10px", borderRadius:20, border:`1px solid ${cat===k?C.green:C.border}`, background:cat===k?C.greenDim:"transparent", color:cat===k?C.green:C.dim, fontSize:12, cursor:"pointer" }}>
            {TRIP_LABELS[k]}
          </button>
        ))}
      </div>
      <FieldLabel error={errors.amt}>Сумма</FieldLabel>
      <div style={{ display:"flex", alignItems:"center", gap:8, borderBottom:`1px solid ${errors.amt?"rgba(244,67,54,0.4)":C.border}`, marginBottom:12, paddingBottom:4 }}>
        <NumInput value={amt} onChange={v => { setAmt(v); setErrors(p => ({...p, amt:""})); }} placeholder="0" style={{ flex:1, minWidth:0, background:"none", border:"none", outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0" }}/>
        <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", padding:"0 2px", color:C.green, fontSize:15, fontWeight:700, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>{cur} ▾</button>
      </div>

      {isMissingRate && (
        <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
          <p style={{ margin:"0 0 8px", fontSize:12, color:C.amber }}>
            Нет курса для {cur} — итоги в ₸ будут неверными
          </p>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <NumInput
              value={missingRate}
              onChange={setMissingRate}
              placeholder="Введи курс"
              style={{ flex:1, background:"none", border:"none", borderBottom:"1px solid rgba(245,158,11,0.4)", color:"#fff", fontSize:15, outline:"none", padding:"2px 0" }}
            />
            <span style={{ color:C.dim, fontSize:13, flexShrink:0 }}>₸ / {cur}</span>
            {parseFloat(missingRate) > 0 && (
              <button
                onClick={() => { onAddRate?.(cur, parseFloat(missingRate)); setMissingRate(""); }}
                style={{ background:"rgba(245,158,11,0.25)", border:"1px solid rgba(245,158,11,0.5)", borderRadius:8, padding:"5px 12px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}

      <FieldLabel>Статус оплаты</FieldLabel>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {[["unpaid","Не оплачено"],["paid","Оплачено"],["partial","Частично"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatus(v)} style={{ flex:1, padding:"7px", borderRadius:8, border:`1px solid ${status===v?(v==="paid"?C.green:v==="partial"?C.amber:C.border):C.border}`, background:status===v?(v==="paid"?"rgba(76,175,80,0.15)":v==="partial"?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.05)"):"transparent", color:status===v?(v==="paid"?C.green:v==="partial"?C.amber:C.main):C.dim, fontSize:12, cursor:"pointer" }}>
            {l}
          </button>
        ))}
      </div>
      {status==="partial" && (
        <div style={{ marginBottom:12 }}>
          <FieldLabel error={errors.paidAmt}>Уже оплачено ({cur})</FieldLabel>
          <NumInput value={paidAmt} onChange={v => { setPaidAmt(v); setErrors(p => ({...p, paidAmt:""})); }} placeholder="0" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.paidAmt?"rgba(244,67,54,0.4)":C.border}`, outline:"none", color:"#fff", fontSize:16, padding:"4px 0", boxSizing:"border-box" }}/>
        </div>
      )}
      <div style={{ marginBottom:12 }}><Toggle value={isCash} onChange={setIsCash} label="Наличными"/></div>
      <FieldLabel>Заметка</FieldLabel>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Номер брони, ссылка..." style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:14, padding:"4px 0", marginBottom:12, boxSizing:"border-box" }}/>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} style={{ flex:1, padding:"10px", borderRadius:20, background:C.yellow, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>Сохранить</button>
        <button onClick={onCancel} style={{ flex:1, padding:"10px", borderRadius:20, background:"rgba(255,255,255,0.06)", border:"none", color:C.mid, fontSize:14, cursor:"pointer" }}>Отмена</button>
      </div>
    </div>
  );
}
