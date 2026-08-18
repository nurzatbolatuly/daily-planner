import { useState, useMemo, memo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS, RU_MONTHS_S, RU_MON_GEN } from "../../../constants/locale";
import { SAVINGS_PURPOSES } from "../../../constants/money";
import { pad, monthKey, localDate, monthsUntil, todayStr } from "../../../utils/date";
import { getSym, fmtAmtAuto, toBase, ratesFromAccounts } from "../../../utils/format";
import { computeDebtState } from "../../../utils/debtUtils";
import { withPersonalAmounts } from "../../../utils/debtLedger";
import { CatIcon } from "../../../components/CatIcon";

const W = 300, H = 120, PAD = { top: 10, bottom: 24, left: 8, right: 8 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

function LineChart({ monthlyData, selectedMonth, onSelect }) {
  const maxVal = Math.max(...monthlyData.flatMap(d => [d.exp, d.inc]), 1);
  const toX = i => PAD.left + (i / Math.max(monthlyData.length - 1, 1)) * innerW;
  const toY = v => PAD.top + innerH - (v / maxVal) * innerH;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD.left} y1={toY(maxVal * f)} x2={W - PAD.right} y2={toY(maxVal * f)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
        ))}
        <polyline
          points={monthlyData.map((d, i) => `${toX(i)},${toY(d.exp)}`).join(" ")}
          fill="none" stroke={C.errorLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline
          points={monthlyData.map((d, i) => `${toX(i)},${toY(d.inc)}`).join(" ")}
          fill="none" stroke={C.emerald} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {monthlyData.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toY(d.exp)} r={selectedMonth === d.mk ? 6 : 4}
            fill={selectedMonth === d.mk ? "#fff" : C.errorLight}
            stroke={selectedMonth === d.mk ? C.errorLight : "none"} strokeWidth="2"
            onClick={() => onSelect(selectedMonth === d.mk ? null : d.mk)}
            style={{ cursor: "pointer" }}/>
        ))}
        {monthlyData.map((d, i) => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)">
            {RU_MONTHS_S[parseInt(d.mk.split("-")[1]) - 1]}
          </text>
        ))}
      </svg>
    </div>
  );
}

const RANGE_OPTIONS = [
  { value: 1,  label: "1 мес" },
  { value: 3,  label: "3 мес" },
  { value: 6,  label: "6 мес" },
  { value: 12, label: "12 мес" },
];

const SELECT_STYLE = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "7px 10px",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
};

