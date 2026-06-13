import { useState, useEffect, useCallback, useRef } from "react";
import { C } from "../../constants/theme";
import { DEFAULT_COLOR_LABELS, STATUS_CONFIG } from "../../constants/planner";
import { RU_MON_GEN, RU_DAYS_S } from "../../constants/locale";
import { pad, todayStr, addDays } from "../../utils/date";
import { fmtDateFull } from "../../utils/format";
import { supa, supaUpsert } from "../../lib/supabase";
import { Ico } from "../../components/Ico";
import { Spinner } from "../../components/Spinner";
import { CalendarPicker } from "../../components/CalendarPicker";
import PlannerTaskCard from "./PlannerTaskCard";
import PlannerTaskForm from "./PlannerTaskForm";
import SomedaySection from "./SomedaySection";

export default function PlannerSection({ navigate }) {
  const [tasks, setTasks] = useState([]);
  const [colorLabels, setColorLabels] = useState(DEFAULT_COLOR_LABELS);
  const [loading, setLoading] = useState(true);
  const [currentDay, setCurrentDay] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [anyPressing, setAnyPressing] = useState(false);
  const [toast, setToast] = useState(null);
  const carouselRef = useRef(null);
  const touchDayStart = useRef(null);
  const toastTimer = useRef(null);
  const dragIdRef = useRef(null);
  const dragOverIdRef = useRef(null);
  const tasksRef = useRef([]);

  const showError = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const currentKey = `${currentDay.getFullYear()}-${pad(currentDay.getMonth()+1)}-${pad(currentDay.getDate())}`;
  const isToday = currentKey === todayStr();
  const isYesterday = currentKey === addDays(todayStr(), -1);
  const isTomorrow = currentKey === addDays(todayStr(), 1);
  const dayLabel = isToday?"Сегодня":isYesterday?"Вчера":isTomorrow?"Завтра":`${currentDay.getDate()} ${RU_MON_GEN[currentDay.getMonth()]}`;

  const carouselDays = Array.from({ length:61 }, (_,i) => { const d = new Date(currentDay); d.setDate(d.getDate()-30+i); return d; });
  const tasksByDate = {};
  const somedayTasks = [];
  tasks.forEach(t => {
    if (!t.date) { somedayTasks.push(t); return; }
    if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
    tasksByDate[t.date].push(t);
  });
  const currentTasks = (tasksByDate[currentKey]||[]).sort((a,b) => a.order-b.order);
  tasksRef.current = tasks;
  const activeCnt = currentTasks.filter(t=>t.status==="active").length;
  const doneCnt = currentTasks.filter(t=>t.status==="done").length;

  // Load from Supabase
  useEffect(() => {
    const load = async () => {
      try {
        const [t, cl] = await Promise.all([
          supa.select("tasks", "order=order.asc"),
          supa.select("color_labels"),
        ]);
        if (t) setTasks(t.map(row => ({ ...row, time_of_day: row.time_of_day||null })));
        if (cl && cl.length > 0) setColorLabels(cl);
        else { await supaUpsert("color_labels", DEFAULT_COLOR_LABELS); }
      } catch(e) { console.error("Load tasks error:", e); }
      setLoading(false);
    };
    load();
  }, []);

  // Выбранный день всегда в центре окна (индекс 30 из 61) — скроллим его в центр полосы.
  const scrollToCenter = useCallback((behavior = "auto") => {
    carouselRef.current?.children[30]?.scrollIntoView({ behavior, inline:"center", block:"nearest" });
  }, []);

  // Центрируем при смене выбранного дня И после завершения загрузки (когда карусель
  // впервые появляется в DOM — иначе на обновлении страницы скролл срабатывает «вхолостую»).
  useEffect(() => {
    if (loading) return;
    const r = requestAnimationFrame(() => scrollToCenter());
    return () => cancelAnimationFrame(r);
  }, [currentDay, loading, scrollToCenter]);

  const updateTask = useCallback(async (id, patch) => {
    let snapshot;
    setTasks(prev => { snapshot = prev; return prev.map(t => t.id===id ? {...t,...patch} : t); });
    try { await supa.update("tasks", patch, `id=eq.${id}`); }
    catch(e) { console.error(e); setTasks(snapshot); showError("Не удалось сохранить изменение"); }
  }, [showError]);

  const deleteTask = useCallback(async id => {
    let snapshot;
    setTasks(prev => { snapshot = prev; return prev.filter(t => t.id!==id); });
    try { await supa.delete("tasks", `id=eq.${id}`); }
    catch(e) { console.error(e); setTasks(snapshot); showError("Не удалось удалить задачу"); }
  }, [showError]);

  const moveToDay = useCallback(async (id, newDate) => {
    const task = tasks.find(t => t.id===id);
    if (!task) return;
    const dayTasks = tasks.filter(t => t.date===newDate);
    const newOrder = dayTasks.length > 0 ? Math.max(...dayTasks.map(t=>t.order))+1 : 0;
    const patch = { date: newDate, order: newOrder, status:"active" };
    let snapshot;
    setTasks(prev => { snapshot = prev; return prev.map(t => t.id===id ? {...t,...patch} : t); });
    try { await supa.update("tasks", patch, `id=eq.${id}`); }
    catch(e) { console.error(e); setTasks(snapshot); showError("Не удалось перенести задачу"); }
  }, [tasks, showError]);

  const saveTask = useCallback(async (taskData, skipClose = false) => {
    const exists = tasks.find(t => t.id===taskData.id);
    let snapshot;
    if (exists) {
      setTasks(prev => { snapshot = prev; return prev.map(t => t.id===taskData.id ? taskData : t); });
      const { id, ...patch } = taskData;
      try { await supa.update("tasks", patch, `id=eq.${taskData.id}`); }
      catch(e) { console.error(e); setTasks(snapshot); showError("Не удалось сохранить задачу"); }
    } else {
      const dayTasks = tasks.filter(t => t.date===taskData.date);
      const newTask = { ...taskData, order: taskData.order===999 ? dayTasks.length : taskData.order };
      setTasks(prev => { snapshot = prev; return [...prev, newTask]; });
      try { await supaUpsert("tasks", newTask); }
      catch(e) { console.error(e); setTasks(snapshot); showError("Не удалось создать задачу"); }
    }
    if (!skipClose) setShowForm(false);
  }, [tasks, showError]);

  // Drag & drop — pointer events (работает на touch + mouse, в отличие от HTML5 drag API)
  const executeDrop = useCallback(async () => {
    const fromId = dragIdRef.current;
    const toId   = dragOverIdRef.current;
    setDragId(null); setDragOverId(null);
    dragIdRef.current = null; dragOverIdRef.current = null;
    if (!fromId || !toId || fromId === toId) return;
    const day = tasksRef.current.filter(t => t.date===currentKey).sort((a,b) => a.order-b.order);
    const fi = day.findIndex(t => t.id===fromId), ti = day.findIndex(t => t.id===toId);
    if (fi<0||ti<0) return;
    const reordered = [...day]; const [moved] = reordered.splice(fi,1); reordered.splice(ti,0,moved);
    const updated = reordered.map((t,i) => ({...t,order:i}));
    let snapshot;
    setTasks(prev => { snapshot = prev; return prev.map(t => { const u=updated.find(x=>x.id===t.id); return u||t; }); });
    try { await Promise.all(updated.map(t => supa.update("tasks",{order:t.order},`id=eq.${t.id}`))); }
    catch(e) { console.error(e); setTasks(snapshot); showError("Не удалось изменить порядок"); }
  }, [currentKey, showError]);
  const executeDropRef = useRef(executeDrop);
  useEffect(() => { executeDropRef.current = executeDrop; }, [executeDrop]);

  const getDragHandlers = useCallback(id => ({
    onPointerDown: e => {
      e.stopPropagation();
      dragIdRef.current = id;
      setDragId(id);
      const onMove = moveEvent => {
        moveEvent.preventDefault();
        const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const overId = el?.closest('[data-taskid]')?.dataset.taskid || null;
        if (overId !== dragOverIdRef.current) {
          dragOverIdRef.current = overId;
          setDragOverId(overId);
        }
      };
      const onUp = () => {
        executeDropRef.current();
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
    },
  }), []);

  const handleMainTouchStart = e => { touchDayStart.current = e.touches[0].clientX; };
  const handleMainTouchEnd = e => {
    if (touchDayStart.current===null) return;
    const dx = e.changedTouches[0].clientX - touchDayStart.current;
    if (Math.abs(dx) > 70) {
      const nd = new Date(currentDay); nd.setDate(nd.getDate() + (dx<0?1:-1));
      setCurrentDay(nd);
    }
    touchDayStart.current = null;
  };

  if (loading) return <div style={{ background:C.planBg, minHeight:"calc(100dvh - var(--app-header-h))" }}><Spinner color={C.indigo}/></div>;

  return (
    <div style={{ background:C.planBg, minHeight:"calc(100dvh - var(--app-header-h))", paddingBottom:80 }}>
      <div style={{ position:"sticky", top:0, zIndex:20, background:"rgba(13,13,26,0.92)", backdropFilter:"blur(16px)", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth:480, margin:"0 auto", padding:"12px 16px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div>
              <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:"rgba(255,255,255,0.95)" }}>{dayLabel}</h2>
              {!isToday && <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.35)" }}>{fmtDateFull(currentDay)}</p>}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowTimeline(v=>!v)} style={{ padding:10, borderRadius:12, border:`1px solid ${showTimeline?"rgba(99,102,241,0.5)":"rgba(255,255,255,0.1)"}`, background:showTimeline?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.05)", color:showTimeline?"#a5b4fc":"rgba(255,255,255,0.5)", cursor:"pointer", display:"flex" }}>
                <Ico n="clock" s={16} c={showTimeline?"#a5b4fc":"rgba(255,255,255,0.5)"}/>
              </button>
              <button onClick={() => setShowCalendar(true)} style={{ padding:10, borderRadius:12, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.5)", cursor:"pointer", display:"flex" }}>
                <Ico n="calendar" s={16} c="rgba(255,255,255,0.5)"/>
              </button>
              <button onClick={() => setShowForm(true)} style={{ padding:10, borderRadius:12, border:"1px solid rgba(99,102,241,0.4)", background:"rgba(99,102,241,0.2)", color:"#a5b4fc", cursor:"pointer", display:"flex" }}>
                <Ico n="plus" s={16} c="#a5b4fc"/>
              </button>
            </div>
          </div>
          {/* Carousel */}
          <div ref={carouselRef} style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
            {carouselDays.map(d => {
              const dk = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
              const isActive = dk===currentKey, td = dk===todayStr();
              const hasTasks = tasksByDate[dk]?.length>0;
              const hasActive = tasksByDate[dk]?.some(t=>t.status==="active");
              return (
                <button key={dk} onClick={() => setCurrentDay(new Date(d))} style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"8px 10px", borderRadius:12, border:"none", background:isActive?"#6366f1":td?"rgba(99,102,241,0.15)":"transparent", color:isActive?"#fff":td?"#a5b4fc":"rgba(255,255,255,0.45)", cursor:"pointer", minWidth:44 }}>
                  <span style={{ fontSize:10, fontWeight:500 }}>{RU_DAYS_S[d.getDay()]}</span>
                  <span style={{ fontSize:14, fontWeight:700 }}>{d.getDate()}</span>
                  <span style={{ width:5, height:5, borderRadius:3, background:hasTasks?(hasActive?(isActive?"#fff":"#818cf8"):(isActive?"rgba(255,255,255,0.4)":"rgba(255,255,255,0.2)")):"transparent" }}/>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:480, margin:"0 auto", padding:"12px 16px" }} onTouchStart={handleMainTouchStart} onTouchEnd={handleMainTouchEnd}>
        {/* Timeline */}
        {showTimeline && (
          <div style={{ borderRadius:16, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", padding:"12px 16px", marginBottom:12 }}>
            <p style={{ margin:"0 0 8px", fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:2 }}>Расписание</p>
            {currentTasks.filter(t=>t.time).sort((a,b)=>a.time.localeCompare(b.time)).length===0
              ? <p style={{ fontSize:13, color:"rgba(255,255,255,0.2)", margin:0 }}>Нет задач с точным временем</p>
              : currentTasks.filter(t=>t.time).sort((a,b)=>a.time.localeCompare(b.time)).map(t => (
                <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderTop:"1px solid rgba(255,255,255,0.05)", opacity:STATUS_CONFIG[t.status]?.dim?0.4:1 }}>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,0.3)", fontFamily:"monospace", width:40 }}>{t.time}</span>
                  <div style={{ width:1, height:24, background:"rgba(255,255,255,0.1)" }}/>
                  <span style={{ fontSize:13, color:"rgba(255,255,255,0.7)" }}>{t.title}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Stats */}
        {currentTasks.length>0 && (
          <div style={{ display:"flex", gap:12, marginBottom:10 }}>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.3)" }}>{currentTasks.length} задач</span>
            {activeCnt>0 && <span style={{ fontSize:12, color:"#818cf8" }}>{activeCnt} активных</span>}
            {doneCnt>0 && <span style={{ fontSize:12, color:"rgba(52,211,153,0.7)" }}>{doneCnt} выполнено</span>}
            <span style={{ fontSize:10, color:"rgba(255,255,255,0.15)", marginLeft:"auto" }}>удерживай для действий</span>
          </div>
        )}

        {/* Tasks */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {currentTasks.length===0 && (
            <div style={{ padding:"60px 0", display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
              <div style={{ width:56, height:56, borderRadius:16, background:"rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n="calendar" s={24} c="rgba(255,255,255,0.15)"/></div>
              <p style={{ margin:0, fontSize:14, color:"rgba(255,255,255,0.35)" }}>Нет задач на этот день</p>
            </div>
          )}
          {currentTasks.map((task, idx) => (
            <div key={task.id}
                 data-taskid={task.id}
                 style={{ opacity:dragId===task.id?0.4:1, transform:dragOverId===task.id&&dragId!==task.id?"scaleX(1.01)":"none", transition:"transform 0.1s" }}>
              <PlannerTaskCard task={task} colorLabels={colorLabels}
                               onStatusChange={(id,s) => updateTask(id, {status:s})}
                               onMoveToDay={moveToDay}
                               onEdit={saveTask}
                               onDelete={deleteTask}
                               isDragging={dragId===task.id}
                               dragHandlers={getDragHandlers(task.id)}
                               isAnyPressing={anyPressing}
                               onPressingChange={setAnyPressing}
              />
            </div>
          ))}
        </div>

        {/* Заметки без срока */}
        <SomedaySection
          tasks={somedayTasks}
          colorLabels={colorLabels}
          onSave={saveTask}
          onDelete={deleteTask}
          onStatusChange={(id, s) => updateTask(id, { status: s })}
        />
      </div>

      {/* FAB */}
      <button onClick={() => setShowForm(true)} style={{ position:"fixed", bottom:"calc(20px + env(safe-area-inset-bottom, 0px))", right:20, width:56, height:56, borderRadius:20, background:"#6366f1", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 8px 24px rgba(99,102,241,0.4)", zIndex:20 }}>
        <Ico n="plus" s={24} c="#fff"/>
      </button>

      {showForm && <PlannerTaskForm initialDate={currentDay} colorLabels={colorLabels} onSave={saveTask} onClose={() => setShowForm(false)}/>}
      {showCalendar && <CalendarPicker mode="single" value={currentKey} onChange={v => { setCurrentDay(new Date(v)); setShowCalendar(false); }} onClose={() => setShowCalendar(false)}/>}

      {/* Error toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:200, maxWidth:"90vw", padding:"12px 18px", borderRadius:14, background:"rgba(244,67,54,0.95)", color:"#fff", fontSize:13, fontWeight:500, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }} onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
