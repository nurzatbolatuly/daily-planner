import Decimal from "decimal.js";
import { numericFormatter } from "react-number-format";
import { BASE_CUR, ALL_CURR, COMMODITY_CURRENCIES } from "../constants/currencies";
import { RU_MON_GEN, RU_DAYS_FULL } from "../constants/locale";
import { pad, todayStr, monthKey } from "./date";

const NUM_FMT_OPTS = { thousandSeparator: " ", decimalSeparator: ".", decimalScale: 2 };

export const getSym = code => ALL_CURR.find(c => c.code === code)?.sym || code;

export const isCommodity = code => COMMODITY_CURRENCIES.includes(code);

// Точная денежная арифметика через Decimal.js — устраняет IEEE 754 floating-point мусор.
// Принимает результат обычного JS-выражения: round2(a + b) или round2(a - b).
// Decimal.js использует num.toString() внутри, поэтому 1.6099999... → "1.61" корректно.
export const round2 = n => new Decimal(Number(n) || 0).toDecimalPlaces(2).toNumber();

export const fmtGrams = n => {
  const num = Number(n) || 0;
  const abs = Math.abs(num).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(',', '.');
  return num < 0 ? `-${abs} г` : `${abs} г`;
};

export const fmtAmt = (n, dec = 2) => Math.abs(Number(n)||0).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(',', '.');

// Умное форматирование: 10 000 · 1 500.5 · 1 500.54 · без trailing zeros.
// Decimal.js устраняет IEEE 754 float-point мусор (1.005 → 1.01, не 1.00).
export const fmtAmtAuto = n => {
  const rounded = round2(Math.abs(Number(n) || 0));
  return numericFormatter(String(rounded), NUM_FMT_OPTS);
};

export const fmtM = (n, code) => isCommodity(code) ? fmtGrams(n) : `${getSym(code)}${fmtAmtAuto(n)}`;

// Для отображения баланса счёта — сохраняет знак минус при отрицательных значениях.
// Дробная часть отображается только если есть остаток (не нулевые копейки).
export const fmtBal = (n, code) => {
  if (isCommodity(code)) return fmtGrams(n);
  const num = Number(n) || 0;
  const sym = getSym(code);
  const abs = fmtAmtAuto(Math.abs(num));
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

// Дельта баланса счёта от операций ПОСЛЕ указанного месяца (mk = "YYYY-MM") — на сколько нужно
// "отмотать" текущий balance назад, чтобы получить остаток на конец этого месяца. Balance в БД
// хранит только текущее значение (нет истории по месяцам), поэтому остаток за прошлый месяц
// реконструируется отменой эффекта более поздних транзакций/переводов.
const accountDeltasAfterMonth = (transactions, transfers, mk) => {
  const deltas = {};
  const add = (id, amt) => { if (id) deltas[id] = (deltas[id] || 0) + amt; };

  transactions.forEach(t => {
    if (monthKey(t.date) > mk) add(t.account_id, t.type === "income" ? t.amount : -t.amount);
  });
  transfers.forEach(t => {
    if (monthKey(t.created_at) > mk) {
      // Корректировка баланса (AccPage) — своя схема: to_id всегда null, дельта = to_amt (знаковая).
      if (t.is_adjustment) add(t.from_id, t.to_amt);
      else {
        add(t.from_id, -t.amount);
        add(t.to_id, t.to_amt ?? t.amount);
      }
    }
  });
  return deltas;
};

// Суммарный баланс в BASE_CUR на КОНЕЦ указанного месяца (mk = "YYYY-MM"), а не на текущий момент.
// Для текущего/будущего месяца отменять нечего — результат совпадает с calcTotalBalance.
// Курс конвертации — текущий avg_rate счёта (исторических курсов в БД нет, тот же подход, что и
// везде в проекте для прошлых периодов).
export const calcTotalBalanceAtMonth = (accounts = [], transactions = [], transfers = [], mk) => {
  const deltas = accountDeltasAfterMonth(transactions, transfers, mk);
  return accounts.filter(a => a.in_total).reduce((s, a) => {
    const bal = (a.balance || 0) - (deltas[a.id] || 0);
    if (a.currency === BASE_CUR) return s + bal;
    return s + (a.avg_rate ? bal * a.avg_rate : 0);
  }, 0);
};

export function fmtDateFull(d) {
  const dt = new Date(d);
  return `${dt.getDate()} ${RU_MON_GEN[dt.getMonth()]}, ${RU_DAYS_FULL[dt.getDay()]}`;
}

export function calcCatDelta(transactions, expCats, accounts) {
  const rates = ratesFromAccounts(accounts);
  const now = new Date();
  const curMk  = monthKey(todayStr());
  const prevD  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMk = `${prevD.getFullYear()}-${pad(prevD.getMonth() + 1)}`;

  const sumByCat = (mk) => {
    const r = {};
    transactions
      .filter(t => t.type === "expense" && monthKey(t.date) === mk)
      .forEach(t => { r[t.category_id] = (r[t.category_id] || 0) + toBase(t.amount, t.currency, rates); });
    return r;
  };

  const cur = sumByCat(curMk), prev = sumByCat(prevMk);
  const ids = [...new Set([...Object.keys(cur), ...Object.keys(prev)])];

  return Object.fromEntries(ids.map(id => {
    const c = cur[id] || 0, p = prev[id] || 0;
    return [id, { curAmt: c, prevAmt: p, delta: p > 0 ? (c - p) / p * 100 : null }];
  }));
}

export function fmtDateShort(s) {
  const d = new Date(s), t = new Date(), yesterday = new Date(t);
  yesterday.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString()) return "Сегодня";
  if(d.toDateString()===yesterday.toDateString()) return "Вчера";
  if(d.getFullYear() !== t.getFullYear()) return `${d.getDate()} ${RU_MON_GEN[d.getMonth()]} ${d.getFullYear()}`;
  return `${d.getDate()} ${RU_MON_GEN[d.getMonth()]}`;
}