export const MoneyAnalyticsSection = memo(function MoneyAnalyticsSection({ data }) {
  const { transactions: rawTransactions, transfers, accounts, expCats, monthPlans, goals, goalTopups, debtEvents } = data;
  // Личная доля вместо полной суммы для сплит-расходов (см. MoneyHomeSection).
  const transactions = useMemo(() => withPersonalAmounts(rawTransactions, debtEvents), [rawTransactions, debtEvents]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [range, setRange] = useState(6);

  const now = useMemo(() => new Date(), []);
  const thisYear = now.getFullYear();

  const [forecastTarget, setForecastTarget] = useState(() => ({
    year: now.getFullYear(),
    month: 11, // декабрь
  }));

  const sym   = getSym(BASE_CUR);
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);

  // Хронологический учёт долга — единый источник правды для всей аналитики.
  // repaymentSavings[transferId] = часть погашения, являющаяся накоплением (излишек > долга).
  const debtState = useMemo(() => computeDebtState(transfers, accounts, rates), [transfers, accounts, rates]);

  const months = useMemo(() => {
    const result = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(thisYear, now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }
    return result;
  }, [range, now, thisYear]);

  const monthlyData = useMemo(() => {
    return months.map(mk => {
      const txs = transactions.filter(t => monthKey(t.date) === mk);
      const exp = txs.filter(t => t.type === "expense").reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);
      const inc = txs.filter(t => t.type === "income" ).reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);
      return { mk, exp, inc };
    });
  }, [months, transactions, rates]);

  const selectedData = selectedMonth ? monthlyData.find(d => d.mk === selectedMonth) : null;
  const selectedLabel = selectedMonth
    ? `${RU_MONTHS[parseInt(selectedMonth.split("-")[1]) - 1]} ${selectedMonth.split("-")[0]}`
    : null;

  const selectedCatBreakdown = useMemo(() => {
    if (!selectedMonth) return [];
    const sums = {};
    transactions
      .filter(t => t.type === "expense" && monthKey(t.date) === selectedMonth)
      .forEach(t => { sums[t.category_id] = (sums[t.category_id] || 0) + toBase(t.amount, t.currency, rates); });
    return expCats
      .filter(cat => sums[cat.id] > 0 || monthPlans.some(p => p.month === selectedMonth && p.type === "expense" && p.cat_id === cat.id))
      .map(cat => {
        const planRow = monthPlans.find(p => p.month === selectedMonth && p.type === "expense" && p.cat_id === cat.id);
        const plan    = planRow ? toBase(planRow.plan, planRow.plan_currency, rates) : 0;
        const amt     = sums[cat.id] || 0;
        return { cat, amt, plan };
      })
      .sort((a, b) => b.amt - a.amt);
  }, [selectedMonth, transactions, expCats, monthPlans, rates]);

  const selectedSavingsData = useMemo(() => {
    if (!selectedMonth) return null;
    const { repaymentSavings } = debtState;
    const savingsAccs = accounts.filter(a => SAVINGS_PURPOSES.includes(a.purpose));
    const rows = savingsAccs.map(acc => {
      const planRow = monthPlans.find(p => p.month === selectedMonth && p.type === "savings" && p.acc_id === acc.id);
      // Обычные переводы — 100% накопление
      const regularActual = transfers
        .filter(t => t.to_id === acc.id && !t.is_adjustment && !t.is_debt_repayment && monthKey(localDate(t.created_at)) === selectedMonth)
        .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates), 0);
      // Погашения долга — только излишек сверх долга считается накоплением
      const repayExcess = transfers
        .filter(t => t.to_id === acc.id && !t.is_adjustment && t.is_debt_repayment && monthKey(localDate(t.created_at)) === selectedMonth)
        .reduce((s, t) => s + (repaymentSavings[t.id] || 0), 0);
      const actual = regularActual + repayExcess;
      const plan   = planRow ? toBase(planRow.plan, planRow.plan_currency, rates) : 0;
      return { acc, plan, actual };
    }).filter(r => r.plan > 0 || r.actual > 0);
    if (!rows.length) return null;
    return {
      rows,
      totalPlan:   rows.reduce((s, r) => s + r.plan,   0),
      totalActual: rows.reduce((s, r) => s + r.actual, 0),
    };
  }, [selectedMonth, accounts, monthPlans, transfers, rates, debtState]);

  const yearForecast = useMemo(() => {
    const { repaymentSavings } = debtState;
    const thisMonth = now.getMonth();

    const savingsAccs   = accounts.filter(a => SAVINGS_PURPOSES.includes(a.purpose));
    const savingsAccIds = savingsAccs.map(a => a.id);

    const currentSavBal = savingsAccs.reduce((s, a) => {
      if (a.currency === BASE_CUR) return s + (a.balance || 0);
      return s + (a.avg_rate ? (a.balance || 0) * a.avg_rate : 0);
    }, 0);

    // Avg за выбранный период чарта (range мес.) — синхронизировано с трендами
    const avgPeriodMks = Array.from({ length: range }, (_, i) => {
      const d = new Date(thisYear, thisMonth - i, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    });
    const avgMonthlySav = avgPeriodMks.reduce((sum, mk) => {
      const regular = transfers
        .filter(t => savingsAccIds.includes(t.to_id) && !t.is_adjustment && !t.is_debt_repayment && monthKey(localDate(t.created_at)) === mk)
        .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates), 0);
      const excess = transfers
        .filter(t => savingsAccIds.includes(t.to_id) && !t.is_adjustment && t.is_debt_repayment && monthKey(localDate(t.created_at)) === mk)
        .reduce((s, t) => s + (repaymentSavings[t.id] || 0), 0);
      return sum + regular + excess;
    }, 0) / range;

    const currentMk = `${thisYear}-${pad(thisMonth + 1)}`;
    const currentMonthRegular = transfers
      .filter(t => savingsAccIds.includes(t.to_id) && !t.is_adjustment && !t.is_debt_repayment && monthKey(localDate(t.created_at)) === currentMk)
      .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates), 0);
    const currentMonthExcess = transfers
      .filter(t => savingsAccIds.includes(t.to_id) && !t.is_adjustment && t.is_debt_repayment && monthKey(localDate(t.created_at)) === currentMk)
      .reduce((s, t) => s + (repaymentSavings[t.id] || 0), 0);
    const currentMonthActual = currentMonthRegular + currentMonthExcess;

    const currentMonthPlan = monthPlans
      .filter(p => p.month === currentMk && p.type === "savings" && savingsAccIds.includes(p.acc_id))
      .reduce((s, p) => s + toBase(p.plan, p.plan_currency, rates), 0);

    const monthsLeft = (forecastTarget.year - thisYear) * 12 + (forecastTarget.month - thisMonth);

    const remainingProjected = avgMonthlySav * Math.max(monthsLeft, 0);
    const projected          = currentSavBal + remainingProjected;

    // Анализ целей — показываем все активные, дедлайн опционален
    const today = todayStr();
    const goalsAnalysis = (goals || []).map(goal => {
      const myTopups   = (goalTopups || []).filter(t => t.goal_id === goal.id);
      const totalSaved = myTopups.reduce((s, t) => s + toBase(t.amount, t.currency || goal.currency, rates), 0);
      const targetBase = toBase(goal.target, goal.currency, rates);
      const remaining  = Math.max(targetBase - totalSaved, 0);
      const pct        = targetBase > 0 ? Math.min(totalSaved / targetBase, 1) : 0;
      const monthsToDeadline = goal.deadline
        ? Math.max(monthsUntil(today, goal.deadline), 1)
        : null;
      const monthlyNeeded = monthsToDeadline && remaining > 0 ? remaining / monthsToDeadline : null;
      return { goal, totalSaved, targetBase, remaining, monthlyNeeded, pct };
    }).filter(g => g.pct < 1); // скрываем выполненные цели

    const totalGoalsMonthlyNeeded = goalsAnalysis
      .filter(g => g.monthlyNeeded != null)
      .reduce((s, g) => s + g.monthlyNeeded, 0);
    const gap = totalGoalsMonthlyNeeded > 0 ? avgMonthlySav - totalGoalsMonthlyNeeded : null;

    return {
      avgMonthlySav, currentSavBal, currentMonthActual, currentMonthPlan,
      remainingProjected, projected, monthsLeft,
      goalsAnalysis, totalGoalsMonthlyNeeded, gap,
    };
  }, [transfers, accounts, monthPlans, goals, goalTopups, rates, forecastTarget, range, now, thisYear, debtState]);

  const forecastLabel = `К концу ${RU_MON_GEN[forecastTarget.month]}${forecastTarget.year !== thisYear ? ` ${forecastTarget.year}` : ""}`;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: C.monHeader, padding: "14px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>Аналитика</p>
      </div>

      <div style={{ padding: "12px 16px 0" }}>

        {/* ─── Тренды ─── */}
        <div style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.mid }}>Тренды за {range} мес.</p>
            <div style={{ display: "flex", gap: 4 }}>
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setRange(opt.value); setSelectedMonth(null); }}
                  style={{
                    padding: "4px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                    background: range === opt.value ? C.emerald : "rgba(255,255,255,0.08)",
                    color: range === opt.value ? "#000" : C.mid,
                    transition: "background 0.15s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <LineChart monthlyData={monthlyData} selectedMonth={selectedMonth} onSelect={setSelectedMonth}/>

          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: C.dim }}><span style={{ color: C.errorLight }}>—</span> Расходы</span>
            <span style={{ fontSize: 11, color: C.dim }}><span style={{ color: C.emerald }}>—</span> Доходы</span>
          </div>

          {selectedData && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)" }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#fff" }}>{selectedLabel}</p>

              {/* Итоги месяца */}
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.dim }}>Доходы</p>
                  <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 700, color: C.emerald }}>{sym}{fmtAmtAuto(selectedData.inc)}</p>
                </div>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.dim }}>Расходы</p>
                  <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 700, color: C.errorLight }}>{sym}{fmtAmtAuto(selectedData.exp)}</p>
                </div>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.dim }}>Разница</p>
                  <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 700, color: selectedData.inc >= selectedData.exp ? C.emerald : C.errorLight }}>
                    {selectedData.inc >= selectedData.exp ? "+" : ""}{sym}{fmtAmtAuto(selectedData.inc - selectedData.exp)}
                  </p>
                </div>
              </div>

              {/* Накопления: план vs факт */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.blue }}>Накопления</p>
                  {selectedSavingsData && (
                    <span style={{ fontSize: 10, color: C.dim }}>
                      факт {sym}{fmtAmtAuto(selectedSavingsData.totalActual)}
                      {selectedSavingsData.totalPlan > 0 && ` / план ${sym}${fmtAmtAuto(selectedSavingsData.totalPlan)}`}
                    </span>
                  )}
                </div>
                {selectedSavingsData ? selectedSavingsData.rows.map(({ acc, plan, actual }) => {
                  const hasPlan = plan > 0;
                  const pct     = hasPlan ? Math.min(actual / plan, 1) : 1;
                  const done    = !hasPlan || actual >= plan;
                  return (
                    <div key={acc.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <CatIcon k={acc.icon || "wallet"} size={18} color={acc.color || C.blue}/>
                        <span style={{ fontSize: 12, color: C.main, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: done ? C.emerald : C.amber, flexShrink: 0 }}>
                          {sym}{fmtAmtAuto(actual)}
                          {hasPlan && <span style={{ color: C.dim, fontWeight: 400 }}> / {sym}{fmtAmtAuto(plan)}</span>}
                        </span>
                      </div>
                      {hasPlan && (
                        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                          <div style={{ height: 3, borderRadius: 2, width: `${pct * 100}%`, background: done ? C.emerald : C.amber, transition: "width 0.4s ease" }}/>
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <p style={{ margin: "2px 0 8px", fontSize: 12, color: C.dim }}>Нет данных о накоплениях за этот месяц</p>
                )}
              </div>

              {/* Расходы по категориям: план vs факт */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: C.errorLight }}>Расходы по категориям</p>
                {selectedCatBreakdown.length > 0 ? selectedCatBreakdown.map(({ cat, amt, plan }) => {
                  const hasPlan    = plan > 0;
                  const overBudget = hasPlan && amt > plan;
                  const pct = hasPlan
                    ? Math.min(amt / plan, 1.5)
                    : (selectedData.exp > 0 ? amt / selectedData.exp : 0);
                  const barColor = hasPlan
                    ? (overBudget ? C.errorLight : C.emerald)
                    : (cat.color || C.errorLight);
                  return (
                    <div key={cat.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <CatIcon k={cat.icon} size={18} color={cat.color}/>
                        <span style={{ fontSize: 12, color: C.main, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: overBudget ? C.errorLight : C.main, flexShrink: 0 }}>
                          {sym}{fmtAmtAuto(amt)}
                          {hasPlan && <span style={{ color: C.dim, fontWeight: 400 }}> / {sym}{fmtAmtAuto(plan)}</span>}
                        </span>
                        {hasPlan && (
                          <span style={{ fontSize: 11, color: overBudget ? C.errorLight : C.dim, minWidth: 36, textAlign: "right", flexShrink: 0 }}>
                            {overBudget ? "↑" : ""}{Math.round(amt / plan * 100)}%
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                        <div style={{ height: 3, borderRadius: 2, width: `${Math.min(pct, 1) * 100}%`, background: barColor, transition: "width 0.4s ease" }}/>
                      </div>
                      {overBudget && (
                        <p style={{ margin: "3px 0 0", fontSize: 10, color: C.errorLight, textAlign: "right" }}>
                          перерасход +{sym}{fmtAmtAuto(amt - plan)}
                        </p>
                      )}
                    </div>
                  );
                }) : (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: C.dim }}>Нет расходов за этот месяц</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Прогноз накоплений ─── */}
        <div style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.mid }}>Прогноз накоплений</p>

            {/* Выбор целевого месяца и года */}
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={forecastTarget.month}
                onChange={e => setForecastTarget(p => ({ ...p, month: Number(e.target.value) }))}
                style={SELECT_STYLE}
              >
                {RU_MONTHS_S.map((m, i) => (
                  <option key={i} value={i} style={{ background: "#1e1e2e" }}>{m}</option>
                ))}
              </select>
              <select
                value={forecastTarget.year}
                onChange={e => setForecastTarget(p => ({ ...p, year: Number(e.target.value) }))}
                style={SELECT_STYLE}
              >
                {[thisYear, thisYear + 1, thisYear + 2].map(y => (
                  <option key={y} value={y} style={{ background: "#1e1e2e" }}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Текущее состояние */}
          <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: C.dim }}>На счетах сбережений</p>
              <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: C.main }}>{sym}{fmtAmtAuto(yearForecast.currentSavBal)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: C.dim }}>Отложено в этом месяце</p>
              <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: C.main }}>{sym}{fmtAmtAuto(yearForecast.currentMonthActual)}</p>
              {yearForecast.currentMonthPlan > 0 && (
                <p style={{ margin: "1px 0 0", fontSize: 10, color: C.dim }}>план {sym}{fmtAmtAuto(yearForecast.currentMonthPlan)}</p>
              )}
            </div>
          </div>

          {/* Итоговый прогноз */}
          {yearForecast.monthsLeft > 0 ? (
            <>
              <p style={{ margin: "6px 0 2px", fontSize: "clamp(13px, 5vw, 22px)", fontWeight: 600, color: C.emerald, whiteSpace: "nowrap" }}>
                {forecastLabel}:{" "}
                <span style={{ fontWeight: 800 }}>
                  {sym}{fmtAmtAuto(yearForecast.projected)}
                </span>
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.dim, lineHeight: 1.5 }}>
                <span style={{ color: "rgba(52,211,153,0.65)", fontWeight: 600 }}>
                  +{sym}{fmtAmtAuto(yearForecast.remainingProjected)}
                </span>
                {" за "}{yearForecast.monthsLeft} мес.{" · "}
                <span style={{ color: C.mid, fontWeight: 600 }}>
                  ср. {sym}{fmtAmtAuto(yearForecast.avgMonthlySav)}/{range} мес
                </span>
              </p>
            </>
          ) : (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.dim }}>
              Выберите будущий месяц для прогноза
            </p>
          )}

          {/* Гэп-анализ по целям */}
          {yearForecast.goalsAnalysis.length > 0 && (
            <>
              <div style={{ height: 1, background: C.border, margin: "14px 0 12px" }}/>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: C.mid }}>Цели vs план</p>

              {/* Сводная строка — только если есть цели с дедлайном */}
              {yearForecast.totalGoalsMonthlyNeeded > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column" }}>
                    <p style={{ margin: 0, fontSize: 10, color: C.dim, lineHeight: 1.4, minHeight: 28 }}>Нужно для целей</p>
                    <p style={{ margin: 0, fontSize: "var(--analytics-card-value-fs)", fontWeight: 800, color: C.amber }}>
                      {sym}{fmtAmtAuto(yearForecast.totalGoalsMonthlyNeeded)}<span style={{ fontSize: "var(--analytics-card-unit-fs)", fontWeight: 400 }}>/мес</span>
                    </p>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column" }}>
                    <p style={{ margin: 0, fontSize: 10, color: C.dim, lineHeight: 1.4, minHeight: 28 }}>Ср. накопление</p>
                    <p style={{ margin: 0, fontSize: "var(--analytics-card-value-fs)", fontWeight: 800, color: C.blue }}>
                      {sym}{fmtAmtAuto(yearForecast.avgMonthlySav)}<span style={{ fontSize: "var(--analytics-card-unit-fs)", fontWeight: 400 }}>/мес</span>
                    </p>
                  </div>
                  {yearForecast.gap != null && (
                    <div style={{
                      flex: 1, borderRadius: 10, padding: "10px 12px",
                      display: "flex", flexDirection: "column",
                      background: yearForecast.gap >= 0 ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                      border: `1px solid ${yearForecast.gap >= 0 ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
                    }}>
                      <p style={{ margin: 0, fontSize: 10, color: C.dim, lineHeight: 1.4, minHeight: 28 }}>{yearForecast.gap >= 0 ? "Профицит" : "Нехватка"}</p>
                      <p style={{ margin: 0, fontSize: "var(--analytics-card-value-fs)", fontWeight: 800, color: yearForecast.gap >= 0 ? C.emerald : C.errorLight }}>
                        {yearForecast.gap >= 0 ? "+" : ""}{sym}{fmtAmtAuto(yearForecast.gap)}<span style={{ fontSize: "var(--analytics-card-unit-fs)", fontWeight: 400 }}>/мес</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Список целей */}
              {yearForecast.goalsAnalysis.map(({ goal, totalSaved, targetBase, monthlyNeeded, pct }) => (
                <div key={goal.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <CatIcon k={goal.icon || "target"} size={22} color={goal.color || C.blue}/>
                    <span style={{ fontSize: 12, color: C.main, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{goal.name}</span>
                    {monthlyNeeded != null ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.main, flexShrink: 0 }}>
                        {sym}{fmtAmtAuto(monthlyNeeded)}/мес
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>без дедлайна</span>
                    )}
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)", marginBottom: 3 }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, background: goal.color || C.blue, transition: "width 0.4s ease" }}/>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: C.dim }}>
                      {sym}{fmtAmtAuto(totalSaved)} из {getSym(goal.currency || BASE_CUR)}{fmtAmtAuto(goal.target)} · {Math.round(pct * 100)}%
                    </span>
                    {goal.deadline && (
                      <span style={{ fontSize: 10, color: C.dim }}>до {goal.deadline}</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  );
});
