// Строит данные для ленты "Денежный поток" (CashflowRuler/CashflowPage):
// сводит в одну структуру по дням — ожидаемые доходы/расходы с конкретной датой
// (planned_incomes/planned_expenses), спроецированные на календарь recurring-платежи/кредиты
// (у них только "день месяца", тут разворачиваются в реальные даты по диапазону), и статьи
// бюджетного плана (month_plans.items) с опциональной датой — те же данные, что в "Бюджет →
// Месяц", БЕЗ дублирования в отдельную таблицу (см. projectPlanItems). У статей плана нет
// track'а факта оплаты (в отличие от planned_incomes/expenses) — это чисто ориентир на ленте,
// "план", а не обязательство; статус всегда "pending", инлайн-оплаты через ленту нет.
import { pad } from "./date";
import { toBase } from "./format";
import { annualToMonthlyRate, effectivePayment } from "./loan";

const daysInMonthOf = (y, m0 /* 0-indexed */) => new Date(y, m0 + 1, 0).getDate();

// d.setMonth() напрямую нормализует переполненные дни (31 янв + 1 мес → 3 марта, а не 28 фев) —
// тут вместо этого день зажимается в границы целевого месяца, как day у recurring/loans.
// ВАЖНО: если исходная дата была ПОСЛЕДНИМ днём своего месяца (зарплата "в последний день
// месяца", у него то 28, то 30, то 31 число) — целевая дата тоже всегда последний день целевого
// месяца, а не "то же число, зажатое в границы". Без этого цепочка addMonths по once-truncated
// дате уже никогда не восстанавливает 31 — просто Math.min(30, 31) навсегда остаётся 30
// (см. is_recurring в planned_incomes/planned_expenses, единственное место, где addMonths
// вызывается ЦЕПОЧКОЙ месяц за месяцем от предыдущего результата, а не от исходного дня).
export const addMonths = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const isLastDayOfMonth = day === daysInMonthOf(d.getFullYear(), d.getMonth());
  const targetIdx = d.getMonth() + n;
  const y = d.getFullYear() + Math.floor(targetIdx / 12);
  const m = ((targetIdx % 12) + 12) % 12;
  const daysInTargetMonth = daysInMonthOf(y, m);
  const targetDay = isLastDayOfMonth ? daysInTargetMonth : Math.min(day, daysInTargetMonth);
  return `${y}-${pad(m + 1)}-${pad(targetDay)}`;
};

const daysBetweenDates = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// Спроецировать recurring-платежи и активные кредиты на каждый месяц диапазона —
// у них только "день месяца" (day), тут превращается в реальную "YYYY-MM-DD" на каждый месяц.
export function projectRecurringItems(recurring = [], loans = [], rangeStart, rangeEnd) {
  const items = [];
  const startD = new Date(rangeStart + "T12:00:00");
  const endD = new Date(rangeEnd + "T12:00:00");
  let y = startD.getFullYear(), m = startD.getMonth();

  while (y < endD.getFullYear() || (y === endD.getFullYear() && m <= endD.getMonth())) {
    const curY = y, curM = m;
    const mk = `${curY}-${pad(curM + 1)}`;
    const daysInMonth = new Date(curY, curM + 1, 0).getDate();

    recurring.filter(r => r.active !== false).forEach(r => {
      const day = Math.min(r.day, daysInMonth);
      const date = `${curY}-${pad(curM + 1)}-${pad(day)}`;
      // До даты первого платежа (start_date, см. v19) платёж ещё не должен появляться на ленте —
      // та же ловушка, что и у кредитов ниже (day-of-month сам по себе не знает, что платёж
      // ещё не "начался").
      if (r.start_date && date < r.start_date) return;
      if (date >= rangeStart && date <= rangeEnd) {
        items.push({ id: `rec-${r.id}-${mk}`, kind: "recurring", bucket: "expense", refId: r.id, name: r.name, amount: r.amount, currency: "KZT", date, status: r.last_fired === mk ? "paid" : "pending", raw: r });
      }
    });

    loans.filter(l => l.status === "active").forEach(l => {
      const day = Math.min(l.day, daysInMonth);
      const date = `${curY}-${pad(curM + 1)}-${pad(day)}`;
      // До даты первого платежа (start_date) кредит ещё не должен появляться на ленте — иначе
      // новый кредит с датой первого платежа в след. месяце показывался бы просроченным уже
      // сегодня (day-of-month сам по себе не знает, что кредит ещё не "начался").
      if (l.start_date && date < l.start_date) return;
      if (date >= rangeStart && date <= rangeEnd) {
        // Фикс. платёж по банку (loan.payment), если задан — иначе расчётный аннуитет от
        // исходного principal, не remaining_principal (см. effectivePayment).
        const amount = effectivePayment(l, annualToMonthlyRate(l.rate_annual));
        items.push({ id: `loan-${l.id}-${mk}`, kind: "loan", bucket: "expense", refId: l.id, name: l.name, amount, currency: l.currency || "KZT", date, status: l.last_paid_month === mk ? "paid" : "pending", raw: l });
      }
    });

    m++;
    if (m > 11) { m = 0; y++; }
  }
  return items;
}

