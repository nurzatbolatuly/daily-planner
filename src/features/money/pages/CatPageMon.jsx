import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { EXP_ICONS, INC_ICONS } from "../../../constants/icons";
import { supaUpsert, supa } from "../../../lib/supabase";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { ColorPickerComp } from "../../../components/ColorPickerComp";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

export function CatPageMon({ expCats, incCats, onBack, edit, catType }) {
  const [name, setName] = useState(edit?.name || "");
  const [icon, setIcon] = useState(edit?.icon || "other");
  const [color, setColor] = useState(edit?.color || C.green);
  const [plan, setPlan] = useState(edit?.plan || "");
  const [planCur, setPlanCur] = useState(edit?.plan_currency || BASE_CUR);
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (showCur) return <CurrencyPage value={planCur} onSelect={v => { setPlanCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const iconKeys = Object.keys(catType === "income" ? INC_ICONS : EXP_ICONS);

  const save = async () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    setSaveError(null);
    const list = catType === "expense" ? expCats : incCats;
    const cat = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      icon,
      color,
      plan: parseFloat(plan) || 0,
      plan_currency: planCur,
      sort_order: edit?.sort_order ?? (Math.max(0, ...list.map(c => c.sort_order ?? 0)) + 1),
    };
    try {
      await supaUpsert(catType === "expense" ? "exp_categories" : "inc_categories", cat);
      onBack(true);
    } catch(err) { console.error(err); setSaveError("Не удалось сохранить категорию"); setSaving(false); }
  };

  const del = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete(catType === "expense" ? "exp_categories" : "inc_categories", `id=eq.${edit.id}`);
      onBack(true);
    } catch(err) { console.error(err); setSaveError("Не удалось удалить категорию"); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать категорию" : "Новая категория"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, paddingBottom:16, borderBottom:`1px solid ${C.border}` }}>
          <CatIcon k={icon} size={52} color={color}/>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
            placeholder="Название категории"
            style={{ flex:1, background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:20, fontWeight:600, padding:"4px 0" }}
          />
        </div>
        {errors.name && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{errors.name}</p>}
        <div style={{ marginBottom:16 }}>
          <FieldLabel>{catType === "expense" ? "Плановый расход" : "Плановый доход"}</FieldLabel>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <input
              value={plan}
              onChange={e => setPlan(e.target.value)}
              type="number"
              placeholder="0"
              style={{ width:120, background:"none", border:"none", borderBottom:"1px solid rgba(255,255,255,0.2)", outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0" }}
            />
            <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:15, fontWeight:600, cursor:"pointer" }}>
              {planCur} ▾
            </button>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel>Иконка</FieldLabel>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
            {iconKeys.map(k => (
              <button key={k} onClick={() => setIcon(k)} style={{ width:52, height:52, borderRadius:26, border:icon===k?"3px solid #fff":"3px solid transparent", background:"transparent", cursor:"pointer", padding:0, margin:"0 auto" }}>
                <CatIcon k={k} size={46} color={color}/>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:28 }}>
          <FieldLabel>Цвет</FieldLabel>
          <ColorPickerComp value={color} onChange={setColor}/>
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
          title="Удалить категорию?"
          message="Транзакции с этой категорией останутся, но категория у них будет отображаться как «—»."
        />
      </div>
    </div>
  );
}
