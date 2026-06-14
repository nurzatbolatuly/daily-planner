import { BottomSheet } from "./BottomSheet";
import { C } from "../constants/theme";

export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel = "Удалить" }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {message && <p style={{ margin:"0 0 20px", fontSize:14, color:C.mid, lineHeight:1.5 }}>{message}</p>}
      <button
        onClick={onConfirm}
        style={{ width:"100%", padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.15)", border:"1px solid rgba(244,67,54,0.4)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer", marginBottom:10 }}
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