// Спроецировать статьи бюджетного плана (month_plans.items) с опциональной датой — читает
// напрямую из month_plans, ничего никуда не копирует (единственный источник правды — сам план,
// правка/удаление статьи меняет "Бюджет → Месяц" и ленту одновременно). Только type
// "expense"/"income" — у "savings" нет category_id (это перевод на счёт, не транзакция),
// собственный трекинг накоплений уже есть в Бюджете, дублировать его на ленте не нужно.
// items[].done (boolean, необязательное поле) — отметка "уже зафиксировано" (запись реальной
// транзакции или ручная отметка "выполнено" на ленте, см. CashflowPage.markDone/markPlanItemDone).
// Тот же принцип, что у items[].date — просто ещё одно поле того же объекта, без отдельной таблицы.
export function projectPlanItems(monthPlans = [], rangeStart, rangeEnd) {
  const items = [];
  monthPlans.forEach(plan => {
    if (plan.type !== "expense" && plan.type !== "income") return;
    (plan.items || []).forEach(it => {
      if (!it.date || it.date < rangeStart || it.date > rangeEnd) return;
      items.push({
        id: `plan-${it.id}`, kind: "plan_item", bucket: plan.type, refId: plan.id, itemId: it.id,
        name: it.label || "Статья плана", amount: it.amount, currency: plan.plan_currency || "KZT",
        date: it.date, status: it.done ? "paid" : "pending", raw: plan,
      });
    });
  });
  return items;
}

// Единая карта "дата → { income:[...], expense:[...] }" для ленты. projectedItems — уже
// спроецированные на реальные даты элементы с явным полем bucket (см. projectRecurringItems,
// projectPlanItems выше) — объединяет несколько источников в один список перед вызовом.
export function buildDayMap(plannedIncomes = [], plannedExpenses = [], projectedItems = []) {
  const map = {};
  const add = (date, bucket, item) => {
    if (!map[date]) map[date] = { income: [], expense: [] };
    map[date][bucket].push(item);
  };
  plannedIncomes.forEach(p => add(p.expected_date, "income", {
    id: p.id, kind: "planned_income", name: p.name, amount: p.amount, currency: p.currency,
    status: p.status === "received" ? "paid" : "pending", raw: p,
  }));
  plannedExpenses.forEach(p => add(p.expected_date, "expense", {
    id: p.id, kind: "planned_expense", name: p.name, amount: p.amount, currency: p.currency,
    status: p.status === "paid" ? "paid" : "pending", raw: p,
  }));
  projectedItems.forEach(it => add(it.date, it.bucket, it));
  return map;
}

// Сумма предстоящих (pending) расходов от today до ближайшего ожидаемого (pending) дохода.
// Если будущих ожидаемых доходов нет — берётся сумма всех предстоящих расходов без ограничения,
// и horizon = null (страница должна пометить это как "без даты-ограничителя").
export function expenseUntilNextIncome(dayMap, today, rates = {}) {
  const dates = Object.keys(dayMap).filter(d => d >= today).sort();
  const nextIncomeDate = dates.find(d => dayMap[d].income.some(i => i.status === "pending")) || null;

  let sum = 0;
  dates.forEach(d => {
    if (nextIncomeDate && d > nextIncomeDate) return;
    dayMap[d].expense.forEach(e => {
      if (e.status === "paid") return;
      sum += toBase(e.amount, e.currency, rates);
    });
  });
  return { sum, nextIncomeDate };
}

export { daysBetweenDates };
