import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { todayStr } from "../../../utils/date";
import { supaUpsert, supabase } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { Ico } from "../../../components/Ico";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

export function GoalTopupPage({ goal, onBack, edit }) {
  const isEdit = !!edit;
  const [amount, setAmount]     = useState(edit?.amount ? String(edit.amount) : "");
  const [currency, setCurrency] = useState(edit?.currency || goal.currency || "KZT");
  const [date, setDate]         = useState(edit?.date || todayStr());
  const [note, setNote]         = useState(edit?.note || "");
  const [errors, setErrors]     = useState({});
  const [showCalendar, setShowCalendar]   = useState(false);
  const [showCurrency, setShowCurrency]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef   = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(),   { errorMsg: "Не удалось сохранить" });
  const { save: del }                         = useSave(() => deleteRef.current?.(), { errorMsg: "Не удалось удалить" });

  saveRef.current = async () => {
    const row = {
      id: edit?.id || crypto.randomUUID(),
      goal_id: goal.id,
      amount: parseFloat(amount) || 0,
      currency,
      date,
      note: note.trim(),
    };
    await supaUpsert("goal_topups", row);
    onBack(true);
  };

  deleteRef.current = async () => {
    await supabase.from("goal_topups").delete().eq("id", edit.id);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!amount || parseFloat(amount) <= 0) errs.amount = "Укажите сумму";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    execSave();
  };

  if (showCurrency) return (
    <CurrencyPage value={currency} onSelect={setCurrency} onBack={() => setShowCurrency(false)}/>
  );

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={isEdit ? "Редактировать пополнение" : "Пополнить цель"}
        onBack={() => onBack(false)}
        right={isEdit ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <Ico n="trash" s={20} c={C.errorLight}/>
          </button>
        ) : <div style={{ width: 30 }}/>}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        <div style={{ background: C.monCard, borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Цель</p>
          <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{goal.name}</p>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel error={errors.amount}>Сумма</FieldLabel>
            <NumInput
              value={amount}
              onChange={setAmount} placeholder="0"
              style={{ width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${errors.amount ? C.errorLight : C.border}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" }}
            />
          </div>
          <div>
            <FieldLabel>Валюта</FieldLabel>
            <button onClick={() => setShowCurrency(true)}
              style={{ background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", height: 47 }}>
              {currency}
            </button>
          </div>
        </div>

        <FieldLabel>Дата</FieldLabel>
        <button onClick={() => setShowCalendar(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, cursor: "pointer", marginBottom: 14 }}>
          <Ico n="calendar" s={16} c={C.dim}/>
          {date}
        </button>

        <FieldLabel>Заметка</FieldLabel>
        <input
          value={note} onChange={e => setNote(e.target.value)} placeholder="Необязательно"
          style={{ width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 20, outline: "none" }}
        />

        {saveError && <p style={{ color: C.errorLight, fontSize: 12, marginBottom: 8 }}>{saveError}</p>}

        <button onClick={save} disabled={saving}
          style={{ width: "100%", padding: 16, borderRadius: 14, background: C.blue, border: "none", color: "#fff", fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Пополнить"}
        </button>
      </div>

      {showCalendar && (
        <CalendarPicker mode="single" value={date}
          onChange={v => { setDate(v); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}/>
      )}

      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); del(); }}
        title="Удалить пополнение?"
      />
    </div>
  );
}
