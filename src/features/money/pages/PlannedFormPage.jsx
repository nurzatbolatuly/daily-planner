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

// Плановый расход и ожидаемый доход — одна форма: отличаются только таблицей и текстами.
// Новый вид плановой записи — ещё один ключ здесь и строки в screenMap.
export const PLANNED_KINDS = {
  expense: {
    table: "planned_expenses",
    titleNew: "Плановый расход", titleEdit: "Редактировать расход",
    namePlaceholder: "Например, Страховка",
    recurringHint: "После отметки «Оплачено» автоматически появится плановый расход на тот же день следующего месяца.",
    deleteTitle: "Удалить плановый расход?",
    deleteMessage: "Запись будет удалена. Если расход уже отмечен оплаченным, связанная транзакция останется.",
  },
  income: {
    table: "planned_incomes",
    titleNew: "Ожидаемый доход", titleEdit: "Редактировать доход",
    namePlaceholder: "Например, Зарплата",
    recurringHint: "После отметки «Получено» автоматически появится ожидаемый доход на тот же день следующего месяца.",
    deleteTitle: "Удалить ожидаемый доход?",
    deleteMessage: "Запись будет удалена. Если доход уже отмечен полученным, связанная транзакция останется.",
  },
};

const sym = getSym(BASE_CUR);

const underline = hasError => `1px solid ${hasError ? C.errorBorder : C.border}`;
const fieldStyle = { width: "100%", background: "none", border: "none", outline: "none", color: C.white, padding: "4px 0", boxSizing: "border-box" };

function validate(name, amt) {
  const errs = {};
  if (!name.trim()) errs.name = "Введите название";
  if (!parseFloat(amt)) errs.amt = "Введите сумму";
  return errs;
}

// kind — ключ PLANNED_KINDS; cats — категории этого вида (expCats / incCats).
export function PlannedFormPage({ kind, cats, onBack, edit }) {
  const cfg = PLANNED_KINDS[kind];
  const [name, setName] = useState(edit?.name || "");
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [catId, setCatId] = useState(edit?.category_id || cats[0]?.id || "");
  const [date, setDate] = useState(edit?.expected_date || todayStr());
  const [note, setNote] = useState(edit?.note || "");
  const [isRecurring, setIsRecurring] = useState(edit?.is_recurring || false);
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить" });
  const { save: execDelete, saving: deleting, saveError: deleteError, setSaveError: setDeleteError } =
    useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить" });

  saveRef.current = async () => {
    await supaUpsert(cfg.table, {
      id: edit?.id || newId(),
      name: name.trim(),
      amount: parseFloat(amt),
      currency: BASE_CUR,
      category_id: catId || null,
      expected_date: date,
      status: edit?.status || "pending",
      is_recurring: isRecurring,
      transaction_id: edit?.transaction_id ?? null,
      note: note.trim(),
    });
    onBack(true);
  };
  deleteRef.current = async () => {
    await supa.delete(cfg.table, `id=eq.${edit.id}`);
    onBack(true);
  };

  const save = () => {
    const errs = validate(name, amt);
    setErrors(errs);
    if (Object.keys(errs).length === 0) execSave();
  };
  const clearError = key => setErrors(p => ({ ...p, [key]: "" }));
  const closeDelete = () => { setConfirmDelete(false); setDeleteError(null); };

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: C.white, display: "flex", flexDirection: "column" }}>
      <PageHeader title={edit ? cfg.titleEdit : cfg.titleNew} onBack={() => onBack(false)}/>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Название</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); clearError("name"); }}
          placeholder={cfg.namePlaceholder}
          aria-invalid={!!errors.name}
          style={{ ...fieldStyle, borderBottom: underline(errors.name), fontSize: 16, marginBottom: errors.name ? 4 : 20 }}
        />
        {errors.name && <p style={{ color: C.red, fontSize: 12, marginBottom: 16 }}>{errors.name}</p>}

        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel error={errors.amt}>Сумма ({sym})</FieldLabel>
            <NumInput
              value={amt}
              onChange={v => { setAmt(v); clearError("amt"); }}
              placeholder="0"
              style={{ ...fieldStyle, borderBottom: underline(errors.amt), fontSize: 22, fontWeight: 600 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Ожидаемая дата</FieldLabel>
            <button onClick={() => setShowCal(true)} style={{ ...fieldStyle, borderBottom: underline(false), fontSize: 22, fontWeight: 600, textAlign: "left", cursor: "pointer" }}>
              {date}
            </button>
          </div>
        </div>

        <FieldLabel>Категория</FieldLabel>
        <div style={{ marginBottom: 20 }}>
          <CategoryPicker cats={cats} value={catId} onChange={setCatId}/>
        </div>

        <FieldLabel>Заметка</FieldLabel>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Необязательно"
          style={{ ...fieldStyle, borderBottom: underline(false), fontSize: 15, marginBottom: 20 }}
        />

        <div style={{ padding: "14px 16px", borderRadius: 12, background: C.monCard, marginBottom: 24 }}>
          <Toggle value={isRecurring} onChange={setIsRecurring} label="Повторять ежемесячно"/>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: C.dim, lineHeight: 1.4 }}>{cfg.recurringHint}</p>
        </div>

        {saveError && <p style={{ color: C.errorLight, fontSize: 13, textAlign: "center", marginBottom: 8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width: "100%", padding: "15px", borderRadius: 30, background: saving ? C.savingDisabled : C.green, border: "none", color: C.white, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {edit && (
          <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", marginTop: 10, padding: "14px", borderRadius: 30, background: C.errorTintSoft, border: `1px solid ${C.errorBorderSoft}`, color: C.red, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Удалить
          </button>
        )}

        {showCal && (
          <CalendarPicker mode="single" value={date} onChange={v => { setDate(v); setShowCal(false); }} onClose={() => setShowCal(false)}/>
        )}
        <ConfirmSheet
          open={confirmDelete}
          onClose={closeDelete}
          onConfirm={execDelete}
          title={cfg.deleteTitle}
          message={cfg.deleteMessage}
          confirmLabel={deleting ? "Удаление..." : "Удалить"}
          disabled={deleting}
          error={deleteError}
        />
      </div>
    </div>
  );
}
