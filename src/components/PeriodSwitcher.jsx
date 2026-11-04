import { C } from "../constants/theme";
import { PERIOD_TABS } from "../utils/period";
import { Ico } from "./Ico";

const navBtn = { background: "none", border: "none", cursor: "pointer", padding: "4px 8px", display: "flex" };

// Вкладки периода (день/неделя/месяц/год/все) + листание назад/вперёд.
// Пропсы — объект из usePeriodFilter: <PeriodSwitcher {...periodState}/>.
export function PeriodSwitcher({ period, offset, label, setPeriod, shift, resetOffset }) {
  const atPresent = offset >= 0;
  return (
    <>
      <div role="tablist" style={{ display: "flex", gap: 2, background: C.segmentBg, borderRadius: 10, padding: 3, marginBottom: 8 }}>
        {PERIOD_TABS.map(([v, l]) => {
          const active = period === v;
          return (
            <button key={v} role="tab" aria-selected={active} onClick={() => setPeriod(v)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: active ? C.monCard2 : "transparent", color: active ? C.green : C.dim }}>
              {l}
            </button>
          );
        })}
      </div>

      {period !== "all" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <button aria-label="Предыдущий период" onClick={() => shift(-1)} style={navBtn}>
            <Ico n="chevL" s={18} c={C.mid}/>
          </button>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.white, textAlign: "center" }}>{label}</span>
          {!atPresent && (
            <button onClick={resetOffset} style={{ padding: "3px 10px", borderRadius: 20, background: C.greenTintStrong, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Сейчас
            </button>
          )}
          <button aria-label="Следующий период" onClick={() => shift(1)} disabled={atPresent} style={{ ...navBtn, opacity: atPresent ? 0.2 : 1, cursor: atPresent ? "default" : "pointer" }}>
            <Ico n="chevR" s={18} c={C.mid}/>
          </button>
        </div>
      )}
    </>
  );
}
