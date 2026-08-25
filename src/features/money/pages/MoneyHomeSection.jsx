import { useState, useMemo, memo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { SAVINGS_PURPOSES, ACC_PURPOSES } from "../../../constants/money";
import { pad, todayStr } from "../../../utils/date";
import { getSym, fmtAmtAuto, fmtBal, toBase, ratesFromAccounts, calcTotalBalance, calcCatDelta } from "../../../utils/format";
import { withPersonalAmounts } from "../../../utils/debtLedger";
import { getSavedOrder } from "../../../utils/accountOrder";
import { exportTransactionsXLSX } from "../../../utils/export";
import { projectRecurringItems, projectPlanItems, buildDayMap, addMonths } from "../../../utils/cashflowTimeline";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { BottomSheet } from "../../../components/BottomSheet";
import { DonutChart } from "../components/DonutChart";
import { CashflowRuler } from "../components/CashflowRuler";

export const MoneyHomeSection = memo(function MoneyHomeSection({ data, navigate, onGoToBudget }) {
  const { accounts, transactions: rawTransactions, transfers, expCats, incCats, monthPlans, debtEvents, recurring, loans, plannedIncomes, plannedExpenses } = data;
  // Личная доля вместо полной суммы для сплит-расходов — иначе чужие доли завышают
  // категории/бюджет/over-budget баннер (см. utils/debtLedger.withPersonalAmounts).
  const transactions = useMemo(() => withPersonalAmounts(rawTransactions, debtEvents), [rawTransactions, debtEvents]);

  const [txType, setTxType]           = useState("expense");
  const [period, setPeriod]           = useState("month");
  const [viewMonth, setViewMonth]     = useState(new Date().getMonth());
  const [viewYear, setViewYear]       = useState(new Date().getFullYear());
  const [rangeStart, setRangeStart]   = useState("");
  const [rangeEnd, setRangeEnd]       = useState("");
  const [selAccId, setSelAccId]       = useState(null);
  const [showAccPicker, setShowAccPicker] = useState(false);
  const [showCalendar, setShowCalendar]   = useState(false);
  const [txFilter, setTxFilter]           = useState({ sortBy: "amount_desc", catIds: [] });
  const [showFilter, setShowFilter]       = useState(false);

  const sym   = getSym(BASE_CUR);
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);

  const totalBal = useMemo(() =>
    selAccId ? (accounts.find(a => a.id === selAccId)?.balance || 0) : calcTotalBalance(accounts),
    [accounts, selAccId]
  );

  const cats = txType === "expense" ? expCats : incCats;

  const typeTxs = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (selAccId && t.account_id !== selAccId) return false;
      const d = new Date(t.date);
      if (period === "day")   return t.date === todayStr();
      if (period === "week")  { const w = new Date(); w.setDate(w.getDate() - 7); return d >= w; }
      if (period === "month") return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
      if (period === "year")  return d.getFullYear() === viewYear;
      if (period === "range" && rangeStart && rangeEnd) return t.date >= rangeStart && t.date <= rangeEnd;
      return true;
    });
    return filtered.filter(t => t.type === txType);
  }, [transactions, selAccId, period, txType, viewMonth, viewYear, rangeStart, rangeEnd]);

  // Apply category filter from txFilter
  const filteredTypeTxs = useMemo(() => {
    if (!txFilter.catIds.length) return typeTxs;
    return typeTxs.filter(t => txFilter.catIds.includes(t.category_id));
  }, [typeTxs, txFilter.catIds]);

  const catData = useMemo(() => {
    const rows = cats
      .map(c => ({ ...c, val: filteredTypeTxs.filter(t => t.category_id === c.id).reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0) }))
      .filter(c => c.val > 0);
    if (txFilter.sortBy === "amount_asc") return rows.sort((a, b) => a.val - b.val);
    return rows.sort((a, b) => b.val - a.val);
  }, [cats, filteredTypeTxs, rates, txFilter.sortBy]);

  const grandTotal = useMemo(() => catData.reduce((s, c) => s + c.val, 0), [catData]);

  // Delta % per category (current month vs previous month, always)
  const catDelta = useMemo(() => calcCatDelta(transactions, expCats, accounts), [transactions, expCats, accounts]);

  // Over-budget banner for current month
  const overBudgetData = useMemo(() => {
    const now = new Date();
    const curMk = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const curPlans = monthPlans.filter(p => p.month === curMk);
    if (!curPlans.length) return null;

    const planInc = curPlans
      .filter(p => p.type === "income")
      .reduce((s, p) => s + toBase(p.plan, p.plan_currency || BASE_CUR, rates), 0);

    const curTxs = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const actExp = curTxs.filter(t => t.type === "expense")
      .reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);

    const savAccIds = accounts.filter(a => SAVINGS_PURPOSES.includes(a.purpose)).map(a => a.id);
    const actSav = (transfers || [])
      .filter(t => {
        const d = new Date(t.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && !t.is_adjustment && savAccIds.includes(t.to_id);
      })
      .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates), 0);

    const overBy = actExp + actSav - planInc;
    return planInc > 0 && overBy > 0 ? { overBy } : null;
  }, [monthPlans, transactions, transfers, accounts, rates]);

  // Мини-лента "Денежный поток" — тот же движок, что и на полной странице (CashflowPage), просто
  // узкое окно вперёд и клик по чему угодно ведёт на полную страницу. Начинается сегодня — прошлое
  // на ленте не показываем (см. CashflowPage.rulerRange); у виджета нет своего списка "ближайшие
  // события", поэтому здесь, в отличие от полной страницы, не нужен отдельный более широкий диапазон
  // для проекции назад ради просроченных.
  const cashflowRange = useMemo(() => ({ start: todayStr(), end: addMonths(todayStr(), 2) }), []);
  const cashflowProjectedItems = useMemo(() => [
    ...projectRecurringItems(recurring, loans, cashflowRange.start, cashflowRange.end),
    ...projectPlanItems(monthPlans, cashflowRange.start, cashflowRange.end),
  ], [recurring, loans, monthPlans, cashflowRange]);
  const cashflowDayMap = useMemo(
    () => buildDayMap(plannedIncomes, plannedExpenses, cashflowProjectedItems),
    [plannedIncomes, plannedExpenses, cashflowProjectedItems]
  );

  const prevP = () => {
    if (period === "month") { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
    else setViewYear(y => y - 1);
  };
  const nextP = () => {
    if (period === "month") { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }
    else setViewYear(y => y + 1);
  };
  const periodLabel = period === "month" ? `${RU_MONTHS[viewMonth]} ${viewYear}` : period === "year" ? String(viewYear) : period === "day" ? "Сегодня" : period === "week" ? "Эта неделя" : rangeStart && rangeEnd ? `${rangeStart} — ${rangeEnd}` : "Период";
  const selAcc = accounts.find(a => a.id === selAccId);

  const isFilterActive = !!(txFilter.catIds.length || txFilter.sortBy !== "amount_desc");

  const exportCSV = () => {
    exportTransactionsXLSX({ txs: typeTxs, catData, cats, accounts, txType, periodLabel, filename: "transactions.xlsx" });
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: C.monHeader, padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ width: 30 }}/>
          <div style={{ flex: 1, textAlign: "center" }}>
            <button onClick={() => setShowAccPicker(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{selAcc ? selAcc.name : "Все счета"}</span>
              <Ico n="chevD" s={14} c={C.mid}/>
            </button>
            <p style={{ margin: "2px 0 0", fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>{fmtBal(totalBal, BASE_CUR)}</p>
          </div>
          <button onClick={exportCSV} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
            <Ico n="report" s={22} c={C.mid}/>
          </button>
        </div>
        <div style={{ display: "flex" }}>
          {[["expense", "РАСХОДЫ"], ["income", "ДОХОДЫ"]].map(([v, l]) => (
            <button key={v} onClick={() => setTxType(v)}
              style={{ flex: 1, padding: "12px 0", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: txType === v ? "#fff" : C.dim, borderBottom: txType === v ? "2px solid #fff" : "2px solid transparent" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Over-budget banner */}
      {overBudgetData && (
        <div onClick={onGoToBudget}
          style={{ margin: "12px 16px 0", padding: "10px 14px", borderRadius: 12, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", cursor: onGoToBudget ? "pointer" : "default" }}>
          <p style={{ margin: 0, fontSize: 12, color: C.errorLight }}>
            ⚠ Расходы превышают бюджет на {sym}{fmtAmtAuto(overBudgetData.overBy)} — посмотреть Бюджет →
          </p>
        </div>
      )}

      {/* Денежный поток — мини-лента */}
      <div onClick={() => navigate("cashflow")} style={{ margin: "12px 12px 0", background: C.monCard, borderRadius: 20, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 8px" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Денежный поток</span>
          <Ico n="chevR" s={16} c={C.dim}/>
        </div>
        <CashflowRuler rangeStart={cashflowRange.start} rangeEnd={cashflowRange.end} dayMap={cashflowDayMap} onTapDay={() => navigate("cashflow")} compact/>
      </div>

      {/* Chart card */}
      <div style={{ margin: "12px 12px 0", background: C.monCard, borderRadius: 20 }}>
        <div style={{ display: "flex", padding: "10px 12px 0", gap: 2 }}>
          {[["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["year", "Год"], ["range", "Период"]].map(([v, l]) => (
            <button key={v} onClick={() => { setPeriod(v); if (v === "range") setShowCalendar(true); }}
              style={{ flex: 1, padding: "7px 2px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, background: "transparent", color: period === v ? C.green : C.dim, borderBottom: period === v ? `2px solid ${C.green}` : "2px solid transparent" }}>
              {l}
            </button>
          ))}
        </div>

        {(period === "month" || period === "year") && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 0" }}>
            <button onClick={prevP} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex" }}><Ico n="chevL" s={20}/></button>
            <button onClick={() => setShowCalendar(true)} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: C.mid, textDecoration: "underline" }}>{periodLabel}</span>
            </button>
            <button onClick={nextP} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex" }}><Ico n="chevR" s={20}/></button>
          </div>
        )}
        {period === "range" && rangeStart && rangeEnd && (
          <div style={{ textAlign: "center", padding: "6px 0 0" }}>
            <button onClick={() => setShowCalendar(true)} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: C.mid, textDecoration: "underline" }}>{rangeStart} — {rangeEnd}</span>
            </button>
          </div>
        )}

        <div style={{ padding: "16px 16px 0", position: "relative" }}>
          <DonutChart segments={catData.map(c => ({ val: c.val, color: c.color }))} total={grandTotal}/>
          <button onClick={() => navigate("addTx")}
            style={{ position: "absolute", bottom: 12, right: 16, width: 50, height: 50, borderRadius: 25, background: C.yellow, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(200,150,30,0.45)", zIndex: 5 }}>
            <Ico n="plus" s={24} c="#fff"/>
          </button>
        </div>

        {/* Category list header with filter button */}
        {catData.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: txFilter.catIds.length > 0 ? "space-between" : "flex-end", padding: "10px 16px 0", gap: 8 }}>
            {txFilter.catIds.length > 0 && (
              <span style={{ fontSize: 12, color: C.dim }}>
                Сумма по выбранным ({txFilter.catIds.length}): <span style={{ fontWeight: 700, color: C.main }}>{sym}{fmtAmtAuto(grandTotal)}</span>
              </span>
            )}
            <button onClick={() => setShowFilter(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: isFilterActive ? "rgba(76,175,80,0.15)" : "none", border: isFilterActive ? `1px solid rgba(76,175,80,0.3)` : "1px solid transparent", borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: isFilterActive ? C.green : C.dim }}>
              <Ico n="filter" s={14} c={isFilterActive ? C.green : C.dim}/>
              <span style={{ fontSize: 11 }}>Фильтр</span>
              {txFilter.catIds.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: C.green, color: "#fff", borderRadius: 9, padding: "1px 6px", lineHeight: "14px" }}>
                  {txFilter.catIds.length}
                </span>
              )}
            </button>
          </div>
        )}

        {catData.map(c => {
          const pct      = grandTotal > 0 ? Math.round(c.val / grandTotal * 100) : 0;
          const pl       = monthPlans.find(p => p.cat_id === c.id && p.type === txType);
          const planBase = pl ? toBase(pl.plan, pl.plan_currency || BASE_CUR, rates) : 0;
          const d        = catDelta[c.id];

          return (
            <div key={c.id} onClick={() => navigate("catTxs", { cat: c, catId: c.id, period, viewMonth, viewYear, rangeStart, rangeEnd, selAccId, periodLabel, txType })}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
              <CatIcon k={c.icon} size={42} color={c.color}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main }}>{c.name}</p>
                {pl && (
                  <div style={{ marginTop: 3, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                    <div style={{ height: 3, borderRadius: 2, width: `${Math.min(c.val / planBase * 100, 100)}%`, background: c.val > planBase ? C.errorLight : c.color }}/>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 13, color: C.dim, marginRight: 4 }}>{pct}%</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.main }}>{sym}{fmtAmtAuto(c.val)}</p>
                  {pl && <p style={{ margin: 0, fontSize: 10, color: C.dim }}>из {getSym(pl.plan_currency || BASE_CUR)}{fmtAmtAuto(pl.plan)}</p>}
                  {txType === "expense" && d?.delta !== null && d?.delta !== undefined && Math.abs(d.delta) >= 5 && (
                    <p style={{ margin: 0, fontSize: 10, color: d.delta > 0 ? C.errorLight : C.emerald }}>
                      {d.delta > 0 ? "↑" : "↓"} {Math.abs(Math.round(d.delta))}%
                    </p>
                  )}
                </div>
                <Ico n="chevR" s={16} c={C.dim}/>
              </div>
            </div>
          );
        })}

        {catData.length === 0 && (
          <p style={{ textAlign: "center", padding: "24px", color: C.dim, fontSize: 13 }}>
            Нет транзакций за этот период
          </p>
        )}
      </div>

      {/* Account picker */}
      <BottomSheet open={showAccPicker} onClose={() => setShowAccPicker(false)} title="Счёт">
        {[{ id: null, name: "Все счета", icon: "other", color: C.green }, ...ACC_PURPOSES.flatMap(p => getSavedOrder(accounts).filter(a => (a.purpose || "daily") === p.key))].map(a => (
          <div key={String(a.id)} onClick={() => { setSelAccId(a.id); setShowAccPicker(false); }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px", borderRadius: 12, marginBottom: 6, cursor: "pointer", background: selAccId === a.id ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${selAccId === a.id ? "rgba(76,175,80,0.4)" : C.border}` }}>
            <CatIcon k={a.icon || "other"} size={40} color={a.color || C.green}/>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#fff" }}>{a.name}</p>
              {a.id && <p style={{ margin: 0, fontSize: 12, color: a.balance < 0 ? C.errorLight : C.dim }}>{fmtBal(a.balance, a.currency)}</p>}
            </div>
            <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${selAccId === a.id ? C.green : "rgba(255,255,255,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {selAccId === a.id && <div style={{ width: 10, height: 10, borderRadius: 5, background: C.green }}/>}
            </div>
          </div>
        ))}
      </BottomSheet>

      {/* Filter BottomSheet */}
      <BottomSheet open={showFilter} onClose={() => setShowFilter(false)} title="Фильтр">
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: C.dim }}>Сортировка</p>
        {[
          ["amount_desc", "По сумме (больше сначала)"],
          ["amount_asc",  "По сумме (меньше сначала)"],
          ["date_desc",   "По дате (новые сначала)"],
          ["date_asc",    "По дате (старые сначала)"],
        ].map(([v, l]) => (
          <div key={v} onClick={() => setTxFilter(f => ({ ...f, sortBy: v }))}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
            <span style={{ fontSize: 14, color: txFilter.sortBy === v ? C.green : C.main }}>{l}</span>
            {txFilter.sortBy === v && <Ico n="check" s={16} c={C.green}/>}
          </div>
        ))}

        <p style={{ margin: "16px 0 8px", fontSize: 12, fontWeight: 700, color: C.dim }}>Категории</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 8 }}>
          <button onClick={() => setTxFilter(f => ({ ...f, catIds: [] }))}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${!txFilter.catIds.length ? "rgba(76,175,80,0.4)" : "transparent"}`, cursor: "pointer", fontSize: 12, fontWeight: 600, background: !txFilter.catIds.length ? "rgba(76,175,80,0.2)" : "rgba(255,255,255,0.06)", color: !txFilter.catIds.length ? C.green : C.dim }}>
            Все
          </button>
          {cats.map(c => {
            const sel = txFilter.catIds.includes(c.id);
            return (
              <button key={c.id} onClick={() => setTxFilter(f => ({
                ...f,
                catIds: f.catIds.includes(c.id) ? f.catIds.filter(id => id !== c.id) : [...f.catIds, c.id]
              }))}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, border: `1px solid ${sel ? "rgba(76,175,80,0.4)" : "transparent"}`, cursor: "pointer", fontSize: 12, fontWeight: 600, background: sel ? "rgba(76,175,80,0.2)" : "rgba(255,255,255,0.06)", color: sel ? C.green : C.dim }}>
                <CatIcon k={c.icon} size={18} color={sel ? c.color : C.dim}/>
                {c.name}
                {sel && <Ico n="check" s={12} c={C.green}/>}
              </button>
            );
          })}
        </div>

        {isFilterActive && (
          <button onClick={() => { setTxFilter({ sortBy: "amount_desc", catIds: [] }); setShowFilter(false); }}
            style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "none", color: C.mid, fontSize: 13, cursor: "pointer" }}>
            Сбросить фильтр
          </button>
        )}
      </BottomSheet>

      {showCalendar && (
        period === "range"
          ? <CalendarPicker mode="range" value={rangeStart || todayStr()} valueEnd={rangeEnd} onChange={v => setRangeStart(v)} onChangeEnd={v => setRangeEnd(v)} onClose={() => setShowCalendar(false)}/>
          : <CalendarPicker mode="single" value={`${viewYear}-${pad(viewMonth + 1)}-01`} onChange={v => { const d = new Date(v); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); setPeriod("month"); }} onClose={() => setShowCalendar(false)}/>
      )}
    </div>
  );
});
