import { useState, useCallback } from "react";
import { C } from "../../constants/theme";
import { Ico } from "../../components/Ico";
import { useDragReorder } from "../../hooks/useDragReorder";
import PlannerTaskCard from "./PlannerTaskCard";
import PlannerTaskForm from "./PlannerTaskForm";

/* ─── Простая форма для заметок без срока ─────────────────────────────────── */
function SomedayCardForm({ initial, colorLabels, onSave, onClose }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [note,  setNote]  = useState(initial?.note  || "");
  const [color, setColor] = useState(initial?.color || "none");

  const handleSave = () => {
    if (!title.trim()) return;
    const base = initial || {};
    onSave({
      ...base,
      id:          base.id || crypto.randomUUID(),
      title:       title.trim(),
      note:        note.trim(),
      date:        null,
      time:        null,
      time_of_day: null,
      color,
      status: base.status || "active",
      order:  base.order  ?? 999,
    });
  };

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }}
      onClick={onClose}
      onTouchMove={e => e.preventDefault()}
    >
      <div
        style={{ width:"100%", maxWidth:480, borderRadius:"24px 24px 0 0", background:C.planSheet, borderTop:"1px solid rgba(255,255,255,0.1)", padding:"20px 20px calc(32px + env(safe-area-inset-bottom, 0px))", boxShadow:"0 -20px 60px rgba(0,0,0,0.4)", maxHeight:"calc(92dvh - env(safe-area-inset-top, 0px))", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:600, color:"rgba(255,255,255,0.9)" }}>
            {initial ? "Редактировать заметку" : "Новая заметка"}
          </h3>
          <button onClick={onClose} style={{ color:"rgba(255,255,255,0.4)", background:"none", border:"none", cursor:"pointer", display:"flex" }}>
            <Ico n="x" s={18}/>
          </button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Название"
            autoFocus
            style={{ borderRadius:12, padding:"12px 16px", fontSize:16, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.9)", outline:"none" }}
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Заметка (необязательно)"
            rows={3}
            style={{ borderRadius:12, padding:"12px 16px", fontSize:16, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.9)", outline:"none", resize:"none" }}
          />
          <div>
            <p style={{ margin:"0 0 8px", fontSize:12, color:C.dim }}>Тег</p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {colorLabels.map(c => (
                <button
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:10, border:color===c.id?`2px solid ${c.hex}`:"2px solid rgba(255,255,255,0.08)", background:color===c.id?`${c.hex}22`:"rgba(255,255,255,0.04)", color:color===c.id?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)", fontSize:12, cursor:"pointer" }}
                >
                  {c.id !== "none" && <span style={{ width:8, height:8, borderRadius:4, background:c.hex }}/>}
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          style={{ width:"100%", marginTop:16, padding:"14px", borderRadius:20, background:C.indigo, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}
        >
          {initial ? "Сохранить" : "Добавить заметку"}
        </button>
      </div>
    </div>
  );
}

/* ─── Основной компонент ─────────────────────────────────────────────────────── */
export default function SomedaySection({ tasks, colorLabels, onSave, onDelete, onStatusChange }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [editTask,    setEditTask]    = useState(null);
  const [pendingMove, setPendingMove] = useState(null); // задача ждёт переноса на день
  const [anyPressing, setAnyPressing] = useState(false);

  const sorted = [...tasks].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const handleReorder = useCallback((reordered) => {
    reordered.map((t, i) => ({ ...t, order: i })).forEach(t => onSave(t, true));
  }, [onSave]);

  const { dragId, dragOverId, getDragHandlers } = useDragReorder({
    items: sorted, onReorder: handleReorder, dataAttr: "taskid",
  });

  // Пользователь выбрал дату из календаря → открываем полную форму с предзаполненными данными
  const handleMoveToDay = (id, date) => {
    const task = tasks.find(t => t.id === id);
    if (task) setPendingMove({ ...task, date });
  };

  return (
    <>
      {/* Разделитель и заголовок секции */}
      <div style={{ marginTop:8, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: collapsed ? 0 : 10 }}>
          <button
            onClick={() => setCollapsed(v => !v)}
            style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:0 }}
          >
            <Ico n={collapsed ? "chevR" : "chevD"} s={13} c="rgba(255,255,255,0.3)"/>
            <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:1.5 }}>
              Без срока{tasks.length > 0 ? ` · ${tasks.length}` : ""}
            </span>
          </button>
          <button
            onClick={() => setShowForm(true)}
            style={{ width:28, height:28, borderRadius:8, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.1)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}
          >
            <Ico n="plus" s={14} c="#a5b4fc"/>
          </button>
        </div>

        {!collapsed && (
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingBottom:32 }}>
            {sorted.length === 0 && (
              <p style={{ margin:0, fontSize:13, color:"rgba(255,255,255,0.18)", textAlign:"center", padding:"20px 0" }}>
                Нет заметок без срока
              </p>
            )}
            {sorted.map(task => (
              <div
                key={task.id}
                data-taskid={task.id}
                style={{ opacity: dragId===task.id ? 0.4 : 1, transform: dragOverId===task.id && dragId!==task.id ? "scaleX(1.01)" : "none", transition:"transform 0.1s" }}
              >
                <PlannerTaskCard
                  task={task}
                  colorLabels={colorLabels}
                  onStatusChange={onStatusChange}
                  onMoveToDay={handleMoveToDay}
                  onEdit={t => onSave(t, true)}
                  onDelete={onDelete}
                  dragHandlers={getDragHandlers(task.id)}
                  isDragging={dragId === task.id}
                  isAnyPressing={anyPressing}
                  onPressingChange={setAnyPressing}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Форма создания/редактирования заметки */}
      {(showForm || editTask) && (
        <SomedayCardForm
          initial={editTask}
          colorLabels={colorLabels}
          onSave={t => { onSave(t, true); setShowForm(false); setEditTask(null); }}
          onClose={() => { setShowForm(false); setEditTask(null); }}
        />
      )}

      {/* Полная форма при переносе на день — предзаполнена данными заметки */}
      {pendingMove && (
        <PlannerTaskForm
          initialTask={pendingMove}
          initialDate={new Date(pendingMove.date)}
          colorLabels={colorLabels}
          onSave={taskData => { onSave(taskData, true); setPendingMove(null); }}
          onClose={() => setPendingMove(null)}
        />
      )}
    </>
  );
}
