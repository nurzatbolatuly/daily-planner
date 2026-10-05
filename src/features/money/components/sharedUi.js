import { C } from "../../../constants/theme";

// Общие стили экранов «Общих расходов» — формы счёта и перевода, шторки участников и гостей.
// Одно место вместо копий инлайн-стилей в каждом файле. fontSize полей — 16 (iOS-автозум, §12.0).

export const fieldInput = (error = false) => ({
  width:"100%", boxSizing:"border-box", background:C.fieldBg,
  border:`1px solid ${error ? C.errorBorder : C.border}`, borderRadius:10,
  padding:"12px 14px", color:"#fff", fontSize:16, outline:"none",
});

// Чип-кнопка: «＋ Человек», «за 1», подсказка имени. on — выбран.
export const chip = (on = false) => ({
  padding:"8px 14px", borderRadius:20, cursor:"pointer", fontSize:13, fontWeight:600,
  border:`1px solid ${on ? C.green : C.border}`,
  background: on ? C.greenTintStrong : C.fieldBg,
  color: on ? C.green : C.mid,
});

export const chipRow = { display:"flex", flexWrap:"wrap", gap:8 };

// Кнопки на всю ширину в шторках. tone: primary | secondary | danger.
const SHEET_BTN_TONE = {
  primary:   { background:C.green, color:"#fff" },
  secondary: { background:C.fieldBg, color:C.mid },
  danger:    { background:C.errorTint, color:C.red },
};
export const sheetBtn = (tone = "primary", disabled = false) => ({
  width:"100%", padding:14, borderRadius:30, border:"none", fontSize:15, fontWeight:600,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
  display:"flex", alignItems:"center", justifyContent:"center", gap:6,
  ...SHEET_BTN_TONE[tone],
});

// Сегментный переключатель (Платил: Я / участник, направление перевода).
export const segmentWrap = { display:"flex", borderRadius:12, background:C.segmentBg, padding:4 };
export const segmentBtn = on => ({
  flex:1, minWidth:0, padding:"10px 6px", borderRadius:9, border:"none", cursor:"pointer", fontSize:13, fontWeight:700,
  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
  background: on ? C.green : "transparent", color: on ? "#fff" : C.dim,
});

export const hintText = { margin:"0 0 16px", fontSize:11, color:C.dim, lineHeight:1.4 };
export const errorText = { margin:"0 0 12px", fontSize:12, color:C.errorLight };
