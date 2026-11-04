import { useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { SAVINGS_PURPOSES, BALANCE_ADJUSTMENT_NOTE } from "../../../constants/money";
import { localDate } from "../../../utils/date";
import { fmtM, fmtBal, fmtAmtAuto, fmtGrams, isCommodity, fmtDateLong } from "../../../utils/format";
import { usePeriodFilter } from "../../../hooks/usePeriodFilter";
import { PeriodSwitcher } from "../../../components/PeriodSwitcher";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { TxHistoryRow, TxBadge } from "../components/TxHistoryRow";
import { txBadge } from "../../../utils/txBadges";
import { PageHeader } from "../../../components/PageHeader";

// Долг самому себе (снятие с накопительного счёта). Правило то же, что в
// utils/debtUtils.computeDebtState: исходящий с savings-счёта создаёт долг,
// входящий на savings-счёт с флагом is_debt_repayment — гасит его.
function selfDebtBadge(t, account) {
  if (!SAVINGS_PURPOSES.includes(account.purpose)) return null;
  if (t.from_id === account.id) return { label: "Долг самому себе", tone: "warn" };
  if (t.to_id === account.id && t.is_debt_repayment) return { label: "Возврат долга себе", tone: "warn" };
  return null;
}

function TransferRow({ t, acc, accounts, badge, onClick }) {
  if (t.is_adjustment) {
    const delta = t.to_amt ?? t.amount;
    const isPos = delta >= 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 8, background: C.monCard }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.5 }}><Ico n="edit" s={18} c={C.dim}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main }}>{BALANCE_ADJUSTMENT_NOTE}</p>
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: isPos ? C.emerald : C.errorLight, flexShrink: 0 }}>
          {isPos ? "+" : "−"}{fmtM(Math.abs(delta), t.from_currency)}
        </p>
      </div>
    );
  }

  const isOutgoing = t.from_id === acc.id;
  const other = accounts.find(a => a.id === (isOutgoing ? t.to_id : t.from_id));
  const amt = isOutgoing ? t.amount : (t.to_amt ?? t.amount);
  const cur = isOutgoing ? t.from_currency : (t.to_currency || t.from_currency);

  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 8, background: C.monCard, cursor: "pointer" }}>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ico n="transfer" s={18} c={C.mid}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isOutgoing ? `→ ${other?.name ?? "—"}` : `← ${other?.name ?? "—"}`}
        </p>
        {(t.note || (isOutgoing && t.fee > 0)) && (
          <div style={{ display: "flex", gap: 6, fontSize: 12, color: C.dim, overflow: "hidden" }}>
            {t.note && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</span>}
            {t.note && isOutgoing && t.fee > 0 && <span>·</span>}
            {isOutgoing && t.fee > 0 && <span style={{ color: C.errorLight, flexShrink: 0 }}>−{fmtM(t.fee, t.from_currency)} комиссия</span>}
          </div>
        )}
        <TxBadge badge={badge}/>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: isOutgoing ? "#fff" : C.emerald, flexShrink: 0 }}>
        {isOutgoing ? "−" : "+"}{fmtM(amt, cur)}
      </p>
    </div>
  );
}

// Полная история операций одного счёта: транзакции (доходы/расходы) + переводы,
// где счёт — любая из сторон. Долги выделяются бейджами поверх обычных мест:
// долг самому себе (снятие с накопительного счёта) и долги людям (взял/вернул/мне вернули).
export function AccDetailPage({ account, transactions, transfers, accounts, expCats, incCats, debtEvents, debtPeople, sharedTxIndex = null, navigate, onBack }) {
  const acc = accounts.find(a => a.id === account.id) || account;
  const periodState = usePeriodFilter();

  const entries = useMemo(() => {
    const txEntries = transactions
      .filter(t => t.account_id === acc.id)
      .map(t => ({ kind: "tx", data: t, date: t.date, sortAt: t.created_at || t.date }));
    const trEntries = transfers
      .filter(t => t.from_id === acc.id || t.to_id === acc.id)
      .map(t => ({ kind: "transfer", data: t, date: localDate(t.created_at), sortAt: t.created_at }));
    return [...txEntries, ...trEntries].sort((a, b) => String(b.sortAt || "").localeCompare(String(a.sortAt || "")));
  }, [transactions, transfers, acc.id]);

  const { matches: inPeriod } = periodState;
  const filtered = useMemo(() => entries.filter(e => inPeriod(e.date)), [entries, inPeriod]);

  const grouped = filtered.reduce((g, e) => { (g[e.date] = g[e.date] || []).push(e); return g; }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const catFor = (tx) => (tx.type === "expense" ? expCats : incCats).find(c => c.id === tx.category_id);

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={acc.name}
        onBack={() => onBack(false)}
        right={<button onClick={() => navigate("editAcc", acc)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}><Ico n="edit" s={20} c={C.green}/></button>}
      />

      <div style={{ padding: "18px 16px 6px", display: "flex", alignItems: "center", gap: 14 }}>
        <CatIcon k={acc.icon} size={52} color={acc.color}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, color: C.dim }}>Баланс</p>
          <p style={{ margin: "2px 0 0", fontSize: 24, fontWeight: 800, color: acc.balance < 0 ? C.errorLight : "#fff" }}>
            {isCommodity(acc.currency)
              ? (acc.avg_rate ? fmtBal(acc.balance * acc.avg_rate, BASE_CUR) : fmtGrams(acc.balance))
              : fmtBal(acc.balance, acc.currency)}
          </p>
          {isCommodity(acc.currency) && acc.avg_rate != null && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: C.dim }}>{fmtGrams(acc.balance)} · {fmtAmtAuto(acc.avg_rate)} ₸/г</p>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 40px" }}>
        <PeriodSwitcher {...periodState}/>

        {filtered.length === 0 && <p style={{ textAlign: "center", padding: "40px 0", color: C.dim }}>Нет операций</p>}

        {sortedDates.map(date => (
          <div key={date}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: C.dim }}>{fmtDateLong(date)}</p>
            {grouped[date].map(e => e.kind === "tx"
              ? <TxHistoryRow key={e.data.id} tx={e.data} cat={catFor(e.data)} badge={txBadge(e.data, { sharedIndex: sharedTxIndex, debtEvents, debtPeople })} onClick={() => navigate("editTx", e.data)}/>
              : <TransferRow key={e.data.id} t={e.data} acc={acc} accounts={accounts} badge={selfDebtBadge(e.data, acc)} onClick={() => navigate("editTransfer", e.data)}/>
            )}
            <div style={{ marginBottom: 16 }}/>
          </div>
        ))}
      </div>
    </div>
  );
}
