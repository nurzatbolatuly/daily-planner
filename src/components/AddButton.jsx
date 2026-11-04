import { C } from "../constants/theme";
import { Ico } from "./Ico";

const TONES = {
  green: { color: C.green, border: C.greenBorderStrong },
  blue:  { color: C.blue,  border: C.infoBorderStrong },
};

// Пунктирная кнопка «+ Добавить …» / второстепенного действия. Списки ставят её НАД элементами:
// добавлять, не пролистывая до конца. Отступы снаружи задаёт страница через style.
// icon={null} — без иконки (для действий вроде «Досрочное погашение»).
export function AddButton({ children, onClick, tone = "green", icon = "plus", style }) {
  const t = TONES[tone] || TONES.green;
  return (
    <button type="button" onClick={onClick}
      style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed ${t.border}`,
        color:t.color, fontSize:14, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, ...style }}>
      {icon && <Ico n={icon} s={16} c={t.color}/>}{children}
    </button>
  );
}
