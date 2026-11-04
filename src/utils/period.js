import { dateStr, todayStr } from "./date";
import { RU_MON_GEN, RU_MONTHS_S } from "../constants/locale";

// Вкладки периода ленты операций (AccDetailPage, HistoryPageMon) — компонент PeriodSwitcher.
export const PERIOD_TABS = [["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["year", "Год"], ["all", "Все"]];

const ALL = { label: "Всё время", matches: () => true };

const shortDay = d => `${d.getDate()} ${RU_MONTHS_S[d.getMonth()]}`;

// Период со сдвигом offset (0 — текущий, -1 — предыдущий…) от дня today → { label, matches(date) }.
// today и date — строки "YYYY-MM-DD" (entry.date: t.date транзакции или localDate(created_at) перевода).
// Сравниваем строки, а не Date: new Date("2026-11-04") — полночь по UTC, и западнее Гринвича
// это уже 3 ноября — неделя и месяц съезжали бы на день.
export function periodFilter(period, offset = 0, today = todayStr()) {
  const [y, m1, d] = today.split("-").map(Number);
  const m = m1 - 1;
  const range = (from, to, label) => {
    const a = dateStr(from), b = dateStr(to);
    return { label, matches: s => s >= a && s <= b };
  };

  if (period === "day") {
    const day = new Date(y, m, d + offset);
    return range(day, day, offset === 0 ? "Сегодня" : offset === -1 ? "Вчера" : dateStr(day));
  }
  if (period === "week") {
    const dow = new Date(y, m, d).getDay() || 7; // неделя с понедельника
    const mon = new Date(y, m, d - dow + 1 + offset * 7);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return range(mon, sun, `${shortDay(mon)} – ${shortDay(sun)}`);
  }
  if (period === "month") {
    const first = new Date(y, m + offset, 1);
    const last = new Date(y, m + offset + 1, 0);
    return range(first, last, `${RU_MON_GEN[first.getMonth()]} ${first.getFullYear()}`);
  }
  if (period === "year") {
    return range(new Date(y + offset, 0, 1), new Date(y + offset, 11, 31), String(y + offset));
  }
  return ALL;
}
