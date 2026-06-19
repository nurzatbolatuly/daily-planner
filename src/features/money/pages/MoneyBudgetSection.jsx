import { useState, useMemo, useEffect, useRef, memo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { SAVINGS_PURPOSES } from "../../../constants/money";
import { pad } from "../../../utils/date";
import { getSym, fmtAmtAuto, toBase, ratesFromAccounts, calcTotalBalance, fmtDateShort } from "../../../utils/format";
import { computeDebtState } from "../../../utils/debtUtils";
import { getSavedOrder } from "../../../utils/accountOrder";
import { exportPlansXLSX } from "../../../utils/export";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { NumInput } from "../../../components/NumInput";
import { GoalListPage } from "./GoalListPage";

function PlanTable({ rows, totalPlan, totalAct, label, accentColor, expanded, toggle, navigate, planMonthKey, sym, rates }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: accentColor }}>{label}</p>
      <div style={{ background: C.monCard, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: 340 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 14px", background: "rgba(255,255,255,0.05)" }}>
              {["Категория", "План", "Факт", "Остаток"].map(h => (
                <p key={h} style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.dim, textAlign: "center" }}>{h}</p>
              ))}
            </div>

            {rows.map(r => {
              const { key, cat, type, plan, planCurrency, items, planData, accId } = r;
              const actual = r.actual;
              const pb  = toBase(plan, planCurrency, rates);
              const rest = pb - actual;
              const its  = (items || []).filter(it => it.amount);
              const isOpen = !!expanded[key];
              return (
                <div key={key} style={{ borderTop: `1px solid ${C.border}` }}>
                  <div onClick={() => toggle(key)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 14px", cursor: "pointer", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <CatIcon k={cat?.icon || "other"} size={28} color={cat?.color || "#607d8b"}/>
                      <span style={{ fontSize: 12, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat?.name || "—"}</span>
                      <Ico n={isOpen ? "chevU" : "chevD"} s={13} c={C.dim}/>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, textAlign: "center", color: C.mid }}>
                      {planCurrency === BASE_CUR ? `${sym}${fmtAmtAuto(plan)}` : `${getSym(planCurrency)}${fmtAmtAuto(plan)}`}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, textAlign: "center", color: actual < 0 ? C.amber : C.main }}>
                      {actual < 0 ? "−" : ""}{sym}{fmtAmtAuto(Math.abs(actual))}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, textAlign: "center", fontWeight: 600, color: rest >= 0 ? C.emerald : C.errorLight }}>{sym}{fmtAmtAuto(rest)}</p>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 14px 12px" }}>
                      {its.map(it => (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0 3px 34px" }}>
                          <span style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>• {it.label || "—"}</span>
                          <span style={{ fontSize: 12, color: C.mid, flexShrink: 0 }}>{getSym(planCurrency)}{fmtAmtAuto(it.amount)}</span>
                        </div>
                      ))}
                      {its.length === 0 && planData && (
                        <p style={{ margin: "3px 0 0 34px", fontSize: 12, color: C.dim }}>Нет разбивки</p>
                      )}
                      {planData ? (
                        <button onClick={() => navigate("editPlan", planData)}
                          style={{ marginTop: 8, marginLeft: 34, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Редактировать
                        </button>
                      ) : (
                        <button onClick={() => navigate("addPlan", { month: planMonthKey, cat_id: cat?.id, acc_id: accId, type })}
                          style={{ marginTop: 8, marginLeft: 34, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Установить план
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 14px", borderTop: `1px solid rgba(255,255,255,0.1)`, background: "rgba(255,255,255,0.04)" }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.mid }}>Итого</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textAlign: "center", color: C.mid }}>{sym}{fmtAmtAuto(totalPlan)}</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textAlign: "center", color: C.main }}>{sym}{fmtAmtAuto(totalAct)}</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textAlign: "center", color: (totalPlan - totalAct) >= 0 ? C.emerald : C.errorLight }}>{sym}{fmtAmtAuto(totalPlan - totalAct)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Карточка долга самому себе — показывается когда были исходящие переводы с накопительных счетов
function SelfDebtCard({ debtData, accounts, sym, navigate, rates, cardRef }) {
  const [open, setOpen] = useState(false);
  const { totalDebt, byAcc } = debtData;
  if (totalDebt <= 0) return null;

  const entries = Object.entries(byAcc)
    .map(([accId, { total, items }]) => ({
      acc: accounts.find(a => a.id === accId),
      total,
      items: [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    }))
    .filter(e => e.acc)
    .sort((a, b) => b.total - a.total);

  return (
    <div ref={cardRef} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16, border: `1px solid rgba(245,158,11,0.22)` }}>
      {/* Заголовок — всегда виден */}
      <div
        onClick={() => setOpen(p => !p)}
        style={{ background: "rgba(245,158,11,0.08)", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico n="transfer" s={18} c={C.amber}/>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.amber }}>Долг самому себе</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(245,158,11,0.55)" }}>Взято из накоплений — нужно вернуть</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.amber }}>{sym}{fmtAmtAuto(totalDebt)}</span>
          <Ico n={open ? "chevU" : "chevD"} s={16} c={C.amber}/>
        </div>
      </div>

      {/* Детали — раскрываются */}
      {open && (
        <div style={{ background: "rgba(245,158,11,0.03)", borderTop: "1px solid rgba(245,158,11,0.12)" }}>
          {entries.map(({ acc, total, items }) => (
            <div key={acc.id} style={{ borderBottom: "1px solid rgba(245,158,11,0.08)" }}>
              {/* Счёт-источник */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CatIcon k={acc.icon || "other"} size={22} color={acc.color || C.amber}/>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.main }}>{acc.name}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{sym}{fmtAmtAuto(total)}</span>
              </div>
              {/* Список переводов */}
              {items.map(t => {
                const toAcc = accounts.find(a => a.id === t.to_id);
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 16px 3px 46px" }}>
                    <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
                      <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>→</span>
                      <span style={{ fontSize: 11, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {toAcc?.name || "Удалённый счёт"}
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{fmtDateShort(t.created_at)}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(245,158,11,0.65)", flexShrink: 0, marginLeft: 8 }}>
                      {sym}{fmtAmtAuto(toBase(t.amount, t.from_currency, rates))}
                    </span>
                  </div>
                );
              })}
              {/* Кнопка возврата для конкретного счёта */}
              <div style={{ padding: "8px 16px 12px" }}>
                <button
                  onClick={() => navigate("transfer", { to_id: acc.id, amount: total, is_debt_repayment: true })}
                  style={{ width: "100%", padding: "10px", borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.32)", color: C.amber, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Вернуть {sym}{fmtAmtAuto(total)} в «{acc.name}» →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const MoneyBudgetSection = memo(function MoneyBudgetSection({ data, navigate, budgetTab, setBudgetTab }) {
  const { accounts, transactions, transfers, expCats, incCats, monthPlans, tripPlans, goals } = data;

  const [planMonth, setPlanMonth]   = useState(new Date().getMonth());
  const [planYear,  setPlanYear]    = useState(new Date().getFullYear());
  const [expanded,   setExpanded]   = useState({});
  const [activePill,        setActivePill]        = useState("expense");
  const [activePerspective, setActivePerspective] = useState("plan");
  const [showCal,           setShowCal]           = useState(false);
  const [monthRates, setMonthRates] = useState({});
  const [rateInputs, setRateInputs] = useState({});
  const [ratesOpen,  setRatesOpen]  = useState(false);

  const toggle      = key => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const sym         = getSym(BASE_CUR);
  const debtCardRef = useRef(null);

  const planMonthKey = `${planYear}-${pad(planMonth + 1)}`;

  useEffect(() => {
    try { setMonthRates(JSON.parse(localStorage.getItem(`mon.rates.${planMonthKey}`)) || {}); } catch { setMonthRates({}); }
    setRateInputs({});
  }, [planMonthKey]);

  const accountRates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const rates = useMemo(() => ({ ...accountRates, ...monthRates }), [accountRates, monthRates]);

  const applyMonthRate = (cur, val) => {
    const rate = parseFloat(val);
    if (!rate || rate <= 0) return;
    const newRates = { ...monthRates, [cur]: rate };
    setMonthRates(newRates);
    localStorage.setItem(`mon.rates.${planMonthKey}`, JSON.stringify(newRates));
    setRateInputs(p => { const n = {...p}; delete n[cur]; return n; });
  };

  const resetMonthRate = (cur) => {
    const newRates = {...monthRates};
    delete newRates[cur];
    setMonthRates(newRates);
    localStorage.setItem(`mon.rates.${planMonthKey}`, JSON.stringify(newRates));
    setRateInputs(p => { const n = {...p}; delete n[cur]; return n; });
  };

  const monthRows = monthPlans.filter(p => p.month === planMonthKey);

  const { txsM, transfersM } = useMemo(() => ({
    txsM: transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === planMonth && d.getFullYear() === planYear;
    }),
    transfersM: transfers.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === planMonth && d.getFullYear() === planYear && !t.is_adjustment;
    }),
  }), [transactions, transfers, planMonth, planYear]);

  // Долг самому себе — хронологическая обработка ВСЕЙ истории переводов.
  // repaymentSavings[id] = излишек конкретного погашения сверх долга (= реальное накопление).
  const debtState = useMemo(
    () => computeDebtState(transfers, accounts, rates),
    [transfers, accounts, rates]
  );

  const { expRows, incRows, savingsRows } = useMemo(() => {
    const { repaymentSavings } = debtState;

    const getActual = (catId, type) =>
      txsM.filter(t => t.type === type && t.category_id === catId)
        .reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);

    const getSavingsActual = accId => {
      // Переводы без флага — 100% накопление этого месяца
      const regularInc = transfersM
        .filter(t => t.to_id === accId && !t.is_debt_repayment)
        .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates), 0);

      // Погашения долга: только излишек сверх долга считается накоплением
      const repayExcess = transfersM
        .filter(t => t.to_id === accId && t.is_debt_repayment)
        .reduce((s, t) => s + (repaymentSavings[t.id] || 0), 0);

      // Исходящие (заимствование) не вычитаем — они трекаются в карточке долга отдельно
      return regularInc + repayExcess;
    };

    const buildRows = (cats, type) =>
      cats.map(cat => {
        const planData = monthRows.find(p => p.cat_id === cat.id && p.type === type) ?? null;
        return { key: `${cat.id}-${type}`, cat, type, plan: planData?.plan ?? 0, planCurrency: planData?.plan_currency ?? BASE_CUR, items: planData?.items ?? [], planData, actual: getActual(cat.id, type) };
      });

    const savingsAccounts = getSavedOrder(accounts).filter(a => SAVINGS_PURPOSES.includes(a.purpose));
    return {
      expRows: buildRows(expCats, "expense"),
      incRows: buildRows(incCats, "income"),
      savingsRows: savingsAccounts.map(acc => {
        const planData = monthRows.find(p => p.type === "savings" && p.acc_id === acc.id) ?? null;
        return { key: `sav-${acc.id}`, cat: { icon: acc.icon, color: acc.color, name: acc.name }, type: "savings", plan: planData?.plan ?? 0, planCurrency: planData?.plan_currency ?? BASE_CUR, items: planData?.items ?? [], planData, actual: getSavingsActual(acc.id), accId: acc.id };
      }),
    };
  }, [txsM, transfersM, expCats, incCats, accounts, monthRows, rates, debtState]);

  const selfDebtData = debtState;

  const sum = (rows, field) => rows.reduce((s, r) => s + toBase(r[field], r.planCurrency, rates), 0);
  const { totalPlanExp, totalPlanInc, totalPlanSav, totalActExp, totalActInc, totalActSav, totalPlanExpAll, planExpCovered } = useMemo(() => {
    const tPE = sum(expRows, "plan"), tPI = sum(incRows, "plan"), tPS = sum(savingsRows, "plan");
    // How much actual expense "covers" planned categories (min of actual vs plan per row, only rows with a plan)
    const covered = expRows.reduce((s, r) => {
      const pb = toBase(r.plan, r.planCurrency, rates);
      return pb > 0 ? s + Math.min(r.actual, pb) : s;
    }, 0);
    return {
      totalPlanExp: tPE, totalPlanInc: tPI, totalPlanSav: tPS,
      totalActExp:  expRows.reduce((s, r) => s + r.actual, 0),
      totalActInc:  incRows.reduce((s, r) => s + r.actual, 0),
      totalActSav:  savingsRows.reduce((s, r) => s + r.actual, 0),
      totalPlanExpAll: tPE + tPS,
      planExpCovered: covered,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expRows, incRows, savingsRows, rates]);

  // Plan mode: remaining = what's still left to execute (plan minus progress, floored at 0).
  // planExpCovered uses per-category min so unplanned spending eats activeFree, not the plan bar.
  // planSavRemaining floors actSav at 0 so borrowing from savings doesn't inflate the bar.
  const planExpRemaining = Math.max(totalPlanExp - planExpCovered, 0);
  const planSavRemaining = Math.max(totalPlanSav - Math.max(totalActSav, 0), 0);
  const planIncRemaining = Math.max(totalPlanInc - totalActInc, 0);

  const activeIncome  = planIncRemaining;
  const activeExpense = planExpRemaining;
  const activeSavings = planSavRemaining;
  const totalBalance     = useMemo(() => calcTotalBalance(accounts), [accounts]);
  const totalAvailable   = activeIncome + totalBalance;
  const activeFree       = totalAvailable - activeExpense - activeSavings;
  const activeOverBudget = activeExpense + activeSavings > totalAvailable;

  const usedPlanCurrencies = useMemo(() => {
    const curs = new Set();
    [...expRows, ...incRows, ...savingsRows].forEach(r => {
      if (r.planCurrency && r.planCurrency !== BASE_CUR && r.plan > 0) curs.add(r.planCurrency);
    });
    return [...curs];
  }, [expRows, incRows, savingsRows]);

  const missingCount = usedPlanCurrencies.filter(c => !rates[c]).length;

  const prevM = () => {
    if (planMonth === 0) { setPlanMonth(11); setPlanYear(y => y - 1); }
    else setPlanMonth(m => m - 1);
  };
  const nextM = () => {
    if (planMonth === 11) { setPlanMonth(0); setPlanYear(y => y + 1); }
    else setPlanMonth(m => m + 1);
  };

  const exportXLSX = () => {
    exportPlansXLSX({
      expRows, incRows, savingsRows,
      totals: { totalPlanExp, totalPlanInc, totalPlanSav, totalActExp, totalActInc, totalActSav, totalPlanExpAll },
      rates, planMonth, planYear,
      filename: `plan_${planYear}-${pad(planMonth + 1)}.xlsx`,
    });
  };

  const tableProps = { expanded, toggle, navigate, planMonthKey, sym, rates };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: C.monHeader, padding: "14px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>Бюджет</p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", margin: "12px 16px", borderRadius: 10, padding: 3 }}>
        {[["month", "Месяц"], ["goals", "Цели"], ["trips", "Поездки"]].map(([v, l]) => (
          <button key={v} onClick={() => setBudgetTab(v)}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: budgetTab === v ? C.monCard2 : "transparent", color: budgetTab === v ? C.green : C.dim }}>
            {l}
          </button>
        ))}
      </div>

      {/* ─── Месяц ─── */}
      {budgetTab === "month" && (
        <div style={{ padding: "0 16px" }}>
          {/* Month navigator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={prevM} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex" }}><Ico n="chevL" s={20}/></button>
            <button
              onClick={() => setShowCal(true)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#fff", flex: 1, textAlign: "center" }}
            >
              {RU_MONTHS[planMonth]} {planYear}
            </button>
            <button onClick={nextM} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex" }}><Ico n="chevR" s={20}/></button>
            <button onClick={exportXLSX} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", marginLeft: 8 }}><Ico n="download" s={18} c={C.mid}/></button>
          </div>
          {showCal && (
            <CalendarPicker
              mode="single"
              value={`${planYear}-${pad(planMonth + 1)}-01`}
              onChange={v => { const d = new Date(v + "T12:00:00"); setPlanMonth(d.getMonth()); setPlanYear(d.getFullYear()); }}
              onClose={() => setShowCal(false)}
            />
          )}

          {/* Cash Flow bar */}
          <div style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
            {/* Perspective switcher */}
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, marginBottom: 14 }}>
              {[["plan", "План"], ["summary", "Итог"]].map(([v, l]) => (
                <button key={v} onClick={() => setActivePerspective(v)}
                  style={{ flex: 1, padding: "6px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                           background: activePerspective === v ? "rgba(255,255,255,0.1)" : "transparent",
                           color: activePerspective === v ? "#fff" : C.dim }}>
                  {l}
                </button>
              ))}
            </div>

            {activePerspective === "plan" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.dim }}>Ожид. доход</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.emerald }}>{sym}{fmtAmtAuto(activeIncome)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: C.dim }}>Баланс счетов</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{sym}{fmtAmtAuto(totalBalance)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 9, marginBottom: 14, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>Итого доступно</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{sym}{fmtAmtAuto(totalAvailable)}</span>
                </div>
                {[
                  { label: "Расходы",   amt: activeExpense, color: C.errorLight },
                  { label: "Накоплен.", amt: activeSavings,  color: C.blue },
                  { label: "Свободно",  amt: activeFree,     color: activeFree >= 0 ? C.emerald : C.errorLight },
                ].map(({ label, amt, color }) => {
                  const pct = totalAvailable > 0 ? Math.min(Math.max(amt / totalAvailable, 0), 1) : 0;
                  return (
                    <div key={label} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: C.dim }}>{label}</span>
                        <span style={{ fontSize: 11, color }}>{Math.round(pct * 100)}% {sym}{fmtAmtAuto(amt)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                        <div style={{ height: 6, borderRadius: 3, width: `${pct * 100}%`, background: color, transition: "width 0.4s ease" }}/>
                      </div>
                    </div>
                  );
                })}
                {selfDebtData.totalDebt > 0 && (
                  <div
                    onClick={() => {
                      setActivePill("savings");
                      setTimeout(() => debtCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
                    }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.amber, flexShrink: 0 }}/>
                      <span style={{ fontSize: 11, color: C.amber }}>Долг себе</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>{sym}{fmtAmtAuto(selfDebtData.totalDebt)}</span>
                      <Ico n="chevR" s={12} c={C.amber}/>
                    </div>
                  </div>
                )}
                {activeOverBudget && (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
                    <span style={{ fontSize: 12, color: C.errorLight }}>
                      ⚠ Расходы + накопления превышают доступные средства на {sym}{fmtAmtAuto(activeExpense + activeSavings - totalAvailable)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 14px", fontSize: 11, color: C.dim, textAlign: "center", letterSpacing: 0.5 }}>ИСПОЛНЕНИЕ ПЛАНА</p>
                {[
                  { label: "Доходы",     plan: totalPlanInc, act: totalActInc,              color: C.emerald,    goodOver: true  },
                  { label: "Расходы",    plan: totalPlanExp, act: totalActExp,              color: C.errorLight, goodOver: false },
                  { label: "Накопления", plan: totalPlanSav, act: Math.max(totalActSav, 0), color: C.blue,       goodOver: true  },
                ].map(({ label, plan, act, color, goodOver }) => {
                  const ratio  = plan > 0 ? act / plan : 0;
                  const barPct = Math.min(ratio, 1);
                  const over   = ratio > 1;
                  const barColor = over ? (goodOver ? C.emerald : C.errorLight) : color;
                  return (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: C.dim }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: over && !goodOver ? C.errorLight : C.main }}>
                            {sym}{fmtAmtAuto(act)}
                          </span>
                          {plan > 0 ? (
                            <span style={{ fontSize: 10, color: C.dim }}>
                              / {sym}{fmtAmtAuto(plan)} · <span style={{ color: barColor }}>{Math.round(ratio * 100)}%</span>
                            </span>
                          ) : (
                            act > 0 && <span style={{ fontSize: 10, color: C.dim }}>без плана</span>
                          )}
                        </div>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                        <div style={{ height: 5, borderRadius: 3, width: `${barPct * 100}%`, background: barColor, transition: "width 0.4s ease" }}/>
                      </div>
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: C.dim }}>Баланс счетов</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{sym}{fmtAmtAuto(totalBalance)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.dim }}>Поток за месяц</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: (totalActInc - totalActExp) >= 0 ? C.emerald : C.errorLight }}>
                      {(totalActInc - totalActExp) >= 0 ? "+" : ""}{sym}{fmtAmtAuto(totalActInc - totalActExp)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Rates panel — shown only when plans use non-KZT currencies */}
          {usedPlanCurrencies.length > 0 && (
            <div style={{ background: C.monCard, borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
              <div
                onClick={() => setRatesOpen(p => !p)}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", cursor:"pointer" }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#fff" }}>Курсы валют</span>
                  {missingCount > 0 && (
                    <span style={{ fontSize:11, color:C.amber, background:"rgba(245,158,11,0.15)", padding:"2px 8px", borderRadius:10 }}>
                      {missingCount} без курса
                    </span>
                  )}
                </div>
                <Ico n={ratesOpen ? "chevU" : "chevD"} s={16} c={C.dim}/>
              </div>
              {ratesOpen && (
                <div style={{ padding:"0 14px 14px", borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                  <p style={{ margin:"0 0 10px", fontSize:12, color:C.dim, lineHeight:1.4 }}>
                    Курсы для конвертации плановых сумм в ₸. Ручной курс перекрывает курс из счёта.
                  </p>
                  {usedPlanCurrencies.map(cur => {
                    const accRate = accountRates[cur];
                    const manRate = monthRates[cur];
                    const isMissing = !accRate && !manRate;
                    const inputVal = rateInputs[cur] ?? (manRate ? String(manRate) : "");
                    const isDirty  = inputVal !== "" && parseFloat(inputVal) !== manRate;
                    return (
                      <div key={cur} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <div style={{ width:44, textAlign:"center", padding:"4px 0", borderRadius:8, background:"rgba(255,255,255,0.06)", flexShrink:0 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:C.main }}>{cur}</span>
                        </div>
                        <NumInput
                          value={inputVal}
                          onChange={v => setRateInputs(p => ({...p, [cur]: v}))}
                          placeholder={accRate ? String(Math.round(accRate)) : "0"}
                          style={{ flex:1, background:"rgba(255,255,255,0.06)", border:`1px solid ${isMissing ? "rgba(245,158,11,0.45)" : C.border}`, borderRadius:8, padding:"6px 8px", color:"#fff", fontSize:13, outline:"none" }}
                        />
                        <span style={{ fontSize:12, color:C.dim, flexShrink:0 }}>₸/{getSym(cur)}</span>
                        {isDirty && (
                          <button
                            onClick={() => applyMonthRate(cur, inputVal)}
                            style={{ background:"rgba(76,175,80,0.2)", border:"1px solid rgba(76,175,80,0.4)", borderRadius:8, padding:"5px 10px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}
                          >
                            OK
                          </button>
                        )}
                        {!inputVal && accRate && !manRate && (
                          <span style={{ fontSize:11, color:C.dim, flexShrink:0, whiteSpace:"nowrap" }}>из счёта</span>
                        )}
                        {manRate && !isDirty && (
                          <button
                            onClick={() => resetMonthRate(cur)}
                            style={{ background:"none", border:"none", cursor:"pointer", padding:4, display:"flex", flexShrink:0 }}
                          >
                            <Ico n="x" s={14} c="rgba(244,67,54,0.5)"/>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {missingCount > 0 && (
                    <p style={{ margin:"6px 0 0", fontSize:11, color:C.amber }}>
                      Валюты без курса конвертируются 1:1
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pill-switcher — на пилюле "Накопления" показывается точка если есть долг */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              { v: "expense", l: "Расходы",    color: C.errorLight },
              { v: "savings", l: "Накопления", color: C.blue },
              { v: "income",  l: "Доходы",     color: C.emerald },
            ].map(({ v, l, color }) => (
              <button key={v} onClick={() => setActivePill(v)}
                style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                         background: activePill === v ? "rgba(255,255,255,0.08)" : "transparent",
                         color: activePill === v ? color : C.dim }}>
                {l}
              </button>
            ))}
          </div>

          {activePill === "expense" && (
            <PlanTable {...tableProps} rows={expRows} totalPlan={totalPlanExp} totalAct={totalActExp} label="Расходы" accentColor={C.errorLight}/>
          )}
          {activePill === "savings" && savingsRows.length > 0 && (
            <>
              <PlanTable {...tableProps} rows={savingsRows} totalPlan={totalPlanSav} totalAct={totalActSav} label="Накопления / Инвест." accentColor={C.blue}/>
              <SelfDebtCard debtData={selfDebtData} accounts={accounts} sym={sym} navigate={navigate} rates={rates} cardRef={debtCardRef}/>
            </>
          )}
          {activePill === "savings" && savingsRows.length === 0 && (
            <>
              <p style={{ textAlign: "center", padding: "32px 0", color: C.dim, fontSize: 13 }}>Нет накопительных счетов</p>
              <SelfDebtCard debtData={selfDebtData} accounts={accounts} sym={sym} navigate={navigate} rates={rates} cardRef={debtCardRef}/>
            </>
          )}
          {activePill === "income" && (
            <PlanTable {...tableProps} rows={incRows} totalPlan={totalPlanInc} totalAct={totalActInc} label="Доходы" accentColor={C.emerald}/>
          )}
        </div>
      )}

      {/* ─── Цели ─── */}
      {budgetTab === "goals" && (
        <GoalListPage
          goals={goals || []}
          goalTopups={data.goalTopups || []}
          accounts={accounts}
          navigate={navigate}
        />
      )}

      {/* ─── Поездки ─── */}
      {budgetTab === "trips" && (
        <div style={{ padding: "0 16px" }}>
          {tripPlans.length === 0 && (
            <p style={{ textAlign: "center", padding: "40px 0", color: C.dim, fontSize: 14 }}>Нет планов поездок</p>
          )}
          {tripPlans.map(tp => {
            const allExp  = (tp.days || []).flatMap(d => d.expenses || []);
            const tpRates = { ...accountRates, ...(tp.rates || {}) };
            const total   = allExp.reduce((s, e) => s + toBase(e.amount, e.currency, tpRates), 0);
            const paid    = allExp.reduce((s, e) => s + toBase(e.paidAmount || 0, e.currency, tpRates), 0);
            return (
              <div key={tp.id} onClick={() => navigate("tripDetail", tp)}
                style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 12, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{tp.name}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: C.dim }}>{tp.start_date} → {tp.end_date} · {(tp.days || []).length} дн.</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{sym}{fmtAmtAuto(total)}</p>
                    <p style={{ margin: 0, fontSize: 11, color: C.green }}>{sym}{fmtAmtAuto(paid)} оплачено</p>
                  </div>
                </div>
                {total > 0 && (
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${Math.min(paid / total * 100, 100)}%`, background: C.green }}/>
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => navigate("addTrip")}
            style={{ width: "100%", padding: "13px", borderRadius: 12, background: "transparent", border: `1px dashed rgba(76,175,80,0.4)`, color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            + Новый план поездки
          </button>
        </div>
      )}
    </div>
  );
});
