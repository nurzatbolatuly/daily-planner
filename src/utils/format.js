import { BASE_CUR, ALL_CURR } from "../constants/currencies";
import { RU_MON_GEN, RU_DAYS_FULL } from "../constants/locale";

export const getSym = code => ALL_CURR.find(c => c.code === code)?.sym || code;

export const fmtAmt = (n, dec = 2) => Math.abs(Number(n)||0).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Целое число — без копеек, дробное — с .00 (показываем копейки только если есть остаток).
export const fmtAmtAuto = n => fmtAmt(n, Number.isInteger(Number(n)||0) ? 0 : 2);

export const fmtM = (n, code) => `${getSym(code)}${fmtAmt(n)}`;

// Для отображения баланса счёта — сохраняет знак минус при отрицательных значениях.
export const fmtBal = (n, code, dec = 0) => {
  const num = Number(n) || 0;
  const sym = getSym(code);
  const abs = Math.abs(num).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return num < 0 ? `-${sym}${abs}` : `${sym}${abs}`;
};

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

export const avgRateFn = (oldBalance, oldRate, addedAmount, newRate) =>
  (oldBalance + addedAmount) === 0 ? newRate : (oldBalance * oldRate + addedAmount * newRate) / (oldBalance + addedAmount);

// Суммарный баланс в BASE_CUR для счетов с in_total === true.
// Использует avg_rate каждого счёта индивидуально (точнее, чем средний по валюте).
export const calcTotalBalance = (accounts = []) =>
  accounts.filter(a => a.in_total).reduce((s, a) => {
    if (a.currency === BASE_CUR) return s + (a.balance || 0);
    return s + (a.avg_rate ? (a.balance || 0) * a.avg_rate : 0);
  }, 0);

export function fmtDateFull(d) {
  const dt = new Date(d);
  return `${dt.getDate()} ${RU_MON_GEN[dt.getMonth()]}, ${RU_DAYS_FULL[dt.getDay()]}`;
}

export function fmtDateShort(s) {
  const d = new Date(s), t = new Date(), yesterday = new Date(t);
  yesterday.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString()) return "Сегодня";
  if(d.toDateString()===yesterday.toDateString()) return "Вчера";
  if(d.getFullYear() !== t.getFullYear()) return `${d.getDate()} ${RU_MON_GEN[d.getMonth()]} ${d.getFullYear()}`;
  return `${d.getDate()} ${RU_MON_GEN[d.getMonth()]}`;
}
