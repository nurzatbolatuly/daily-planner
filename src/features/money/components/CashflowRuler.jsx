import { useRef, useMemo, useLayoutEffect } from "react";
import { C } from "../../../constants/theme";
import { RU_MONTHS_S } from "../../../constants/locale";
import { pad, todayStr } from "../../../utils/date";
import { daysBetweenDates } from "../../../utils/cashflowTimeline";

// Горизонтальная лента-календарь: зелёные насечки сверху = ожидаемые доходы,
// красные снизу = расходы с конкретной датой. Полосы фона чередуются по календарным
// месяцам. compact=true — уменьшенная версия для виджета на Главной (без подписей месяцев).
export function CashflowRuler({ rangeStart, rangeEnd, dayMap, onTapDay, compact = false }) {
  const today = todayStr();
  const dayW = compact ? 11 : 16;
  const height = compact ? 84 : 128;
  const tickH = compact ? 16 : 24;
  const scrollRef = useRef(null);

  const totalDays = daysBetweenDates(rangeStart, rangeEnd) + 1;
  const width = totalDays * dayW;
  const offsetOf = (date) => daysBetweenDates(rangeStart, date) * dayW;

  const bands = useMemo(() => {
    const res = [];
    const endD = new Date(rangeEnd + "T12:00:00");
    let y = new Date(rangeStart + "T12:00:00").getFullYear();
    let m = new Date(rangeStart + "T12:00:00").getMonth();
    let idx = 0;
    while (y < endD.getFullYear() || (y === endD.getFullYear() && m <= endD.getMonth())) {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const monthStartStr = `${y}-${pad(m + 1)}-01`;
      const monthEndStr = `${y}-${pad(m + 1)}-${pad(daysInMonth)}`;
      const segStart = monthStartStr < rangeStart ? rangeStart : monthStartStr;
      const segEnd = monthEndStr > rangeEnd ? rangeEnd : monthEndStr;
      res.push({
        key: `${y}-${m}`,
        left: offsetOf(segStart),
        width: (daysBetweenDates(segStart, segEnd) + 1) * dayW,
        label: `${RU_MONTHS_S[m]} ${y}`,
        alt: idx % 2 === 1,
      });
      idx++;
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, dayW]);

  const days = useMemo(
    () => Object.keys(dayMap).filter(d => d >= rangeStart && d <= rangeEnd),
    [dayMap, rangeStart, rangeEnd]
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, offsetOf(today) - el.clientWidth / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scrollRef}
      style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}
    >
      <div style={{ position: "relative", width, height }}>
        {bands.map(b => (
          <div key={b.key} style={{ position: "absolute", left: b.left, width: b.width, top: 0, bottom: 0, background: b.alt ? "rgba(255,255,255,0.03)" : "transparent" }}>
            {!compact && (
              <span style={{ position: "absolute", top: 6, left: 8, fontSize: 10, fontWeight: 600, color: C.dim, whiteSpace: "nowrap" }}>
                {b.label}
              </span>
            )}
          </div>
        ))}

        {/* Baseline */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(255,255,255,0.15)" }}/>

        {/* Today marker */}
        <div style={{ position: "absolute", left: offsetOf(today), top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.3)" }}/>

        {days.map(d => {
          const { income, expense } = dayMap[d];
          const left = offsetOf(d) + dayW / 2;
          const incPending = income.some(i => i.status === "pending");
          const expPending = expense.some(e => e.status === "pending");
          return (
            <div key={d}>
              {income.length > 0 && (
                <div
                  onClick={() => onTapDay(d)}
                  title={d}
                  style={{
                    position: "absolute", left, top: `calc(50% - ${tickH}px)`, transform: "translateX(-50%)",
                    width: 4, height: tickH, borderRadius: 2, cursor: "pointer",
                    background: incPending ? C.emerald : "rgba(52,211,153,0.35)",
                  }}
                />
              )}
              {expense.length > 0 && (
                <div
                  onClick={() => onTapDay(d)}
                  title={d}
                  style={{
                    position: "absolute", left, top: "50%", transform: "translateX(-50%)",
                    width: 4, height: tickH, borderRadius: 2, cursor: "pointer",
                    background: expPending ? C.errorLight : "rgba(248,113,113,0.35)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
