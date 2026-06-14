import { useState } from "react";
import { C } from "../../../constants/theme";
import { supaUpsert, supa } from "../../../lib/supabase";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { AccSelect } from "../../../components/AccSelect";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

export function RecPageMon({ accounts, expCats, onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [day, setDay] = useState(edit?.day || 1);
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [catId, setCatId] = useState(edit?.cat_id || "");
  const [accId, setAccId] = useState(edit?.acc_id || accounts[0]?.id || "");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selAcc = accounts.find(a => a.id === accId);

  const save = async () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    if (!amt) errs.amt = "Введите сумму";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    setSaveError(null);
    const rec = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      day: parseInt(day),
      amount: parseFloat(amt),
      cat_id: catId,
      acc_id: accId,
      last_fired: edit?.last_fired || "",
    };
    try {
      await supaUpsert("recurring", rec);
      onBack(true);
    } catch(err) { console.error(err); setSaveError("Не удалось сохранить"); setSaving(false); }
  };

  const del = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete("recurring", `id=eq.${edit.id}`);
      onBack(true);
    } catch(err) { console.error(err); setSaveError("Не удалось удалить"); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать платёж" : "Добавить платёж"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Название</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
          placeholder="Название"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:16, padding:"4px 0", marginBottom:errors.name?4:16, boxSizing:"border-box" }}
        />
        {errors.name && <p style={{ color:C.red, fontSize:12, marginBottom:12 }}>{errors.name}</p>}
        <AccSelect accounts={accounts} value={accId} onChange={v => setAccId(v)} label="Счёт"/>
        <div style={{ display:"flex", gap:16, marginBottom:16 }}>
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
            <FieldLabel error={errors.amt}>Сумма {selAcc ? `(${selAcc.currency})` : ""}</FieldLabel>
            <input
              type="number"
              value={amt}
              onChange={e => { setAmt(e.target.value); setErrors(p => ({...p, amt:""})); }}
              placeholder="0"
              style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.amt?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", boxSizing:"border-box" }}
            />
          </div>
        </div>
        <FieldLabel>Категория</FieldLabel>
        <div style={{ marginBottom:24 }}>
          <CategoryPicker cats={expCats} value={catId} onChange={setCatId} cols="repeat(4,1fr)"/>
        </div>
        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?C.savingDisabled:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Сохранение...":"Сохранить"}</button>
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
