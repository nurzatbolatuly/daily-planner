import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MONTHS } from "../../../constants/locale";
import { pad } from "../../../utils/date";
import { getSym, fmtAmt, toBase, ratesFromAccounts } from "../../../utils/format";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

const SAVINGS_PURPOSES = ["investment", "savings", "reserve"];

function PlanTable({ rows, totalPlan, totalAct, label, accentColor, expanded, toggle, navigate, planMonthKey, sym, rates }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: accentColor }}>{label}</p>
      <div style={{ background: C.monCard, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: 340 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 14px", background: "rgba(255,255,255,0.05)" }}>
              {["Category", "Plan", "Fact", "Rest"].map(h => (
                <p key={h} style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.dim, textAlign: "center" }}>{h}</p>
              ))}
            </div>

            {rows.map(r => {
              const { key, cat, type, plan, planCurrency, items, planData, accId } = r;
              const actual = r.actual;
              const pb = toBase(plan, planCurrency, rates);
              const rest = pb - actual;
              const its = (items || []).filter(it => it.amount);
              const isOpen = !!expanded[key];
              return (
                <div key={key} style={{ borderTop: `1px solid ${C.border}` }}>
                  <div onClick={() => toggle(key)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 14px", cursor: "pointer", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <CatIcon k={cat?.icon || "other"} size={28} color={cat?.color || "#607d8b"} />
                      <span style={{ fontSize: 12, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat?.name || "—"}</span>
                      <Ico n={isOpen ? "chevU" : "chevD"} s={13} c={C.dim} />
                    </div>
                    <p style={{ margin: 0, fontSize: 12, textAlign: "center", color: C.mid }}>
                      {planCurrency === BASE_CUR ? `${sym}${fmtAmt(plan, 0)}` : `${getSym(planCurrency)}${fmtAmt(plan, 0)}`}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, textAlign: "center", color: C.main }}>{sym}{fmtAmt(actual, 0)}</p>
                    <p style={{ margin: 0, fontSize: 12, textAlign: "center", fontWeight: 600, color: rest >= 0 ? "#34d399" : "#f87171" }}>{sym}{fmtAmt(rest, 0)}</p>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 14px 12px" }}>
                      {its.map(it => (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0 3px 34px" }}>
                          <span style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>• {it.label || "—"}</span>
                          <span style={{ fontSize: 12, color: C.mid, flexShrink: 0 }}>{getSym(planCurrency)}{fmtAmt(it.amount, 0)}</span>
                        </div>
                      ))}
                      {its.length === 0 && planData && (
                        <p style={{ margin: "3px 0 0 34px", fontSize: 12, color: C.dim }}>No breakdown</p>
                      )}
                      {planData ? (
                        <button
                          onClick={() => navigate("editPlan", planData)}
                          style={{ marginTop: 8, marginLeft: 34, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate("addPlan", { month: planMonthKey, cat_id: cat?.id, acc_id: accId, type })}
                          style={{ marginTop: 8, marginLeft: 34, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Set plan
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 14px", borderTop: `1px solid rgba(255,255,255,0.1)`, background: "rgba(255,255,255,0.04)" }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.mid }}>Total</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textAlign: "center", color: C.mid }}>{sym}{fmtAmt(totalPlan, 0)}</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textAlign: "center", color: C.main }}>{sym}{fmtAmt(totalAct, 0)}</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textAlign: "center", color: (totalPlan - totalAct) >= 0 ? "#34d399" : "#f87171" }}>{sym}{fmtAmt(totalPlan - totalAct, 0)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MoneyPlansSection({ data, navigate, plansTab, setPlansTab }) {
  const { accounts, transactions, transfers, expCats, incCats, monthPlans, tripPlans } = data;
  const [planMonth, setPlanMonth] = useState(new Date().getMonth());
  const [planYear,  setPlanYear]  = useState(new Date().getFullYear());
  const [expanded,  setExpanded]  = useState({});
  const toggle = key => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const sym   = getSym(BASE_CUR);
  const rates = ratesFromAccounts(accounts);
  const planMonthKey = `${planYear}-${pad(planMonth + 1)}`;
  const monthRows    = monthPlans.filter(p => p.month === planMonthKey);

  const txsM = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === planMonth && d.getFullYear() === planYear;
  });

  const transfersM = transfers.filter(t => {
    const d = new Date(t.created_at);
    return d.getMonth() === planMonth && d.getFullYear() === planYear && !t.is_adjustment;
  });

  const getActual = (catId, type) =>
    txsM
      .filter(t => t.type === type && t.category_id === catId)
      .reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);

  const getSavingsActual = (accId) =>
    transfersM
      .filter(t => t.to_id === accId)
      .reduce((s, t) => s + toBase(t.to_amt ?? t.amount, t.to_currency || t.from_currency, rates), 0);

  const buildRows = (cats, type) =>
    cats.map(cat => {
      const planData = monthRows.find(p => p.cat_id === cat.id && p.type === type) ?? null;
      return {
        key:          `${cat.id}-${type}`,
        cat,
        type,
        plan:         planData?.plan ?? 0,
        planCurrency: planData?.plan_currency ?? BASE_CUR,
        items:        planData?.items ?? [],
        planData,
        actual:       getActual(cat.id, type),
      };
    });

  const savingsAccounts = accounts.filter(a => SAVINGS_PURPOSES.includes(a.purpose));
  const savingsRows = savingsAccounts.map(acc => {
    const planData = monthRows.find(p => p.type === "savings" && p.acc_id === acc.id) ?? null;
    return {
      key:          `sav-${acc.id}`,
      cat:          { icon: acc.icon, color: acc.color, name: acc.name },
      type:         "savings",
      plan:         planData?.plan ?? 0,
      planCurrency: planData?.plan_currency ?? BASE_CUR,
      items:        planData?.items ?? [],
      planData,
      actual:       getSavingsActual(acc.id),
      accId:        acc.id,
    };
  });

  const expRows = buildRows(expCats, "expense");
  const incRows = buildRows(incCats, "income");

  const sum = (rows, field) => rows.reduce((s, r) => s + toBase(r[field], r.planCurrency, rates), 0);
  const totalPlanExp = sum(expRows, "plan");
  const totalPlanInc = sum(incRows, "plan");
  const totalPlanSav = sum(savingsRows, "plan");
  const totalActExp  = expRows.reduce((s, r) => s + r.actual, 0);
  const totalActInc  = incRows.reduce((s, r) => s + r.actual, 0);
  const totalActSav  = savingsRows.reduce((s, r) => s + r.actual, 0);

  const totalPlanExpAll = totalPlanExp + totalPlanSav;

  const prevM = () => {
    if (planMonth === 0) { setPlanMonth(11); setPlanYear(y => y - 1); }
    else setPlanMonth(m => m - 1);
  };
  const nextM = () => {
    if (planMonth === 11) { setPlanMonth(0); setPlanYear(y => y + 1); }
    else setPlanMonth(m => m + 1);
  };

  const exportPlanCSV = () => {
    const rows = [["Category", "Type", "Plan", "Currency", "PlanBase", "Actual", "Remaining"]];
    [...expRows, ...incRows, ...savingsRows].forEach(r => {
      const pb = toBase(r.plan, r.planCurrency, rates);
      rows.push([r.cat?.name || "", r.type, r.plan, r.planCurrency, pb.toFixed(2), r.actual.toFixed(2), (pb - r.actual).toFixed(2)]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `plan_${planYear}-${pad(planMonth + 1)}.csv`;
    a.click();
  };

  const tableProps = { expanded, toggle, navigate, planMonthKey, sym, rates };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: C.monHeader, padding: "14px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>Plans</p>
      </div>
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", margin: "12px 16px", borderRadius: 10, padding: 3 }}>
        {[["month", "Monthly"], ["trips", "Trips"]].map(([v, l]) => (
          <button key={v} onClick={() => setPlansTab(v)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: plansTab === v ? C.monCard2 : "transparent", color: plansTab === v ? C.green : C.dim }}>{l}</button>
        ))}
      </div>

      {plansTab === "month" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={prevM} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex" }}><Ico n="chevL" s={20} /></button>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{RU_MONTHS[planMonth]} {planYear}</span>
            <button onClick={nextM} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex" }}><Ico n="chevR" s={20} /></button>
            <button onClick={exportPlanCSV} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", marginLeft: 8 }}><Ico n="download" s={18} c={C.mid} /></button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { l: "Inc Plan",  v: `${sym}${fmtAmt(totalPlanInc, 0)}`,              c: "#34d399" },
              { l: "Exp Plan",  v: `${sym}${fmtAmt(totalPlanExpAll, 0)}`,            c: "#f87171" },
              { l: "Remainder", v: `${sym}${fmtAmt(totalPlanInc - totalPlanExpAll, 0)}`, c: "#60a5fa" },
            ].map((c, i) => (
              <div key={i} style={{ background: C.monCard, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
                <p style={{ margin: "0 0 4px", fontSize: 9, color: C.dim }}>{c.l}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.c }}>{c.v}</p>
              </div>
            ))}
          </div>

          <PlanTable
            {...tableProps}
            rows={expRows}
            totalPlan={totalPlanExp}
            totalAct={totalActExp}
            label="Expenses"
            accentColor="#f87171"
          />
          {savingsAccounts.length > 0 && (
            <PlanTable
              {...tableProps}
              rows={savingsRows}
              totalPlan={totalPlanSav}
              totalAct={totalActSav}
              label="Savings / Invest."
              accentColor="#60a5fa"
            />
          )}
          <PlanTable
            {...tableProps}
            rows={incRows}
            totalPlan={totalPlanInc}
            totalAct={totalActInc}
            label="Income"
            accentColor="#34d399"
          />
        </div>
      )}

      {plansTab === "trips" && (
        <div style={{ padding: "0 16px" }}>
          {tripPlans.length === 0 && <p style={{ textAlign: "center", padding: "40px 0", color: C.dim, fontSize: 14 }}>No trip plans yet</p>}
          {tripPlans.map(tp => {
            const allExp = (tp.days || []).flatMap(d => d.expenses || []);
            const total = allExp.reduce((s, e) => s + toBase(e.amount, e.currency, rates), 0);
            const paid  = allExp.reduce((s, e) => s + toBase(e.paidAmount || 0, e.currency, rates), 0);
            return (
              <div key={tp.id} onClick={() => navigate("tripDetail", tp)} style={{ background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 12, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{tp.name}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: C.dim }}>{tp.start_date} → {tp.end_date} · {(tp.days || []).length} days</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{sym}{fmtAmt(total, 0)}</p>
                    <p style={{ margin: 0, fontSize: 11, color: C.green }}>{sym}{fmtAmt(paid, 0)} paid</p>
                  </div>
                </div>
                {total > 0 && (
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${Math.min(paid / total * 100, 100)}%`, background: C.green }} />
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => navigate("addTrip")} style={{ width: "100%", padding: "13px", borderRadius: 12, background: "transparent", border: `1px dashed rgba(76,175,80,0.4)`, color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>+ New trip plan</button>
        </div>
      )}
    </div>
  );
}
