import { useState, useMemo, useEffect, useRef, memo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { SAVINGS_PURPOSES } from "../../../constants/money";
import { pad } from "../../../utils/date";
import { getSym, fmtAmtAuto, fmtM, toBase, ratesFromAccounts, calcTotalBalanceAtMonth, fmtDateShort } from "../../../utils/format";
import { computeDebtState } from "../../../utils/debtUtils";
import { withPersonalAmounts } from "../../../utils/debtLedger";
import { getSavedOrder } from "../../../utils/accountOrder";
import { exportPlansXLSX } from "../../../utils/export";
import { newId } from "../../../utils/id";
import { supaUpsert } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { NumInput } from "../../../components/NumInput";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { GoalListPage } from "./GoalListPage";

// Месяц+1 от (year, month), month — 0-индексный (как Date.getMonth()).
function addMonth(year, month) {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

// Возвращает "YYYY-MM".
function nextMonthKey(year, month) {
  const { year: y, month: m } = addMonth(year, month);
  return `${y}-${pad(m + 1)}`;
}

// Строит план/факт-строки (расходы, доходы, накопления) для произвольного месяца — то же самое,
// что раньше считалось только для отображаемого planMonth/planYear. Вынесено в чистую функцию,
// чтобы её же можно было прогнать по промежуточным месяцам при проекции баланса вперёд (см.
// projectAvailableBalance ниже) без дублирования логики.
function buildPlanRows({ year, month, accounts, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState }) {
  const mk = `${year}-${pad(month + 1)}`;
  const monthRowsData = monthPlans.filter(p => p.month === mk);
  const txsM = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const transfersM = transfers.filter(t => {
    const d = new Date(t.created_at);
    return d.getMonth() === month && d.getFullYear() === year && !t.is_adjustment;
  });
  const { repaymentSavings } = debtState;

  const getActual = (catId, type) =>
    txsM.filter(t => t.type === type && t.category_id === catId)
      .reduce((s, t) => s + toBase(t.amount, t.currency, accountRates), 0);

  const getSavingsActual = accId => {
    const regularInc = transfersM
      .filter(t => t.to_id === accId && !t.is_debt_repayment)
      .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, accountRates), 0);
    const repayExcess = transfersM
      .filter(t => t.to_id === accId && t.is_debt_repayment)
      .reduce((s, t) => s + (repaymentSavings[t.id] || 0), 0);
    return regularInc + repayExcess;
  };

  const buildRows = (cats, type) =>
    cats.map(cat => {
      const planData = monthRowsData.find(p => p.cat_id === cat.id && p.type === type) ?? null;
      return { key: `${cat.id}-${type}`, cat, type, plan: planData?.plan ?? 0, planCurrency: planData?.plan_currency ?? BASE_CUR, items: planData?.items ?? [], planData, actual: getActual(cat.id, type) };
    });

  const savingsAccounts = getSavedOrder(accounts).filter(a => SAVINGS_PURPOSES.includes(a.purpose));
  return {
    mk,
    expRows: buildRows(expCats, "expense"),
    incRows: buildRows(incCats, "income"),
    savingsRows: savingsAccounts.map(acc => {
      const planData = monthRowsData.find(p => p.type === "savings" && p.acc_id === acc.id) ?? null;
      return { key: `sav-${acc.id}`, cat: { icon: acc.icon, color: acc.color, name: acc.name }, type: "savings", plan: planData?.plan ?? 0, planCurrency: planData?.plan_currency ?? BASE_CUR, items: planData?.items ?? [], planData, actual: getSavingsActual(acc.id), accId: acc.id };
    }),
  };
}

const sumRowsField = (rows, field, rates) => rows.reduce((s, r) => s + toBase(r[field], r.planCurrency, rates), 0);

