import { useEffect } from "react";
import { C } from "../constants/theme";

export function BottomSheet({ open, onClose, title, right, children }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="overlay-in"
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
      onClick={onClose}
    >
      <div
        className="sheet-up"
        style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px calc(32px + env(safe-area-inset-bottom, 0px))", maxHeight:"70dvh", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 16px" }}/>
        {(title || right) && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            {title && <p style={{ margin:0, fontSize:16, fontWeight:600, color:"#fff" }}>{title}</p>}
            {right}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
