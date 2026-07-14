import { useState, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { SAVINGS_PURPOSES, BALANCE_ADJUSTMENT_NOTE } from "../../../constants/money";
import { localDate } from "../../../utils/date";
import { fmtM, fmtBal, fmtAmtAuto, fmtGrams, isCommodity } from "../../../utils/format";
import { RU_MON_GEN, RU_MONTHS_S } from "../../../constants/locale";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { PageHeader } from "../../../components/PageHeader";

function fmtGroupDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${RU_MON_GEN[m - 1]} ${y}`;
}

// Тот же паттерн период-табов (день/неделя/месяц/год/всё), что и в TransferHistoryPageMon,
// но работает над уже нормализованной строкой "YYYY-MM-DD" (entry.date), а не raw created_at,
// т.к. здесь entries смешивают transactions (date) и transfers (created_at → localDate).
function getPeriodFilter(period, offset, now) {
  if (period === "day") {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const str = localDate(d);
    const label = offset === 0 ? "Сегодня" : offset === -1 ? "Вчера" : str;
    return { fn: e => e.date === str, label };
  }
  if (period === "week") {
    const mon = new Date(now);
    const dow = mon.getDay() || 7;
    mon.setDate(mon.getDate() - dow + 1 + offset * 7);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    const fmt = d => `${d.getDate()} ${RU_MONTHS_S[d.getMonth()]}`;
    return { fn: e => { const d = new Date(e.date); return d >= mon && d <= sun; }, label: `${fmt(mon)} – ${fmt(sun)}` };
  }
  if (period === "month") {
    const total = now.getFullYear() * 12 + now.getMonth() + offset;
    const y = Math.floor(total / 12);
    const m = total % 12;
    return { fn: e => { const d = new Date(e.date); return d.getFullYear() === y && d.getMonth() === m; }, label: `${RU_MON_GEN[m]} ${y}` };
  }
  if (period === "year") {
    const y = now.getFullYear() + offset;
    return { fn: e => new Date(e.date).getFullYear() === y, label: String(y) };
  }
  return { fn: () => true, label: "Всё время" };
}

// Долг самому себе (снятие с накопительного счёта). Правило то же, что в
// utils/debtUtils.computeDebtState: исходящий с savings-счёта создаёт долг,
// входящий на savings-счёт с флагом is_debt_repayment — гасит его.
function selfDebtBadge(t, account) {
  if (!SAVINGS_PURPOSES.includes(account.purpose)) return null;
  if (t.from_id === account.id) return { label: "Долг самому себе", color: C.amber, bg: "rgba(245,158,11,0.12)" };
  if (t.to_id === account.id && t.is_debt_repayment) return { label: "Возврат долга себе", color: C.amber, bg: "rgba(245,158,11,0.12)" };
  return null;
}

// Долги людям: транзакция привязана к debt_events через transaction_id.
// "they_paid" пишется только DebtFormPage (направление "Я должен" — взял в долг).
// "return" пишется только ReturnModal — направление определяется типом транзакции
// (income = мне вернули, expense = я вернул).
function personDebtBadge(tx, debtEvents, debtPeople) {
  const evt = debtEvents.find(e => e.transaction_id === tx.id && (e.type === "they_paid" || e.type === "return"));
  if (!evt) return null;
  const name = debtPeople.find(p => p.id === evt.person_id)?.name || "—";
  if (evt.type === "they_paid") return { label: `Взял в долг у ${name}`, color: C.errorLight, bg: "rgba(244,67,54,0.12)" };
  if (tx.type === "income") return { label: `${name} вернул(а) долг`, color: C.green, bg: "rgba(76,175,80,0.12)" };
  return { label: `Вернул(а) долг · ${name}`, color: C.blue, bg: "rgba(96,165,250,0.12)" };
}

function DebtBadge({ badge }) {
  if (!badge) return null;
  return (
    <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, padding: "2px 7px", borderRadius: 6 }}>
      {badge.label}
    </span>
  );
}

function TxRow({ tx, cat, badge, onClick }) {
  const title = cat?.name || (badge ? "Долг" : (tx.note || "Без категории"));
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 8, background: C.monCard, cursor: "pointer" }}>
      <CatIcon k={cat?.icon || "other"} size={44} color={cat?.color || C.dim}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
        {tx.note && !badge && <p style={{ margin: 0, fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.note}</p>}
        <DebtBadge badge={badge}/>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: tx.type === "income" ? C.emerald : "#fff", flexShrink: 0 }}>
        {tx.type === "income" ? "+" : ""}{fmtM(tx.amount, tx.currency)}
      </p>
    </div>
  );
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
        <DebtBadge badge={badge}/>
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
export function AccDetailPage({ account, transactions, transfers, accounts, expCats, incCats, debtEvents, debtPeople, navigate, onBack }) {
  const acc = accounts.find(a => a.id === account.id) || account;
  const [period, setPeriod] = useState("month");
  const [periodOffset, setPeriodOffset] = useState(0);
  const now = new Date();

  const entries = useMemo(() => {
    const txEntries = transactions
      .filter(t => t.account_id === acc.id)
      .map(t => ({ kind: "tx", data: t, date: t.date, sortAt: t.created_at || t.date }));
    const trEntries = transfers
      .filter(t => t.from_id === acc.id || t.to_id === acc.id)
      .map(t => ({ kind: "transfer", data: t, date: localDate(t.created_at), sortAt: t.created_at }));
    return [...txEntries, ...trEntries].sort((a, b) => String(b.sortAt || "").localeCompare(String(a.sortAt || "")));
  }, [transactions, transfers, acc.id]);

  const changePeriod = (p) => { setPeriod(p); setPeriodOffset(0); };
  const { fn: periodFn, label: periodLabel } = getPeriodFilter(period, periodOffset, now);
  const filtered = period === "all" ? entries : entries.filter(periodFn);

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
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, marginBottom: 8 }}>
          {[["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["year", "Год"], ["all", "Все"]].map(([v, l]) => (
            <button key={v} onClick={() => changePeriod(v)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: period === v ? C.monCard2 : "transparent", color: period === v ? C.green : C.dim }}>{l}</button>
          ))}
        </div>

        {period !== "all" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setPeriodOffset(o => o - 1)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", display: "flex" }}>
              <Ico n="back" s={18} c={C.mid}/>
            </button>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center" }}>{periodLabel}</span>
            {periodOffset < 0 && (
              <button onClick={() => setPeriodOffset(0)} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(76,175,80,0.12)", border: "1px solid rgba(76,175,80,0.3)", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Сейчас</button>
            )}
            <button onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", display: "flex", opacity: periodOffset >= 0 ? 0.2 : 1 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {filtered.length === 0 && <p style={{ textAlign: "center", padding: "40px 0", color: C.dim }}>Нет операций</p>}

        {sortedDates.map(date => (
          <div key={date}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: C.dim }}>{fmtGroupDate(date)}</p>
            {grouped[date].map(e => e.kind === "tx"
              ? <TxRow key={e.data.id} tx={e.data} cat={catFor(e.data)} badge={personDebtBadge(e.data, debtEvents, debtPeople)} onClick={() => navigate("editTx", e.data)}/>
              : <TransferRow key={e.data.id} t={e.data} acc={acc} accounts={accounts} badge={selfDebtBadge(e.data, acc)} onClick={() => navigate("editTransfer", e.data)}/>
            )}
            <div style={{ marginBottom: 16 }}/>
          </div>
        ))}
      </div>
    </div>
  );
}
