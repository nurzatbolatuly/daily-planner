// Аннуитетный кредитный калькулятор (равные ежемесячные платежи) — стандартная схема
// большинства потребительских кредитов/рассрочек.

// Ежемесячный платёж по известной ставке.
export function monthlyPayment(principal, monthlyRate, months) {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate <= 0) return principal / months;
  const k = Math.pow(1 + monthlyRate, months);
  return principal * monthlyRate * k / (k - 1);
}

// Обратная задача: по известному платежу подобрать месячную ставку.
// monthlyPayment(...) монотонно растёт со ставкой при фиксированных principal/months,
// поэтому ставка ищется бисекцией. null — если платёж не покрывает даже тело долга
// без процентов (минимум = principal/months), т.е. ставка не может быть неотрицательной.
export function monthlyRateFromPayment(principal, payment, months) {
  if (principal <= 0 || months <= 0 || payment <= 0) return null;
  if (payment <= principal / months) return 0;

  let lo = 0, hi = 1;
  while (monthlyPayment(principal, hi, months) < payment && hi < 1000) hi *= 2;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (monthlyPayment(principal, mid, months) < payment) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const monthlyToAnnualRate = mr => mr * 12 * 100;
export const annualToMonthlyRate = ar => ar / 100 / 12;

// Платёж, который реально используется по кредиту: если банк выдал округлённую сумму
// (loan.payment, см. v19) — берём её, иначе как раньше — расчётный аннуитет. Единая точка
// правды для MonthlyPaymentsListPage/LoanDetailPage/cashflowTimeline, чтобы отображаемая
// сумма и дефолт при оплате не расходились между экранами.
export function effectivePayment(loan, monthlyRate) {
  return loan.payment != null ? loan.payment : monthlyPayment(loan.principal, monthlyRate, loan.term_months);
}

// Обратная задача к monthlyPayment: сколько платежей ЕЩЁ осталось при известном остатке
// тела, ставке и фиксированном платеже (стандартная формула остатка срока аннуитета).
// Нужна, когда платёж — не расчётный (см. effectivePayment выше), поэтому число платежей
// нельзя просто взять как term_months минус кол-во сделанных — платёж от банка мог
// отличаться от исходного графика, и "срок" пересчитывается по факту от остатка.
// null — платёж не покрывает даже проценты на остаток (долг не будет погашен никогда).
export function remainingMonthsFromBalance(balance, monthlyRate, payment) {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  if (monthlyRate <= 0) return Math.ceil(balance / payment);
  const interestOnly = balance * monthlyRate;
  if (payment <= interestOnly) return null;
  const n = -Math.log(1 - interestOnly / payment) / Math.log(1 + monthlyRate);
  return Math.max(Math.ceil(n), 1);
}

// Сводка по кредиту: платёж, общая сумма выплат, переплата.
export function loanSummary(principal, monthlyRate, months) {
  const payment = monthlyPayment(principal, monthlyRate, months);
  const total   = payment * months;
  const overpay = Math.max(total - principal, 0);
  return { payment, total, overpay };
}

// Симуляция графика с ежемесячным доп. платежом сверх обязательного (частичное досрочное
// погашение). strategy "term" — платёж не меняется, срок сокращается (макс. экономия на
// процентах, стандартная рекомендация); strategy "payment" — срок не меняется, при каждом
// доп. платеже пересчитывается платёж на оставшийся срок (график тот же, взнос меньше).
// startMonth — с какого платежа по счёту начинаются доп. взносы (1 = с первого).
export function simulateEarlyRepayment(principal, monthlyRate, months, extraPerMonth, { strategy = "term", startMonth = 1 } = {}) {
  const basePayment = monthlyPayment(principal, monthlyRate, months);
  let balance  = principal;
  let payment  = basePayment;
  let month    = 0;
  let totalPaid = 0;

  while (balance > 0.01 && month < 1200) {
    month++;
    const interest      = balance * monthlyRate;
    const principalPart = Math.min(payment - interest, balance);
    const extraRaw       = month >= startMonth ? extraPerMonth : 0;
    const extra          = Math.min(extraRaw, Math.max(balance - principalPart, 0));

    balance   = Math.max(balance - principalPart - extra, 0);
    totalPaid += interest + principalPart + extra;

    if (extra > 0 && strategy === "payment" && balance > 0) {
      payment = monthlyPayment(balance, monthlyRate, Math.max(months - month, 1));
    }
  }

  return { months: month, totalPaid, finalPayment: payment, overpay: Math.max(totalPaid - principal, 0) };
}

// Остаток тела после N обычных (без досрочных) аннуитетных платежей — используется при
// создании кредита, если он уже отчасти оплачен ДО того как попал в приложение (импорт старой
// рассрочки/кредита с историей в 3-4+ месяца): считает тело по графику вперёд на paymentsCount
// платежей, чтобы remaining_principal сразу отражал реальный остаток, а не исходный principal.
// payment (необязательно) — факт. платёж от банка (v19, effectivePayment), если он отличается
// от расчётного: иначе N "уже оплаченных" месяцев считались бы по формуле, а не по факту, и
// остаток разошёлся бы с тем, что реально видит пользователь (см. баг с плавающими копейками
// в первых версиях v19 — рассрочку без процентов с округлённым платежом ужимало на копейки).
export function remainingAfterPayments(principal, monthlyRate, months, paymentsCount, payment) {
  if (payment == null) payment = monthlyPayment(principal, monthlyRate, months);
  let balance = principal;
  const n = Math.min(Math.max(paymentsCount, 0), months);
  for (let i = 0; i < n; i++) {
    const interest = balance * monthlyRate;
    const principalPart = Math.min(payment - interest, balance);
    balance = Math.max(balance - principalPart, 0);
  }
  return balance;
}

// Разовое досрочное погашение — в отличие от simulateEarlyRepayment (доп. платёж КАЖДЫЙ месяц),
// здесь довнесение происходит ОДИН раз, на конкретном платеже по счёту (lumpMonth, 1 = следующий).
// Платёж не пересчитывается (как strategy:"term" выше) — срок сокращается, экономия максимальна.
export function simulateLumpSumRepayment(principal, monthlyRate, months, lumpSum, lumpMonth) {
  const payment = monthlyPayment(principal, monthlyRate, months);
  let balance = principal, month = 0, totalPaid = 0;

  while (balance > 0.01 && month < 1200) {
    month++;
    const interest      = balance * monthlyRate;
    const principalPart = Math.min(payment - interest, balance);
    const lump           = month === lumpMonth ? Math.min(lumpSum, Math.max(balance - principalPart, 0)) : 0;

    balance   = Math.max(balance - principalPart - lump, 0);
    totalPaid += interest + principalPart + lump;
  }

  return { months: month, totalPaid, overpay: Math.max(totalPaid - principal, 0) };
}
