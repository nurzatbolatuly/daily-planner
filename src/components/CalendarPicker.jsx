import { useState, useRef, useEffect } from "react";
import { C } from "../constants/theme";
import { RU_MONTHS, RU_MONTHS_S } from "../constants/locale";
import { pad } from "../utils/date";
import { Ico } from "./Ico";

// Monday-first (Russian standard)
const DAYS_S = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

// confirmable=true (range mode only): don't auto-close after end date picked; show an "Apply" button instead
export function CalendarPicker({ mode="single", value, valueEnd, onChange, onChangeEnd, onClose, confirmable=false }) {
  const today    = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  // Use local noon to avoid UTC-midnight timezone shift
  const initDate = value ? new Date(value + "T12:00:00") : today;

  const [view,    setView]    = useState("days"); // "days" | "months" | "years"
  const [month,   setMonth]   = useState(initDate.getMonth());
  const [year,    setYear]    = useState(initDate.getFullYear());
  const [visible, setVisible] = useState(true);  // opacity fade flag

  const yearsRef = useRef(null);

  // Scroll the selected year into center when year picker opens
  useEffect(() => {
    if (view !== "years" || !yearsRef.current) return;
    const el = yearsRef.current.querySelector(`[data-y="${year}"]`);
    el?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMonth = (delta) => {
    setVisible(false);
    setTimeout(() => {
      let nm = month + delta, ny = year;
      if (nm < 0)  { nm = 11; ny--; }
      if (nm > 11) { nm = 0;  ny++; }
      setMonth(nm);
      setYear(ny);
      setVisible(true);
    }, 80);
  };

  // Build 6-row grid, Monday-first
  const firstDow   = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null); // always 6 rows

  const dk = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const isStart = d => d && dk(d) === (value || todayKey);
  const isEnd   = d => d && valueEnd && dk(d) === valueEnd;
  const inRange = d => d && value && valueEnd && dk(d) > value && dk(d) < valueEnd;
  const isToday = d => d && dk(d) === todayKey;

  const goToday = () => {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
    setView("days");
  };

  const handleDay = (d) => {
    const key = dk(d);
    if (mode === "single") { onChange(key); onClose?.(); return; }
    if (!value || (value && valueEnd)) { onChange(key); onChangeEnd?.(""); }
    else if (key > value) { onChangeEnd?.(key); if (!confirmable) onClose?.(); }
    else                  { onChange(key); onChangeEnd?.(""); }
  };

  const curYear  = today.getFullYear();
  const yearList = Array.from({ length: 31 }, (_, i) => curYear - 15 + i);

  // Shared style fragments
  const btnReset = {
    background:"none", border:"none", cursor:"pointer",
    display:"flex", alignItems:"center", justifyContent:"center", padding:0,
  };
  const pickerBtn = (active) => ({
    height:44, borderRadius:10, border:"none", cursor:"pointer", fontSize:14,
    background: active ? C.green : "rgba(255,255,255,0.06)",
    color:      active ? "#fff"  : C.main,
    fontWeight: active ? 700 : 400,
  });

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
      onClick={onClose}
      onTouchMove={e => e.preventDefault()}
    >
      <div
        style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px calc(32px + env(safe-area-inset-bottom,0px))", cursor:"default" }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      >

        {/* ── Header ────────────────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>

          <button onClick={onClose} style={{ ...btnReset, color:C.mid, padding:4 }}>
            <Ico n="x" s={20}/>
          </button>

          <div style={{ display:"flex", alignItems:"center", gap:2 }}>
            {view === "days" && (
              <button onClick={() => changeMonth(-1)} style={{ ...btnReset, color:C.mid, padding:6 }}>
                <Ico n="chevL" s={18}/>
              </button>
            )}

            {/* Tap month → month picker */}
            <button
              onClick={() => setView(v => v === "months" ? "days" : "months")}
              style={{
                ...btnReset,
                fontSize:15, fontWeight:600, padding:"4px 8px", borderRadius:8,
                color:       view === "months" ? C.green : C.main,
                background:  view === "months" ? C.greenDim : "transparent",
              }}
            >
              {RU_MONTHS[month]}
            </button>

            {/* Tap year → year picker */}
            <button
              onClick={() => setView(v => v === "years" ? "days" : "years")}
              style={{
                ...btnReset,
                fontSize:15, fontWeight:600, padding:"4px 8px", borderRadius:8,
                color:       view === "years" ? C.green : C.main,
                background:  view === "years" ? C.greenDim : "transparent",
              }}
            >
              {year}
            </button>

            {view === "days" && (
              <button onClick={() => changeMonth(1)} style={{ ...btnReset, color:C.mid, padding:6 }}>
                <Ico n="chevR" s={18}/>
              </button>
            )}
          </div>

          <button
            onClick={goToday}
            style={{ background:C.greenDim, border:`1px solid rgba(76,175,80,0.3)`, borderRadius:8, cursor:"pointer", color:C.green, fontSize:12, fontWeight:600, padding:"4px 10px" }}
          >
            Сегодня
          </button>
        </div>

        {/* ── Days view ─────────────────────────────────────────── */}
        {view === "days" && (
          <>
            {/* Day-of-week labels */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
              {DAYS_S.map(d => (
                <div key={d} style={{ textAlign:"center", fontSize:11, color:C.dim, padding:"4px 0" }}>{d}</div>
              ))}
            </div>

            {/* Fixed 6-row grid — empty cells keep height to prevent layout shift */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, opacity: visible ? 1 : 0, transition:"opacity 80ms ease" }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} style={{ height:36 }}/>;

                const sel = isStart(d) || isEnd(d);
                const rng = inRange(d);
                const tod = isToday(d);

                return (
                  <button
                    key={i}
                    onClick={() => handleDay(d)}
                    style={{
                      height:36, borderRadius:8, cursor:"pointer", fontSize:14,
                      background: sel ? C.green : rng ? C.greenDim : "transparent",
                      color:      sel ? "#fff"  : C.main,
                      fontWeight: sel ? 700 : 400,
                      // Green ring for today when not selected
                      border:     !sel && tod ? `1.5px solid ${C.green}` : "none",
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {mode === "range" && value && !valueEnd && (
              <p style={{ textAlign:"center", fontSize:12, color:C.dim, marginTop:8, marginBottom:0 }}>
                Выберите дату окончания
              </p>
            )}
            {confirmable && mode === "range" && value && valueEnd && (
              <button
                onClick={onClose}
                style={{ width:"100%", marginTop:12, padding:"13px", borderRadius:12, background:C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}
              >
                Применить
              </button>
            )}
          </>
        )}

        {/* ── Month picker ──────────────────────────────────────── */}
        {view === "months" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {RU_MONTHS_S.map((name, i) => (
              <button key={i} onClick={() => { setMonth(i); setView("days"); }} style={pickerBtn(i === month)}>
                {name}
              </button>
            ))}
          </div>
        )}

        {/* ── Year picker ───────────────────────────────────────── */}
        {view === "years" && (
          <div
            ref={yearsRef}
            style={{ maxHeight:256, overflowY:"auto", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}
          >
            {yearList.map(y => (
              <button key={y} data-y={y} onClick={() => { setYear(y); setView("days"); }} style={pickerBtn(y === year)}>
                {y}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
