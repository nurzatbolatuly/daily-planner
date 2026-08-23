import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym } from "../../../utils/format";
import { supaUpsert, supa } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { Toggle } from "../../../components/Toggle";

const sym = getSym(BASE_CUR);

export function BillFormPage({ onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [day, setDay] = useState(edit?.day || 1);
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [active, setActive] = useState(edit?.active !== false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить" });
  saveRef.current = async () => {
    // Счёт и категория теперь выбираются в момент оплаты (MonthlyPaymentsListPage), а не здесь —
    // сохраняем ссылки как были (null для новых, прежнее значение при редактировании старой записи).
    const rec = {
      id: edit?.id || newId(),
      name: name.trim(),
      day: parseInt(day),
      amount: parseFloat(amt),
      cat_id: edit?.cat_id ?? null,
      acc_id: edit?.acc_id ?? null,
      active,
      last_fired: edit?.last_fired || "",
    };
    await supaUpsert("recurring", rec);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    if (!amt) errs.amt = "Введите сумму";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const del = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete("recurring", `id=eq.${edit.id}`);
      onBack(true);
    } catch(err) { console.error(err); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать платёж" : "Добавить платёж"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Название</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
          placeholder="Например, Netflix"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:16, padding:"4px 0", marginBottom:errors.name?4:16, boxSizing:"border-box" }}
        />
        {errors.name && <p style={{ color:C.red, fontSize:12, marginBottom:12 }}>{errors.name}</p>}

        <div style={{ display:"flex", gap:16, marginBottom:24 }}>
          <div style={{ flex:1 }}>
            <FieldLabel>День месяца</FieldLabel>
            <input
              type="number"
              min="1"
              max="31"
              value={day}
              onChange={e => setDay(e.target.value)}
              style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ flex:2 }}>
            <FieldLabel error={errors.amt}>Сумма ({sym})</FieldLabel>
            <NumInput
              value={amt}
              onChange={v => { setAmt(v); setErrors(p => ({...p, amt:""})); }}
              placeholder="0"
              style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.amt?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", boxSizing:"border-box" }}
            />
          </div>
        </div>

        <div style={{ padding:"14px 16px", borderRadius:12, background:C.monCard, marginBottom:24 }}>
          <Toggle value={active} onChange={setActive} label="Активен"/>
          <p style={{ margin:"8px 0 0", fontSize:12, color:C.dim, lineHeight:1.4 }}>
            Отключённый платёж не показывается в списке и не учитывается в общей сумме, но история сохраняется.
          </p>
        </div>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?C.savingDisabled:C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {edit && (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}
          >
            Удалить
          </button>
        )}
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={del}
          title="Удалить платёж?"
          message="Регулярный платёж будет удалён. Уже созданные транзакции останутся."
        />
      </div>
    </div>
  );
}
