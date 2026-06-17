import { useMemo } from "react";
import { C } from "../../../constants/theme";
import { RU_MON_GEN } from "../../../constants/locale";
import { getSym, fmtAmtAuto, toBase, ratesFromAccounts } from "../../../utils/format";
import { CatIcon } from "../../../components/CatIcon";
import { GOAL_TYPES } from "../../../constants/money";

const TYPE_LABEL = Object.fromEntries(GOAL_TYPES.map(t => [t.key, t.label]));

function fmtDeadline(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${RU_MON_GEN[m - 1]} ${y}`;
}

export function GoalListPage({ goals, goalTopups = [], accounts = [], navigate }) {
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);

  return (
    <div style={{ padding: "12px 16px 24px" }}>
      {goals.length === 0 && (
        <p style={{ textAlign: "center", padding: "40px 0", color: C.dim, fontSize: 14 }}>
          Нет финансовых целей
        </p>
      )}

      {goals.map(goal => {
        const myTopups   = goalTopups.filter(t => t.goal_id === goal.id);
        const savedBase  = myTopups.reduce((s, t) => s + toBase(t.amount, t.currency, rates), 0);
        const targetBase = toBase(goal.target, goal.currency, rates);
        const pct        = targetBase > 0 ? Math.min(savedBase / targetBase, 1) : 0;
        const sym  = getSym(goal.currency || "KZT");
        const done = pct >= 1 && savedBase > 0;

        return (
          <div
            key={goal.id}
            onClick={() => navigate("goalDetail", goal)}
            style={{ background: C.monCard, borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer" }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <CatIcon k={goal.icon || "target"} size={38} color={goal.color || C.blue}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{goal.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: C.dim }}>
                  {goal.deadline
                    ? `до ${fmtDeadline(goal.deadline)}`
                    : (TYPE_LABEL[goal.type] || "Цель")}
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: goal.color || C.blue }}>
                  {sym}{fmtAmtAuto(goal.target)}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 700, color: done ? C.emerald : (goal.color || C.blue) }}>
                  {done ? "✓ готово" : `${Math.round(pct * 100)}%`}
                </p>
              </div>
            </div>

            {/* Progress row */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: C.dim }}>
                  накоплено {sym}{fmtAmtAuto(savedBase)}
                </span>
                <span style={{ fontSize: 10, color: C.dim }}>
                  из {sym}{fmtAmtAuto(goal.target)}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                <div style={{
                  height: 4, borderRadius: 2,
                  width: `${pct * 100}%`,
                  background: done ? C.emerald : (goal.color || C.blue),
                  transition: "width 0.4s ease",
                }}/>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => navigate("addGoal")}
        style={{
          width: "100%", padding: 13, borderRadius: 12, background: "transparent",
          border: `1px dashed rgba(96,165,250,0.4)`, color: C.blue,
          fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 4,
        }}
      >
        + Новая цель
      </button>
    </div>
  );
}
