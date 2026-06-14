import { useState } from "react";
import { C } from "../constants/theme";
import { RU_MONTHS, RU_DAYS_S } from "../constants/locale";
import { pad } from "../utils/date";
import { Ico } from "./Ico";

export function CalendarPicker({ mode="single", value, valueEnd, onChange, onChangeEnd, onClose }) {
  const initDate = value ? new Date(value) : new Date();
  const [month, setMonth] = useState(initDate.getMonth());
  const [year, setYear] = useState(initDate.getFullYear());
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null);

  const dk = d => d ? `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` : "";
  const inRange = d => d && value && valueEnd && dk(d) > value && dk(d) < valueEnd;
  const isStart = d => d && dk(d) === value;
  const isEnd = d => d && dk(d) === valueEnd;

  const goToday = () => {
    const now = new Date();
    setMonth(now.getMonth());
    setYear(now.getFullYear());
  };

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end", cursor:"pointer" }}
      onClick={onClose}
      onTouchMove={e => e.preventDefault()}
    >
      <div
        style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px calc(32px + env(safe-area-inset-bottom, 0px))", cursor:"default" }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, display:"flex", padding:4 }}>
            <Ico n="x" s={20}/>
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, display:"flex" }}><Ico n="chevL" s={20}/></button>
            <span style={{ fontSize:15, fontWeight:600, color:"#fff", minWidth:140, textAlign:"center" }}>{RU_MONTHS[month]} {year}</span>
            <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, display:"flex" }}><Ico n="chevR" s={20}/></button>
          </div>
          <button onClick={goToday} style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, cursor:"pointer", color:C.mid, fontSize:12, padding:"4px 8px" }}>
            Сег
          </button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
          {RU_DAYS_S.map(d => <div key={d} style={{ textAlign:"center", fontSize:11, color:C.dim, padding:"4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
          {cells.map((d,i) => {
            if (!d) return <div key={i}/>;
            const key = dk(d), sel = isStart(d)||isEnd(d), rng = inRange(d);
            return (
              <button key={i} onClick={() => {
                if (mode==="single") { onChange(key); onClose?.(); }
                else {
                  if (!value||(value&&valueEnd)) { onChange(key); onChangeEnd?.(""); }
                  else if (key > value) { onChangeEnd?.(key); onClose?.(); }
                  else { onChange(key); onChangeEnd?.(""); }
                }
              }} style={{ height:40, borderRadius:8, border:"none", cursor:"pointer", background:sel?C.green:rng?"rgba(76,175,80,0.2)":"transparent", color:sel?"#fff":C.main, fontSize:14, fontWeight:sel?700:400 }}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
        {mode==="range" && value && !valueEnd && <p style={{ textAlign:"center", fontSize:12, color:C.dim, marginTop:8 }}>Выберите дату окончания</p>}
      </div>
    </div>
  );
}
