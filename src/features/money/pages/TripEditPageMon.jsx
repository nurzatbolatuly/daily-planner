import { useState } from "react";
import { C } from "../../../constants/theme";
import { todayStr, addDays, daysBetween } from "../../../utils/date";
import { supaUpsert, supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CalendarPicker } from "../../../components/CalendarPicker";

export function TripEditPageMon({ onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [startDate, setStartDate] = useState(edit?.start_date || todayStr());
  const [endDate, setEndDate] = useState(edit?.end_date || addDays(todayStr(), 3));
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});

  const genDays = (sd, ed) => Array.from(
    { length: daysBetween(sd, ed) + 1 },
    (_, i) => {
      const dk = addDays(sd, i);
      const ex = edit?.days?.find(d => d.date === dk);
      return ex || { date:dk, location:"", note:"", places:[], expenses:[] };
    }
  );

  const save = async () => {
    const e = {};
    if (!name.trim()) e.name = "Enter trip name";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const plan = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      days: genDays(startDate, endDate),
    };
    try {
      await supaUpsert("trip_plans", plan);
      onBack(true);
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{edit ? "Edit trip" : "New trip plan"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <FieldLabel error={errors.name}>Trip name</FieldLabel>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
          placeholder="e.g. Italy trip"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:22, fontWeight:700, padding:"4px 0", marginBottom:errors.name?4:20, boxSizing:"border-box" }}
        />
        {errors.name && <p style={{ color:C.red, fontSize:12, marginBottom:12 }}>{errors.name}</p>}
        <FieldLabel>Dates</FieldLabel>
        <div onClick={() => setShowCal(true)} style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", cursor:"pointer", marginBottom:20 }}>
          <Ico n="clock" s={18} c={C.green}/>
          <span style={{ fontSize:14, color:"#fff" }}>{startDate}</span>
          <span style={{ color:C.dim }}>→</span>
          <span style={{ fontSize:14, color:"#fff" }}>{endDate}</span>
          <span style={{ marginLeft:"auto", fontSize:12, color:C.dim }}>{daysBetween(startDate, endDate)+1} days</span>
        </div>
        <button onClick={save} style={{ width:"100%", padding:"15px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>Save trip plan</button>
        {edit && (
          <button
            onClick={async () => { await supa.delete("trip_plans", `id=eq.${edit.id}`); onBack(true); }}
            style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}
          >
            Delete trip
          </button>
        )}
      </div>
      {showCal && <CalendarPicker mode="range" value={startDate} valueEnd={endDate} onChange={setStartDate} onChangeEnd={setEndDate} onClose={() => setShowCal(false)}/>}
    </div>
  );
}
