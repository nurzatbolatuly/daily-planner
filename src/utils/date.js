export const pad = n => String(n).padStart(2, "0");

export const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

export const todayStr = () => dateStr(new Date());

export const localDate = isoStr => dateStr(new Date(isoStr));

export const addDays = (s, n) => {
  const d = new Date(s);
  d.setDate(d.getDate()+n);
  return dateStr(d);
};

export const daysBetween = (a, b) => Math.round((new Date(b)-new Date(a))/(1000*60*60*24));

// Число календарных месяцев между датами (не по дням/30 — иначе соседние числа месяца
// из-за разной длины месяцев дают заметно разные результаты). Число дня не учитывается —
// текущий месяц и месяц дедлайна всегда считаются полным месяцем каждый (можно положить
// деньги в любой день месяца, а не строго к числу дедлайна).
export const monthsUntil = (a, b) => {
  const d1 = new Date(a), d2 = new Date(b);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
};

export const monthKey = d => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`;
};