// Сколько ещё не исполнено из плана месяца (остаток дохода минус остаток расхода минус остаток
// накоплений) — та же формула, что и activeIncome/activeExpense/activeSavings для отображаемого
// месяца, но параметризованная, чтобы применить её к любому "промежуточному" месяцу при проекции.
function remainingMonthNet({ expRows, incRows, savingsRows }, rates) {
  const totalPlanInc = sumRowsField(incRows, "plan", rates);
  const totalActInc  = incRows.reduce((s, r) => s + r.actual, 0);
  const totalPlanExp = sumRowsField(expRows, "plan", rates);
  const planExpCovered = expRows.reduce((s, r) => {
    const pb = toBase(r.plan, r.planCurrency, rates);
    return pb > 0 ? s + Math.min(r.actual, pb) : s;
  }, 0);
  const totalPlanSav = sumRowsField(savingsRows, "plan", rates);
  const totalActSav  = savingsRows.reduce((s, r) => s + r.actual, 0);

  const incRemaining = Math.max(totalPlanInc - totalActInc, 0);
  const expRemaining = Math.max(totalPlanExp - planExpCovered, 0);
  const savRemaining = Math.max(totalPlanSav - Math.max(totalActSav, 0), 0);
  return incRemaining - expRemaining - savRemaining;
}

