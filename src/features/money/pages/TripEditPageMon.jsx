import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { todayStr, addDays, daysBetween } from "../../../utils/date";
import { supaUpsert, supa } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { isCommodity, getSym } from "../../../utils/format";
import { BASE_CUR, ALL_CURR } from "../../../constants/currencies";
import { Ico } from "../../../components/Ico";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { NumInput } from "../../../components/NumInput";
import { CurrencyPage } from "../../../components/CurrencyPage";

export function TripEditPageMon({ onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [startDate, setStartDate] = useState(edit?.start_date || todayStr());
  const [endDate, setEndDate] = useState(edit?.end_date || addDays(todayStr(), 3));
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tripRates, setTripRates] = useState(() =>
    Object.fromEntries(
      Object.entries(edit?.rates || {}).map(([k, v]) => [k, String(v)])
    )
  );
  const [showRateCurPicker, setShowRateCurPicker] = useState(false);

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
    const cleanRates = Object.fromEntries(
      Object.entries(tripRates)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([k, v]) => [k, parseFloat(v)])
    );
    const plan = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      days: genDays(startDate, endDate),
      rates: cleanRates,
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

  if (showRateCurPicker) return (
    <CurrencyPage
      value={null}
      onSelect={v => {
        setShowRateCurPicker(false);
        if (v !== BASE_CUR && !isCommodity(v) && !(v in tripRates)) {
          setTripRates(p => ({ ...p, [v]: "" }));
        }
      }}
      onBack={() => setShowRateCurPicker(false)}
    />
  );

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

        <FieldLabel>Курсы валют</FieldLabel>
        <p style={{ margin:"0 0 12px", fontSize:12, color:C.dim, lineHeight:1.4 }}>
          Плановый курс для расчётов в ₸. Перекрывает курсы из счетов.
        </p>
        {Object.entries(tripRates).map(([cur, rate]) => {
          const curName = ALL_CURR.find(c => c.code === cur)?.name || cur;
          return (
            <div key={cur} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ width:44, padding:"4px 0", borderRadius:8, background:"rgba(255,255,255,0.06)", textAlign:"center", flexShrink:0 }}>
                <span style={{ fontSize:12, fontWeight:700, color:C.main }}>{cur}</span>
              </div>
              <span style={{ flex:1, fontSize:12, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{curName}</span>
              <NumInput
                value={rate}
                onChange={v => setTripRates(p => ({ ...p, [cur]: v }))}
                placeholder="0"
                style={{ width:88, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 8px", color:"#fff", fontSize:14, outline:"none", textAlign:"right", boxSizing:"border-box" }}
              />
              <span style={{ fontSize:12, color:C.dim, flexShrink:0 }}>₸/{getSym(cur)}</span>
              <button
                onClick={() => setTripRates(p => { const n = {...p}; delete n[cur]; return n; })}
                style={{ background:"none", border:"none", cursor:"pointer", padding:4, display:"flex", flexShrink:0 }}
              >
                <Ico n="x" s={16} c="rgba(244,67,54,0.5)"/>
              </button>
            </div>
          );
        })}
        <button
          onClick={() => setShowRateCurPicker(true)}
          style={{ width:"100%", padding:"9px", borderRadius:10, background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, color:C.dim, fontSize:13, cursor:"pointer", marginBottom:24 }}
        >
          + Добавить валюту
        </button>

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
