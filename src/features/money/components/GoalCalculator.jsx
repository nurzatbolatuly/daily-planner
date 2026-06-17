import { useState } from "react";
import { C } from "../../../constants/theme";
import { NumInput } from "../../../components/NumInput";
import { fmtAmtAuto } from "../../../utils/format";

export function GoalCalculator({ sym, defaultAmt, monthsLeft, color }) {
  const [dir, setDir] = useState("month");
  const [amt, setAmt] = useState(String(Math.round(defaultAmt || 0)));
  const [snd, setSnd] = useState(String(Math.round(monthsLeft || 12)));

  const amtN      = parseFloat(amt) || 0;
  const sndN      = Math.max(parseFloat(snd) || 1, 0.01);
  const rawResult = amtN / sndN;
  const result    = dir === "month" ? rawResult : Math.ceil(Math.round(rawResult * 100) / 100);

  const toggle = () => {
    const next = dir === "month" ? "months" : "month";
    if (result > 0 && isFinite(result)) setSnd(String(Math.round(result)));
    setDir(next);
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.07)",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 10px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div style={{ background: C.monCard, borderRadius: 16, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>Калькулятор</span>
        <button
          onClick={toggle}
          style={{
            background: "rgba(96,165,250,0.1)", border: `1px solid rgba(96,165,250,0.25)`,
            borderRadius: 8, padding: "4px 12px", color: C.blue,
            fontSize: 15, cursor: "pointer", lineHeight: 1,
          }}
        >
          ⇄
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div style={{ flex: 2 }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: C.dim }}>Сумма</p>
          <NumInput value={amt} onChange={setAmt} style={inputStyle}/>
        </div>

        <span style={{ color: C.dim, fontSize: 18, paddingBottom: 10, flexShrink: 0 }}>÷</span>

        <div style={{ flex: 1.5 }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: C.dim }}>
            {dir === "month" ? "Месяцев" : "Плат./мес"}
          </p>
          <NumInput value={snd} onChange={setSnd} style={inputStyle}/>
        </div>

        <span style={{ color: C.dim, fontSize: 16, paddingBottom: 10, flexShrink: 0 }}>=</span>

        <div style={{ flex: 1.8, textAlign: "right", paddingBottom: 2 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: color, lineHeight: 1.15 }}>
            {isFinite(result) && result > 0
              ? dir === "month"
                ? `${sym}${fmtAmtAuto(result)}`
                : `${Math.round(result)}`
              : "—"
            }
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.dim }}>
            {dir === "month" ? "в месяц" : "месяцев"}
          </p>
        </div>
      </div>
    </div>
  );
}
