import { useState, useMemo, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { BILLS_CATEGORY_ID } from "../../../constants/money";
import { supa, supaRpc, supaUpsert } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { todayStr, monthKey } from "../../../utils/date";
import { fmtAmtAuto, fmtM, getSym, round2, ratesFromAccounts, calcTotalBalance, fmtDateShort } from "../../../utils/format";
import { projectRecurringItems, projectPlanItems, buildDayMap, expenseUntilNextIncome, addMonths } from "../../../utils/cashflowTimeline";
import { annualToMonthlyRate, effectivePayment } from "../../../utils/loan";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { BottomSheet } from "../../../components/BottomSheet";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { AccSelect } from "../../../components/AccSelect";
import { NumInput } from "../../../components/NumInput";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { Ico } from "../../../components/Ico";
import { CashflowRuler } from "../components/CashflowRuler";

const sym = getSym(BASE_CUR);

// Строка внутри дневной шторки/списка. Клик по строке:
//  - если ещё pending и с ней можно записать полноценную транзакцию (canFix) → открывает FixSheet
//    (сумма/категория/счёт, см. ниже);
//  - иначе (уже исполнено, или loan — там своя форма в LoanDetailPage) → уводит на существующий
//    экран редактирования/деталей.
// Отдельная круглая кнопка-галочка справа (canMark) — быстрая отметка "уже сделано" БЕЗ указания
// счёта (для разбора накопившегося прошлого, без формы выбора счёта/суммы — но с подтверждением,
// см. markConfirm/ConfirmSheet ниже, чтобы случайный тап не был необратимым). canFix и canMark — РАЗНЫЕ
// флаги: у loan canFix всегда false (тап по строке ведёт в LoanDetailPage, там нужен выбор счёта
// и можно поправить сумму под факт из банка), но canMark может быть true — галочка живёт на строке
// независимо от того, что происходит по тапу на неё саму.
function ItemRow({ item, isIncome, onOpen, onFix, onMarkDone, canFix, canMark }) {
  const pending = item.status === "pending";
  const fixable = pending && canFix;
  const markable = pending && canMark;
  return (
    <div onClick={() => (fixable ? onFix(item, isIncome) : onOpen(item))}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: isIncome ? C.emerald : C.errorLight, flexShrink: 0, opacity: pending ? 1 : 0.35 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: pending ? C.dim : C.green }}>
          {pending ? "Ожидается" : isIncome ? "Получено" : "Оплачено"}
        </p>
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color: pending ? "#fff" : C.dim, textDecoration: pending ? "none" : "line-through" }}>
        {fmtM(item.amount, item.currency)}
      </span>
      {markable && (
        <button onClick={e => { e.stopPropagation(); onMarkDone(item); }}
          title="Отметить выполненным без счёта"
          style={{ width: 26, height: 26, borderRadius: 13, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <Ico n="check" s={13} c={C.dim}/>
        </button>
      )}
    </div>
  );
}

// Строка выбора в шторке "Добавить" — используется и для мгновенной транзакции ("Уже произошло"),
// и для планирования на будущее ("Ожидается"), см. ниже.
function AddRow({ title, subtitle, onClick, last }) {
  return (
    <div onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px", borderRadius: 14, background: C.monCard, marginBottom: last ? 0 : 8, cursor: "pointer" }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 15, color: "#fff" }}>{title}</p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: C.dim }}>{subtitle}</p>
      </div>
      <Ico n="chevR" s={18} c={C.dim}/>
    </div>
  );
}

