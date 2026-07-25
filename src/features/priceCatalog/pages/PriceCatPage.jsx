import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { supaUpsert, supa } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

export function PriceCatPage({ edit, onBack }) {
  const [name, setName] = useState(edit?.name || "");
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить категорию" });

  saveRef.current = async () => {
    const cat = { id: edit?.id || newId(), name: name.trim() };
    await supaUpsert("price_categories", cat);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const del = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete("price_categories", `id=eq.${edit.id}`);
      onBack(true);
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать категорию" : "Новая категория"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ marginBottom:28 }}>
          <FieldLabel error={errors.name}>Название</FieldLabel>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
            placeholder="Например, Продукты"
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${errors.name?"rgba(244,67,54,0.5)":C.border}`, borderRadius:12, outline:"none", color:"#fff", fontSize:16, padding:"12px 14px" }}
          />
        </div>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?C.savingDisabled:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {edit && (
          <button onClick={() => setConfirmDelete(true)} style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>
            Удалить
          </button>
        )}
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={del}
          title="Удалить категорию?"
          message="Товары с этой категорией останутся, но категория у них будет отображаться как «Без категории»."
        />
      </div>
    </div>
  );
}
