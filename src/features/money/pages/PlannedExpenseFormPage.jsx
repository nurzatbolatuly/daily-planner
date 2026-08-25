import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym } from "../../../utils/format";
import { todayStr } from "../../../utils/date";
import { supaUpsert, supa } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { Toggle } from "../../../components/Toggle";

const sym = getSym(BASE_CUR);

export function PlannedExpenseFormPage({ expCats, onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [catId, setCatId] = useState(edit?.category_id || expCats[0]?.id || "");
  const [date, setDate] = useState(edit?.expected_date || todayStr());
  const [note, setNote] = useState(edit?.note || "");
  const [isRecurring, setIsRecurring] = useState(edit?.is_recurring || false);
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить" });
  saveRef.current = async () => {
    const row = {
      id: edit?.id || newId(),
      name: name.trim(),
      amount: parseFloat(amt),
      currency: "KZT",
      category_id: catId || null,
      expected_date: date,
      status: edit?.status || "pending",
      is_recurring: isRecurring,
      transaction_id: edit?.transaction_id ?? null,
      note: note.trim(),
    };
    await supaUpsert("planned_expenses", row);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    if (!amt || !parseFloat(amt)) errs.amt = "Введите сумму";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const del = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete("planned_expenses", `id=eq.${edit.id}`);
      onBack(true);
    } catch (err) { console.error(err); }
  };

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader title={edit ? "Редактировать расход" : "Плановый расход"} onBack={() => onBack(false)}/>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Название</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }}
          placeholder="Например, Страховка"
          style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${errors.name ? "rgba(244,67,54,0.5)" : C.border}`, outline: "none", color: "#fff", fontSize: 16, padding: "4px 0", marginBottom: errors.name ? 4 : 20, boxSizing: "border-box" }}
        />
        {errors.name && <p style={{ color: C.red, fontSize: 12, marginBottom: 16 }}>{errors.name}</p>}

        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel error={errors.amt}>Сумма ({sym})</FieldLabel>
            <NumInput
              value={amt}
              onChange={v => { setAmt(v); setErrors(p => ({ ...p, amt: "" })); }}
              placeholder="0"
              style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${errors.amt ? "rgba(244,67,54,0.5)" : C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Ожидаемая дата</FieldLabel>
            <button onClick={() => setShowCal(true)} style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", textAlign: "left", cursor: "pointer" }}>
              {date}
            </button>
          </div>
        </div>

        <FieldLabel>Категория</FieldLabel>
        <div style={{ marginBottom: 20 }}>
          <CategoryPicker cats={expCats} value={catId} onChange={setCatId}/>
        </div>

        <FieldLabel>Заметка</FieldLabel>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Необязательно"
          style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 15, padding: "4px 0", marginBottom: 20, boxSizing: "border-box" }}
        />

        <div style={{ padding: "14px 16px", borderRadius: 12, background: C.monCard, marginBottom: 24 }}>
          <Toggle value={isRecurring} onChange={setIsRecurring} label="Повторять ежемесячно"/>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
            После отметки «Оплачено» автоматически появится плановый расход на тот же день следующего месяца.
          </p>
        </div>

        {saveError && <p style={{ color: C.errorLight, fontSize: 13, textAlign: "center", marginBottom: 8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width: "100%", padding: "15px", borderRadius: 30, background: saving ? C.savingDisabled : C.green, border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {edit && (
          <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", marginTop: 10, padding: "14px", borderRadius: 30, background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.3)", color: C.red, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Удалить
          </button>
        )}

        {showCal && (
          <CalendarPicker mode="single" value={date} onChange={v => { setDate(v); setShowCal(false); }} onClose={() => setShowCal(false)}/>
        )}
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={del}
          title="Удалить плановый расход?"
          message="Запись будет удалена. Если расход уже отмечен оплаченным, связанная транзакция останется."
        />
      </div>
    </div>
  );
}
