import { useState, useEffect, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MON_GEN } from "../../../constants/locale";
import { daysBetween, todayStr, monthKey, pad } from "../../../utils/date";
import { getSym, fmtAmt, toBase, ratesFromAccounts } from "../../../utils/format";
import { supabase, supaUpsert } from "../../../lib/supabase";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { Spinner } from "../../../components/Spinner";
import { CatIcon } from "../../../components/CatIcon";
import { NumInput } from "../../../components/NumInput";

function fmtDate(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDeadline(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${RU_MON_GEN[m - 1]} ${y} г.`;
}

export function GoalDetailPage({ goal: initialGoal, accounts, transactions = [], navigate, onBack }) {
  const [localGoal, setLocalGoal]         = useState(initialGoal);
  const [topups, setTopups]               = useState([]);
  const [loadingTopups, setLoadingTopups] = useState(true);
  const [editingCurVal, setEditingCurVal] = useState(false);
  const [curValInput, setCurValInput]     = useState(String(initialGoal.current_value || 0));

  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const sym   = getSym(localGoal.currency || BASE_CUR);

  useEffect(() => {
    let cancelled = false;
    supabase.from("goals").select("*").eq("id", initialGoal.id).single()
      .then(({ data }) => {
        if (!cancelled && data) {
          setLocalGoal(data);
          setCurValInput(String(data.current_value || 0));
        }
      });
    return () => { cancelled = true; };
  }, [initialGoal.id]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("goal_topups").select("*")
      .eq("goal_id", initialGoal.id)
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) { setTopups(data || []); setLoadingTopups(false); }
      });
    return () => { cancelled = true; };
  }, [initialGoal.id]);

  const totalSaved = useMemo(
    () => topups.reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0),
    [topups, rates]
  );
  const targetBase     = toBase(localGoal.target, localGoal.currency, rates);
  const pct            = targetBase > 0 ? Math.min(totalSaved / targetBase, 1) : 0;
  const remaining      = Math.max(targetBase - totalSaved, 0);
  const monthsLeft     = localGoal.deadline ? Math.max(daysBetween(todayStr(), localGoal.deadline) / 30, 1) : null;
  const monthlyNeeded  = monthsLeft && remaining > 0 ? remaining / monthsLeft : null;

  const safetyNetRec = useMemo(() => {
    if (localGoal.type !== "safety_net") return null;
    const now = new Date();
    const months3 = [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    });
    const totalExp = transactions
      .filter(t => t.type === "expense" && months3.includes(monthKey(t.date)))
      .reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);
    const avgMonthlyExp = totalExp / 3;
    return { avgMonthlyExp, recommendedTarget: avgMonthlyExp * 3 };
  }, [localGoal.type, transactions, rates]);

  const roiData = useMemo(() => {
    if (localGoal.type !== "investment") return null;
    const invested   = topups.reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);
    const currentVal = toBase(localGoal.current_value || 0, localGoal.currency, rates);
    const gain       = currentVal - invested;
    const roiPct     = invested > 0 ? gain / invested * 100 : 0;
    const lastTopup  = topups[topups.length - 1];
    const mHeld      = lastTopup ? daysBetween(lastTopup.date, todayStr()) / 30 : 0;
    const annualized = mHeld > 0 ? (Math.pow(1 + roiPct / 100, 12 / mHeld) - 1) * 100 : 0;
    return { invested, currentVal, gain, roiPct, annualized };
  }, [localGoal, topups, rates]);

  const saveCurVal = async () => {
    const v = parseFloat(curValInput) || 0;
    await supaUpsert("goals", { ...localGoal, current_value: v });
    setLocalGoal(g => ({ ...g, current_value: v }));
    setEditingCurVal(false);
  };

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={localGoal.name} onBack={() => onBack(false)}
        right={
          <button onClick={() => navigate("editGoal", localGoal)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <Ico n="edit" s={20} c={C.mid}/>
          </button>
        }
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 80px" }}>

        {/* Progress card */}
        <div style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <CatIcon k={localGoal.icon || "target"} size={44} color={localGoal.color || C.blue}/>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Накоплено</p>
              <p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                {sym}{fmtAmt(totalSaved, 0)}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: C.dim }}>
                из {sym}{fmtAmt(localGoal.target, 0)}
              </p>
            </div>
          </div>

          <div style={{ marginBottom: remaining === 0 && totalSaved > 0 ? 10 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.dim }}>Прогресс</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: localGoal.color || C.blue }}>{Math.round(pct * 100)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: 8, borderRadius: 4, width: `${pct * 100}%`, background: localGoal.color || C.blue, transition: "width 0.5s ease" }}/>
            </div>
          </div>

          {remaining === 0 && totalSaved > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: C.emerald }}>Цель достигнута!</p>
          )}

          {/* Deadline */}
          {localGoal.deadline && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
              <Ico n="calendar" s={13} c={C.dim}/>
              <span style={{ fontSize: 12, color: C.dim }}>Дедлайн: </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{fmtDeadline(localGoal.deadline)}</span>
            </div>
          )}

          {monthlyNeeded != null && remaining > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: C.dim }}>
              Нужно{" "}
              <span style={{ color: C.main, fontWeight: 600 }}>{sym}{fmtAmt(monthlyNeeded, 0)}/мес</span>
              {monthsLeft && ` · осталось ~${Math.round(monthsLeft)} мес.`}
            </p>
          )}
        </div>

        {/* Safety net recommendation */}
        {safetyNetRec && (
          <div style={{ background: "rgba(96,165,250,0.08)", borderRadius: 14, padding: "12px 16px", marginBottom: 14, border: "1px solid rgba(96,165,250,0.15)" }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: C.dim }}>Рекомендуемая подушка</p>
            <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700, color: C.blue }}>
              {sym}{fmtAmt(safetyNetRec.recommendedTarget, 0)}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>
              3 мес. расходов · {sym}{fmtAmt(safetyNetRec.avgMonthlyExp, 0)}/мес (среднее)
            </p>
          </div>
        )}

        {/* ROI block */}
        {roiData && (
          <div style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: C.amber }}>ROI</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label="Вложено" value={`${sym}${fmtAmt(roiData.invested, 0)}`}/>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.dim }}>Текущая стоимость:</span>
                {editingCurVal ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <NumInput
                      value={curValInput} onChange={setCurValInput}
                      style={{ width: 110, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", color: "#fff", fontSize: 13, outline: "none" }}
                    />
                    <button onClick={saveCurVal} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                      <Ico n="check" s={18} c={C.emerald}/>
                    </button>
                    <button onClick={() => setEditingCurVal(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                      <Ico n="x" s={16} c={C.dim}/>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: C.main }}>{sym}{fmtAmt(roiData.currentVal, 0)}</span>
                    <button
                      onClick={() => { setCurValInput(String(localGoal.current_value || 0)); setEditingCurVal(true); }}
                      style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                      <Ico n="edit" s={14} c={C.dim}/>
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: C.dim }}>Доход:</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: roiData.gain >= 0 ? C.emerald : C.errorLight }}>
                  {roiData.gain >= 0 ? "+" : ""}{sym}{fmtAmt(Math.abs(roiData.gain), 0)}
                  {" "}({roiData.gain >= 0 ? "+" : ""}{roiData.roiPct.toFixed(1)}%)
                </span>
              </div>
              {Math.abs(roiData.annualized) > 0.1 && (
                <Row label="Годовых" value={`~${roiData.annualized.toFixed(1)}%`}/>
              )}
            </div>
          </div>
        )}

        {/* Calculator */}
        <GoalCalculator
          sym={sym}
          defaultAmt={localGoal.target}
          monthsLeft={monthsLeft}
          color={localGoal.color || C.blue}
        />

        {/* Linked account banner */}
        {localGoal.account_id && (() => {
          const linkedAcc = accounts.find(a => a.id === localGoal.account_id);
          if (!linkedAcc) return null;
          return (
            <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 14, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <CatIcon k={linkedAcc.icon} size={36} color={linkedAcc.color}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Привязанный счёт</p>
                <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkedAcc.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: C.dim }}>
                  {getSym(linkedAcc.currency)}{fmtAmt(linkedAcc.balance, 0)} · переводы сюда = пополнение цели
                </p>
              </div>
            </div>
          );
        })()}

        {/* Topup history */}
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.dim }}>История пополнений</p>

        {loadingTopups ? (
          <div style={{ textAlign: "center", padding: 24 }}><Spinner color={C.blue}/></div>
        ) : topups.length === 0 ? (
          <p style={{ textAlign: "center", padding: "24px 0", color: C.dim, fontSize: 13 }}>Нет пополнений</p>
        ) : (
          topups.map(t => (
            <div key={t.id}
              style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.dim, width: 38, flexShrink: 0 }}>{fmtDate(t.date)}</span>
              <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                <span style={{ fontSize: 14, color: C.main }}>
                  {getSym(t.currency || "KZT")}{fmtAmt(t.amount, 0)}
                </span>
                {t.note && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function GoalCalculator({ sym, defaultAmt, monthsLeft, color }) {
  const [dir, setDir] = useState("month");
  const [amt, setAmt] = useState(String(Math.round(defaultAmt || 0)));
  const [snd, setSnd] = useState(String(Math.round(monthsLeft || 12)));

  const amtN   = parseFloat(amt) || 0;
  const sndN   = Math.max(parseFloat(snd) || 1, 0.01);
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
      {/* Header */}
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

      {/* Inputs row */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        {/* Amount */}
        <div style={{ flex: 2 }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: C.dim }}>Сумма</p>
          <NumInput value={amt} onChange={setAmt} style={inputStyle}/>
        </div>

        <span style={{ color: C.dim, fontSize: 18, paddingBottom: 10, flexShrink: 0 }}>÷</span>

        {/* Secondary: months or monthly payment */}
        <div style={{ flex: 1.5 }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: C.dim }}>
            {dir === "month" ? "Месяцев" : "Плат./мес"}
          </p>
          <NumInput value={snd} onChange={setSnd} style={inputStyle}/>
        </div>

        <span style={{ color: C.dim, fontSize: 16, paddingBottom: 10, flexShrink: 0 }}>=</span>

        {/* Result */}
        <div style={{ flex: 1.8, textAlign: "right", paddingBottom: 2 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: color, lineHeight: 1.15 }}>
            {isFinite(result) && result > 0
              ? dir === "month"
                ? `${sym}${fmtAmt(result, 0)}`
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

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: C.dim }}>{label}:</span>
      <span style={{ fontSize: 12, color: C.main }}>{value}</span>
    </div>
  );
}
