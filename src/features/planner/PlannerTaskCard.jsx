import { useState, useEffect, useRef } from "react";
import { STATUS_CONFIG, TIME_OF_DAY } from "../../constants/planner";
import { Ico } from "../../components/Ico";
import { CalendarPicker } from "../../components/CalendarPicker";
import PlannerTaskForm from "./PlannerTaskForm";

export default function PlannerTaskCard({ task, colorLabels, onStatusChange, onMoveToDay, onEdit, onDelete, dragHandlers, isDragging, isAnyPressing, onPressingChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showMoveCal, setShowMoveCal] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef(null);
  const menuRef = useRef(null);
  const touchStartRef = useRef(null);
  const didScrollRef = useRef(false);
  const colorCfg = colorLabels.find(c => c.id===task.color) || colorLabels[0];
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.active;
  const isDim = statusCfg.dim;

  const startPress = (e) => {
    didScrollRef.current = false;
    if (e.touches) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    setPressing(true); onPressingChange(true);
    timerRef.current = setTimeout(() => { setShowMenu(true); setPressing(false); onPressingChange(false); }, 500);
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    if (dx > 8 || dy > 8) {
      didScrollRef.current = true;
      endPress();
    }
  };

  const endPress = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    touchStartRef.current = null;
    setPressing(false); onPressingChange(false);
  };

  const handleClick = () => {
    if (showMenu || didScrollRef.current) return;
    setShowDetail(true);
  };

  useEffect(() => {
    if (!showMenu) return;
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  return (
    <>
      <div className={pressing?"lp-glow":""} style={{ position:"relative", borderRadius:16, border:isDim?"1px solid rgba(255,255,255,0.05)":pressing?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.1)", background:isDim?"rgba(255,255,255,0.03)":pressing?"rgba(99,102,241,0.12)":"rgba(255,255,255,0.06)", opacity:isDim?0.45:(isAnyPressing&&!pressing)?0.35:1, transform:pressing?"scale(1.025)":"scale(1)", transition:"opacity 0.2s,transform 0.15s,background 0.15s", cursor:"pointer", userSelect:"none" }}
           onMouseDown={startPress} onMouseUp={endPress} onMouseLeave={endPress}
           onTouchStart={startPress} onTouchMove={handleTouchMove} onTouchEnd={endPress}
           onClick={handleClick}>
        {task.color!=="none" && !isDim && (
          <div style={{ position:"absolute", left:0, top:12, bottom:12, width:3, borderRadius:2, background:colorCfg.hex, opacity:0.75 }}/>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:16, paddingRight:12, paddingTop:12, paddingBottom:12 }}>
          <div {...dragHandlers}
               onMouseDown={e => e.stopPropagation()}
               onTouchStart={e => e.stopPropagation()}
               onClick={e => e.stopPropagation()}
               style={{ color:"rgba(255,255,255,0.15)", cursor:"grab", flexShrink:0, touchAction:"none", userSelect:"none" }}>
            <Ico n="drag" s={16}/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:14, fontWeight:500, color:isDim?"rgba(255,255,255,0.35)":"rgba(255,255,255,0.9)", textDecoration:isDim?"line-through":"none" }}>{task.title}</span>
              {statusCfg.tag && <span style={{ fontSize:10, fontWeight:700, letterSpacing:2, padding:"1px 6px", borderRadius:6, background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.35)" }}>{statusCfg.tag}</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
              {task.time ? <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)", display:"flex", alignItems:"center", gap:3 }}><Ico n="clock" s={10} c="rgba(255,255,255,0.35)"/>{task.time}</span>
                : task.time_of_day ? <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>{TIME_OF_DAY.find(t=>t.id===task.time_of_day)?.icon} {TIME_OF_DAY.find(t=>t.id===task.time_of_day)?.label}</span>
                  : null}
              {task.note && <span style={{ fontSize:12, color:"rgba(255,255,255,0.25)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.note}</span>}
            </div>
          </div>
          <button onClick={e => { e.stopPropagation(); onStatusChange(task.id, task.status==="done"?"active":"done"); }} style={{ width:24, height:24, borderRadius:12, border:task.status==="done"?"2px solid #34d399":"2px solid rgba(255,255,255,0.2)", background:task.status==="done"?"rgba(52,211,153,0.2)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}>
            {task.status==="done" && <Ico n="check" s={12} c="#34d399"/>}
          </button>
        </div>
      </div>

      {/* Context menu */}
      {showMenu && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", cursor:"pointer" }} onClick={() => setShowMenu(false)}>
          <div ref={menuRef} style={{ width:"100%", maxWidth:480, marginLeft:16, marginRight:16, marginBottom:"calc(32px + env(safe-area-inset-bottom, 0px))", borderRadius:24, background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.1)", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.5)", cursor:"default" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
              <p style={{ margin:0, fontSize:14, fontWeight:600, color:"rgba(255,255,255,0.9)" }}>{task.title}</p>
            </div>
            <div style={{ padding:8 }}>
              {["active","done","hold","cancelled"].map(s => (
                <button key={s} onClick={() => { onStatusChange(task.id, s); setShowMenu(false); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:task.status===s?"rgba(255,255,255,0.08)":"transparent", border:"none", color:task.status===s?"#fff":"rgba(255,255,255,0.6)", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                  {STATUS_CONFIG[s].label}
                  {task.status===s && <Ico n="check" s={14} c="#34d399"/>}
                </button>
              ))}
              <div style={{ height:1, background:"rgba(255,255,255,0.05)", margin:"4px 0" }}/>
              <button onClick={() => { setShowMoveCal(true); setShowMenu(false); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:"transparent", border:"none", color:"rgba(255,255,255,0.6)", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                <Ico n="calendar" s={16} c="rgba(255,255,255,0.6)"/>Перенести на другой день
              </button>
              {task.date && (
                <button onClick={() => { onMoveToDay(task.id, null); setShowMenu(false); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:"transparent", border:"none", color:"rgba(255,255,255,0.6)", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                  <Ico n="x" s={16} c="rgba(255,255,255,0.6)"/>Убрать срок (в «Без срока»)
                </button>
              )}
              <button onClick={() => { setShowEditForm(true); setShowMenu(false); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:"transparent", border:"none", color:"rgba(255,255,255,0.6)", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                <Ico n="edit" s={16} c="rgba(255,255,255,0.6)"/>Редактировать
              </button>
              <button onClick={() => { onDelete(task.id); setShowMenu(false); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:"transparent", border:"none", color:"rgba(244,67,54,0.7)", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                <Ico n="trash" s={16} c="rgba(244,67,54,0.7)"/>Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {showDetail && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)", padding:16, cursor:"pointer" }} onClick={() => setShowDetail(false)}>
          <div style={{ width:"100%", maxWidth:400, borderRadius:24, background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.1)", overflow:"hidden", cursor:"default" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"20px 24px 16px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                <h3 style={{ margin:0, fontSize:16, fontWeight:600, color:"rgba(255,255,255,0.95)" }}>{task.title}</h3>
                <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                  <button onClick={() => { setShowDetail(false); setShowEditForm(true); }} style={{ padding:6, borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.5)", cursor:"pointer", display:"flex" }}><Ico n="edit" s={14}/></button>
                  <button onClick={() => setShowDetail(false)} style={{ color:"rgba(255,255,255,0.4)", background:"none", border:"none", cursor:"pointer", display:"flex" }}><Ico n="x" s={18}/></button>
                </div>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
                <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)" }}>{statusCfg.label}</span>
                {colorCfg.id!=="none" && <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)", display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:4, background:colorCfg.hex, display:"inline-block" }}/>{colorCfg.label}</span>}
                {task.time && <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)", display:"flex", alignItems:"center", gap:4 }}><Ico n="clock" s={10} c="rgba(255,255,255,0.6)"/>{task.time}</span>}
                {task.time_of_day && !task.time && <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)" }}>{TIME_OF_DAY.find(t=>t.id===task.time_of_day)?.icon} {TIME_OF_DAY.find(t=>t.id===task.time_of_day)?.label}</span>}
              </div>
            </div>
            {task.note && <div style={{ margin:"0 24px 24px", padding:16, borderRadius:16, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)" }}><p style={{ margin:0, fontSize:14, color:"rgba(255,255,255,0.65)", lineHeight:1.5 }}>{task.note}</p></div>}
            {!task.note && <div style={{ height:24 }}/>}
          </div>
        </div>
      )}

      {/* Move to day calendar */}
      {showMoveCal && (
        <CalendarPicker mode="single" value={task.date} onChange={newDate => { onMoveToDay(task.id, newDate); setShowMoveCal(false); }} onClose={() => setShowMoveCal(false)}/>
      )}

      {/* Edit form */}
      {showEditForm && (
        <PlannerTaskForm initialTask={task} colorLabels={colorLabels} onSave={updated => { onEdit(updated); setShowEditForm(false); }} onClose={() => setShowEditForm(false)}/>
      )}
    </>
  );
}