export function CashflowPage({ accounts = [], expCats = [], incCats = [], recurring = [], loans = [], monthPlans = [], plannedIncomes = [], plannedExpenses = [], navigate, onReload, onBack }) {
  const today = todayStr();
  // dataRange — на сколько назад/вперёд проецируем recurring/loans/статьи плана. Шире, чем видимое
  // окно ленты: назад — чтобы просроченные неоплаченные попадали в список "Ближайшие события" ниже
  // (лента их не показывает, см. rulerRange), вперёд — совпадает с видимым окном ленты.
  const [dataRange] = useState({ start: addMonths(today, -6), end: addMonths(today, 12) });
  // Лента визуально начинается СЕГОДНЯ — прошлое не показываем на самой оси (см. dataRange выше
  // для того, откуда всё же берутся просроченные для списка).
  const rulerRange = { start: today, end: dataRange.end };
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);

  const projectedItems = useMemo(() => [
    ...projectRecurringItems(recurring, loans, dataRange.start, dataRange.end),
    ...projectPlanItems(monthPlans, dataRange.start, dataRange.end),
  ], [recurring, loans, monthPlans, dataRange]);
  const dayMap = useMemo(
    () => buildDayMap(plannedIncomes, plannedExpenses, projectedItems),
    [plannedIncomes, plannedExpenses, projectedItems]
  );

  const totalBalance = useMemo(() => calcTotalBalance(accounts), [accounts]);
  const { sum: expenseUntil, nextIncomeDate } = useMemo(
    () => expenseUntilNextIncome(dayMap, today, rates),
    [dayMap, today, rates]
  );
  const leftover = totalBalance - expenseUntil;

  // recurring/loan проецируются на КАЖДЫЙ месяц диапазона (см. projectRecurringItems), но
  // last_fired/last_paid_month хранит только "оплачено В ЭТОМ КАЛЕНДАРНОМ МЕСЯЦЕ или нет" — не
  // помесячный долг за всю историю. RPC fire_recurring/pay_loan тоже всегда пишет ТЕКУЩИЙ
  // календарный месяц, независимо от того, какую проекцию тапнули. Поэтому "актуально прямо
  // сейчас" может быть только вхождение ТЕКУЩЕГО месяца.
  const todayMk = monthKey(today);
  const isCurrentCycle = (item) => monthKey(item.date) === todayMk;

  // Лента показывает только сегодня-и-вперёд (rulerRange), но список ниже — единственное место,
  // где видны просроченные неоплаченные события (иначе они бы просто пропадали из виду). Прошлое
  // показываем, только если ещё не исполнено (status === "pending", включая plan_item — у него
  // теперь тоже есть done-флаг, см. cashflowTimeline.js). recurring/loan в прошлом — только
  // текущего календарного месяца (isCurrentCycle, см. выше).
  const upcoming = useMemo(() => {
    const rows = [];
    const collect = (list, isIncome, isPast, date) => list.forEach(it => {
      if (isPast) {
        if (it.status !== "pending") return;
        if ((it.kind === "recurring" || it.kind === "loan") && monthKey(it.date) !== todayMk) return;
      }
      rows.push({ date, item: it, isIncome });
    });
    Object.keys(dayMap).sort().forEach(d => {
      const isPast = d < today;
      collect(dayMap[d].income, true, isPast, d);
      collect(dayMap[d].expense, false, isPast, d);
    });
    return rows.slice(0, 40);
  }, [dayMap, today, todayMk]);

  // Можно ли открыть FixSheet (записать полноценную транзакцию прямо со строки): recurring —
  // только вхождение ТЕКУЩЕГО календарного месяца (см. isCurrentCycle — ровно то, что реально
  // оплатит RPC). Loan — никогда (оплата только через LoanDetailPage: там нужен выбор счёта и
  // расчёт split тело/проценты, с возможностью поправить сумму под факт из банка).
  // planned_income/planned_expense/plan_item — всегда.
  const canFix = (item) => {
    if (item.kind === "loan") return false;
    if (item.kind === "recurring") return isCurrentCycle(item);
    return true;
  };

  // Можно ли отметить строку выполненной БЕЗ счёта (круглая галочка) — отдельно от canFix, т.к.
  // у loan своя форма (LoanDetailPage), но галочка на строке всё равно нужна для разбора
  // накопившегося прошлого. last_paid_month хранит только "оплачено в ЭТОМ КАЛЕНДАРНОМ МЕСЯЦЕ или
  // нет" (как last_fired у recurring) — поэтому та же isCurrentCycle-граница, что и у recurring.
  const canMarkDone = (item) => item.kind === "loan" ? isCurrentCycle(item) : canFix(item);

  const [daySheetDate, setDaySheetDate] = useState(null);
  const [addChoiceOpen, setAddChoiceOpen] = useState(false);
  const [fixItem, setFixItem] = useState(null); // { item, isIncome }
  const [fixAccId, setFixAccId] = useState("");
  const [fixAmt, setFixAmt] = useState("");
  const [fixCatId, setFixCatId] = useState("");
  const [markConfirm, setMarkConfirm] = useState(null); // { item, isIncome }

  const openDetail = (item) => {
    setDaySheetDate(null);
    if (item.kind === "recurring") navigate("editBill", item.raw);
    else if (item.kind === "loan") navigate("loanDetail", item.raw);
    else if (item.kind === "planned_income") navigate("editPlannedIncome", item.raw);
    else if (item.kind === "planned_expense") navigate("editPlannedExpense", item.raw);
    else if (item.kind === "plan_item") navigate("editPlan", item.raw);
  };

  // Категория предзаполняется, если у источника она уже есть (статья плана / ожидаемый доход-
  // расход) — дальше её всё равно можно сменить. У recurring категория фиксированная
  // (BILLS_CATEGORY_ID, без выбора — как везде в приложении), у неё пикер вообще не показываем.
  const openFix = (item, isIncome) => {
    const acc = accounts[0];
    setFixItem({ item, isIncome });
    setFixAccId(acc?.id || "");
    setFixAmt(String(item.amount));
    const presetCat = item.kind === "plan_item" ? item.raw.cat_id
      : (item.kind === "planned_income" || item.kind === "planned_expense") ? item.raw.category_id
      : "";
    setFixCatId(presetCat || "");
  };

  // Галочка на строке только ЗАПРАШИВАЕТ отметку — сама смена статуса (markDone) происходит
  // только после подтверждения в ConfirmSheet (см. markConfirm/execMarkDone ниже). Раньше это было
  // одно нажатие без подтверждения — оказалось слишком легко задеть по ошибке, а для loan откатить
  // (remaining_principal уже пересчитан, в loan_payments уже запись) одним тапом нельзя.
  const requestMarkDone = (item, isIncome) => setMarkConfirm({ item, isIncome });

  // Отметить выполненным БЕЗ счёта — никакой транзакции не создаётся, баланс не трогается, только
  // статус. Для разбора накопившегося прошлого одним тапом (уже оплатил/получил вне приложения).
  const markDone = async (item) => {
    if (item.kind === "recurring") {
      await supa.update("recurring", { last_fired: todayMk }, `id=eq.${item.refId}`);
    } else if (item.kind === "planned_income") {
      const p = item.raw;
      await supa.update("planned_incomes", { status: "received" }, `id=eq.${p.id}`);
      if (p.is_recurring) await spawnNextPlanned("planned_incomes", p);
    } else if (item.kind === "planned_expense") {
      const p = item.raw;
      await supa.update("planned_expenses", { status: "paid" }, `id=eq.${p.id}`);
      if (p.is_recurring) await spawnNextPlanned("planned_expenses", p);
    } else if (item.kind === "plan_item") {
      await markPlanItemDone(item);
    } else if (item.kind === "loan") {
      await markLoanDone(item);
    }
    onReload();
  };

  const spawnNextPlanned = (table, p) => supaUpsert(table, {
    id: newId(), name: p.name, amount: p.amount, currency: "KZT", category_id: p.category_id,
    expected_date: addMonths(p.expected_date, 1), status: "pending", is_recurring: true,
    transaction_id: null, note: p.note,
  });

  const markPlanItemDone = (item) => {
    const plan = item.raw;
    const newItems = (plan.items || []).map(it => it.id === item.itemId ? { ...it, done: true } : it);
    return supaUpsert("month_plans", { ...plan, items: newItems });
  };

  // Отметить кредит оплаченным БЕЗ счёта и БЕЗ транзакции — но, в отличие от recurring/planned,
  // тело/проценты нужно честно пересчитать (иначе remaining_principal разойдётся с графиком),
  // поэтому не просто supa.update, а отдельная RPC (mark_loan_paid, копия pay_loan без
  // transactions/accounts). Формула — та же, что в LoanDetailPage.payRef (плановый аннуитетный
  // платёж, проценты от remaining_principal, тело — остаток платежа).
  const markLoanDone = (item) => {
    const l = item.raw;
    const monthlyRate = annualToMonthlyRate(l.rate_annual);
    const payment = effectivePayment(l, monthlyRate);
    const interestPart = round2(l.remaining_principal * monthlyRate);
    const principalPart = round2(Math.max(Math.min(payment - interestPart, l.remaining_principal), 0));
    const newRemaining = round2(Math.max(l.remaining_principal - principalPart, 0));
    const newStatus = newRemaining <= 0.01 ? "closed" : "active";
    return supaRpc("mark_loan_paid", {
      p_loan_id: l.id, p_month: todayMk,
      p_payment: { id: newId(), date: todayStr(), amount: round2(payment), principal_part: principalPart, interest_part: interestPart, is_early_repayment: false, note: "Без счёта" },
      p_new_remaining: newRemaining, p_new_status: newStatus,
    });
  };

  // Текст предупреждения в ConfirmSheet — у loan честно предупреждаем, что это не косметика:
  // остаток долга и история платежей пересчитаются так же, как при настоящей оплате.
  const markConfirmMessage = (item) => item.kind === "loan"
    ? "Транзакция не создастся, счёт не тронем — но остаток кредита и история платежей пересчитаются, как при настоящей оплате."
    : "Транзакция не создастся, баланс счёта не изменится — обновится только статус строки.";

  const markConfirmRef = useRef(null);
  const { save: execMarkDone, saving: markingDone, saveError: markError, setSaveError: setMarkError } = useSave(
    () => markConfirmRef.current(), { errorMsg: "Не удалось отметить" }
  );
  markConfirmRef.current = async () => {
    await markDone(markConfirm.item);
    setMarkConfirm(null);
  };

  const saveRef = useRef(null);
  const { save: execFix, saving: fixing, saveError: fixError, setSaveError: setFixError } = useSave(
    () => saveRef.current(), { errorMsg: "Не удалось сохранить" }
  );
  saveRef.current = async () => {
    const acc = accounts.find(a => a.id === fixAccId);
    if (!acc) return;
    const amt = parseFloat(fixAmt) || 0;
    const { item } = fixItem;

    if (item.kind === "recurring") {
      const r = item.raw;
      const tx = { id: newId(), type: "expense", amount: amt, currency: acc.currency, category_id: BILLS_CATEGORY_ID, account_id: acc.id, date: todayStr(), note: r.name };
      await supaRpc("fire_recurring", { p_tx: tx, p_account_id: acc.id, p_new_balance: round2(acc.balance - amt), p_rec_id: r.id, p_month: todayMk });
    } else if (item.kind === "planned_income") {
      const p = item.raw;
      const tx = { id: newId(), type: "income", amount: amt, currency: acc.currency, category_id: fixCatId || p.category_id, account_id: acc.id, date: todayStr(), note: p.name };
      await supaRpc("receive_planned_income", { p_tx: tx, p_account_id: acc.id, p_new_balance: round2(acc.balance + amt), p_planned_id: p.id });
      if (p.is_recurring) await spawnNextPlanned("planned_incomes", p);
    } else if (item.kind === "planned_expense") {
      const p = item.raw;
      const tx = { id: newId(), type: "expense", amount: amt, currency: acc.currency, category_id: fixCatId || p.category_id, account_id: acc.id, date: todayStr(), note: p.name };
      await supaRpc("pay_planned_expense", { p_tx: tx, p_account_id: acc.id, p_new_balance: round2(acc.balance - amt), p_planned_id: p.id });
      if (p.is_recurring) await spawnNextPlanned("planned_expenses", p);
    } else if (item.kind === "plan_item") {
      const tx = { id: newId(), type: item.bucket, amount: amt, currency: acc.currency, category_id: fixCatId || item.raw.cat_id, account_id: acc.id, date: todayStr(), note: item.name };
      const newBal = item.bucket === "income" ? round2(acc.balance + amt) : round2(acc.balance - amt);
      await supaRpc("save_tx", { p_tx: tx, p_account_id: acc.id, p_new_balance: newBal });
      await markPlanItemDone(item);
    }
    setFixItem(null);
    onReload();
  };
  const needsCategory = fixItem && fixItem.item.kind !== "recurring";
  const fix = () => {
    if (!fixAccId || !parseFloat(fixAmt)) return;
    if (needsCategory && !fixCatId) return;
    execFix();
  };

  const daySheetItems = daySheetDate ? dayMap[daySheetDate] : null;

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Денежный поток" onBack={onBack}/>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>

        {/* Summary */}
        <div style={{ display: "flex", background: C.monCard, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Баланс сейчас</p>
            <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#fff" }}>{sym}{fmtAmtAuto(totalBalance)}</p>
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>
              {nextIncomeDate ? `Расход до ${fmtDateShort(nextIncomeDate)}` : "Все предстоящие расходы"}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: C.errorLight }}>{sym}{fmtAmtAuto(expenseUntil)}</p>
          </div>
        </div>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: C.dim }}>Останется: </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: leftover >= 0 ? C.emerald : C.errorLight }}>{sym}{fmtAmtAuto(leftover)}</span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: C.emerald }}/>
            <span style={{ fontSize: 11, color: C.dim }}>Доход</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: C.errorLight }}/>
            <span style={{ fontSize: 11, color: C.dim }}>Расход</span>
          </div>
        </div>

        {/* Ruler */}
        <div style={{ background: C.monCard, borderRadius: 16, marginBottom: 16, overflow: "hidden" }}>
          <CashflowRuler rangeStart={rulerRange.start} rangeEnd={rulerRange.end} dayMap={dayMap} onTapDay={setDaySheetDate}/>
        </div>

        <button onClick={() => setAddChoiceOpen(true)}
          style={{ width: "100%", padding: 13, borderRadius: 12, background: "transparent", border: "1px dashed rgba(76,175,80,0.4)", color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ico n="plus" s={16} c={C.green}/> Добавить
        </button>

        {/* Upcoming list */}
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.dim }}>Ближайшие события</p>
        {upcoming.length === 0 && (
          <p style={{ textAlign: "center", padding: "24px 0", color: C.dim, fontSize: 13 }}>Пока ничего не запланировано</p>
        )}
        {upcoming.map(({ date, item, isIncome }) => (
          <div key={`${date}-${item.id}`}>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: C.dim }}>{fmtDateShort(date)}</p>
            <ItemRow item={item} isIncome={isIncome} onOpen={openDetail} onFix={openFix} onMarkDone={requestMarkDone} canFix={canFix(item)} canMark={canMarkDone(item)}/>
          </div>
        ))}
      </div>

      {/* Day detail sheet */}
      <BottomSheet open={!!daySheetDate} onClose={() => setDaySheetDate(null)} title={daySheetDate || ""}>
        {daySheetItems && [...daySheetItems.income.map(it => ({ it, isIncome: true })), ...daySheetItems.expense.map(it => ({ it, isIncome: false }))].map(({ it, isIncome }) => (
          <ItemRow key={it.id} item={it} isIncome={isIncome} onOpen={openDetail} onFix={openFix} onMarkDone={requestMarkDone} canFix={canFix(it)} canMark={canMarkDone(it)}/>
        ))}
      </BottomSheet>

      {/* Add choice sheet — планирование на будущую дату (planned_incomes/expenses); мгновенные
          транзакции сюда не заводятся вручную — они фиксируются кнопками-галочками на уже
          запланированных строках (см. ItemRow/markDone/openFix выше) */}
      <BottomSheet open={addChoiceOpen} onClose={() => setAddChoiceOpen(false)} title="Добавить">
        <AddRow title="Ожидаемый доход" subtitle="Зарплата, фриланс — с датой поступления" onClick={() => { setAddChoiceOpen(false); navigate("addPlannedIncome"); }}/>
        <AddRow title="Плановый расход" subtitle="Разовый или регулярный, с конкретной датой" onClick={() => { setAddChoiceOpen(false); navigate("addPlannedExpense"); }} last/>
      </BottomSheet>

      {/* Fix sheet — запись реальной транзакции по строке: сумма (предзаполнена), категория
          (предзаполнена если известна, кроме recurring — там всегда BILLS_CATEGORY_ID без выбора),
          счёт (всегда выбирается вручную), заметка = название строки (задаётся в saveRef, не видна
          в форме — как и в остальных местах проекта, см. BillFormPage/MonthlyPaymentsListPage) */}
      <BottomSheet open={!!fixItem} onClose={() => { setFixItem(null); setFixError(null); }} title={fixItem ? `${fixItem.isIncome ? "Записать доход" : "Записать расход"}: «${fixItem.item.name}»` : ""}>
        {fixItem && (
          <>
            {needsCategory && (
              <>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: C.dim }}>Категория</p>
                <div style={{ marginBottom: 16 }}>
                  <CategoryPicker cats={fixItem.isIncome ? incCats : expCats} value={fixCatId} onChange={setFixCatId} cols="repeat(4,1fr)"/>
                </div>
              </>
            )}
            <AccSelect accounts={accounts} value={fixAccId} onChange={setFixAccId} label={fixItem.isIncome ? "Счёт зачисления" : "Счёт списания"}/>
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: C.dim }}>Сумма</p>
              <NumInput
                value={fixAmt}
                onChange={setFixAmt}
                placeholder="0"
                style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", boxSizing: "border-box" }}
              />
            </div>
            {fixError && <p style={{ color: C.errorLight, fontSize: 13, textAlign: "center", marginBottom: 8 }}>{fixError}</p>}
            <button onClick={fix} disabled={fixing} style={{ width: "100%", padding: "15px", borderRadius: 30, background: fixing ? C.savingDisabled : C.green, border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              {fixing ? "Сохранение..." : "Записать"}
            </button>
          </>
        )}
      </BottomSheet>

      {/* Подтверждение "отметить без счёта" — защита от случайного тапа по галочке (см.
          requestMarkDone/markConfirm выше): для loan это не косметика, там уже честно
          пересчитывается остаток долга (mark_loan_paid), откатить одним тапом нельзя. */}
      <ConfirmSheet
        open={!!markConfirm}
        onClose={() => { setMarkConfirm(null); setMarkError(null); }}
        onConfirm={execMarkDone}
        tone="confirm"
        disabled={markingDone}
        error={markError}
        title={markConfirm ? `Отметить «${markConfirm.item.name}» без счёта?` : ""}
        message={markConfirm ? markConfirmMessage(markConfirm.item) : ""}
        confirmLabel={markingDone ? "Отмечаем..." : "Отметить выполненным"}
      />
    </div>
  );
}
