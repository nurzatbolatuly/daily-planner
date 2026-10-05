import { C } from "../../../constants/theme";
import { CatIcon } from "../../../components/CatIcon";
import { fmtM } from "../../../utils/format";

// Цвета бейджей по tone (utils/txBadges.js) — одно место для истории счёта и общей истории.
const BADGE_TONES = {
  danger: { color: C.errorLight, bg: C.errorTint },
  warn:   { color: C.amber,      bg: "rgba(245,158,11,0.12)" },
  ok:     { color: C.green,      bg: C.greenTintStrong },
  info:   { color: C.blue,       bg: "rgba(96,165,250,0.12)" },
  shared: { color: C.violet,     bg: "rgba(167,139,250,0.14)" },
};

export function TxBadge({ badge, style }) {
  if (!badge) return null;
  const tone = BADGE_TONES[badge.tone] || BADGE_TONES.info;
  return (
    <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 600, color: tone.color, background: tone.bg, padding: "2px 7px", borderRadius: 6,
                   maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...style }}>
      {badge.label}
    </span>
  );
}

// Строка транзакции в истории (HistoryPageMon, AccDetailPage). Без категории (перевод, займ) —
// заголовок по бейджу. Сумма — полная, как списано со счёта (история — не статистика).
export function TxHistoryRow({ tx, cat, badge, onClick }) {
  const title = cat?.name || (badge ? (badge.tone === "shared" ? "Общие расходы" : "Долг") : (tx.note || "Без категории"));
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 8, background: C.monCard, cursor: "pointer" }}>
      <CatIcon k={cat?.icon || "other"} size={44} color={cat?.color || C.dim}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
        {tx.note && !badge && <p style={{ margin: 0, fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.note}</p>}
        <TxBadge badge={badge}/>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: tx.type === "income" ? C.emerald : "#fff", flexShrink: 0 }}>
        {tx.type === "income" ? "+" : ""}{fmtM(tx.amount, tx.currency)}
      </p>
    </div>
  );
}
