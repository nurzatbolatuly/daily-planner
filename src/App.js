/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from "react";

/* ══════════════════════════════════════════════════════════════
   SUPABASE CLIENT
══════════════════════════════════════════════════════════════ */
const SUPA_URL = "https://dfsojlxtlceiuxcelcdo.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmc29qbHh0bGNlaXV4Y2VsY2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTk0NDUsImV4cCI6MjA5NTMzNTQ0NX0.RrMFnPdGHoiL17n6Ri4cCsg-JQBWvUPRPZe0ltZafq4";

const supa = {
  async query(table, method = "GET", body = null, filters = "") {
    const url = `${SUPA_URL}/rest/v1/${table}${filters}`;
    const res = await fetch(url, {
      method,
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
        "Prefer": method === "POST" ? "return=representation" : method === "PATCH" ? "return=representation" : "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase ${method} ${table}: ${err}`);
    }
    if (method === "DELETE" || res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },
  select: (table, filters = "") => supa.query(table, "GET", null, `?${filters}`),
  insert: (table, data) => supa.query(table, "POST", data),
  update: (table, data, filter) => supa.query(table, "PATCH", data, `?${filter}`),
  delete: (table, filter) => supa.query(table, "DELETE", null, `?${filter}`),
  upsert: (table, data) => supa.query(table, "POST", data, ""),
};

// Supabase upsert via POST with header
async function supaUpsert(table, data) {
  const url = `${SUPA_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(Array.isArray(data) ? data : [data]),
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ══════════════════════════════════════════════════════════════
   THEME & CONSTANTS
══════════════════════════════════════════════════════════════ */
const C = {
  // Planner
  planBg: "#0d0d1a", planHeader: "rgba(13,13,26,0.92)", planCard: "rgba(255,255,255,0.06)",
  indigo: "#6366f1", indigoD: "rgba(99,102,241,0.2)",
  // Money
  monBg: "#0a1a0a", monHeader: "#0f2010", monCard: "#141e14", monCard2: "#1a2a1a",
  green: "#4caf50", greenDim: "rgba(76,175,80,0.15)", yellow: "#c8961e",
  // Shared
  red: "#f44336", dim: "rgba(255,255,255,0.30)", mid: "rgba(255,255,255,0.60)",
  main: "rgba(255,255,255,0.92)", border: "rgba(255,255,255,0.07)",
};
const BASE_CUR = "KZT";
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const getSym = code => ALL_CURR.find(c => c.code === code)?.sym || code;
const fmtAmt = (n, dec = 2) => Math.abs(Number(n)||0).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtM = (n, code) => `${getSym(code)}${fmtAmt(n)}`;
const toBase = (amt, from, rates = {}) => from === BASE_CUR ? amt : amt * (rates[from] || 1);
const avgRateFn = (ob, or_, aa, nr) => (ob+aa) === 0 ? nr : (ob*or_+aa*nr)/(ob+aa);
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const daysBetween = (a, b) => Math.round((new Date(b)-new Date(a))/(1000*60*60*24));
const monthKey = d => { const dt = new Date(d); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`; };

const RU_MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const RU_MONTHS_S = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const RU_MON_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const RU_DAYS_S = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const RU_DAYS_FULL = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];

function fmtDateFull(d) { const dt = new Date(d); return `${dt.getDate()} ${RU_MON_GEN[dt.getMonth()]}, ${RU_DAYS_FULL[dt.getDay()]}`; }
function fmtDateShort(s) { const d = new Date(s), t = new Date(), y = new Date(t); y.setDate(t.getDate()-1); if(d.toDateString()===t.toDateString()) return "Сегодня"; if(d.toDateString()===y.toDateString()) return "Вчера"; return `${d.getDate()} ${RU_MON_GEN[d.getMonth()]}`; }

/* ══════════════════════════════════════════════════════════════
   CURRENCIES
══════════════════════════════════════════════════════════════ */
const MAIN_CURR = [{code:"KZT",sym:"₸",name:"Казахстанский тенге"},{code:"USD",sym:"$",name:"Доллар США"},{code:"EUR",sym:"€",name:"Евро"}];
const ALL_CURR = [...MAIN_CURR,
  {code:"RUB",sym:"₽",name:"Российский рубль"},{code:"GBP",sym:"£",name:"Британский фунт"},
  {code:"CHF",sym:"Fr",name:"Швейцарский франк"},{code:"JPY",sym:"¥",name:"Японская иена"},
  {code:"AED",sym:"د.إ",name:"Дирхам ОАЭ"},{code:"TRY",sym:"₺",name:"Турецкая лира"},
  {code:"CAD",sym:"CA$",name:"Канадский доллар"},{code:"AUD",sym:"A$",name:"Австралийский доллар"},
  {code:"PLN",sym:"zł",name:"Польский злотый"},{code:"UAH",sym:"₴",name:"Украинская гривна"},
  {code:"UZS",sym:"сўм",name:"Узбекский сум"},{code:"KGS",sym:"с",name:"Киргизский сом"},
  {code:"AZN",sym:"₼",name:"Азербайджанский манат"},{code:"GEL",sym:"₾",name:"Грузинский лари"},
  {code:"SGD",sym:"S$",name:"Сингапурский доллар"},{code:"KRW",sym:"₩",name:"Южнокорейская вона"},
  {code:"INR",sym:"₹",name:"Индийская рупия"},{code:"THB",sym:"฿",name:"Тайский бат"},
  {code:"ZAR",sym:"R",name:"Южноафриканский рэнд"},{code:"ILS",sym:"₪",name:"Израильский шекель"},
  {code:"NZD",sym:"NZ$",name:"Новозеландский доллар"},{code:"BTC",sym:"₿",name:"Биткоин"},
];

/* ══════════════════════════════════════════════════════════════
   CATEGORY SVG ICONS
══════════════════════════════════════════════════════════════ */
const CAT_SVG = {
  groceries:"M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  transport:"M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3M16 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  amenities:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  travel:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  eating:"M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3",
  entertainment:"M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4l3 3",
  health:"M22 12h-4l-3 9L9 3l-3 9H2",
  clothes:"M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z",
  services:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01",
  salary:"M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  freelance:"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 1 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  invest:"M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  gift:"M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  other:"M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  fuel:"M3 22V8l8-6 8 6v14M10 22v-5h4v5",
  education:"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  accommodation:"M2 20h20M5 20V10l7-7 7 7v10",
  unplanned:"M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01",
};

function CatIcon({ k, size = 28, color = C.green }) {
  const path = CAT_SVG[k] || CAT_SVG.other;
  return (
      <div style={{ width:size, height:size, borderRadius:size/2, background:color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width={size*0.54} height={size*0.54} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {path.split("M").filter(Boolean).map((p,i) => <path key={i} d={`M${p}`}/>)}
        </svg>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PLANNER DEFAULT DATA
══════════════════════════════════════════════════════════════ */
const DEFAULT_COLOR_LABELS = [
  { id:"none",   label:"Без метки", hex:"#6b7280" },
  { id:"red",    label:"Срочно",    hex:"#f87171" },
  { id:"blue",   label:"Работа",    hex:"#60a5fa" },
  { id:"green",  label:"Личное",    hex:"#34d399" },
  { id:"amber",  label:"Финансы",   hex:"#fbbf24" },
  { id:"purple", label:"Учёба",     hex:"#a78bfa" },
];

const STATUS_CONFIG = {
  active:    { label:"Активна",  dim:false, tag:null },
  done:      { label:"Готово",   dim:true,  tag:null },
  hold:      { label:"Холд",     dim:true,  tag:"HOLD" },
  cancelled: { label:"Отменена", dim:true,  tag:"ОТМЕНЕНО" },
};

const TIME_OF_DAY = [
  { id:"morning",   label:"Утро",   icon:"🌅" },
  { id:"afternoon", label:"День",   icon:"☀️" },
  { id:"evening",   label:"Вечер",  icon:"🌇" },
  { id:"night",     label:"Ночь",   icon:"🌙" },
];

const WEEKDAYS = [
  { id:1,label:"Пн" },{ id:2,label:"Вт" },{ id:3,label:"Ср" },
  { id:4,label:"Чт" },{ id:5,label:"Пт" },{ id:6,label:"Сб" },{ id:0,label:"Вс" },
];

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER DEFAULT DATA
══════════════════════════════════════════════════════════════ */
const DEF_EXP = [
  {id:"c1",name:"Groceries",icon:"groceries",color:"#4caf50"},
  {id:"c2",name:"Transport",icon:"transport",color:"#1976d2"},
  {id:"c3",name:"Home",icon:"home",color:"#388e3c"},
  {id:"c4",name:"Amenities",icon:"amenities",color:"#1976d2"},
  {id:"c5",name:"Traveling",icon:"travel",color:"#4caf50"},
  {id:"c6",name:"Eating out",icon:"eating",color:"#f9a825"},
  {id:"c7",name:"Entertain.",icon:"entertainment",color:"#9c27b0"},
  {id:"c8",name:"Health",icon:"health",color:"#f44336"},
  {id:"c9",name:"Clothes",icon:"clothes",color:"#e91e63"},
  {id:"c10",name:"Services",icon:"services",color:"#f9a825"},
  {id:"c11",name:"Fuel",icon:"fuel",color:"#795548"},
  {id:"c12",name:"Unplanned",icon:"unplanned",color:"#546e7a"},
];
const DEF_INC = [
  {id:"i1",name:"Salary",icon:"salary",color:"#4caf50",planCurrency:"KZT"},
  {id:"i2",name:"Freelance",icon:"freelance",color:"#1976d2",planCurrency:"USD"},
  {id:"i3",name:"Invest.",icon:"invest",color:"#f9a825",planCurrency:"KZT"},
  {id:"i4",name:"Gift",icon:"gift",color:"#e91e63",planCurrency:"KZT"},
  {id:"i5",name:"Other",icon:"other",color:"#546e7a",planCurrency:"KZT"},
];
const TRIP_CATS = ["transport","accommodation","eating","entertainment","travel","other"];
const TRIP_LABELS = {transport:"Transport",accommodation:"Accommodation",eating:"Food",entertainment:"Entertainment",travel:"Activities",other:"Other"};
const PALETTE = ["#4caf50","#66bb6a","#388e3c","#1b5e20","#f9a825","#fbc02d","#ff8f00","#e65100","#f44336","#e53935","#c62828","#e91e63","#c2185b","#9c27b0","#7b1fa2","#673ab7","#3f51b5","#1976d2","#0288d1","#0097a7","#00796b","#5d4037","#757575","#546e7a","#37474f","#ffffff","#000000","#ff5722","#795548","#9e9e9e"];

/* ══════════════════════════════════════════════════════════════
   SHARED SVG ICON
══════════════════════════════════════════════════════════════ */
const PATHS = {
  back:"M19 12H5M12 19l-7-7 7-7", plus:"M12 5v14M5 12h14", x:"M18 6 6 18M6 6l12 12",
  check:"M20 6 9 20 4 14", chevD:"M6 9l6 6 6-6", chevL:"M15 18l-6-6 6-6",
  chevR:"M9 18l6-6-6-6", chevU:"M18 15 12 9 6 15",
  edit:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash:"M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  transfer:"M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  clock:"M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2",
  download:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  filter:"M22 3H2l8 9.46V19l4 2v-8.54L22 3",
  report:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  menu:"M3 12h18M3 6h18M3 18h18",
  undo:"M3 7v6h6M3 13A9 9 0 1 0 5.27 6.27",
  drag:"M9 5h1M9 12h1M9 19h1M15 5h1M15 12h1M15 19h1",
  calendar:"M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  arrowR:"M5 12h14M12 5l7 7-7 7",
};
const Ico = ({ n, s=20, c=C.main }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(PATHS[n]||"").split("M").filter(Boolean).map((p,i) => <path key={i} d={`M${p}`}/>)}
    </svg>
);

/* ══════════════════════════════════════════════════════════════
   LOADING SPINNER
══════════════════════════════════════════════════════════════ */
function Spinner({ color = C.green }) {
  return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:32, height:32, borderRadius:16, border:`3px solid rgba(255,255,255,0.1)`, borderTopColor:color, animation:"spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SHARED UI COMPONENTS
══════════════════════════════════════════════════════════════ */
function Toggle({ value, onChange, label }) {
  return (
      <div onClick={() => onChange(!value)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
        {label && <span style={{ fontSize:14, color:C.mid }}>{label}</span>}
        <div style={{ width:44, height:24, borderRadius:12, background:value?C.green:"rgba(255,255,255,0.15)", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
          <div style={{ width:20, height:20, borderRadius:10, background:"#fff", position:"absolute", top:2, left:value?22:2, transition:"left 0.2s" }}/>
        </div>
      </div>
  );
}

function FieldLabel({ children, error }) {
  return <p style={{ margin:"0 0 6px", fontSize:13, color:error?C.red:C.dim }}>{children}{error && <span style={{ marginLeft:6, fontSize:12 }}>— {error}</span>}</p>;
}

function ColorPickerComp({ value, onChange }) {
  return (
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {PALETTE.map(c => (
            <button key={c} onClick={() => onChange(c)} style={{ width:32, height:32, borderRadius:16, background:c, border:value===c?"3px solid #fff":"3px solid transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {value===c && <Ico n="check" s={12} c={c==="#ffffff"?"#000":"#fff"}/>}
            </button>
        ))}
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CALENDAR PICKER (shared, fixed height)
══════════════════════════════════════════════════════════════ */
function CalendarPicker({ mode="single", value, valueEnd, onChange, onChangeEnd, onClose }) {
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

  return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={onClose}>
        <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px 40px" }} onClick={e => e.stopPropagation()}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, display:"flex" }}><Ico n="chevL" s={22}/></button>
            <span style={{ fontSize:16, fontWeight:600, color:"#fff" }}>{RU_MONTHS[month]} {year}</span>
            <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, display:"flex" }}><Ico n="chevR" s={22}/></button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
            {RU_DAYS_S.map(d => <div key={d} style={{ textAlign:"center", fontSize:11, color:C.dim, padding:"4px 0" }}>{d}</div>)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, height:252 }}>
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
                  }} style={{ height:36, borderRadius:8, border:"none", cursor:"pointer", background:sel?C.green:rng?"rgba(76,175,80,0.2)":"transparent", color:sel?"#fff":C.main, fontSize:13, fontWeight:sel?700:400 }}>
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

/* ══════════════════════════════════════════════════════════════
   CURRENCY PAGE
══════════════════════════════════════════════════════════════ */
function CurrencyPage({ value, onSelect, onBack }) {
  const [q, setQ] = useState("");
  const other = ALL_CURR.filter(c => !MAIN_CURR.find(m => m.code===c.code));
  const fl = arr => q ? arr.filter(c => c.code.toLowerCase().includes(q.toLowerCase())||c.name.toLowerCase().includes(q.toLowerCase())) : arr;
  return (
      <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ fontSize:17, fontWeight:600, color:"#fff" }}>Select currency</span>
        </div>
        <div style={{ padding:"12px 16px" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." style={{ width:"100%", background:"rgba(255,255,255,0.07)", border:"none", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" }}/>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"0 16px 40px" }}>
          {!q && <p style={{ fontSize:12, fontWeight:700, color:C.green, marginBottom:8 }}>Main</p>}
          {fl(MAIN_CURR).map(c => <div key={c.code} onClick={() => { onSelect(c.code); onBack(); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 12px", borderRadius:10, cursor:"pointer", background:value===c.code?"rgba(76,175,80,0.12)":"transparent", marginBottom:2 }}><span style={{ width:46, fontSize:14, fontWeight:700, color:C.green }}>{c.code}</span><span style={{ flex:1, fontSize:14, color:C.mid }}>{c.name}</span>{value===c.code && <Ico n="check" s={16} c={C.green}/>}</div>)}
          {!q && <><div style={{ height:1, background:C.border, margin:"8px 0" }}/><p style={{ fontSize:12, fontWeight:700, color:C.dim, marginBottom:8 }}>All</p></>}
          {fl(other).map(c => <div key={c.code} onClick={() => { onSelect(c.code); onBack(); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 12px", borderRadius:10, cursor:"pointer", marginBottom:2 }}><span style={{ width:46, fontSize:14, fontWeight:600, color:C.dim }}>{c.code}</span><span style={{ flex:1, fontSize:14, color:C.mid }}>{c.name}</span></div>)}
        </div>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ACCOUNT SELECT (bottom sheet)
══════════════════════════════════════════════════════════════ */
function AccSelect({ accounts, value, onChange, onCurrencyChange, label, error }) {
  const [open, setOpen] = useState(false);
  const sel = accounts.find(a => a.id===value);
  return (
      <>
        <FieldLabel error={error}>{label||"Account"}</FieldLabel>
        <div onClick={() => setOpen(true)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${error?"rgba(244,67,54,0.5)":C.border}`, cursor:"pointer", marginBottom:16 }}>
          {sel ? (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <CatIcon k={sel.icon} size={32} color={sel.color}/>
                <div><p style={{ margin:0, fontSize:14, color:"#fff" }}>{sel.name}</p><p style={{ margin:0, fontSize:12, color:C.dim }}>{fmtM(sel.balance, sel.currency)}</p></div>
              </div>
          ) : <span style={{ fontSize:14, color:C.dim }}>Select account</span>}
          <Ico n="chevD" s={16} c={C.dim}/>
        </div>
        {open && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={() => setOpen(false)}>
              <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px 40px", maxHeight:"70vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 16px" }}/>
                <p style={{ fontSize:16, fontWeight:600, color:"#fff", marginBottom:12 }}>Select account</p>
                {accounts.map(a => (
                    <div key={a.id} onClick={() => { onChange(a.id); onCurrencyChange?.(a.currency); setOpen(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:value===a.id?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${value===a.id?"rgba(76,175,80,0.4)":C.border}` }}>
                      <CatIcon k={a.icon} size={40} color={a.color}/>
                      <div style={{ flex:1 }}><p style={{ margin:0, fontSize:14, color:"#fff" }}>{a.name}</p><p style={{ margin:0, fontSize:12, color:C.dim }}>{fmtM(a.balance, a.currency)}</p></div>
                      {value===a.id && <Ico n="check" s={18} c={C.green}/>}
                    </div>
                ))}
              </div>
            </div>
        )}
      </>
  );
}

/* ══════════════════════════════════════════════════════════════
   PLANNER — TASK CARD
══════════════════════════════════════════════════════════════ */
function PlannerTaskCard({ task, colorLabels, onStatusChange, onMoveToDay, onEdit, onDelete, dragHandlers, isDragging, isAnyPressing, onPressingChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showMoveCal, setShowMoveCal] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef(null);
  const menuRef = useRef(null);
  const colorCfg = colorLabels.find(c => c.id===task.color) || colorLabels[0];
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.active;
  const isDim = statusCfg.dim;

  const startPress = () => {
    setPressing(true); onPressingChange(true);
    timerRef.current = setTimeout(() => { setShowMenu(true); setPressing(false); onPressingChange(false); }, 500);
  };
  const endPress = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressing(false); onPressingChange(false);
  };

  useEffect(() => {
    if (!showMenu) return;
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  return (
      <>
        <style>{`@keyframes lp-pulse{0%{box-shadow:0 0 0 0px rgba(99,102,241,0.6)}60%{box-shadow:0 0 0 8px rgba(99,102,241,0.2)}100%{box-shadow:0 0 0 12px rgba(99,102,241,0)}}.lp-glow{animation:lp-pulse 0.5s ease-out forwards}`}</style>
        <div className={pressing?"lp-glow":""} style={{ position:"relative", borderRadius:16, border:isDim?"1px solid rgba(255,255,255,0.05)":pressing?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.1)", background:isDim?"rgba(255,255,255,0.03)":pressing?"rgba(99,102,241,0.12)":"rgba(255,255,255,0.06)", opacity:isDim?0.45:(isAnyPressing&&!pressing)?0.35:1, transform:pressing?"scale(1.025)":"scale(1)", transition:"opacity 0.2s,transform 0.15s,background 0.15s", cursor:"pointer", userSelect:"none" }}
             onMouseDown={startPress} onMouseUp={endPress} onMouseLeave={endPress}
             onTouchStart={startPress} onTouchEnd={endPress}
             onClick={() => { if (!showMenu) setShowDetail(true); }}>
          {task.color!=="none" && !isDim && (
              <div style={{ position:"absolute", left:0, top:12, bottom:12, width:3, borderRadius:2, background:colorCfg.hex, opacity:0.75 }}/>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:16, paddingRight:12, paddingTop:12, paddingBottom:12 }}>
            <div {...dragHandlers} style={{ color:"rgba(255,255,255,0.15)", cursor:"grab", flexShrink:0, touchAction:"none" }} onClick={e => e.stopPropagation()}>
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
            <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)" }} onClick={() => setShowMenu(false)}>
              <div ref={menuRef} style={{ width:"100%", maxWidth:480, marginLeft:16, marginRight:16, marginBottom:32, borderRadius:24, background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.1)", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
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
            <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)", padding:16 }} onClick={() => setShowDetail(false)}>
              <div style={{ width:"100%", maxWidth:400, borderRadius:24, background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.1)", overflow:"hidden" }} onClick={e => e.stopPropagation()}>
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

/* ══════════════════════════════════════════════════════════════
   PLANNER — TASK FORM
══════════════════════════════════════════════════════════════ */
function PlannerTaskForm({ initialDate, initialTask, colorLabels, onSave, onClose }) {
  const [title, setTitle] = useState(initialTask?.title || "");
  const [note, setNote] = useState(initialTask?.note || "");
  const [date, setDate] = useState(initialTask?.date || (initialDate ? `${initialDate.getFullYear()}-${pad(initialDate.getMonth()+1)}-${pad(initialDate.getDate())}` : todayStr()));
  const [time, setTime] = useState(initialTask?.time || "");
  const [timeOfDay, setTimeOfDay] = useState(initialTask?.time_of_day || null);
  const [color, setColor] = useState(initialTask?.color || "none");
  const [isRoutine, setIsRoutine] = useState(false);
  const [routineDays, setRoutineDays] = useState([]);

  const handleSave = () => {
    if (!title.trim()) return;
    if (isRoutine && routineDays.length > 0) {
      const now = new Date(), dow = now.getDay();
      const monday = new Date(now); monday.setDate(now.getDate() - (dow===0?6:dow-1));
      routineDays.forEach((rd, i) => {
        const d = new Date(monday);
        const offset = rd === 0 ? 6 : rd - 1;
        d.setDate(monday.getDate() + offset);
        const taskDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        onSave({ id: `t${Date.now()}${i}`, title: title.trim(), note: note.trim(), date: taskDate, time: time||null, time_of_day: time?null:timeOfDay, color, status:"active", order:999, recur_days:routineDays }, true);
      });
      onClose(); return;
    }
    const base = initialTask || {};
    onSave({ ...base, id: base.id||`t${Date.now()}`, title: title.trim(), note: note.trim(), date, time: time||null, time_of_day: time?null:timeOfDay, color, status: base.status||"active", order: base.order??999 });
  };

  return (
      <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }} onClick={onClose}>
        <div style={{ width:"100%", maxWidth:480, borderRadius:"24px 24px 0 0", background:"#1a1a2e", borderTop:"1px solid rgba(255,255,255,0.1)", padding:"20px 20px 32px", boxShadow:"0 -20px 60px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ margin:0, fontSize:16, fontWeight:600, color:"rgba(255,255,255,0.9)" }}>{initialTask?"Редактировать":"Новая задача"}</h3>
            <button onClick={onClose} style={{ color:"rgba(255,255,255,0.4)", background:"none", border:"none", cursor:"pointer", display:"flex" }}><Ico n="x" s={18}/></button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название задачи" autoFocus style={{ borderRadius:12, padding:"12px 16px", fontSize:14, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.9)", outline:"none" }}/>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Заметка" rows={2} style={{ borderRadius:12, padding:"12px 16px", fontSize:14, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.9)", outline:"none", resize:"none" }}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <p style={{ margin:"0 0 6px", fontSize:12, color:C.dim }}>Дата</p>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:13, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.8)", outline:"none", colorScheme:"dark", boxSizing:"border-box" }}/>
              </div>
              <div>
                <p style={{ margin:"0 0 6px", fontSize:12, color:C.dim }}>Время</p>
                <input type="time" value={time} onChange={e => { setTime(e.target.value); if(e.target.value) setTimeOfDay(null); }} style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:13, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.8)", outline:"none", colorScheme:"dark", boxSizing:"border-box" }}/>
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
                    Рутинная задача (на эту неделю)
                  </button>
                  {isRoutine && (
                      <div style={{ display:"flex", gap:6, marginTop:8 }}>
                        {WEEKDAYS.map(d => (
                            <button key={d.id} onClick={() => setRoutineDays(prev => prev.includes(d.id)?prev.filter(x=>x!==d.id):[...prev,d.id])} style={{ flex:1, padding:"8px 2px", borderRadius:10, border:routineDays.includes(d.id)?"2px solid #818cf8":"2px solid rgba(255,255,255,0.08)", background:routineDays.includes(d.id)?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", color:routineDays.includes(d.id)?"#a5b4fc":"rgba(255,255,255,0.4)", fontSize:11, fontWeight:500, cursor:"pointer" }}>
                              {d.label}
                            </button>
                        ))}
                      </div>
                  )}
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

/* ══════════════════════════════════════════════════════════════
   PLANNER SECTION
══════════════════════════════════════════════════════════════ */
function PlannerSection({ navigate }) {
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
  const carouselRef = useRef(null);
  const touchDayStart = useRef(null);

  const currentKey = `${currentDay.getFullYear()}-${pad(currentDay.getMonth()+1)}-${pad(currentDay.getDate())}`;
  const isToday = currentKey === todayStr();
  const isYesterday = currentKey === addDays(todayStr(), -1);
  const isTomorrow = currentKey === addDays(todayStr(), 1);
  const dayLabel = isToday?"Сегодня":isYesterday?"Вчера":isTomorrow?"Завтра":`${currentDay.getDate()} ${RU_MON_GEN[currentDay.getMonth()]}`;

  const carouselDays = Array.from({ length:60 }, (_,i) => { const d = new Date(); d.setDate(d.getDate()-7+i); return d; });
  const tasksByDate = {};
  tasks.forEach(t => { if(!tasksByDate[t.date]) tasksByDate[t.date]=[]; tasksByDate[t.date].push(t); });
  const currentTasks = (tasksByDate[currentKey]||[]).sort((a,b) => a.order-b.order);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToDay = useCallback(d => {
    const key = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const idx = carouselDays.findIndex(cd => `${cd.getFullYear()}-${pad(cd.getMonth()+1)}-${pad(cd.getDate())}` === key);
    if (carouselRef.current && idx >= 0) carouselRef.current.children[idx]?.scrollIntoView({ behavior:"smooth", inline:"center", block:"nearest" });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTimeout(() => scrollToDay(currentDay), 100); }, []);

  const updateTask = useCallback(async (id, patch) => {
    setTasks(prev => prev.map(t => t.id===id ? {...t,...patch} : t));
    try { await supa.update("tasks", patch, `id=eq.${id}`); } catch(e) { console.error(e); }
  }, []);

  const deleteTask = useCallback(async id => {
    setTasks(prev => prev.filter(t => t.id!==id));
    try { await supa.delete("tasks", `id=eq.${id}`); } catch(e) { console.error(e); }
  }, []);

  const moveToDay = useCallback(async (id, newDate) => {
    const task = tasks.find(t => t.id===id);
    if (!task) return;
    const dayTasks = tasks.filter(t => t.date===newDate);
    const newOrder = dayTasks.length > 0 ? Math.max(...dayTasks.map(t=>t.order))+1 : 0;
    const patch = { date: newDate, order: newOrder, status:"active" };
    setTasks(prev => prev.map(t => t.id===id ? {...t,...patch} : t));
    try { await supa.update("tasks", patch, `id=eq.${id}`); } catch(e) { console.error(e); }
  }, [tasks]);

  const saveTask = useCallback(async (taskData, skipClose = false) => {
    const exists = tasks.find(t => t.id===taskData.id);
    if (exists) {
      setTasks(prev => prev.map(t => t.id===taskData.id ? taskData : t));
      try { await supa.update("tasks", taskData, `id=eq.${taskData.id}`); } catch(e) { console.error(e); }
    } else {
      const dayTasks = tasks.filter(t => t.date===taskData.date);
      const newTask = { ...taskData, order: taskData.order===999 ? dayTasks.length : taskData.order };
      setTasks(prev => [...prev, newTask]);
      try { await supaUpsert("tasks", newTask); } catch(e) { console.error(e); }
    }
    if (!skipClose) setShowForm(false);
  }, [tasks]);

  // Drag & drop
  const getDragHandlers = id => ({
    draggable: true,
    onDragStart: () => setDragId(id),
    onDragEnd: () => { setDragId(null); setDragOverId(null); },
  });
  const handleDrop = async targetId => {
    if (!dragId || dragId===targetId) { setDragId(null); setDragOverId(null); return; }
    const day = tasks.filter(t => t.date===currentKey).sort((a,b) => a.order-b.order);
    const fi = day.findIndex(t => t.id===dragId), ti = day.findIndex(t => t.id===targetId);
    if (fi<0||ti<0) return;
    const reordered = [...day]; const [moved] = reordered.splice(fi,1); reordered.splice(ti,0,moved);
    const updated = reordered.map((t,i) => ({...t,order:i}));
    setTasks(prev => prev.map(t => { const u=updated.find(x=>x.id===t.id); return u||t; }));
    setDragId(null); setDragOverId(null);
    try { await Promise.all(updated.map(t => supa.update("tasks", {order:t.order}, `id=eq.${t.id}`))); } catch(e) { console.error(e); }
  };

  const handleMainTouchStart = e => { touchDayStart.current = e.touches[0].clientX; };
  const handleMainTouchEnd = e => {
    if (touchDayStart.current===null) return;
    const dx = e.changedTouches[0].clientX - touchDayStart.current;
    if (Math.abs(dx) > 70) {
      const nd = new Date(currentDay); nd.setDate(nd.getDate() + (dx<0?1:-1));
      setCurrentDay(nd); scrollToDay(nd);
    }
    touchDayStart.current = null;
  };

  if (loading) return <div style={{ background:C.planBg, minHeight:"100vh" }}><Spinner color={C.indigo}/></div>;

  return (
      <div style={{ background:C.planBg, minHeight:"100vh", paddingBottom:80 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>

        {/* Sticky header */}
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
                    <button key={dk} onClick={() => { setCurrentDay(new Date(d)); scrollToDay(d); }} style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"8px 10px", borderRadius:12, border:"none", background:isActive?"#6366f1":td?"rgba(99,102,241,0.15)":"transparent", color:isActive?"#fff":td?"#a5b4fc":"rgba(255,255,255,0.45)", cursor:"pointer", minWidth:44 }}>
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
                     onDragOver={e => { e.preventDefault(); setDragOverId(task.id); }}
                     onDrop={() => handleDrop(task.id)}
                     style={{ opacity:dragId===task.id?0.4:1, transform:dragOverId===task.id?"scaleX(1.01)":"none", transition:"transform 0.1s" }}>
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
        </div>

        {/* FAB */}
        <button onClick={() => setShowForm(true)} style={{ position:"fixed", bottom:88, right:20, width:56, height:56, borderRadius:20, background:"#6366f1", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 8px 24px rgba(99,102,241,0.4)", zIndex:20 }}>
          <Ico n="plus" s={24} c="#fff"/>
        </button>

        {showForm && <PlannerTaskForm initialDate={currentDay} colorLabels={colorLabels} onSave={saveTask} onClose={() => setShowForm(false)}/>}
        {showCalendar && <CalendarPicker mode="single" value={currentKey} onChange={v => { setCurrentDay(new Date(v)); scrollToDay(new Date(v)); setShowCalendar(false); }} onClose={() => setShowCalendar(false)}/>}
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — DONUT CHART
══════════════════════════════════════════════════════════════ */
function DonutChart({ segments, total, size=210 }) {
  const cx=size/2, cy=size/2, r=78, circ=2*Math.PI*r;
  let off=0;
  const slices = segments.map(s => {
    const pct=total>0?s.val/total:0, dash=pct*circ, gap=circ-dash;
    const style={strokeDasharray:`${dash} ${gap}`,strokeDashoffset:-off,stroke:s.color,strokeWidth:26};
    off+=dash; return {...s,style,pct};
  });
  return (
      <div style={{ position:"relative", width:size, height:size, margin:"0 auto" }}>
        <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
          <circle cx={cx} cy={cy} r={r+16} fill="none" stroke="rgba(76,175,80,0.1)" strokeWidth={1}/>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(76,175,80,0.2)" strokeWidth={26}/>
          {slices.map((s,i) => s.pct>0.003 && <circle key={i} cx={cx} cy={cy} r={r} fill="none" style={s.style}/>)}
          <circle cx={cx} cy={cy} r={r-16} fill="#1a2a1a"/>
          <circle cx={cx} cy={cy} r={r-3} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="4 6"/>
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{getSym(BASE_CUR)}{fmtAmt(total,0)}</span>
        </div>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — DATA HOOKS
══════════════════════════════════════════════════════════════ */
function useMoneyData() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [expCats, setExpCats] = useState(DEF_EXP);
  const [incCats, setIncCats] = useState(DEF_INC);
  const [monthPlans, setMonthPlans] = useState([]);
  const [tripPlans, setTripPlans] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [acc, txs, trs, ec, ic, mp, tp, rec] = await Promise.all([
        supa.select("accounts"),
        supa.select("transactions", "order=created_at.desc"),
        supa.select("transfers", "order=date.desc"),
        supa.select("exp_categories"),
        supa.select("inc_categories"),
        supa.select("month_plans"),
        supa.select("trip_plans"),
        supa.select("recurring"),
      ]);
      if (acc?.length) setAccounts(acc);
      if (txs?.length) setTransactions(txs);
      if (trs?.length) setTransfers(trs);
      if (ec?.length) setExpCats(ec); else { await supaUpsert("exp_categories", DEF_EXP); setExpCats(DEF_EXP); }
      if (ic?.length) setIncCats(ic); else { await supaUpsert("inc_categories", DEF_INC); setIncCats(DEF_INC); }
      if (mp?.length) setMonthPlans(mp);
      if (tp?.length) setTripPlans(tp.map(p => ({...p, days: p.days||[]})));
      if (rec?.length) setRecurring(rec);
    } catch(e) { console.error("Load money data:", e); }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // Auto-fire recurring
  useEffect(() => {
    if (!recurring.length) return;
    const today = new Date(), day = today.getDate(), mk = monthKey(todayStr());
    recurring.forEach(async r => {
      if (r.day===day && r.last_fired!==mk) {
        const acc = accounts.find(a => a.id===r.acc_id);
        if (!acc) return;
        const tx = { id:`t${Date.now()}_rec`, type:"expense", amount:r.amount, currency:acc.currency, category_id:r.cat_id, account_id:r.acc_id, date:todayStr(), note:`${r.name} (авто)` };
        try {
          await supaUpsert("transactions", tx);
          await supa.update("accounts", { balance: acc.balance - r.amount }, `id=eq.${acc.id}`);
          await supa.update("recurring", { last_fired: mk }, `id=eq.${r.id}`);
          setTransactions(prev => [tx, ...prev]);
          setAccounts(prev => prev.map(a => a.id===acc.id ? {...a, balance: a.balance-r.amount} : a));
          setRecurring(prev => prev.map(rec => rec.id===r.id ? {...rec, last_fired:mk} : rec));
        } catch(e) { console.error(e); }
      }
    });
  }, [recurring, accounts]);

  return { accounts, setAccounts, transactions, setTransactions, transfers, setTransfers, expCats, setExpCats, incCats, setIncCats, monthPlans, setMonthPlans, tripPlans, setTripPlans, recurring, setRecurring, loading, reload: load };
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — TRANSACTION PAGE
══════════════════════════════════════════════════════════════ */
function TxPage({ accounts, expCats, incCats, onBack, edit }) {
  const [type, setType] = useState(edit?.type||"expense");
  const [amt, setAmt] = useState(edit?.amount?String(edit.amount):"");
  const [cur, setCur] = useState(edit?.currency||BASE_CUR);
  const [cat, setCat] = useState(edit?.category_id||"");
  const [accId, setAccId] = useState(edit?.account_id||accounts[0]?.id||"");
  const [date, setDate] = useState(edit?.date||todayStr());
  const [note, setNote] = useState(edit?.note||"");
  const [showCur, setShowCur] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const cats = type==="expense" ? expCats : incCats;
  if (showCur) return <CurrencyPage value={cur} onSelect={v => { setCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const today = todayStr();
  const dateShorts = [
    {key:today, label:`${new Date().getMonth()+1}/${new Date().getDate()}`, sub:"today"},
    {key:addDays(today,-1), label:`${new Date(addDays(today,-1)).getMonth()+1}/${new Date(addDays(today,-1)).getDate()}`, sub:"yesterday"},
    {key:addDays(today,-2), label:`${new Date(addDays(today,-2)).getMonth()+1}/${new Date(addDays(today,-2)).getDate()}`, sub:"2 days ago"},
    {key:addDays(today,-3), label:`${new Date(addDays(today,-3)).getMonth()+1}/${new Date(addDays(today,-3)).getDate()}`, sub:"3 days ago"},
  ];

  const save = async () => {
    const e = {};
    if (!amt||parseFloat(amt)<=0) e.amt = "Enter amount";
    if (!cat) e.cat = "Select category";
    if (!accId) e.acc = "Select account";
    setErrors(e); if (Object.keys(e).length > 0) return;
    setSaving(true);
    const acc = accounts.find(a => a.id===accId);
    const delta = type==="income" ? parseFloat(amt) : -parseFloat(amt);
    const tx = { id: edit?.id||`t${Date.now()}`, type, amount: parseFloat(amt), currency: cur, category_id: cat, account_id: accId, date, note };
    try {
      await supaUpsert("transactions", tx);
      if (!edit) await supa.update("accounts", { balance: acc.balance + delta }, `id=eq.${accId}`);
      else {
        // reverse old, apply new
        const old = edit;
        const oldDelta = old.type==="income" ? -old.amount : old.amount;
        const newBal = acc.balance + oldDelta + delta;
        await supa.update("accounts", { balance: newBal }, `id=eq.${accId}`);
      }
      onBack(true);
    } catch(e) { console.error(e); setSaving(false); }
  };

  const del = async () => {
    if (!edit) return;
    const acc = accounts.find(a => a.id===edit.account_id);
    const delta = edit.type==="income" ? -edit.amount : edit.amount;
    try {
      await supa.delete("transactions", `id=eq.${edit.id}`);
      if (acc) await supa.update("accounts", { balance: acc.balance + delta }, `id=eq.${acc.id}`);
      onBack(true);
    } catch(e) { console.error(e); }
  };

  return (
      <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader }}>
          <div style={{ display:"flex", alignItems:"center", padding:"14px 16px 0" }}>
            <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"#fff", marginRight:12, display:"flex" }}><Ico n="back" s={22}/></button>
            <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff", textAlign:"center", marginRight:34 }}>{edit?"Edit Transaction":"Add Transaction"}</span>
          </div>
          <div style={{ display:"flex", marginTop:12 }}>
            {[["expense","EXPENSES"],["income","INCOME"]].map(([v,l]) => (
                <button key={v} onClick={() => { setType(v); setCat(""); }} style={{ flex:1, padding:"12px 0", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:type===v?"#fff":C.dim, borderBottom:type===v?"2px solid #fff":"2px solid transparent" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"0 16px 80px" }}>
          <div style={{ textAlign:"center", padding:"24px 24px 16px" }}>
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:16 }}>
              <input value={amt} onChange={e => { setAmt(e.target.value); setErrors(p=>({...p,amt:""})); }} type="number" placeholder="0" style={{ background:"none", border:"none", outline:"none", color:errors.amt?C.red:"#fff", fontSize:38, fontWeight:700, textAlign:"center", width:180 }}/>
              <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:22, fontWeight:700, cursor:"pointer" }}>{cur}</button>
            </div>
            <div style={{ height:1, background:errors.amt?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.15)", margin:"8px 40px 0" }}/>
            {errors.amt && <p style={{ color:C.red, fontSize:12, marginTop:4 }}>{errors.amt}</p>}
          </div>
          <div style={{ marginBottom:4 }}>
            <AccSelect accounts={accounts} value={accId} onChange={v => { setAccId(v); const a=accounts.find(ac=>ac.id===v); if(a) setCur(a.currency); }} error={errors.acc} label="Account"/>
          </div>
          <div style={{ marginBottom:16 }}>
            <FieldLabel error={errors.cat}>Categories</FieldLabel>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {cats.map(c => { const sel=cat===c.id; return (
                  <button key={c.id} onClick={() => { setCat(c.id); setErrors(p=>({...p,cat:""})); }} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"10px 4px", borderRadius:12, background:sel?c.color:"transparent", border:"none", cursor:"pointer" }}>
                    <CatIcon k={c.icon} size={50} color={sel?"rgba(0,0,0,0.25)":c.color}/>
                    <span style={{ fontSize:11, color:sel?"#fff":C.mid, textAlign:"center" }}>{c.name}</span>
                  </button>
              ); })}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <FieldLabel>Date</FieldLabel>
            <div style={{ display:"flex", alignItems:"center", gap:8, overflowX:"auto", paddingBottom:4 }}>
              {dateShorts.map(ds => (
                  <button key={ds.key} onClick={() => setDate(ds.key)} style={{ flexShrink:0, padding:"10px 12px", borderRadius:10, cursor:"pointer", background:date===ds.key?C.green:"transparent", border:"none", textAlign:"center", minWidth:60 }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:700, color:date===ds.key?"#fff":C.mid }}>{ds.label}</p>
                    <p style={{ margin:0, fontSize:11, color:date===ds.key?"rgba(255,255,255,0.8)":C.dim }}>{ds.sub}</p>
                  </button>
              ))}
              <button onClick={() => setShowCal(true)} style={{ flexShrink:0, background:"none", border:"none", cursor:"pointer", padding:"0 8px", display:"flex" }}><Ico n="clock" s={22} c={C.dim}/></button>
            </div>
          </div>
          <div style={{ marginBottom:24 }}>
            <FieldLabel>Comment</FieldLabel>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", boxSizing:"border-box" }}/>
          </div>
          <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Saving...":"Save"}</button>
          {edit && <button onClick={del} style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>Delete transaction</button>}
        </div>
        {showCal && <CalendarPicker mode="single" value={date} onChange={v => { setDate(v); setShowCal(false); }} onClose={() => setShowCal(false)}/>}
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — ACCOUNT PAGE
══════════════════════════════════════════════════════════════ */
function AccPage({ onBack, edit }) {
  const [name, setName] = useState(edit?.name||"");
  const [icon, setIcon] = useState(edit?.icon||"home");
  const [color, setColor] = useState(edit?.color||C.green);
  const [cur, setCur] = useState(edit?.currency||BASE_CUR);
  const [bal, setBal] = useState(edit?.balance!=null?String(edit.balance):"");
  const [inTotal, setInTotal] = useState(edit?.in_total!==false);
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!edit;
  if (showCur) return <CurrencyPage value={cur} onSelect={setCur} onBack={() => setShowCur(false)}/>;
  const iconKeys = Object.keys(CAT_SVG);

  const save = async () => {
    const e = {}; if (!name.trim()) e.name = "Enter name";
    setErrors(e); if (Object.keys(e).length > 0) return;
    setSaving(true);
    const acc = { id: edit?.id||`a${Date.now()}`, name: name.trim(), icon, color, currency: cur, balance: parseFloat(bal)||0, in_total: inTotal, avg_rate: edit?.avg_rate||null };
    try { await supaUpsert("accounts", acc); onBack(true); } catch(e) { console.error(e); setSaving(false); }
  };

  return (
      <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff", textAlign:"left" }}>{isEdit?"Edit Account":"New Account"}</span>
          <div style={{ width:30 }}/>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, padding:"16px", borderRadius:16, background:C.monCard }}>
            <CatIcon k={icon} size={52} color={color}/>
            <div><p style={{ margin:0, fontSize:18, fontWeight:700, color:"#fff" }}>{name||"Account"}</p><p style={{ margin:0, fontSize:14, color:C.green }}>{getSym(cur)}{fmtAmt(parseFloat(bal)||0)}</p></div>
          </div>
          <div style={{ marginBottom:20 }}>
            <FieldLabel>Balance</FieldLabel>
            <div style={{ display:"flex", alignItems:"baseline", gap:12 }}>
              <input value={bal} onChange={e => setBal(e.target.value)} type="number" placeholder="0" style={{ flex:1, background:"none", border:"none", borderBottom:"1px solid rgba(255,255,255,0.2)", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0" }}/>
              {isEdit
                  ? <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end" }}><span style={{ fontSize:18, fontWeight:700, color:C.dim }}>{cur}</span><span style={{ fontSize:10, color:C.dim }}>Cannot change</span></div>
                  : <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:18, fontWeight:700, cursor:"pointer" }}>{cur} ▾</button>
              }
            </div>
          </div>
          {isEdit && edit.currency!==BASE_CUR && (
              <div style={{ padding:"12px 14px", borderRadius:12, background:C.monCard, marginBottom:16 }}>
                <p style={{ margin:0, fontSize:12, color:C.dim }}>Average rate</p>
                <p style={{ margin:"4px 0 0", fontSize:16, fontWeight:600, color:C.main }}>1 {edit.currency} = {edit.avg_rate ? `${getSym(BASE_CUR)}${fmtAmt(edit.avg_rate,2)}`:"—"}</p>
                <p style={{ margin:"4px 0 0", fontSize:11, color:C.dim }}>Auto-updated on each incoming transfer</p>
              </div>
          )}
          <div style={{ marginBottom:16 }}>
            <FieldLabel error={errors.name}>Name</FieldLabel>
            <input value={name} onChange={e => { setName(e.target.value); setErrors(p=>({...p,name:""})); }} placeholder="Account name" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", boxSizing:"border-box" }}/>
            {errors.name && <p style={{ color:C.red, fontSize:12, marginTop:4 }}>{errors.name}</p>}
          </div>
          <div style={{ marginBottom:16 }}>
            <FieldLabel>Icon</FieldLabel>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {iconKeys.map(k => <button key={k} onClick={() => setIcon(k)} style={{ width:50, height:50, borderRadius:25, border:icon===k?"3px solid #fff":"3px solid transparent", background:"transparent", cursor:"pointer", padding:0 }}><CatIcon k={k} size={44} color={color}/></button>)}
            </div>
          </div>
          <div style={{ marginBottom:20 }}><FieldLabel>Color</FieldLabel><ColorPickerComp value={color} onChange={setColor}/></div>
          <div style={{ padding:"14px 16px", borderRadius:12, background:C.monCard, marginBottom:24 }}>
            <Toggle value={!inTotal} onChange={v => setInTotal(!v)} label="Exclude from total balance"/>
          </div>
          <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Saving...":"Save"}</button>
          {isEdit && <button onClick={async () => { await supa.delete("accounts",`id=eq.${edit.id}`); onBack(true); }} style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>Delete account</button>}
        </div>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — TRANSFER PAGE
══════════════════════════════════════════════════════════════ */
function TransferPageMon({ accounts, onBack }) {
  const [fromId, setFromId] = useState(accounts[0]?.id||"");
  const [toId, setToId] = useState(accounts[1]?.id||"");
  const [amt, setAmt] = useState("");
  const [toAmt, setToAmt] = useState("");
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("");
  const [date, _setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const fromAcc = accounts.find(a => a.id===fromId);
  const toAcc = accounts.find(a => a.id===toId);
  const diffCur = fromAcc?.currency !== toAcc?.currency;

  const save = async () => {
    if (!amt || fromId===toId) return;
    setSaving(true);
    const tr = { id:`tr${Date.now()}`, from_id:fromId, to_id:toId, amount:parseFloat(amt), from_currency:fromAcc?.currency, to_amt:diffCur?(parseFloat(toAmt)||0):parseFloat(amt), to_currency:toAcc?.currency, rate:parseFloat(rate)||null, fee:parseFloat(fee)||0, date, note };
    try {
      await supaUpsert("transfers", tr);
      // Update balances
      const newFromBal = fromAcc.balance - parseFloat(amt) - (parseFloat(fee)||0);
      const newToBal = toAcc.balance + (diffCur ? (parseFloat(toAmt)||0) : parseFloat(amt));
      await supa.update("accounts", { balance: newFromBal }, `id=eq.${fromId}`);
      // Update avg rate on destination if different currencies
      let toUpdate = { balance: newToBal };
      if (diffCur && rate) {
        const oldRate = toAcc.avg_rate || parseFloat(rate);
        const newAvg = Math.round(avgRateFn(toAcc.balance, oldRate, parseFloat(toAmt)||0, parseFloat(rate))*100)/100;
        toUpdate.avg_rate = newAvg;
      }
      await supa.update("accounts", toUpdate, `id=eq.${toId}`);
      onBack(true);
    } catch(e) { console.error(e); setSaving(false); }
  };

  return (
      <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Create transfer</span>
          <div style={{ width:30 }}/>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>
          <AccSelect accounts={accounts} value={fromId} onChange={setFromId} label="Transfer from"/>
          <AccSelect accounts={accounts} value={toId} onChange={setToId} label="Transfer to"/>
          <FieldLabel>Amount ({fromAcc?.currency||""})</FieldLabel>
          <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
            <input value={amt} onChange={e => setAmt(e.target.value)} type="number" placeholder="0" style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
          </div>
          {diffCur && <>
            <FieldLabel>Receive ({toAcc?.currency||""})</FieldLabel>
            <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
              <input value={toAmt} onChange={e => setToAmt(e.target.value)} type="number" placeholder="0" style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
            </div>
            <FieldLabel>Exchange rate</FieldLabel>
            <input value={rate} onChange={e => setRate(e.target.value)} type="number" placeholder="e.g. 480" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>
          </>}
          <FieldLabel>Commission fee</FieldLabel>
          <input value={fee} onChange={e => setFee(e.target.value)} type="number" placeholder="0" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>
          <FieldLabel>Comment</FieldLabel>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", marginBottom:24, boxSizing:"border-box" }}/>
          <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Saving...":"Add transfer"}</button>
        </div>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — HOME SECTION
══════════════════════════════════════════════════════════════ */
function MoneyHomeSection({ data, navigate }) {
  const { accounts, transactions, expCats, incCats, monthPlans } = data;
  const [txType, setTxType] = useState("expense");
  const [period, setPeriod] = useState("month");
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selAccId, setSelAccId] = useState(null);
  const [showAccPicker, setShowAccPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [filterCats, setFilterCats] = useState([]);
  const [showFilter, setShowFilter] = useState(false);
  const sym = getSym(BASE_CUR);

  const totalBal = (() => {
    const accs = selAccId ? accounts.filter(a => a.id===selAccId) : accounts.filter(a => a.in_total);
    return accs.reduce((s,a) => s + toBase(a.balance, a.currency), 0);
  })();

  const filterTxs = txs => txs.filter(t => {
    if (selAccId && t.account_id!==selAccId) return false;
    if (filterCats.length>0 && !filterCats.includes(t.category_id)) return false;
    const d = new Date(t.date);
    if (period==="day") return t.date===todayStr();
    if (period==="week") { const w=new Date(); w.setDate(w.getDate()-7); return d>=w; }
    if (period==="month") return d.getMonth()===viewMonth && d.getFullYear()===viewYear;
    if (period==="year") return d.getFullYear()===viewYear;
    if (period==="range"&&rangeStart&&rangeEnd) return t.date>=rangeStart && t.date<=rangeEnd;
    return true;
  });

  const periodTxs = filterTxs(transactions);
  const typeTxs = periodTxs.filter(t => t.type===txType);
  const cats = txType==="expense" ? expCats : incCats;
  const catData = cats.map(c => ({ ...c, val: typeTxs.filter(t => t.category_id===c.id).reduce((s,t) => s+toBase(t.amount, t.currency), 0) })).filter(c => c.val>0).sort((a,b) => b.val-a.val);
  const grandTotal = catData.reduce((s,c) => s+c.val, 0);

  const grouped = {};
  typeTxs.forEach(t => { if (!grouped[t.date]) grouped[t.date]=[]; grouped[t.date].push(t); });
  const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a));

  const prevP = () => { if(period==="month"){if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1);}else setViewYear(y=>y-1); };
  const nextP = () => { if(period==="month"){if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1);}else setViewYear(y=>y+1); };
  const periodLabel = period==="month"?`${RU_MONTHS[viewMonth]} ${viewYear}`:period==="year"?String(viewYear):period==="day"?"Today":period==="week"?"This week":rangeStart&&rangeEnd?`${rangeStart} — ${rangeEnd}`:"Period";
  const selAcc = accounts.find(a => a.id===selAccId);

  const exportCSV = () => {
    const rows = [["Date","Type","Category","Account","Amount","Currency","Note"]];
    typeTxs.forEach(t => { const cat=cats.find(c=>c.id===t.category_id); const acc=accounts.find(a=>a.id===t.account_id); rows.push([t.date,t.type,cat?.name||"",acc?.name||"",t.amount,t.currency,t.note||""]); });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="transactions.csv"; a.click();
  };

  return (
      <div style={{ paddingBottom:80 }}>
        {/* Header */}
        <div style={{ background:C.monHeader, padding:"14px 16px 0" }}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:6 }}>
            <div style={{ width:30 }}/>
            <div style={{ flex:1, textAlign:"center" }}>
              <button onClick={() => setShowAccPicker(true)} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{selAcc?selAcc.name:"Total"}</span>
                <Ico n="chevD" s={14} c={C.mid}/>
              </button>
              <p style={{ margin:"2px 0 0", fontSize:32, fontWeight:800, color:"#fff", letterSpacing:-1 }}>{sym}{fmtAmt(totalBal,0)}</p>
            </div>
            <button onClick={exportCSV} style={{ background:"none", border:"none", cursor:"pointer", color:C.mid, padding:4, display:"flex" }}><Ico n="report" s={22} c={C.mid}/></button>
          </div>
          <div style={{ display:"flex" }}>
            {[["expense","EXPENSES"],["income","INCOME"]].map(([v,l]) => (
                <button key={v} onClick={() => setTxType(v)} style={{ flex:1, padding:"12px 0", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:txType===v?"#fff":C.dim, borderBottom:txType===v?"2px solid #fff":"2px solid transparent" }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Chart card */}
        <div style={{ margin:"12px 12px 0", background:C.monCard, borderRadius:20 }}>
          <div style={{ display:"flex", padding:"10px 12px 0", gap:2 }}>
            {[["day","Day"],["week","Week"],["month","Month"],["year","Year"],["range","Period"]].map(([v,l]) => (
                <button key={v} onClick={() => { setPeriod(v); if(v==="range") setShowCalendar(true); }} style={{ flex:1, padding:"7px 2px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:500, background:"transparent", color:period===v?C.green:C.dim, borderBottom:period===v?`2px solid ${C.green}`:"2px solid transparent" }}>{l}</button>
            ))}
          </div>
          {(period==="month"||period==="year") && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px 0" }}>
                <button onClick={prevP} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevL" s={20}/></button>
                <button onClick={() => setShowCalendar(true)} style={{ background:"none", border:"none", cursor:"pointer" }}><span style={{ fontSize:13, color:C.mid, textDecoration:"underline" }}>{periodLabel}</span></button>
                <button onClick={nextP} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevR" s={20}/></button>
              </div>
          )}
          {period==="range"&&rangeStart&&rangeEnd && <div style={{ textAlign:"center", padding:"6px 0 0" }}><button onClick={() => setShowCalendar(true)} style={{ background:"none", border:"none", cursor:"pointer" }}><span style={{ fontSize:13, color:C.mid, textDecoration:"underline" }}>{rangeStart} — {rangeEnd}</span></button></div>}
          <div style={{ padding:"16px 16px 0", position:"relative" }}>
            <DonutChart segments={catData.map(c => ({val:c.val,color:c.color}))} total={grandTotal}/>
            <button onClick={() => navigate("addTx")} style={{ position:"absolute", bottom:12, right:16, width:50, height:50, borderRadius:25, background:C.yellow, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(200,150,30,0.45)", zIndex:5 }}><Ico n="plus" s={24} c="#fff"/></button>
          </div>
          {catData.map(c => {
            const pct = grandTotal>0?Math.round(c.val/grandTotal*100):0;
            const pl = monthPlans.find(p => p.cat_id===c.id && p.type===txType);
            return (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
                  <CatIcon k={c.icon} size={42} color={c.color}/>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:500, color:C.main }}>{c.name}</p>
                    {pl && <div style={{ marginTop:3, height:3, borderRadius:2, background:"rgba(255,255,255,0.08)" }}><div style={{ height:3, borderRadius:2, width:`${Math.min(c.val/pl.plan*100,100)}%`, background:c.val>pl.plan?"#f87171":c.color }}/></div>}
                  </div>
                  <span style={{ fontSize:13, color:C.dim, marginRight:6 }}>{pct}%</span>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:600, color:C.main }}>{sym}{fmtAmt(c.val,0)}</p>
                    {pl && <p style={{ margin:0, fontSize:10, color:C.dim }}>of {sym}{fmtAmt(pl.plan,0)}</p>}
                  </div>
                </div>
            );
          })}
          {catData.length===0 && <p style={{ textAlign:"center", padding:"24px", color:C.dim, fontSize:13 }}>No transactions for this period</p>}
        </div>

        {/* Filter button */}
        <div style={{ padding:"10px 12px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => setShowFilter(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:20, background:filterCats.length>0?C.greenDim:"rgba(255,255,255,0.06)", border:`1px solid ${filterCats.length>0?"rgba(76,175,80,0.4)":C.border}`, color:filterCats.length>0?C.green:C.mid, fontSize:13, cursor:"pointer" }}>
            <Ico n="filter" s={15} c={filterCats.length>0?C.green:C.mid}/>
            {filterCats.length>0?`Filters (${filterCats.length})`:"Filter"}
          </button>
          <span style={{ fontSize:13, fontWeight:600, color:C.mid }}>{sym}{fmtAmt(grandTotal,0)}</span>
        </div>

        {/* TX list */}
        <div style={{ padding:"10px 12px 0" }}>
          {sortedDates.map(date => (
              <div key={date} style={{ marginBottom:12 }}>
                <p style={{ fontSize:12, fontWeight:600, color:C.dim, margin:"0 0 6px" }}>{fmtDateShort(date)}</p>
                {grouped[date].map(tx => {
                  const cat = cats.find(c => c.id===tx.category_id);
                  const acc = accounts.find(a => a.id===tx.account_id);
                  return (
                      <div key={tx.id} onClick={() => navigate("editTx", tx)} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:14, marginBottom:4, background:C.monCard, cursor:"pointer" }}>
                        <CatIcon k={cat?.icon||"other"} size={44} color={cat?.color||"#607d8b"}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:14, fontWeight:500, color:C.main }}>{cat?.name||"—"}</p>
                          <p style={{ margin:0, fontSize:12, color:C.dim, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{acc?.name||"—"}{tx.note?` · ${tx.note}`:""}</p>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <p style={{ margin:0, fontSize:14, fontWeight:600, color:tx.type==="income"?"#34d399":"#fff" }}>{tx.type==="income"?"+":""}{getSym(tx.currency)}{fmtAmt(tx.amount)}</p>
                        </div>
                      </div>
                  );
                })}
              </div>
          ))}
        </div>

        {/* Account picker */}
        {showAccPicker && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={() => setShowAccPicker(false)}>
              <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px 40px", maxHeight:"70vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 16px" }}/>
                <p style={{ fontSize:16, fontWeight:600, color:"#fff", marginBottom:12 }}>Select account</p>
                {[{id:null,name:"Total — all accounts",icon:"other",color:C.green},...accounts].map(a => (
                    <div key={String(a.id)} onClick={() => { setSelAccId(a.id); setShowAccPicker(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:selAccId===a.id?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${selAccId===a.id?"rgba(76,175,80,0.4)":C.border}` }}>
                      <CatIcon k={a.icon||"other"} size={40} color={a.color||C.green}/>
                      <div style={{ flex:1 }}><p style={{ margin:0, fontSize:14, color:"#fff" }}>{a.name}</p>{a.id&&<p style={{ margin:0, fontSize:12, color:C.dim }}>{fmtM(a.balance,a.currency)}</p>}</div>
                      <div style={{ width:22, height:22, borderRadius:11, border:`2px solid ${selAccId===a.id?C.green:"rgba(255,255,255,0.2)"}`, display:"flex", alignItems:"center", justifyContent:"center" }}>{selAccId===a.id && <div style={{ width:10, height:10, borderRadius:5, background:C.green }}/>}</div>
                    </div>
                ))}
              </div>
            </div>
        )}

        {/* Filter */}
        {showFilter && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={() => setShowFilter(false)}>
              <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px 40px", maxHeight:"70vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 12px" }}/>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                  <p style={{ fontSize:16, fontWeight:600, color:"#fff", margin:0 }}>Filter by category</p>
                  {filterCats.length>0 && <button onClick={() => setFilterCats([])} style={{ background:"none", border:"none", color:"#f87171", fontSize:13, cursor:"pointer" }}>Clear all</button>}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                  {cats.map(c => { const sel=filterCats.includes(c.id); return (
                      <button key={c.id} onClick={() => setFilterCats(prev => sel?prev.filter(x=>x!==c.id):[...prev,c.id])} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"10px 4px", borderRadius:12, background:sel?c.color:"rgba(255,255,255,0.04)", border:`2px solid ${sel?c.color:C.border}`, cursor:"pointer" }}>
                        <CatIcon k={c.icon} size={44} color={sel?"rgba(0,0,0,0.25)":c.color}/>
                        <span style={{ fontSize:11, color:sel?"#fff":C.mid, textAlign:"center" }}>{c.name}</span>
                      </button>
                  ); })}
                </div>
                <button onClick={() => setShowFilter(false)} style={{ width:"100%", marginTop:16, padding:"14px", borderRadius:30, background:C.green, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>Apply</button>
              </div>
            </div>
        )}

        {showCalendar && (
            period==="range"
                ? <CalendarPicker mode="range" value={rangeStart||todayStr()} valueEnd={rangeEnd} onChange={v => setRangeStart(v)} onChangeEnd={v => setRangeEnd(v)} onClose={() => setShowCalendar(false)}/>
                : <CalendarPicker mode="single" value={`${viewYear}-${pad(viewMonth+1)}-01`} onChange={v => { const d=new Date(v); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); setPeriod("month"); }} onClose={() => setShowCalendar(false)}/>
        )}
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — ACCOUNTS SECTION
══════════════════════════════════════════════════════════════ */
function MoneyAccountsSection({ data, navigate }) {
  const { accounts } = data;
  const sym = getSym(BASE_CUR);
  const total = accounts.filter(a => a.in_total).reduce((s,a) => s+toBase(a.balance,a.currency), 0);
  return (
      <div style={{ paddingBottom:80 }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", textAlign:"center" }}>
          <p style={{ margin:"0 0 4px", fontSize:12, color:C.dim }}>Total balance</p>
          <p style={{ margin:0, fontSize:32, fontWeight:800, color:"#fff", letterSpacing:-1 }}>{sym}{fmtAmt(total,0)}</p>
          <div style={{ display:"flex", justifyContent:"center", gap:24, marginTop:16, marginBottom:8 }}>
            {[["transfer","Transfer",()=>navigate("transfer")],["clock","History",()=>navigate("trHistory")]].map(([ic,l,fn]) => (
                <button key={l} onClick={fn} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer" }}>
                  <div style={{ width:52, height:52, borderRadius:26, background:C.greenDim, display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n={ic} s={22} c={C.green}/></div>
                  <span style={{ fontSize:11, color:C.mid }}>{l}</span>
                </button>
            ))}
          </div>
        </div>
        <div style={{ padding:"16px" }}>
          {accounts.map(acc => (
              <div key={acc.id} onClick={() => navigate("editAcc", acc)} style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 14px", borderRadius:16, marginBottom:10, background:C.monCard, cursor:"pointer" }}>
                <CatIcon k={acc.icon} size={50} color={acc.color}/>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:15, fontWeight:600, color:"#fff" }}>{acc.name}</p>
                  {acc.currency!==BASE_CUR && acc.avg_rate!=null && <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>Avg rate: 1 {acc.currency} = {getSym(BASE_CUR)}{fmtAmt(acc.avg_rate,2)}</p>}
                  {!acc.in_total && <p style={{ margin:0, fontSize:11, color:C.dim }}>Not in total</p>}
                </div>
                <p style={{ margin:0, fontSize:16, fontWeight:700, color:"#fff" }}>{fmtM(acc.balance, acc.currency)}</p>
              </div>
          ))}
        </div>
        <button onClick={() => navigate("addAcc")} style={{ position:"fixed", bottom:90, right:20, width:56, height:56, borderRadius:28, background:C.yellow, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(200,150,30,0.4)", zIndex:20 }}><Ico n="plus" s={26} c="#fff"/></button>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — PLANS SECTION (simplified)
══════════════════════════════════════════════════════════════ */
function MoneyPlansSection({ data, navigate, plansTab, setPlansTab }) {
  const { transactions, expCats, incCats, monthPlans, tripPlans } = data;
  const [planMonth, setPlanMonth] = useState(new Date().getMonth());
  const [planYear, setPlanYear] = useState(new Date().getFullYear());
  const now = new Date();
  const sym = getSym(BASE_CUR);
  const isCurrent = planMonth===now.getMonth() && planYear===now.getFullYear();
  const txsM = transactions.filter(t => { const d=new Date(t.date); return d.getMonth()===planMonth && d.getFullYear()===planYear; });
  const getActual = (catId, type) => txsM.filter(t => t.type===type && t.category_id===catId).reduce((s,t) => s+toBase(t.amount,t.currency), 0);
  const totalPlanExp = monthPlans.filter(p => p.type==="expense").reduce((s,p) => s+p.plan, 0);
  const totalPlanInc = monthPlans.filter(p => p.type==="income").reduce((s,p) => s+p.plan, 0);
  const totalActExp = txsM.filter(t => t.type==="expense").reduce((s,t) => s+toBase(t.amount,t.currency), 0);
  const totalActInc = txsM.filter(t => t.type==="income").reduce((s,t) => s+toBase(t.amount,t.currency), 0);
  const prevM = () => { if(planMonth===0){setPlanMonth(11);setPlanYear(y=>y-1);}else setPlanMonth(m=>m-1); };
  const nextM = () => { if(planMonth===11){setPlanMonth(0);setPlanYear(y=>y+1);}else setPlanMonth(m=>m+1); };

  const exportPlanCSV = () => {
    const rows = [["Category","Type","Plan","Actual","Remaining"]];
    monthPlans.forEach(mp => { const allC=[...expCats,...incCats]; const cat=allC.find(c=>c.id===mp.cat_id); const actual=getActual(mp.cat_id,mp.type); rows.push([cat?.name||"",mp.type,mp.plan,actual.toFixed(2),(mp.plan-actual).toFixed(2)]); });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`plan_${planYear}-${pad(planMonth+1)}.csv`; a.click();
  };

  return (
      <div style={{ paddingBottom:80 }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", textAlign:"center" }}><p style={{ margin:0, fontSize:17, fontWeight:600, color:"#fff" }}>Plans</p></div>
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", margin:"12px 16px", borderRadius:10, padding:3 }}>
          {[["month","Monthly"],["trips","Trips"]].map(([v,l]) => (
              <button key={v} onClick={() => setPlansTab(v)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:plansTab===v?C.monCard2:"transparent", color:plansTab===v?C.green:C.dim }}>{l}</button>
          ))}
        </div>
        {plansTab==="month" && (
            <div style={{ padding:"0 16px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <button onClick={prevM} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevL" s={20}/></button>
                <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{RU_MONTHS[planMonth]} {planYear}</span>
                <button onClick={nextM} style={{ background:"none", border:"none", cursor:"pointer", color:C.dim, display:"flex" }}><Ico n="chevR" s={20}/></button>
                <button onClick={exportPlanCSV} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", marginLeft:8 }}><Ico n="download" s={18} c={C.mid}/></button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                {[{l:"Inc Plan",v:`${sym}${fmtAmt(totalPlanInc,0)}`,c:"#34d399"},{l:"Exp Plan",v:`${sym}${fmtAmt(totalPlanExp,0)}`,c:"#f87171"},{l:"Remainder",v:`${sym}${fmtAmt(totalPlanInc-totalPlanExp,0)}`,c:"#60a5fa"}].map((c,i) => (
                    <div key={i} style={{ background:C.monCard, borderRadius:12, padding:"12px 8px", textAlign:"center" }}>
                      <p style={{ margin:"0 0 4px", fontSize:9, color:C.dim }}>{c.l}</p>
                      <p style={{ margin:0, fontSize:13, fontWeight:700, color:c.c }}>{c.v}</p>
                    </div>
                ))}
              </div>
              <div style={{ background:C.monCard, borderRadius:16, overflow:"hidden", marginBottom:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1.8fr 55px 1fr 1fr 1fr", padding:"10px 14px", background:"rgba(255,255,255,0.05)" }}>
                  {["Category","Type","Plan","Fact","Rest"].map(h => <p key={h} style={{ margin:0, fontSize:10, fontWeight:700, color:C.dim, textAlign:"center" }}>{h}</p>)}
                </div>
                {monthPlans.map(mp => {
                  const allC = [...expCats,...incCats]; const cat = allC.find(c => c.id===mp.cat_id);
                  const actual = getActual(mp.cat_id, mp.type); const rest = mp.plan - actual;
                  return (
                      <div key={mp.id} onClick={() => isCurrent && navigate("editPlan", mp)} style={{ display:"grid", gridTemplateColumns:"1.8fr 55px 1fr 1fr 1fr", padding:"12px 14px", borderTop:`1px solid ${C.border}`, cursor:isCurrent?"pointer":"default", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}><CatIcon k={cat?.icon||"other"} size={28} color={cat?.color||"#607d8b"}/><span style={{ fontSize:12, color:C.main, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cat?.name||"—"}</span></div>
                        <p style={{ margin:0, fontSize:11, textAlign:"center", color:mp.type==="income"?"#34d399":"#f87171" }}>{mp.type==="income"?"Inc":"Exp"}</p>
                        <p style={{ margin:0, fontSize:12, textAlign:"center", color:C.mid }}>{sym}{fmtAmt(mp.plan,0)}</p>
                        <p style={{ margin:0, fontSize:12, textAlign:"center", color:C.main }}>{sym}{fmtAmt(actual,0)}</p>
                        <p style={{ margin:0, fontSize:12, textAlign:"center", fontWeight:600, color:rest>=0?"#34d399":"#f87171" }}>{sym}{fmtAmt(rest,0)}</p>
                      </div>
                  );
                })}
                <div style={{ display:"grid", gridTemplateColumns:"1.8fr 55px 1fr 1fr 1fr", padding:"12px 14px", borderTop:`1px solid rgba(255,255,255,0.1)`, background:"rgba(255,255,255,0.04)" }}>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.mid, gridColumn:"span 2" }}>Total</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, textAlign:"center", color:C.mid }}>{sym}{fmtAmt(totalPlanExp,0)}</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, textAlign:"center", color:C.main }}>{sym}{fmtAmt(totalActExp,0)}</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, textAlign:"center", color:(totalActInc-totalActExp)>=0?"#34d399":"#f87171" }}>{sym}{fmtAmt(totalActInc-totalActExp,0)}</p>
                </div>
              </div>
              {isCurrent && <button onClick={() => navigate("addPlan")} style={{ width:"100%", padding:"13px", borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer" }}>+ Add plan row</button>}
            </div>
        )}
        {plansTab==="trips" && (
            <div style={{ padding:"0 16px" }}>
              {tripPlans.length===0 && <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>No trip plans yet</p>}
              {tripPlans.map(tp => {
                const allExp = (tp.days||[]).flatMap(d => d.expenses||[]);
                const total = allExp.reduce((s,e) => s+toBase(e.amount,e.currency), 0);
                const paid = allExp.reduce((s,e) => s+toBase(e.paidAmount||0,e.currency), 0);
                return (
                    <div key={tp.id} onClick={() => navigate("tripDetail", tp)} style={{ background:C.monCard, borderRadius:16, padding:"16px", marginBottom:12, cursor:"pointer" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                        <div><p style={{ margin:0, fontSize:17, fontWeight:700, color:"#fff" }}>{tp.name}</p><p style={{ margin:"3px 0 0", fontSize:12, color:C.dim }}>{tp.start_date} → {tp.end_date} · {(tp.days||[]).length} days</p></div>
                        <div style={{ textAlign:"right" }}><p style={{ margin:0, fontSize:15, fontWeight:700, color:"#fff" }}>{sym}{fmtAmt(total,0)}</p><p style={{ margin:0, fontSize:11, color:C.green }}>{sym}{fmtAmt(paid,0)} paid</p></div>
                      </div>
                      {total>0 && <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,0.08)" }}><div style={{ height:4, borderRadius:2, width:`${Math.min(paid/total*100,100)}%`, background:C.green }}/></div>}
                    </div>
                );
              })}
              <button onClick={() => navigate("addTrip")} style={{ width:"100%", padding:"13px", borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer" }}>+ New trip plan</button>
            </div>
        )}
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER — MENU PAGE
══════════════════════════════════════════════════════════════ */
function MoneyMenuPage({ navigate, onBack }) {
  return (
      <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Menu</span>
          <div style={{ width:30 }}/>
        </div>
        <div style={{ flex:1, padding:"12px 16px" }}>
          {[{label:"Categories",key:"menuCats"},{label:"Recurring payments",key:"menuRec"}].map(item => (
              <div key={item.key} onClick={() => navigate(item.key)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 16px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
                <span style={{ fontSize:16, color:"#fff", fontWeight:500 }}>{item.label}</span>
                <Ico n="chevR" s={18} c={C.dim}/>
              </div>
          ))}
        </div>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER WRAPPER (handles its own navigation + data)
══════════════════════════════════════════════════════════════ */
function MoneyManagerSection() {
  const data = useMoneyData();
  const [monTab, setMonTab] = useState("home");
  const [plansTab, setPlansTab] = useState("month");
  const [screen, setScreen] = useState(null);

  const navigate = (name, d) => setScreen({ name, data: d });
  const goBack = (reload = false) => { if (reload) data.reload(); setScreen(null); };
  const goBackToTrips = (reload = false) => { setPlansTab("trips"); setMonTab("plans"); if (reload) data.reload(); setScreen(null); };

  if (data.loading) return <div style={{ background:C.monBg, minHeight:"100vh" }}><Spinner color={C.green}/></div>;

  // Full-page screens
  if (screen) {
    const { name, data: d } = screen;
    if (name==="addTx")     return <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} onBack={goBack}/>;
    if (name==="editTx")    return <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d}/>;
    if (name==="addAcc")    return <AccPage onBack={goBack}/>;
    if (name==="editAcc")   return <AccPage onBack={goBack} edit={d}/>;
    if (name==="transfer")  return <TransferPageMon accounts={data.accounts} onBack={goBack}/>;
    if (name==="trHistory") return <TransferHistoryPageMon transfers={data.transfers} accounts={data.accounts} dispatch={data} onBack={() => goBack(true)}/>;
    if (name==="addCat")    return <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} catType={d?.catType}/>;
    if (name==="editCat")   return <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d} catType={d?.catType}/>;
    if (name==="addRec")    return <RecPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack}/>;
    if (name==="editRec")   return <RecPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack} edit={d}/>;
    if (name==="addPlan")   return <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack}/>;
    if (name==="editPlan")  return <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d}/>;
    if (name==="addTrip")   return <TripEditPageMon onBack={goBackToTrips}/>;
    if (name==="editTrip")  return <TripEditPageMon onBack={goBackToTrips} edit={d}/>;
    if (name==="tripDetail")return <TripDetailPageMon plan={d} onBack={goBack}/>;
    if (name==="menu")      return <MoneyMenuPage navigate={navigate} onBack={() => goBack(false)}/>;
    if (name==="menuCats")  return <CatsListPageMon expCats={data.expCats} incCats={data.incCats} navigate={navigate} onBack={() => goBack(false)}/>;
    if (name==="menuRec")   return <RecListPageMon recurring={data.recurring} accounts={data.accounts} expCats={data.expCats} navigate={navigate} onBack={() => goBack(false)}/>;
  }

  const MON_TABS = [
    { id:"home",    d:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10", label:"Home" },
    { id:"accounts",d:"M3 4h18v16H3zM3 10h18", label:"Accounts" },
    { id:"plans",   d:"M18 20V10M12 20V4M6 20v-6", label:"Plans" },
    { id:"menu",    d:"M3 12h18M3 6h18M3 18h18", label:"Menu" },
  ];

  return (
      <div style={{ background:C.monBg, minHeight:"100vh", color:"#fff" }}>
        <div style={{ overflowY:"auto", height:"calc(100vh - 64px)" }}>
          {monTab==="home"     && <MoneyHomeSection     data={data} navigate={navigate}/>}
          {monTab==="accounts" && <MoneyAccountsSection data={data} navigate={navigate}/>}
          {monTab==="plans"    && <MoneyPlansSection    data={data} navigate={navigate} plansTab={plansTab} setPlansTab={setPlansTab}/>}
        </div>
        <div style={{ position:"fixed", bottom:0, left:0, right:0, height:64, background:C.monHeader, borderTop:"1px solid rgba(76,175,80,0.1)", display:"flex", zIndex:30 }}>
          {MON_TABS.map(t => (
              <button key={t.id} onClick={() => { if(t.id==="menu") navigate("menu"); else { setMonTab(t.id); setScreen(null); } }} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, background:"none", border:"none", cursor:"pointer", color:monTab===t.id&&t.id!=="menu"?C.green:"rgba(255,255,255,0.3)" }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.d.split("M").filter(Boolean).map((p,i) => <path key={i} d={`M${p}`}/>)}</svg>
                <span style={{ fontSize:10, fontWeight:500 }}>{t.label}</span>
              </button>
          ))}
        </div>
      </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MONEY MANAGER STUB PAGES (cat, rec, plan, trip)
══════════════════════════════════════════════════════════════ */
function CatPageMon({ expCats, incCats, onBack, edit, catType }) {
  const [name,setName]=useState(edit?.name||"");const [icon,setIcon]=useState(edit?.icon||"other");const [color,setColor]=useState(edit?.color||C.green);const [plan,setPlan]=useState(edit?.plan||"");const [planCur,setPlanCur]=useState(edit?.plan_currency||BASE_CUR);const [showCur,setShowCur]=useState(false);const [errors,setErrors]=useState({});
  if(showCur)return <CurrencyPage value={planCur} onSelect={v=>{setPlanCur(v);setShowCur(false);}} onBack={()=>setShowCur(false)}/>;
  const iconKeys=Object.keys(CAT_SVG);
  const save=async()=>{const e={};if(!name.trim())e.name="Enter name";setErrors(e);if(Object.keys(e).length>0)return;const cat={id:edit?.id||`cat${Date.now()}`,name:name.trim(),icon,color,plan:parseFloat(plan)||0,plan_currency:planCur};try{await supaUpsert(catType==="expense"?"exp_categories":"inc_categories",cat);onBack(true);}catch(e){console.error(e);}};
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={()=>onBack(false)} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>{edit?"Edit Category":"New Category"}</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"16px 16px 100px"}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.border}`}}><CatIcon k={icon} size={52} color={color}/><input value={name} onChange={e=>{setName(e.target.value);setErrors(p=>({...p,name:""}));}} placeholder="Category name" style={{flex:1,background:"none",border:"none",borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`,outline:"none",color:"#fff",fontSize:20,fontWeight:600,padding:"4px 0"}}/></div>{errors.name&&<p style={{color:C.red,fontSize:13,marginBottom:12}}>{errors.name}</p>}<div style={{marginBottom:16}}><FieldLabel>{catType==="expense"?"Projected expense":"Projected income"}</FieldLabel><div style={{display:"flex",alignItems:"baseline",gap:10}}><input value={plan} onChange={e=>setPlan(e.target.value)} type="number" placeholder="0" style={{width:120,background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.2)",outline:"none",color:"#fff",fontSize:22,fontWeight:600,padding:"4px 0"}}/><button onClick={()=>setShowCur(true)} style={{background:"none",border:"none",color:C.green,fontSize:15,fontWeight:600,cursor:"pointer"}}>{planCur} ▾</button></div></div><div style={{marginBottom:16}}><FieldLabel>Icons</FieldLabel><div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>{iconKeys.map(k=><button key={k} onClick={()=>setIcon(k)} style={{width:52,height:52,borderRadius:26,border:icon===k?"3px solid #fff":"3px solid transparent",background:"transparent",cursor:"pointer",padding:0,margin:"0 auto"}}><CatIcon k={k} size={46} color={color}/></button>)}</div></div><div style={{marginBottom:28}}><FieldLabel>Color</FieldLabel><ColorPickerComp value={color} onChange={setColor}/></div><button onClick={save} style={{width:"100%",padding:"15px",borderRadius:30,background:C.yellow,border:"none",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>Save</button>{edit&&<button onClick={async()=>{await supa.delete(catType==="expense"?"exp_categories":"inc_categories",`id=eq.${edit.id}`);onBack(true);}} style={{width:"100%",marginTop:10,padding:"14px",borderRadius:30,background:"rgba(244,67,54,0.1)",border:"1px solid rgba(244,67,54,0.3)",color:C.red,fontSize:15,fontWeight:600,cursor:"pointer"}}>Delete</button>}</div></div>);
}

function RecPageMon({ accounts, expCats, onBack, edit }) {
  const [name,setName]=useState(edit?.name||"");const [day,setDay]=useState(edit?.day||1);const [amt,setAmt]=useState(edit?.amount?String(edit.amount):"");const [catId,setCatId]=useState(edit?.cat_id||"");const [accId,setAccId]=useState(edit?.acc_id||accounts[0]?.id||"");const [errors,setErrors]=useState({});
  const selAcc=accounts.find(a=>a.id===accId);
  const save=async()=>{const e={};if(!name.trim())e.name="Enter name";if(!amt)e.amt="Enter amount";setErrors(e);if(Object.keys(e).length>0)return;const rec={id:edit?.id||`r${Date.now()}`,name:name.trim(),day:parseInt(day),amount:parseFloat(amt),cat_id:catId,acc_id:accId,last_fired:edit?.last_fired||""};try{await supaUpsert("recurring",rec);onBack(true);}catch(e){console.error(e);}};
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={()=>onBack(false)} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>{edit?"Edit Reminder":"Create Reminder"}</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"16px 16px 100px"}}><FieldLabel error={errors.name}>Payment Name</FieldLabel><input value={name} onChange={e=>{setName(e.target.value);setErrors(p=>({...p,name:""}));}} placeholder="Name" style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":C.border}`,outline:"none",color:"#fff",fontSize:16,padding:"4px 0",marginBottom:errors.name?4:16,boxSizing:"border-box"}}/>{errors.name&&<p style={{color:C.red,fontSize:12,marginBottom:12}}>{errors.name}</p>}<AccSelect accounts={accounts} value={accId} onChange={v=>setAccId(v)} label="Account"/><div style={{display:"flex",gap:16,marginBottom:16}}><div style={{flex:1}}><FieldLabel>Day of month</FieldLabel><input type="number" min="1" max="31" value={day} onChange={e=>setDay(e.target.value)} style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,outline:"none",color:"#fff",fontSize:22,fontWeight:600,padding:"4px 0",boxSizing:"border-box"}}/></div><div style={{flex:2}}><FieldLabel error={errors.amt}>Amount {selAcc?`(${selAcc.currency})`:""}</FieldLabel><input type="number" value={amt} onChange={e=>{setAmt(e.target.value);setErrors(p=>({...p,amt:""}));}} placeholder="0" style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${errors.amt?"rgba(244,67,54,0.5)":C.border}`,outline:"none",color:"#fff",fontSize:22,fontWeight:600,padding:"4px 0",boxSizing:"border-box"}}/></div></div><FieldLabel>Category</FieldLabel><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}}>{expCats.map(c=><button key={c.id} onClick={()=>setCatId(c.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",borderRadius:10,background:catId===c.id?c.color:"transparent",border:"none",cursor:"pointer"}}><CatIcon k={c.icon} size={46} color={catId===c.id?"rgba(0,0,0,0.25)":c.color}/><span style={{fontSize:10,color:catId===c.id?"#fff":C.mid,textAlign:"center"}}>{c.name}</span></button>)}</div><button onClick={save} style={{width:"100%",padding:"15px",borderRadius:30,background:C.yellow,border:"none",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>Save</button>{edit&&<button onClick={async()=>{await supa.delete("recurring",`id=eq.${edit.id}`);onBack(true);}} style={{width:"100%",marginTop:10,padding:"14px",borderRadius:30,background:"rgba(244,67,54,0.1)",border:"1px solid rgba(244,67,54,0.3)",color:C.red,fontSize:15,fontWeight:600,cursor:"pointer"}}>Delete</button>}</div></div>);
}

function PlanRowPageMon({ expCats, incCats, onBack, edit }) {
  const [type,setType]=useState(edit?.type||"expense");const [catId,setCatId]=useState(edit?.cat_id||"");const [plan,setPlan]=useState(edit?.plan?String(edit.plan):"");const [errors,setErrors]=useState({});
  const save=async()=>{const e={};if(!catId)e.cat="Select category";if(!plan)e.plan="Enter amount";setErrors(e);if(Object.keys(e).length>0)return;const p={id:edit?.id||`mp${Date.now()}`,cat_id:catId,type,plan:parseFloat(plan)};try{await supaUpsert("month_plans",p);onBack(true);}catch(e){console.error(e);}};
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={()=>onBack(false)} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>{edit?"Edit plan row":"Add plan row"}</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"16px 16px 100px"}}><div style={{display:"flex",gap:2,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:3,marginBottom:20}}>{[["expense","Expense"],["income","Income"]].map(([v,l])=><button key={v} onClick={()=>{setType(v);setCatId("");}} style={{flex:1,padding:"10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:type===v?C.monCard2:"transparent",color:type===v?C.green:C.dim}}>{l}</button>)}</div><FieldLabel error={errors.plan}>Plan amount ({BASE_CUR})</FieldLabel><input value={plan} onChange={e=>{setPlan(e.target.value);setErrors(p=>({...p,plan:""}));}} type="number" placeholder="0" style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${errors.plan?"rgba(244,67,54,0.5)":C.border}`,outline:"none",color:"#fff",fontSize:28,fontWeight:700,padding:"4px 0",marginBottom:errors.plan?4:20,boxSizing:"border-box"}}/>{errors.plan&&<p style={{color:C.red,fontSize:12,marginBottom:12}}>{errors.plan}</p>}<FieldLabel error={errors.cat}>Category</FieldLabel><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}}>{(type==="expense"?expCats:incCats).map(c=><button key={c.id} onClick={()=>{setCatId(c.id);setErrors(p=>({...p,cat:""}));}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",borderRadius:10,background:catId===c.id?c.color:"transparent",border:"none",cursor:"pointer"}}><CatIcon k={c.icon} size={46} color={catId===c.id?"rgba(0,0,0,0.25)":c.color}/><span style={{fontSize:10,color:catId===c.id?"#fff":C.mid,textAlign:"center"}}>{c.name}</span></button>)}</div><button onClick={save} style={{width:"100%",padding:"15px",borderRadius:30,background:C.yellow,border:"none",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>Save</button>{edit&&<button onClick={async()=>{await supa.delete("month_plans",`id=eq.${edit.id}`);onBack(true);}} style={{width:"100%",marginTop:10,padding:"14px",borderRadius:30,background:"rgba(244,67,54,0.1)",border:"1px solid rgba(244,67,54,0.3)",color:C.red,fontSize:15,fontWeight:600,cursor:"pointer"}}>Delete</button>}</div></div>);
}

function TripEditPageMon({ onBack, edit }) {
  const [name,setName]=useState(edit?.name||"");const [startDate,setStartDate]=useState(edit?.start_date||todayStr());const [endDate,setEndDate]=useState(edit?.end_date||addDays(todayStr(),3));const [showCal,setShowCal]=useState(false);const [errors,setErrors]=useState({});
  const genDays=(sd,ed)=>Array.from({length:daysBetween(sd,ed)+1},(_,i)=>{const dk=addDays(sd,i);const ex=edit?.days?.find(d=>d.date===dk);return ex||{date:dk,location:"",note:"",places:[],expenses:[]};});
  const save=async()=>{const e={};if(!name.trim())e.name="Enter trip name";setErrors(e);if(Object.keys(e).length>0)return;const plan={id:edit?.id||`tp${Date.now()}`,name:name.trim(),start_date:startDate,end_date:endDate,days:genDays(startDate,endDate)};try{await supaUpsert("trip_plans",plan);onBack(true);}catch(e){console.error(e);}};
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={()=>onBack(false)} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>{edit?"Edit trip":"New trip plan"}</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"16px 16px 100px"}}><FieldLabel error={errors.name}>Trip name</FieldLabel><input value={name} onChange={e=>{setName(e.target.value);setErrors(p=>({...p,name:""}));}} placeholder="e.g. Italy trip" style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`,outline:"none",color:"#fff",fontSize:22,fontWeight:700,padding:"4px 0",marginBottom:errors.name?4:20,boxSizing:"border-box"}}/>{errors.name&&<p style={{color:C.red,fontSize:12,marginBottom:12}}>{errors.name}</p>}<FieldLabel>Dates</FieldLabel><div onClick={()=>setShowCal(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,0.06)",cursor:"pointer",marginBottom:20}}><Ico n="clock" s={18} c={C.green}/><span style={{fontSize:14,color:"#fff"}}>{startDate}</span><span style={{color:C.dim}}>→</span><span style={{fontSize:14,color:"#fff"}}>{endDate}</span><span style={{marginLeft:"auto",fontSize:12,color:C.dim}}>{daysBetween(startDate,endDate)+1} days</span></div><button onClick={save} style={{width:"100%",padding:"15px",borderRadius:30,background:C.yellow,border:"none",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>Save trip plan</button>{edit&&<button onClick={async()=>{await supa.delete("trip_plans",`id=eq.${edit.id}`);onBack(true);}} style={{width:"100%",marginTop:10,padding:"14px",borderRadius:30,background:"rgba(244,67,54,0.1)",border:"1px solid rgba(244,67,54,0.3)",color:C.red,fontSize:15,fontWeight:600,cursor:"pointer"}}>Delete trip</button>}</div>{showCal&&<CalendarPicker mode="range" value={startDate} valueEnd={endDate} onChange={setStartDate} onChangeEnd={setEndDate} onClose={()=>setShowCal(false)}/>}</div>);
}

function TripDetailPageMon({ plan, onBack }) {
  const [days, setDays] = useState(plan.days||[]);
  const sym = getSym(BASE_CUR);
  const saveDay = async (idx, day) => {
    const nd = [...days]; nd[idx] = day; setDays(nd);
    try { await supa.update("trip_plans", { days: nd }, `id=eq.${plan.id}`); } catch(e) { console.error(e); }
  };
  const allExp = days.flatMap(d => d.expenses||[]);
  const totalAll = allExp.reduce((s,e) => s+toBase(e.amount,e.currency), 0);
  const totalPaid = allExp.reduce((s,e) => s+toBase(e.paidAmount||0,e.currency), 0);
  const byCat = {}; allExp.forEach(e => { if(!byCat[e.cat]) byCat[e.cat]=0; byCat[e.cat]+=toBase(e.amount,e.currency); });
  const byCur = {}; allExp.filter(e=>e.status!=="paid").forEach(e=>{const needed=e.status==="partial"?(e.amount-(e.paidAmount||0)):e.amount;if(!byCur[e.currency])byCur[e.currency]={cash:0,card:0};if(e.isCash)byCur[e.currency].cash+=needed;else byCur[e.currency].card+=needed;});
  const exportCSV = () => { const rows=[["Date","Location","Name","Category","Amount","Currency","Status","Cash","Note"]]; days.forEach(d=>d.expenses.forEach(e=>rows.push([d.date,d.location||"",e.label,TRIP_LABELS[e.cat]||e.cat,e.amount,e.currency,e.status,e.isCash?"Yes":"No",e.note||""]))); const csv=rows.map(r=>r.join(",")).join("\n"); const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${plan.name.replace(/\s+/g,"_")}.csv`;a.click(); };
  return(
      <div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}>
        <div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>onBack(false)} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button>
          <span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>{plan.name}</span>
          <button onClick={exportCSV} style={{background:"none",border:"none",cursor:"pointer",display:"flex"}}><Ico n="download" s={20} c={C.mid}/></button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px 80px"}}>
          <div style={{borderRadius:16,background:C.monCard,padding:"16px",marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {[{l:"Total",v:`${sym}${fmtAmt(totalAll,0)}`,c:"#fff"},{l:"Paid",v:`${sym}${fmtAmt(totalPaid,0)}`,c:C.green},{l:"Remaining",v:`${sym}${fmtAmt(totalAll-totalPaid,0)}`,c:"#f87171"}].map((s,i)=>(
                  <div key={i} style={{textAlign:"center",padding:"10px",borderRadius:10,background:"rgba(255,255,255,0.04)"}}>
                    <p style={{margin:0,fontSize:10,color:C.dim,marginBottom:3}}>{s.l}</p>
                    <p style={{margin:0,fontSize:13,fontWeight:700,color:s.c}}>{s.v}</p>
                  </div>
              ))}
            </div>
            {Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
                <div key={cat} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:13,color:C.mid}}>{TRIP_LABELS[cat]||cat}</span>
                  <span style={{fontSize:13,color:C.main,fontWeight:500}}>{sym}{fmtAmt(amt,0)}</span>
                </div>
            ))}
            {Object.keys(byCur).length>0&&<><div style={{height:1,background:C.border,margin:"10px 0 8px"}}/><p style={{margin:"0 0 6px",fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Need to pay</p>{Object.entries(byCur).map(([cur,v])=>(
                <div key={cur} style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:13,fontWeight:600,color:C.main}}>{cur}</span><span style={{fontSize:13,color:C.main}}>{getSym(cur)}{fmtAmt(v.cash+v.card,0)}</span></div>
                  <div style={{display:"flex",gap:12}}>{v.cash>0&&<span style={{fontSize:12,color:C.dim}}>💵 {getSym(cur)}{fmtAmt(v.cash,0)}</span>}{v.card>0&&<span style={{fontSize:12,color:C.dim}}>💳 {getSym(cur)}{fmtAmt(v.card,0)}</span>}</div>
                </div>
            ))}</>}
          </div>
          {days.map((day,i) => (
              <TripDayCardMon key={day.date} day={day} dayIndex={i} onUpdate={d => saveDay(i,d)} prevDay={i>0?days[i-1]:null}/>
          ))}
        </div>
      </div>
  );
}

function TripDayCardMon({ day, dayIndex, onUpdate, prevDay }) {
  const [collapsed,setCollapsed]=useState(day.date<todayStr());const [editExpId,setEditExpId]=useState(null);const [addingExp,setAddingExp]=useState(false);const [newPlace,setNewPlace]=useState("");
  const d=new Date(day.date);const dayLabel=`${d.getDate()} ${RU_MONTHS_S[d.getMonth()]}`;const isToday=day.date===todayStr();const isPast=day.date<todayStr();const allDone=day.expenses.length>0&&day.expenses.every(e=>e.status==="paid");
  const dayTotal=day.expenses.reduce((s,e)=>s+toBase(e.amount,e.currency),0);const dayPaid=day.expenses.reduce((s,e)=>s+toBase(e.paidAmount||0,e.currency),0);const sym=getSym(BASE_CUR);
  const saveExp=(exp)=>{const exps=editExpId?day.expenses.map(e=>e.id===editExpId?exp:e):[...day.expenses,exp];onUpdate({...day,expenses:exps});setEditExpId(null);setAddingExp(false);};
  const addPlace=()=>{if(!newPlace.trim())return;onUpdate({...day,places:[...(day.places||[]),{id:`pl${Date.now()}`,name:newPlace.trim(),done:false}]});setNewPlace("");};
  const copyFromPrev=()=>{if(!prevDay)return;const newExps=prevDay.expenses.map(e=>({...e,id:`ex${Date.now()}${Math.random()}`,status:"unpaid",paidAmount:0}));onUpdate({...day,expenses:[...day.expenses,...newExps]});};
  return(
      <div style={{borderRadius:16,background:C.monCard,marginBottom:10,border:`1px solid ${allDone?"rgba(76,175,80,0.3)":C.border}`,overflow:"hidden"}}>
        <div onClick={()=>setCollapsed(!collapsed)} style={{display:"flex",alignItems:"center",padding:"14px 16px",cursor:"pointer",background:isToday?"rgba(76,175,80,0.08)":"transparent"}}>
          <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:15,fontWeight:700,color:isToday?C.green:isPast?C.mid:"#fff"}}>{dayLabel}</span>{isToday&&<span style={{fontSize:10,fontWeight:700,color:C.green,background:"rgba(76,175,80,0.15)",padding:"2px 7px",borderRadius:10}}>TODAY</span>}{allDone&&<span style={{fontSize:10,fontWeight:700,color:"#34d399",background:"rgba(52,211,153,0.15)",padding:"2px 7px",borderRadius:10}}>✓ DONE</span>}</div>{day.location&&<p style={{margin:"2px 0 0",fontSize:13,color:C.mid}}>{day.location}</p>}</div>
          <div style={{textAlign:"right",marginRight:12}}><p style={{margin:0,fontSize:14,fontWeight:700,color:"#fff"}}>{sym}{fmtAmt(dayTotal,0)}</p>{dayPaid>0&&<p style={{margin:0,fontSize:11,color:C.green}}>{sym}{fmtAmt(dayPaid,0)} paid</p>}</div>
          <Ico n={collapsed?"chevD":"chevU"} s={18} c={C.dim}/>
        </div>
        {!collapsed&&(
            <div style={{padding:"0 16px 16px"}}>
              <input value={day.location||""} onChange={e=>onUpdate({...day,location:e.target.value})} placeholder="Location / City" style={{width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:"#fff",fontSize:14,outline:"none",marginBottom:10,boxSizing:"border-box"}}/>
              <textarea value={day.note||""} onChange={e=>onUpdate({...day,note:e.target.value})} placeholder="Day notes..." style={{width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:"#fff",fontSize:13,outline:"none",resize:"none",minHeight:52,marginBottom:10,boxSizing:"border-box"}}/>
              <div style={{marginBottom:10}}>
                <p style={{margin:"0 0 6px",fontSize:11,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Places to visit</p>
                {(day.places||[]).map(pl=>(
                    <div key={pl.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <button onClick={()=>onUpdate({...day,places:day.places.map(p=>p.id===pl.id?{...p,done:!p.done}:p)})} style={{width:20,height:20,borderRadius:10,border:`2px solid ${pl.done?C.green:"rgba(255,255,255,0.2)"}`,background:pl.done?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{pl.done&&<Ico n="check" s={11} c="#fff"/>}</button>
                      <span style={{flex:1,fontSize:13,color:pl.done?C.dim:C.main,textDecoration:pl.done?"line-through":"none"}}>{pl.name}</span>
                      <button onClick={()=>onUpdate({...day,places:day.places.filter(p=>p.id!==pl.id)})} style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex"}}><Ico n="x" s={14} c="rgba(244,67,54,0.4)"/></button>
                    </div>
                ))}
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <input value={newPlace} onChange={e=>setNewPlace(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPlace()} placeholder="Add place..." style={{flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:13,outline:"none"}}/>
                  <button onClick={addPlace} style={{background:C.green,border:"none",borderRadius:8,padding:"6px 14px",color:"#fff",cursor:"pointer",fontSize:16,fontWeight:700}}>+</button>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <p style={{margin:"0 0 6px",fontSize:11,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Expenses</p>
                {day.expenses.map(exp=>{
                  if(editExpId===exp.id)return <TripExpenseFormMon key={exp.id} exp={exp} onSave={saveExp} onCancel={()=>setEditExpId(null)}/>;
                  const stColor=exp.status==="paid"?C.green:exp.status==="partial"?"#f59e0b":"rgba(255,255,255,0.3)";
                  return(
                      <div key={exp.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.04)",marginBottom:4,border:`1px solid ${C.border}`}}>
                        <div style={{width:8,height:8,borderRadius:4,background:stColor,marginTop:6,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14,color:exp.status==="paid"?C.dim:C.main,fontWeight:500,textDecoration:exp.status==="paid"?"line-through":"none"}}>{exp.label}</span>{exp.isCash&&<span style={{fontSize:10,color:C.dim,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px"}}>CASH</span>}</div><div style={{display:"flex",gap:8,marginTop:2,flexWrap:"wrap"}}><span style={{fontSize:12,color:C.dim}}>{TRIP_LABELS[exp.cat]||exp.cat}</span>{exp.status==="partial"&&<span style={{fontSize:12,color:"#f59e0b"}}>{getSym(exp.currency)}{fmtAmt(exp.paidAmount)} paid</span>}{exp.note&&<span style={{fontSize:12,color:C.dim,fontStyle:"italic"}}>{exp.note}</span>}</div></div>
                        <div style={{textAlign:"right",flexShrink:0}}><p style={{margin:0,fontSize:14,fontWeight:600,color:C.main}}>{getSym(exp.currency)}{fmtAmt(exp.amount)}</p></div>
                        <button onClick={()=>setEditExpId(exp.id)} style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex"}}><Ico n="edit" s={14} c={C.dim}/></button>
                        <button onClick={()=>onUpdate({...day,expenses:day.expenses.filter(e=>e.id!==exp.id)})} style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex"}}><Ico n="trash" s={14} c="rgba(244,67,54,0.4)"/></button>
                      </div>
                  );
                })}
              </div>
              {addingExp?<TripExpenseFormMon onSave={saveExp} onCancel={()=>setAddingExp(false)}/>:
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setAddingExp(true)} style={{flex:1,padding:"9px",borderRadius:10,background:"rgba(76,175,80,0.1)",border:"1px solid rgba(76,175,80,0.3)",color:C.green,fontSize:13,cursor:"pointer",fontWeight:600}}>+ Add expense</button>
                    {dayIndex>0&&prevDay&&<button onClick={copyFromPrev} style={{padding:"9px 12px",borderRadius:10,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,color:C.dim,fontSize:12,cursor:"pointer"}}>Copy prev</button>}
                  </div>
              }
            </div>
        )}
      </div>
  );
}

function TripExpenseFormMon({ exp, onSave, onCancel }) {
  const [label,setLabel]=useState(exp?.label||"");const [cat,setCat]=useState(exp?.cat||"transport");const [amt,setAmt]=useState(exp?.amount?String(exp.amount):"");const [cur,setCur]=useState(exp?.currency||BASE_CUR);const [paidAmt,setPaidAmt]=useState(exp?.paidAmount?String(exp.paidAmount):"");const [status,setStatus]=useState(exp?.status||"unpaid");const [isCash,setIsCash]=useState(exp?.isCash||false);const [note,setNote]=useState(exp?.note||"");const [showCur,setShowCur]=useState(false);const [errors,setErrors]=useState({});
  if(showCur)return <CurrencyPage value={cur} onSelect={v=>{setCur(v);setShowCur(false);}} onBack={()=>setShowCur(false)}/>;
  const save=()=>{const e={};if(!label.trim())e.label="Enter name";if(!amt)e.amt="Enter amount";setErrors(e);if(Object.keys(e).length>0)return;onSave({id:exp?.id||`ex${Date.now()}`,label:label.trim(),cat,amount:parseFloat(amt),currency:cur,paidAmount:status==="partial"?parseFloat(paidAmt)||0:(status==="paid"?parseFloat(amt):0),status,isCash,note});};
  return(
      <div style={{background:C.monCard2,borderRadius:16,padding:16,marginBottom:8,border:`1px solid ${C.border}`}}>
        <FieldLabel error={errors.label}>Name</FieldLabel>
        <input value={label} onChange={e=>{setLabel(e.target.value);setErrors(p=>({...p,label:""}));}} placeholder="e.g. Train to Naples" style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${errors.label?"rgba(244,67,54,0.4)":C.border}`,outline:"none",color:"#fff",fontSize:15,padding:"4px 0",marginBottom:12,boxSizing:"border-box"}}/>
        <FieldLabel>Category</FieldLabel>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{TRIP_CATS.map(k=><button key={k} onClick={()=>setCat(k)} style={{padding:"6px 10px",borderRadius:20,border:`1px solid ${cat===k?C.green:C.border}`,background:cat===k?C.greenDim:"transparent",color:cat===k?C.green:C.dim,fontSize:12,cursor:"pointer"}}>{TRIP_LABELS[k]}</button>)}</div>
        <FieldLabel error={errors.amt}>Amount</FieldLabel>
        <div style={{display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${errors.amt?"rgba(244,67,54,0.4)":C.border}`,marginBottom:12,paddingBottom:4}}>
          <input value={amt} onChange={e=>{setAmt(e.target.value);setErrors(p=>({...p,amt:""}));}} type="number" placeholder="0" style={{flex:1,background:"none",border:"none",outline:"none",color:"#fff",fontSize:22,fontWeight:600,padding:"4px 0"}}/>
          <button onClick={()=>setShowCur(true)} style={{background:"none",border:"none",color:C.green,fontSize:16,fontWeight:700,cursor:"pointer",flexShrink:0}}>{cur} ▾</button>
        </div>
        <FieldLabel>Payment status</FieldLabel>
        <div style={{display:"flex",gap:6,marginBottom:12}}>{[["unpaid","Unpaid"],["paid","Paid"],["partial","Partial"]].map(([v,l])=><button key={v} onClick={()=>setStatus(v)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${status===v?(v==="paid"?C.green:v==="partial"?"#f59e0b":C.border):C.border}`,background:status===v?(v==="paid"?"rgba(76,175,80,0.15)":v==="partial"?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.05)"):"transparent",color:status===v?(v==="paid"?C.green:v==="partial"?"#f59e0b":C.main):C.dim,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div>
        {status==="partial"&&<div style={{marginBottom:12}}><FieldLabel>Already paid ({cur})</FieldLabel><input value={paidAmt} onChange={e=>setPaidAmt(e.target.value)} type="number" placeholder="0" style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,outline:"none",color:"#fff",fontSize:16,padding:"4px 0",boxSizing:"border-box"}}/></div>}
        <div style={{marginBottom:12}}><Toggle value={isCash} onChange={setIsCash} label="Cash payment"/></div>
        <FieldLabel>Note</FieldLabel>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Booking ref, link..." style={{width:"100%",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,outline:"none",color:"#fff",fontSize:14,padding:"4px 0",marginBottom:12,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={save} style={{flex:1,padding:"10px",borderRadius:20,background:C.yellow,border:"none",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Save</button>
          <button onClick={onCancel} style={{flex:1,padding:"10px",borderRadius:20,background:"rgba(255,255,255,0.06)",border:"none",color:C.mid,fontSize:14,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
  );
}

function CatsListPageMon({ expCats, incCats, navigate, onBack }) {
  const [tab,setTab]=useState("expense");
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>Categories</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"12px 16px 80px"}}><div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:16}}>{[["expense","EXPENSES"],["income","INCOME"]].map(([v,l])=><button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"10px 0",background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,color:tab===v?"#fff":C.dim,borderBottom:tab===v?"2px solid #fff":"2px solid transparent"}}>{l}</button>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>{(tab==="expense"?expCats:incCats).map(c=><button key={c.id} onClick={()=>navigate("editCat",{...c,catType:tab})} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 4px",borderRadius:14,background:C.monCard,border:"none",cursor:"pointer"}}><CatIcon k={c.icon} size={52} color={c.color}/><span style={{fontSize:11,color:C.mid,textAlign:"center",lineHeight:1.2}}>{c.name}</span></button>)}<button onClick={()=>navigate("addCat",{catType:tab})} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 4px",borderRadius:14,background:C.monCard,border:"none",cursor:"pointer"}}><div style={{width:52,height:52,borderRadius:26,background:C.yellow,display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="plus" s={24} c="#fff"/></div><span style={{fontSize:11,color:C.dim}}>Add</span></button></div></div></div>);
}

function RecListPageMon({ recurring, accounts, expCats, navigate, onBack }) {
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>Recurring payments</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"12px 16px 80px"}}>{recurring.sort((a,b)=>a.day-b.day).map(r=>{const cat=expCats.find(c=>c.id===r.cat_id);const acc=accounts.find(a=>a.id===r.acc_id);const mk=monthKey(todayStr());const fired=r.last_fired===mk;return(<div key={r.id} onClick={()=>navigate("editRec",r)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px",borderRadius:14,marginBottom:8,background:C.monCard,cursor:"pointer"}}><div style={{width:42,height:42,borderRadius:21,background:"rgba(76,175,80,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}><span style={{fontSize:15,fontWeight:800,color:C.green}}>{r.day}</span>{fired&&<div style={{position:"absolute",top:-2,right:-2,width:10,height:10,borderRadius:5,background:C.green,border:`2px solid ${C.monCard}`}}/>}</div><div style={{flex:1}}><p style={{margin:0,fontSize:14,color:C.main}}>{r.name}</p><p style={{margin:0,fontSize:12,color:C.dim}}>{cat?.name||"—"} · {acc?.name||"—"}{fired?" · paid":""}</p></div><p style={{margin:0,fontSize:14,fontWeight:600,color:C.main}}>{fmtM(r.amount,acc?.currency||BASE_CUR)}</p></div>);})}<button onClick={()=>navigate("addRec")} style={{width:"100%",marginTop:4,padding:"14px",borderRadius:12,background:C.green,border:"none",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>+ Add recurring payment</button></div></div>);
}

function TransferHistoryPageMon({ transfers, accounts, onBack }) {
  const [period,setPeriod]=useState("month");const [confirmCancel,setConfirmCancel]=useState(null);const now=new Date();
  const filtered=transfers.filter(t=>{const d=new Date(t.date);if(period==="day")return t.date===todayStr();if(period==="week"){const w=new Date();w.setDate(w.getDate()-7);return d>=w;}if(period==="month")return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();if(period==="year")return d.getFullYear()===now.getFullYear();return true;});
  const cancelTransfer=async(t)=>{const from=accounts.find(a=>a.id===t.from_id);const to=accounts.find(a=>a.id===t.to_id);try{await supa.delete("transfers",`id=eq.${t.id}`);if(from)await supa.update("accounts",{balance:from.balance+t.amount+(t.fee||0)},`id=eq.${from.id}`);if(to)await supa.update("accounts",{balance:to.balance-(t.to_amt||t.amount)},`id=eq.${to.id}`);setConfirmCancel(null);onBack();}catch(e){console.error(e);}};
  return(<div style={{minHeight:"100vh",background:C.monBg,color:"#fff",display:"flex",flexDirection:"column"}}><div style={{background:C.monHeader,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}><button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.main,display:"flex"}}><Ico n="back" s={22}/></button><span style={{flex:1,fontSize:17,fontWeight:600,color:"#fff"}}>Transfer history</span><div style={{width:30}}/></div><div style={{flex:1,overflowY:"auto",padding:"12px 16px 40px"}}><div style={{display:"flex",gap:2,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:3,marginBottom:16}}>{[["day","Day"],["week","Week"],["month","Month"],["year","Year"],["all","All"]].map(([v,l])=><button key={v} onClick={()=>setPeriod(v)} style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:period===v?C.monCard2:"transparent",color:period===v?C.green:C.dim}}>{l}</button>)}</div>{filtered.length===0&&<p style={{textAlign:"center",padding:"40px 0",color:C.dim}}>No transfers</p>}{filtered.sort((a,b)=>b.date.localeCompare(a.date)).map(t=>{const from=accounts.find(a=>a.id===t.from_id);const to=accounts.find(a=>a.id===t.to_id);return(<div key={t.id} style={{background:C.monCard,borderRadius:14,padding:"14px",marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:14,fontWeight:500,color:C.main}}>{from?.name} → {to?.name}</span><span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{fmtM(t.amount,t.from_currency)}</span></div><div style={{display:"flex",gap:12,fontSize:12,color:C.dim,marginBottom:8}}><span>{t.date}</span>{t.rate&&<span>Rate: {t.rate}</span>}{t.fee>0&&<span style={{color:"#f87171"}}>Fee: {fmtM(t.fee,t.from_currency)}</span>}</div>{confirmCancel===t.id?(<div style={{display:"flex",gap:8}}><button onClick={()=>cancelTransfer(t)} style={{flex:1,padding:"8px",borderRadius:10,background:"rgba(244,67,54,0.15)",border:"1px solid rgba(244,67,54,0.3)",color:C.red,fontSize:13,fontWeight:600,cursor:"pointer"}}>Confirm cancel</button><button onClick={()=>setConfirmCancel(null)} style={{flex:1,padding:"8px",borderRadius:10,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,color:C.mid,fontSize:13,cursor:"pointer"}}>Keep</button></div>):(<button onClick={()=>setConfirmCancel(t.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20,background:"rgba(244,67,54,0.08)",border:"1px solid rgba(244,67,54,0.2)",color:"rgba(244,67,54,0.7)",fontSize:12,cursor:"pointer"}}><Ico n="undo" s={14} c="rgba(244,67,54,0.7)"/>Cancel transfer</button>)}</div>);})}</div></div>);
}

/* ══════════════════════════════════════════════════════════════
   ROOT APP — TOP LEVEL (Planner ↔ Money Manager)
══════════════════════════════════════════════════════════════ */
export default function App() {
  const [section, setSection] = useState("planner"); // planner | money

  return (
      <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>
        <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
        input{caret-color:#6366f1;}
        ::placeholder{color:rgba(255,255,255,0.25);}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=date],input[type=time]{color-scheme:dark;}
        textarea{caret-color:#6366f1;}
      `}</style>

        {/* Section switcher */}
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, display:"flex", background:"rgba(8,8,20,0.97)", backdropFilter:"blur(16px)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"6px 16px 6px" }}>
          <button onClick={() => setSection("planner")} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:section==="planner"?"rgba(99,102,241,0.2)":"transparent", color:section==="planner"?"#a5b4fc":"rgba(255,255,255,0.3)", transition:"all 0.2s" }}>
            📋 Планнер
          </button>
          <button onClick={() => setSection("money")} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:section==="money"?"rgba(76,175,80,0.2)":"transparent", color:section==="money"?"#86efac":"rgba(255,255,255,0.3)", transition:"all 0.2s" }}>
            💰 Финансы
          </button>
        </div>

        {/* Content — padded for top switcher */}
        <div style={{ paddingTop:50 }}>
          {section==="planner" && <PlannerSection/>}
          {section==="money"   && <MoneyManagerSection/>}
        </div>
      </div>
  );
}
