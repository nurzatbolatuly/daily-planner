import { BottomSheet } from "./BottomSheet";
import { C } from "../constants/theme";

// tone: "danger" (по умолчанию, красный — удаление и другое разрушительное) | "confirm"
// (зелёный — подтверждение действия, которое не удаляет данные, но его сложно/нельзя
// откатить одним тапом, напр. "отметить выполненным без счёта", см. CashflowPage).
// disabled/error — для случаев, когда onConfirm асинхронный (см. useSave в вызывающем месте).
export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel = "Удалить", tone = "danger", disabled = false, error = null }) {
  const toneStyle = tone === "confirm"
    ? { background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.4)", color: C.green }
    : { background: "rgba(244,67,54,0.15)", border: "1px solid rgba(244,67,54,0.4)", color: C.red };
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {message && <p style={{ margin:"0 0 20px", fontSize:14, color:C.mid, lineHeight:1.5 }}>{message}</p>}
      {error && <p style={{ margin:"0 0 12px", fontSize:13, color:C.red, textAlign:"center" }}>{error}</p>}
      <button
        onClick={onConfirm}
        disabled={disabled}
        style={{ width:"100%", padding:"14px", borderRadius:30, ...toneStyle, opacity: disabled ? 0.6 : 1, fontSize:15, fontWeight:600, cursor: disabled ? "default" : "pointer", marginBottom:10 }}
      >
        {confirmLabel}
      </button>
      <button
        onClick={onClose}
        style={{ width:"100%", padding:"14px", borderRadius:30, background:"rgba(255,255,255,0.06)", border:"none", color:C.mid, fontSize:15, fontWeight:600, cursor:"pointer" }}
      >
        Отмена
      </button>
    </BottomSheet>
  );
}
