import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { todayStr, addDays, daysBetween } from "../../../utils/date";
import { supaUpsert, supa } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { Ico } from "../../../components/Ico";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

export function TripEditPageMon({ onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [startDate, setStartDate] = useState(edit?.start_date || todayStr());
  const [endDate, setEndDate] = useState(edit?.end_date || addDays(todayStr(), 3));
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить поездку" });
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить поездку" });

  const genDays = (sd, ed) => Array.from(
    { length: daysBetween(sd, ed) + 1 },
    (_, i) => {
      const dk = addDays(sd, i);
      const ex = edit?.days?.find(d => d.date === dk);
      return ex || { date:dk, location:"", note:"", places:[], expenses:[] };
    }
  );

  saveRef.current = async () => {
    const plan = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      days: genDays(startDate, endDate),
    };
    await supaUpsert("trip_plans", plan);
    onBack(true);
  };

  deleteRef.current = async () => {
    await supa.delete("trip_plans", `id=eq.${edit.id}`);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название поездки";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать поездку" : "Новый план поездки"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Название поездки</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
          placeholder="напр. Поездка в Алматы"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:22, fontWeight:700, padding:"4px 0", marginBottom:errors.name?4:20, boxSizing:"border-box" }}
        />
        {errors.name && <p style={{ color:C.red, fontSize:12, marginBottom:12 }}>{errors.name}</p>}
        <FieldLabel>Даты</FieldLabel>
        <div onClick={() => setShowCal(true)} style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", cursor:"pointer", marginBottom:20 }}>
          <Ico n="clock" s={18} c={C.green}/>
          <span style={{ fontSize:14, color:"#fff" }}>{startDate}</span>
          <span style={{ color:C.dim }}>→</span>
          <span style={{ fontSize:14, color:"#fff" }}>{endDate}</span>
          <span style={{ marginLeft:"auto", fontSize:12, color:C.dim }}>{daysBetween(startDate, endDate)+1} дн.</span>
        </div>
        {saveError && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:saving?"default":"pointer", opacity:saving?0.6:1 }}>
          {saving ? "Сохранение…" : "Сохранить поездку"}
        </button>
        {edit && (
          <>
            {deleteError && <p style={{ color:C.red, fontSize:13, marginTop:8 }}>{deleteError}</p>}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer", opacity:deleting?0.6:1 }}
            >
              Удалить поездку
            </button>
          </>
        )}
      </div>
      {showCal && <CalendarPicker mode="range" confirmable value={startDate} valueEnd={endDate} onChange={setStartDate} onChangeEnd={setEndDate} onClose={() => setShowCal(false)}/>}
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); execDelete(); }}
        title="Удалить поездку?"
        message={`«${name}» и все её данные будут удалены безвозвратно.`}
        confirmLabel="Удалить"
      />
    </div>
  );
}
