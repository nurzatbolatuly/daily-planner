import { useCallback, useMemo, useState } from "react";
import { periodFilter } from "../utils/period";
import { todayStr } from "../utils/date";

// Состояние вкладок периода ленты: период + сдвиг назад (offset ≤ 0, будущего нет).
// Смена периода сбрасывает сдвиг. Возвращаемый объект целиком передаётся в <PeriodSwitcher/>.
export function usePeriodFilter(initial = "month") {
  const [period, setPeriodRaw] = useState(initial);
  const [offset, setOffset] = useState(0);
  // Сегодняшняя дата в зависимостях: открытый за полночь экран пересчитает «Сегодня».
  const today = todayStr();
  const { label, matches } = useMemo(() => periodFilter(period, offset, today), [period, offset, today]);

  const setPeriod = useCallback(p => { setPeriodRaw(p); setOffset(0); }, []);
  const shift = useCallback(n => setOffset(o => Math.min(o + n, 0)), []);
  const resetOffset = useCallback(() => setOffset(0), []);

  return { period, offset, label, matches, setPeriod, shift, resetOffset };
}
