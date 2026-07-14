import { useState, useEffect } from "react";
import { C } from "../../constants/theme";
import { TIME_OF_DAY, WEEKDAYS, ORDER_UNSET } from "../../constants/planner";
import { RU_MON_GEN } from "../../constants/locale";
import { dateStr, todayStr } from "../../utils/date";
import { newId } from "../../utils/id";
import { Ico } from "../../components/Ico";

function RoutineWeekPicker({ date, routineDays, setRoutineDays, weekMondayOf, ruMonGen, weekdays }) {
  const monday = weekMondayOf(date);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return (
    <>
      <div style={{ display:"flex", gap:6, marginTop:8 }}>
        {weekdays.map(d => (
          <button key={d.id} onClick={() => setRoutineDays(prev => prev.includes(d.id)?prev.filter(x=>x!==d.id):[...prev,d.id])} style={{ flex:1, padding:"8px 2px", borderRadius:10, border:routineDays.includes(d.id)?"2px solid #818cf8":"2px solid rgba(255,255,255,0.08)", background:routineDays.includes(d.id)?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", color:routineDays.includes(d.id)?"#a5b4fc":"rgba(255,255,255,0.4)", fontSize:11, fontWeight:500, cursor:"pointer" }}>
            {d.label}
          </button>
        ))}
      </div>
      <p style={{ margin:"8px 0 0", fontSize:11, color:"rgba(255,255,255,0.4)" }}>
        Неделя {monday.getDate()} {ruMonGen[monday.getMonth()]} – {sunday.getDate()} {ruMonGen[sunday.getMonth()]} (по выбранной дате)
      </p>
    </>
  );
}

function weekMondayOf(ds) {
  const [y, m, dd] = (ds || todayStr()).split("-").map(Number);
  const anchor = new Date(y, m - 1, dd);
  const dow = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
  return monday;
}

export default function PlannerTaskForm({ initialDate, initialTask, colorLabels, onSave, onClose }) {
  const [title, setTitle] = useState(initialTask?.title || "");
  const [note, setNote] = useState(initialTask?.note || "");
  const [date, setDate] = useState(initialTask?.date || (initialDate ? dateStr(initialDate) : todayStr()));
  const [time, setTime] = useState(initialTask?.time || "");
  const [timeOfDay, setTimeOfDay] = useState(initialTask?.time_of_day || null);
  const [color, setColor] = useState(initialTask?.color || "none");
  const [isRoutine, setIsRoutine] = useState(false);
  const [routineDays, setRoutineDays] = useState([]);
  const [titleError, setTitleError] = useState(false);

  // Lock body scroll while modal is open (prevents background rubber-band on iOS)
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleSave = () => {
    if (!title.trim()) { setTitleError(true); return; }
    if (isRoutine && routineDays.length > 0) {
      const monday = weekMondayOf(date);
      routineDays.forEach((rd) => {
        const d = new Date(monday);
        const offset = rd === 0 ? 6 : rd - 1;
        d.setDate(monday.getDate() + offset);
        const taskDate = dateStr(d);
        onSave({ id: newId(), title: title.trim(), note: note.trim(), date: taskDate, time: time||null, time_of_day: time?null:timeOfDay, color, status:"active", order:ORDER_UNSET, recur_days:routineDays }, true);
      });
      onClose(); return;
    }
    const base = initialTask || {};
    onSave({ ...base, id: base.id || newId(), title: title.trim(), note: note.trim(), date, time: time||null, time_of_day: time?null:timeOfDay, color, status: base.status||"active", order: base.order??ORDER_UNSET });
  };

  return (
    <div
      className="overlay-in"
      style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }}
      onClick={onClose}
      onTouchMove={e => e.preventDefault()}
    >
      <div
        className="sheet-up"
        style={{ width:"100%", maxWidth:480, borderRadius:"24px 24px 0 0", background:C.planSheet, borderTop:"1px solid rgba(255,255,255,0.1)", padding:"20px 20px calc(32px + env(safe-area-inset-bottom, 0px))", boxShadow:"0 -20px 60px rgba(0,0,0,0.4)", maxHeight:"85dvh", overflowY:"auto", overscrollBehavior:"contain" }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:600, color:"rgba(255,255,255,0.9)" }}>{initialTask?"Редактировать":"Новая задача"}</h3>
          <button onClick={onClose} style={{ color:"rgba(255,255,255,0.4)", background:"none", border:"none", cursor:"pointer", display:"flex" }}><Ico n="x" s={18}/></button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* font-size: 16px on all inputs — prevents iOS auto-zoom on focus */}
          <div>
            <input value={title} onChange={e => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(false); }} placeholder="Название задачи" autoFocus style={{ width:"100%", borderRadius:12, padding:"12px 16px", fontSize:16, background:"rgba(255,255,255,0.06)", border:`1px solid ${titleError ? "rgba(244,67,54,0.6)" : "rgba(255,255,255,0.1)"}`, color:"rgba(255,255,255,0.9)", outline:"none", boxSizing:"border-box" }}/>
            {titleError && <p style={{ margin:"6px 0 0", fontSize:12, color:"#f87171" }}>Введите название задачи</p>}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Заметка" rows={2} style={{ borderRadius:12, padding:"12px 16px", fontSize:16, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.9)", outline:"none", resize:"none" }}/>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div>
              <p style={{ margin:"0 0 6px", fontSize:12, color:C.dim }}>Дата</p>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:16, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.8)", outline:"none", colorScheme:"dark", boxSizing:"border-box" }}/>
            </div>
            <div>
              <p style={{ margin:"0 0 6px", fontSize:12, color:C.dim }}>Время</p>
              <input type="time" value={time} onChange={e => { setTime(e.target.value); if(e.target.value) setTimeOfDay(null); }} style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:16, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.8)", outline:"none", colorScheme:"dark", boxSizing:"border-box" }}/>
            </div>
          </div>
          {!time && (
            <div style={{ display:"flex", gap:8 }}>
              {TIME_OF_DAY.map(t => (
                <button key={t.id} onClick={() => setTimeOfDay(timeOfDay===t.id?null:t.id)} style={{ flex:1, padding:"8px 4px", borderRadius:10, border:`1px solid ${timeOfDay===t.id?"rgba(99,102,241,0.6)":"rgba(255,255,255,0.1)"}`, background:timeOfDay===t.id?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.05)", color:timeOfDay===t.id?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.45)", fontSize:11, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <span>{t.icon}</span><span>{t.label}</span>
                </button>
              ))}
            </div>
          )}
          <div>
            <p style={{ margin:"0 0 8px", fontSize:12, color:C.dim }}>Цвет</p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {colorLabels.map(c => (
                <button key={c.id} onClick={() => setColor(c.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:10, border:color===c.id?`2px solid ${c.hex}`:"2px solid rgba(255,255,255,0.08)", background:color===c.id?`${c.hex}22`:"rgba(255,255,255,0.04)", color:color===c.id?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)", fontSize:12, cursor:"pointer" }}>
                  {c.id!=="none" && <span style={{ width:8, height:8, borderRadius:4, background:c.hex }}/>}{c.label}
                </button>
              ))}
            </div>
          </div>
          {!initialTask && (
            <div>
              <button onClick={() => setIsRoutine(v=>!v)} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, background:"none", border:"none", cursor:"pointer", color:isRoutine?"#a5b4fc":"rgba(255,255,255,0.35)", padding:0 }}>
                <span style={{ width:18, height:18, borderRadius:4, border:isRoutine?"1.5px solid #818cf8":"1.5px solid rgba(255,255,255,0.2)", background:isRoutine?"rgba(99,102,241,0.25)":"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>{isRoutine && <Ico n="check" s={11} c="#a5b4fc"/>}</span>
                Рутинная задача
              </button>
              {isRoutine && <RoutineWeekPicker date={date} routineDays={routineDays} setRoutineDays={setRoutineDays} weekMondayOf={weekMondayOf} ruMonGen={RU_MON_GEN} weekdays={WEEKDAYS}/>}
            </div>
          )}
        </div>
        <button onClick={handleSave} style={{ width:"100%", marginTop:16, padding:"14px", borderRadius:20, background:C.indigo, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {initialTask?"Сохранить":isRoutine&&routineDays.length>0?`Добавить на ${routineDays.length} дн.`:"Добавить"}
        </button>
      </div>
    </div>
  );
}
