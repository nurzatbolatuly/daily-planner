import { BASE_CUR, ALL_CURR } from "../constants/currencies";
import { RU_MON_GEN, RU_DAYS_FULL } from "../constants/locale";

export const getSym = code => ALL_CURR.find(c => c.code === code)?.sym || code;

export const fmtAmt = (n, dec = 2) => Math.abs(Number(n)||0).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const fmtM = (n, code) => `${getSym(code)}${fmtAmt(n)}`;

export const toBase = (amt, from, rates = {}) => from === BASE_CUR ? amt : amt * (rates[from] || 1);

// Карта курсов { currency: rateToBase } из avg_rate счетов.
// Если в одной валюте несколько счетов — берём среднее их avg_rate.
// Валюты без курса в карту не попадают → toBase даст fallback 1:1 (прежнее поведение).
export const ratesFromAccounts = (accounts = []) => {
  const agg = {};
  accounts.forEach(a => {
    if (!a || a.currency === BASE_CUR || !a.avg_rate) return;
    if (!agg[a.currency]) agg[a.currency] = { sum: 0, n: 0 };
    agg[a.currency].sum += Number(a.avg_rate);
    agg[a.currency].n += 1;
  });
  const rates = {};
  Object.keys(agg).forEach(cur => { rates[cur] = agg[cur].sum / agg[cur].n; });
  return rates;
};

export const avgRateFn = (ob, or_, aa, nr) => (ob+aa) === 0 ? nr : (ob*or_+aa*nr)/(ob+aa);

export function fmtDateFull(d) {
  const dt = new Date(d);
  return `${dt.getDate()} ${RU_MON_GEN[dt.getMonth()]}, ${RU_DAYS_FULL[dt.getDay()]}`;
}

export function fmtDateShort(s) {
  const d = new Date(s), t = new Date(), y = new Date(t);
  y.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString()) return "Сегодня";
  if(d.toDateString()===y.toDateString()) return "Вчера";
  return `${d.getDate()} ${RU_MON_GEN[d.getMonth()]}`;
}