// Баланс, доступный к началу planMonthKey. Для текущего/прошлого месяца — фактический баланс
// счетов на конец этого месяца (как и раньше). Для будущего месяца (когда планируешь наперёд) —
// сегодняшний фактический баланс ПЛЮС ещё не исполненный остаток плана (доход − расход −
// накопления) по каждому месяцу между сегодняшним и планируемым: то есть свободная сумма, которая
// реально останется к тому моменту, а не весь текущий баланс счетов "как есть сейчас".
function projectAvailableBalance({ accounts, rawTransactions, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState, planMonthKey }) {
  const now = new Date();
  const realMonthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const realBalance = calcTotalBalanceAtMonth(accounts, rawTransactions, transfers, realMonthKey);

  if (planMonthKey <= realMonthKey) {
    return calcTotalBalanceAtMonth(accounts, rawTransactions, transfers, planMonthKey);
  }

  let bal = realBalance;
  let y = now.getFullYear(), m = now.getMonth();
  while (`${y}-${pad(m + 1)}` < planMonthKey) {
    const monthData = buildPlanRows({ year: y, month: m, accounts, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState });
    bal += remainingMonthNet(monthData, accountRates);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return bal;
}

function PlanTable({ rows, totalPlan, totalAct, label, accentColor, expanded, toggle, navigate, planMonthKey, sym, rates, onCopy, copyingId, copiedId }) {
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
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {it.date && (
                              <span style={{ fontSize: 10, color: C.dim, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "1px 6px", whiteSpace: "nowrap" }}>
                                {parseInt(it.date.split("-")[2], 10)} число
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: C.mid }}>{getSym(planCurrency)}{fmtAmtAuto(it.amount)}</span>
                          </div>
                        </div>
                      ))}
                      {its.length === 0 && planData && (
                        <p style={{ margin: "3px 0 0 34px", fontSize: 12, color: C.dim }}>Нет разбивки</p>
                      )}
                      {planData ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, marginLeft: 34 }}>
                          <button onClick={() => navigate("editPlan", planData)}
                            style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            Редактировать
                          </button>
                          <button
                            onClick={() => onCopy(planData)}
                            disabled={copyingId === planData.id}
                            title="Скопировать план на следующий месяц"
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: copiedId === planData.id ? C.green : C.dim, fontSize: 12, fontWeight: 600, cursor: copyingId === planData.id ? "default" : "pointer", opacity: copyingId === planData.id ? 0.5 : 1 }}>
                            <Ico n={copiedId === planData.id ? "check" : "copy"} s={13} c={copiedId === planData.id ? C.green : C.dim}/>
                            {copiedId === planData.id ? "Скопировано" : copyingId === planData.id ? "Копирую…" : "На след. месяц"}
                          </button>
                        </div>
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
function SelfDebtCard({ debtData, accounts, sym, navigate, cardRef }) {
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
                <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{fmtM(total, acc.currency)}</span>
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
                      {fmtM(t.amount, t.from_currency)}
                    </span>
                  </div>
                );
              })}
              {/* Кнопка возврата для конкретного счёта — подставляет ровно ту сумму/валюту,
                  что была снята (грамм для металла, исходная валюта для остальных), а не KZT-эквивалент */}
              <div style={{ padding: "8px 16px 12px" }}>
                <button
                  onClick={() => navigate("transfer", acc.currency === BASE_CUR
                    ? { to_id: acc.id, amount: total, is_debt_repayment: true }
                    : { to_id: acc.id, toAmt: total, is_debt_repayment: true })}
                  style={{ width: "100%", padding: "10px", borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.32)", color: C.amber, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Вернуть {fmtM(total, acc.currency)} в «{acc.name}» →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Карточка с разбивкой уже запланированных расходов следующего месяца — эта сумма отложена
// (зарезервирована) из "Свободно" текущего месяца, чтобы деньги под уже известные будущие траты
// случайно не разошлись на что-то другое в этом месяце.
function NextMonthReserveCard({ rows, total, sym, monthLabel, onGoToMonth }) {
  const [open, setOpen] = useState(false);
  if (total <= 0) return null;

  const items = rows.filter(r => r.plan > 0);

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 14, border: "1px solid rgba(167,139,250,0.22)" }}>
      <div
        onClick={() => setOpen(p => !p)}
        style={{ background: "rgba(167,139,250,0.08)", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico n="calendar" s={18} c={C.violet}/>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.violet }}>Уже запланировано на {monthLabel}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(167,139,250,0.55)" }}>Отложено из «Свободно» этого месяца</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.violet }}>{sym}{fmtAmtAuto(total)}</span>
          <Ico n={open ? "chevU" : "chevD"} s={16} c={C.violet}/>
        </div>
      </div>

      {open && (
        <div style={{ background: "rgba(167,139,250,0.03)", borderTop: "1px solid rgba(167,139,250,0.12)" }}>
          {items.map(r => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <CatIcon k={r.cat?.icon || "other"} size={22} color={r.cat?.color || C.violet}/>
                <span style={{ fontSize: 13, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cat?.name || "—"}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(167,139,250,0.85)", flexShrink: 0, marginLeft: 8 }}>
                {getSym(r.planCurrency)}{fmtAmtAuto(r.plan)}
              </span>
            </div>
          ))}
          <div style={{ padding: "6px 16px 12px" }}>
            <button
              onClick={onGoToMonth}
              style={{ width: "100%", padding: "10px", borderRadius: 10, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.32)", color: C.violet, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Перейти к планированию {monthLabel} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const MoneyBudgetSection = memo(function MoneyBudgetSection({ data, navigate, budgetTab, setBudgetTab, planMonth, setPlanMonth, planYear, setPlanYear }) {
  const { accounts, transactions: rawTransactions, transfers, expCats, incCats, monthPlans, tripPlans, goals, debtEvents } = data;
  // Личная доля вместо полной суммы для сплит-расходов (см. MoneyHomeSection).
  const transactions = useMemo(() => withPersonalAmounts(rawTransactions, debtEvents), [rawTransactions, debtEvents]);

  const [expanded,   setExpanded]   = useState({});
  const [activePill,        setActivePill]        = useState("expense");
  const [activePerspective, setActivePerspective] = useState("plan");
  const [showCal,           setShowCal]           = useState(false);
  const [monthRates, setMonthRates] = useState({});
  const [rateInputs, setRateInputs] = useState({});
  const [ratesOpen,  setRatesOpen]  = useState(false);
  const [copyingId,  setCopyingId]  = useState(null);
  const [copiedId,   setCopiedId]   = useState(null);
  const [copyConfirm, setCopyConfirm] = useState(null); // { planData, targetMonthKey, existingId, label }
  const copiedTimerRef = useRef(null);

  useEffect(() => () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current); }, []);

  const toggle      = key => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const sym         = getSym(BASE_CUR);
  const debtCardRef = useRef(null);

  const planMonthKey = `${planYear}-${pad(planMonth + 1)}`;

  useEffect(() => {
    try { setMonthRates(JSON.parse(localStorage.getItem(`mon.rates.${planMonthKey}`)) || {}); } catch { setMonthRates({}); }
    setRateInputs({});
  }, [planMonthKey]);

  const accountRates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  // planRates — для конвертации плановых сумм (включает ручной курс месяца)
  // accountRates — для конвертации фактических транзакций (только курс из счетов)
  const planRates = useMemo(() => ({ ...accountRates, ...monthRates }), [accountRates, monthRates]);

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

  // Долг самому себе — хронологическая обработка ВСЕЙ истории переводов.
  // repaymentSavings[id] = излишек конкретного погашения сверх долга (= реальное накопление).
  const debtState = useMemo(
    () => computeDebtState(transfers, accounts, accountRates),
    [transfers, accounts, accountRates]
  );

  const { expRows, incRows, savingsRows } = useMemo(
    () => buildPlanRows({ year: planYear, month: planMonth, accounts, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState }),
    [planYear, planMonth, accounts, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState]
  );

  // Уже запланированные расходы след. месяца — резервируются из "Свободно" этого месяца, чтобы
  // не потратить деньги, которые по факту уже расписаны наперёд (см. NextMonthReserveCard).
  const { year: nextResY, month: nextResM } = addMonth(planYear, planMonth);
  const nextMonthExpRows = useMemo(
    () => buildPlanRows({ year: nextResY, month: nextResM, accounts, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState }).expRows,
    [nextResY, nextResM, accounts, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState]
  );
  const reserveNextMonth = useMemo(
    () => sumRowsField(nextMonthExpRows, "plan", accountRates),
    [nextMonthExpRows, accountRates]
  );
  const nextMonthLabel = `${RU_MONTHS[nextResM].toLowerCase()} ${nextResY}`;

  const selfDebtData = debtState;

  const sum = (rows, field) => rows.reduce((s, r) => s + toBase(r[field], r.planCurrency, planRates), 0);
  const { totalPlanExp, totalPlanInc, totalPlanSav, totalActExp, totalActInc, totalActSav, totalPlanExpAll, planExpCovered } = useMemo(() => {
    const tPE = sum(expRows, "plan"), tPI = sum(incRows, "plan"), tPS = sum(savingsRows, "plan");
    // How much actual expense "covers" planned categories (min of actual vs plan per row, only rows with a plan)
    const covered = expRows.reduce((s, r) => {
      const pb = toBase(r.plan, r.planCurrency, planRates);
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
  }, [expRows, incRows, savingsRows, planRates]);

  // Plan mode: remaining = what's still left to execute (plan minus progress, floored at 0).
  // planExpCovered uses per-category min so unplanned spending eats activeFree, not the plan bar.
  // planSavRemaining floors actSav at 0 so borrowing from savings doesn't inflate the bar.
  const planExpRemaining = Math.max(totalPlanExp - planExpCovered, 0);
  const planSavRemaining = Math.max(totalPlanSav - Math.max(totalActSav, 0), 0);
  const planIncRemaining = Math.max(totalPlanInc - totalActInc, 0);

  const activeIncome  = planIncRemaining;
  const activeExpense = planExpRemaining;
  const activeSavings = planSavRemaining;
  const totalBalance     = useMemo(
    () => projectAvailableBalance({ accounts, rawTransactions, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState, planMonthKey }),
    [accounts, rawTransactions, transactions, transfers, expCats, incCats, monthPlans, accountRates, debtState, planMonthKey]
  );
  const totalAvailable   = activeIncome + totalBalance;
  const activeFree       = totalAvailable - activeExpense - activeSavings - reserveNextMonth;
  const activeOverBudget = activeExpense + activeSavings + reserveNextMonth > totalAvailable;

  const usedPlanCurrencies = useMemo(() => {
    const curs = new Set();
    [...expRows, ...incRows, ...savingsRows].forEach(r => {
      if (r.planCurrency && r.planCurrency !== BASE_CUR && r.plan > 0) curs.add(r.planCurrency);
    });
    return [...curs];
  }, [expRows, incRows, savingsRows]);

  const missingCount = usedPlanCurrencies.filter(c => !planRates[c]).length;

  const prevM = () => {
    if (planMonth === 0) { setPlanMonth(11); setPlanYear(y => y - 1); }
    else setPlanMonth(m => m - 1);
  };
  const nextM = () => {
    if (planMonth === 11) { setPlanMonth(0); setPlanYear(y => y + 1); }
    else setPlanMonth(m => m + 1);
  };

  const copyPlan = async (planData, targetMonthKey, existingId) => {
    setCopyingId(planData.id);
    try {
      const newPlan = {
        id:            existingId || newId(),
        cat_id:        planData.cat_id,
        acc_id:        planData.acc_id,
        type:          planData.type,
        plan:          planData.plan,
        plan_currency: planData.plan_currency,
        month:         targetMonthKey,
        items:         (planData.items || []).map(it => ({ ...it, id: newId() })),
      };
      await supaUpsert("month_plans", newPlan);
      await data.reload();
      setCopiedId(planData.id);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } finally {
      setCopyingId(null);
    }
  };

  const handleCopyClick = (planData) => {
    const targetMonthKey = nextMonthKey(planYear, planMonth);
    const existing = monthPlans.find(p => p.month === targetMonthKey && p.type === planData.type &&
      (planData.type === "savings" ? p.acc_id === planData.acc_id : p.cat_id === planData.cat_id));
    if (existing) {
      const [ty, tm] = targetMonthKey.split("-").map(Number);
      setCopyConfirm({ planData, targetMonthKey, existingId: existing.id, label: `${RU_MONTHS[tm - 1]} ${ty}` });
    } else {
      copyPlan(planData, targetMonthKey, null);
    }
  };

  const exportXLSX = () => {
    exportPlansXLSX({
      expRows, incRows, savingsRows,
      totals: { totalPlanExp, totalPlanInc, totalPlanSav, totalActExp, totalActInc, totalActSav, totalPlanExpAll },
      rates: planRates, planMonth, planYear,
      filename: `plan_${planYear}-${pad(planMonth + 1)}.xlsx`,
    });
  };

  const tableProps = { expanded, toggle, navigate, planMonthKey, sym, rates: planRates, onCopy: handleCopyClick, copyingId, copiedId };

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
                  ...(reserveNextMonth > 0 ? [{ label: "Резерв след. мес.", amt: reserveNextMonth, color: C.violet }] : []),
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
                      ⚠ Расходы + накопления{reserveNextMonth > 0 ? " + резерв на след. месяц" : ""} превышают доступные средства на {sym}{fmtAmtAuto(activeExpense + activeSavings + reserveNextMonth - totalAvailable)}
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

          <NextMonthReserveCard rows={nextMonthExpRows} total={reserveNextMonth} sym={sym} monthLabel={nextMonthLabel} onGoToMonth={nextM}/>

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
              <SelfDebtCard debtData={selfDebtData} accounts={accounts} sym={sym} navigate={navigate} cardRef={debtCardRef}/>
            </>
          )}
          {activePill === "savings" && savingsRows.length === 0 && (
            <>
              <p style={{ textAlign: "center", padding: "32px 0", color: C.dim, fontSize: 13 }}>Нет накопительных счетов</p>
              <SelfDebtCard debtData={selfDebtData} accounts={accounts} sym={sym} navigate={navigate} cardRef={debtCardRef}/>
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

      <ConfirmSheet
        open={!!copyConfirm}
        onClose={() => setCopyConfirm(null)}
        onConfirm={() => {
          const cc = copyConfirm;
          setCopyConfirm(null);
          copyPlan(cc.planData, cc.targetMonthKey, cc.existingId);
        }}
        title="Перезаписать план?"
        message={copyConfirm ? `На ${copyConfirm.label} уже есть план для этой категории. Он будет заменён скопированным.` : ""}
        confirmLabel="Перезаписать"
      />
    </div>
  );
});
