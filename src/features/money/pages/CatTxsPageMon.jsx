import { useMemo } from "react";
import { C } from "../../../constants/theme";
import { fmtDateShort, fmtM } from "../../../utils/format";
import { sharedTxBadge, virtualTxLabel } from "../../../utils/txBadges";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

// Транзакции категории за период. txs — «мои» (personalTransactions): сумма — моя доля, как в
// итоге категории на Главной; виртуальные строки «мою долю оплатил другой» — тоже здесь (§11.1).
// rawById — исходные транзакции: «всего» (списано со счёта) и правка открывают их, а не долю.
export function CatTxsPageMon({ cat, txs, rawById, sharedTxIndex, periodLabel, txType, accounts, navigate, onBack }) {
  const { grouped, sortedDates } = useMemo(() => {
    const g = {};
    txs.forEach(t => { if (!g[t.date]) g[t.date] = []; g[t.date].push(t); });
    return { grouped: g, sortedDates: Object.keys(g).sort((a, b) => b.localeCompare(a)) };
  }, [txs]);


  return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))", color: "#fff" }}>
      <div style={{ background: C.monHeader, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: C.main, display: "flex" }}>
          <Ico n="back" s={22}/>
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>{cat.name}</p>
          <p style={{ margin: 0, fontSize: 12, color: C.dim }}>{periodLabel}</p>
        </div>
        <CatIcon k={cat.icon || "other"} size={36} color={cat.color || C.dim}/>
      </div>

      <div style={{ padding: "10px 12px" }}>
        {sortedDates.length === 0 && (
          <p style={{ textAlign: "center", padding: "40px 0", color: C.dim, fontSize: 13 }}>Нет транзакций</p>
        )}
        {sortedDates.map(date => (
          <div key={date} style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.dim, margin: "0 0 6px" }}>{fmtDateShort(date)}</p>
            {grouped[date].map(tx => {
              const acc = accounts.find(a => a.id === tx.account_id);
              const raw = rawById.get(tx.id);
              const isPartial = !!raw && Number(raw.amount) !== Number(tx.amount);
              const sharedLabel = tx.virtual ? virtualTxLabel(tx, sharedTxIndex) : sharedTxBadge(tx, sharedTxIndex)?.label;
              const sub = tx.virtual ? sharedLabel : [acc?.name || "—", sharedLabel || tx.note].filter(Boolean).join(" · ");
              return (
                <div key={tx.id} onClick={() => navigate("editTx", raw || tx)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 4, background: C.monCard, cursor: "pointer" }}>
                  <CatIcon k={cat.icon || "other"} size={44} color={cat.color || "#607d8b"}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main }}>{cat.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: tx.virtual ? C.violet : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: txType === "income" ? C.emerald : "#fff" }}>{txType === "income" ? "+" : ""}{fmtM(tx.amount, tx.currency)}</p>
                    {isPartial && <p style={{ margin: 0, fontSize: 11, color: C.dim }}>всего {fmtM(raw.amount, raw.currency)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
