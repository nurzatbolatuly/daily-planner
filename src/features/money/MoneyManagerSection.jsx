import { useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { todayStr } from "../../utils/date";
import { C } from "../../constants/theme";
import { Spinner } from "../../components/Spinner";
import { useMoneyData } from "./hooks/useMoneyData";
import { TxPage } from "./pages/TxPage";
import { AccPage } from "./pages/AccPage";
import { AccDetailPage } from "./pages/AccDetailPage";
import { TransferPageMon } from "./pages/TransferPageMon";
import { HistoryPageMon } from "./pages/HistoryPageMon";
import { MoneyHomeSection, initialHomeView } from "./pages/MoneyHomeSection";
import { MoneyAccountsSection } from "./pages/MoneyAccountsSection";
import { MoneyBudgetSection } from "./pages/MoneyBudgetSection";
import { MoneyAnalyticsSection } from "./pages/MoneyAnalyticsSection";
import { MoneyMenuPage } from "./pages/MoneyMenuPage";
import { CatPageMon } from "./pages/CatPageMon";
import { PlanRowPageMon } from "./pages/PlanRowPageMon";
import { TripEditPageMon } from "./pages/TripEditPageMon";
import { TripDetailPageMon } from "./pages/TripDetailPageMon";
import { CatsListPageMon } from "./pages/CatsListPageMon";
import { CatTxsPageMon } from "./pages/CatTxsPageMon";
import { GoalFormPage } from "./pages/GoalFormPage";
import { GoalDetailPage } from "./pages/GoalDetailPage";
import { GoalTopupPage } from "./pages/GoalTopupPage";
import { DebtsListPage } from "./pages/DebtsListPage";
import { DebtPersonDetailPage } from "./pages/DebtPersonDetailPage";
import { DebtFormPage } from "./pages/DebtFormPage";
import { PeopleListPage } from "./pages/PeopleListPage";
import { SharedGroupsListPage } from "./pages/SharedGroupsListPage";
import { SharedGroupDetailPage } from "./pages/SharedGroupDetailPage";
import { SharedEntryFormPage } from "./pages/SharedEntryFormPage";
import { SharedTransferFormPage } from "./pages/SharedTransferFormPage";
import { SharedGroupFormPage } from "./pages/SharedGroupFormPage";
import { SharedMirrorPage } from "./pages/SharedMirrorPage";
import { SharedPurchaseFormPage } from "./pages/SharedPurchaseFormPage";
import { SharedMirrorTransferPage } from "./pages/SharedMirrorTransferPage";
import { PriceCatalogSection } from "../priceCatalog/PriceCatalogSection";
import { LoanCalculatorPage } from "./pages/LoanCalculatorPage";
import { MonthlyPaymentsListPage } from "./pages/MonthlyPaymentsListPage";
import { BillFormPage } from "./pages/BillFormPage";
import { LoanDetailPage } from "./pages/LoanDetailPage";
import { CashflowPage } from "./pages/CashflowPage";
import { PlannedIncomeFormPage } from "./pages/PlannedIncomeFormPage";
import { PlannedExpenseFormPage } from "./pages/PlannedExpenseFormPage";

const MON_NAV_HEIGHT = 60;

const MON_TABS = [
  { id: "home",      label: "Главная",   d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10" },
  { id: "accounts",  label: "Счета",     d: "M3 4h18v16H3zM3 10h18" },
  { id: "budget",    label: "Бюджет",    d: "M18 20V10M12 20V4M6 20v-6" },
  { id: "analytics", label: "Аналитика", d: "M3 3v18h18M7 16l4-4 4 4 4-8" },
  { id: "menu",      label: "Меню",      d: "M3 12h18M3 6h18M3 18h18" },
];

export default function MoneyManagerSection() {
  const data = useMoneyData();

  const [monTab, setMonTab] = useState(() => {
    const t = localStorage.getItem("mon.tab") || "home";
    return t === "plans" ? "budget" : t;
  });
  const [budgetTab, setBudgetTab] = useState(() => localStorage.getItem("mon.budgetTab") || "month");
  // Выбранный месяц в бюджете — лежит здесь, а не внутри MoneyBudgetSection, потому что
  // экран размонтируется при переходе на addPlan/editPlan и обратно (см. `if (screen)` ниже),
  // и локальный useState сбрасывался бы на текущий месяц при каждом возврате.
  const [planMonth, setPlanMonth] = useState(new Date().getMonth());
  const [planYear,  setPlanYear]  = useState(new Date().getFullYear());
  // То же для Главной: выбранный период/месяц/счёт/фильтр переживают переход в catTxs и обратно.
  const [homeView, setHomeView] = useState(initialHomeView);

  const [stack, setStack] = useState([]);
  const screen = stack[stack.length - 1] || null;

  const navRef = useRef(null);
  const contentRef = useRef(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--mon-nav-h", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [monTab]);

  const setMonTabP    = useCallback((t) => { setMonTab(t);    localStorage.setItem("mon.tab",       t); }, []);
  const setBudgetTabP = useCallback((t) => { setBudgetTab(t); localStorage.setItem("mon.budgetTab", t); }, []);

  const { reload } = data;
  const navigate = useCallback((name, d) => setStack(s => [...s, { name, data: d }]), []);
  const goBack = useCallback((doReload = false) => { if (doReload) reload(); setStack(s => s.slice(0, -1)); }, [reload]);
  // Заменить текущий экран другим (с перезагрузкой данных): форма создала сущность — открываем её
  // вместо формы, чтобы «назад» не возвращал в уже сохранённую форму.
  const replaceScreen = useCallback((name, d) => { reload(); setStack(s => [...s.slice(0, -1), { name, data: d }]); }, [reload]);
  // Закрыть несколько экранов сразу: удалили группу из её настроек — назад к списку, минуя её экран.
  const popScreens = useCallback((n) => { reload(); setStack(s => s.slice(0, -n)); }, [reload]);
  // Всё, что нужно шторке удаления группы для расчёта последствий (§7.6) — одним стабильным объектом.
  const { sharedGroups, sharedMembers, sharedEntries, transactions, debtEvents, accounts } = data;
  const rawTxById = useMemo(() => new Map(transactions.map(t => [t.id, t])), [transactions]);
  const sharedData = useMemo(
    () => ({ groups: sharedGroups, members: sharedMembers, entries: sharedEntries, transactions, debtEvents, accounts }),
    [sharedGroups, sharedMembers, sharedEntries, transactions, debtEvents, accounts]);
  const goBackToTrips = useCallback((doReload = false) => { setBudgetTabP("trips"); setMonTabP("budget"); if (doReload) reload(); setStack([]); }, [setBudgetTabP, setMonTabP, reload]);
  const goToGoalsList = useCallback(() => { setBudgetTabP("goals"); setMonTabP("budget"); reload(); setStack([]); }, [setBudgetTabP, setMonTabP, reload]);

  if (data.loading) return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))" }}>
      <Spinner color={C.green}/>
    </div>
  );

  if (data.loadError) return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, color: C.errorLight, textAlign: "center" }}>{data.loadError}</p>
      <button onClick={data.reload} style={{ padding: "12px 28px", borderRadius: 30, background: C.greenDim, border: `1px solid ${C.green}`, color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
        Повторить
      </button>
    </div>
  );

  // Декларативный роутер: каждый экран — функция (d) => JSX
  if (screen) {
    const { name, data: d } = screen;
    const sharedGroupById = id => data.sharedGroups.find(g => g.id === id) || null;
    const sharedEntryForm = (group, entry = null, { linkTx = null, copyFrom = null } = {}) => (
      <SharedEntryFormPage group={group} entry={entry} feesSupported={data.sharedSchema.fees} linkTx={linkTx} copyFrom={copyFrom} groups={data.sharedGroups} members={data.sharedMembers} entries={data.sharedEntries}
        accounts={data.accounts} transactions={data.transactions} expCats={data.expCats}
        people={data.debtPeople} setPeople={data.setDebtPeople} onBack={goBack}
        onSaved={(groupId, isNewGroup) => (isNewGroup ? replaceScreen("sharedGroup", { groupId }) : goBack(true))}
        onPayRest={e => replaceScreen("addSharedBill", { groupId: e.group_id, copyFromId: e.id })}/>
    );
    const sharedTransferForm = (group, { memberId, direction, edit = null }) => (
      <SharedTransferFormPage group={group} memberId={memberId} direction={direction} edit={edit} groups={data.sharedGroups} debtEvents={data.debtEvents}
        members={data.sharedMembers} entries={data.sharedEntries} people={data.debtPeople} setPeople={data.setDebtPeople}
        accounts={data.accounts} transactions={data.transactions} onBack={goBack}/>
    );
    const purchaseForm = (group, { entry = null } = {}) => (
      <SharedPurchaseFormPage group={group} entry={entry} feesSupported={data.sharedSchema.fees} members={data.sharedMembers} entries={data.sharedEntries}
        accounts={data.accounts} transactions={data.transactions} expCats={data.expCats} people={data.debtPeople} setPeople={data.setDebtPeople}
        onBack={goBack} onSaved={() => goBack(true)}/>
    );
    const mirrorTransferForm = (group, edit = null) => (
      <SharedMirrorTransferPage group={group} edit={edit} members={data.sharedMembers} entries={data.sharedEntries} people={data.debtPeople}
        accounts={data.accounts} transactions={data.transactions} debtEvents={data.debtEvents} onBack={goBack}/>
    );
    const groupForm = (group, extra = {}) => (
      <SharedGroupFormPage group={group} data={sharedData} people={data.debtPeople} setPeople={data.setDebtPeople}
        cats={[...data.expCats, ...data.incCats]} onBack={goBack} onDeleted={() => popScreens(2)}
        onCreated={groupId => replaceScreen("sharedGroup", { groupId })} {...extra}/>
    );
    // Правка записи группы: форма по виду записи и режиму группы. Квартира: покупка/возврат —
    // форма покупки, перевод — свой (без вариантов закрытия), начальный баланс — в настройках.
    const editSharedEntryScreen = entry => {
      const group = sharedGroupById(entry.group_id);
      if (!group) return null;
      // Пара «Записать в Tricount» не правится формой — открываем группу (там — отмена пары).
      const moved = entry.batch_id && data.sharedEntries.some(x => x.batch_id === entry.batch_id && x.method === "group");
      if (moved) return screenMap.sharedGroup({ groupId: group.id });
      if (group.mode === "mirror") {
        if (entry.kind === "transfer") return mirrorTransferForm(group, entry);
        if (entry.kind === "bill" || entry.kind === "refund") return purchaseForm(group, { entry });
        return groupForm(group);
      }
      return entry.kind === "transfer" ? sharedTransferForm(group, { edit: entry }) : sharedEntryForm(group, entry);
    };
    // Транзакция счёта общей группы (или виртуальная строка «мою долю оплатил другой») правится
    // только через форму группы: в TxPage правка суммы/удаление разошлись бы с долями и долгами
    // участников. Единая точка — все списки транзакций ведут сюда через navigate("editTx").
    const sharedEntryOfTx = tx => data.sharedEntries.find(e => (tx.virtual ? e.id === tx.shared_entry_id : e.transaction_id === tx.id));
    const screenMap = {
      addTx:        (d) => <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtPeople={data.debtPeople} setDebtPeople={data.setDebtPeople} debtEvents={data.debtEvents} onBack={goBack} prefill={d}/>,
      editTx:       (d) => {
        const shared = sharedEntryOfTx(d);
        if (shared) return editSharedEntryScreen(shared);
        return <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtPeople={data.debtPeople} setDebtPeople={data.setDebtPeople} debtEvents={data.debtEvents} onBack={goBack} edit={d}
          sharedGroups={data.sharedGroups} onMakeShared={groupId => replaceScreen("addSharedBill", { groupId, linkTxId: d.id })}/>;
      },
      addAcc:       ()  => <AccPage onBack={goBack}/>,
      editAcc:      (d) => <AccPage onBack={goBack} edit={d}/>,
      accDetail:    (d) => <AccDetailPage account={data.accounts.find(a => a.id === d.id) || d} transactions={data.transactions} transfers={data.transfers} accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtEvents={data.debtEvents} debtPeople={data.debtPeople} sharedTxIndex={data.sharedTxIndex} navigate={navigate} onBack={goBack}/>,
      transfer:     (d) => <TransferPageMon accounts={data.accounts} transfers={data.transfers} expCats={data.expCats} goals={data.goals} transactions={data.transactions} fxAccount={data.accounts.find(a => a.is_fx_account)} onBack={goBack} prefill={d}/>,
      history:      ()  => <HistoryPageMon transactions={data.transactions} transfers={data.transfers} accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtEvents={data.debtEvents} debtPeople={data.debtPeople} sharedTxIndex={data.sharedTxIndex} navigate={navigate} onReload={data.reload} onBack={goBack}/>,
      editTransfer: (d) => <TransferPageMon accounts={data.accounts} transfers={data.transfers} expCats={data.expCats} goals={data.goals} transactions={data.transactions} fxAccount={data.accounts.find(a => a.is_fx_account)} onBack={goBack} edit={d}/>,
      addCat:       (d) => <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} catType={d?.catType}/>,
      editCat:      (d) => <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d} catType={d?.catType}/>,
      addPlan:      (d) => <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} month={d?.month} prefillCatId={d?.cat_id} prefillAccId={d?.acc_id} prefillType={d?.type}/>,
      editPlan:     (d) => <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} edit={d}/>,
      addTrip:      ()  => <TripEditPageMon onBack={goBackToTrips}/>,
      editTrip:     (d) => <TripEditPageMon onBack={goBackToTrips} edit={d}/>,
      tripDetail:   (d) => <TripDetailPageMon plan={d} accounts={data.accounts} navigate={navigate} onBack={goBack}/>,
      menuCats:     ()  => <CatsListPageMon expCats={data.expCats} incCats={data.incCats} dispatch={data} navigate={navigate} onBack={() => goBack(false)}/>,
      menuDebts:    ()  => <DebtsListPage debtPeople={data.debtPeople} debtEvents={data.debtEvents} accounts={data.accounts}
        sharedGroups={data.sharedGroups} sharedMembers={data.sharedMembers} sharedEntries={data.sharedEntries} navigate={navigate} onBack={() => goBack(false)}/>,
      debtPersonDetail: (d) => <DebtPersonDetailPage person={data.debtPeople.find(p => p.id === d.id) || d} people={data.debtPeople} debtEvents={data.debtEvents} sharedGroups={data.sharedGroups} sharedMembers={data.sharedMembers} sharedEntries={data.sharedEntries} accounts={data.accounts} transactions={data.transactions} navigate={navigate} onReload={data.reload} onBack={goBack}/>,
      menuShared:   ()  => <SharedGroupsListPage groups={data.sharedGroups} members={data.sharedMembers} entries={data.sharedEntries} people={data.debtPeople} accounts={data.accounts} navigate={navigate} onBack={() => goBack(false)}/>,
      sharedGroup:  (d) => sharedGroupById(d.groupId)?.mode === "mirror"
        ? <SharedMirrorPage group={sharedGroupById(d.groupId)} members={data.sharedMembers} entries={data.sharedEntries} people={data.debtPeople}
            accounts={data.accounts} expCats={data.expCats} navigate={navigate} onReload={data.reload} onBack={goBack}/>
        : <SharedGroupDetailPage group={sharedGroupById(d.groupId)} groups={data.sharedGroups} members={data.sharedMembers} entries={data.sharedEntries} people={data.debtPeople} accounts={data.accounts} expCats={data.expCats} navigate={navigate} onReload={data.reload} onBack={goBack}/>,
      addSharedBill: (d) => sharedEntryForm(d.groupId ? sharedGroupById(d.groupId) : null, null, {
        linkTx: d.linkTxId ? data.transactions.find(t => t.id === d.linkTxId) || null : null,
        copyFrom: d.copyFromId ? data.sharedEntries.find(e => e.id === d.copyFromId) || null : null,
      }),
      editSharedGroup: (d) => groupForm(sharedGroupById(d.groupId)),
      addSharedGroup: (d) => groupForm(null, { createMode: d.mode }),
      addSharedPurchase: (d) => purchaseForm(sharedGroupById(d.groupId)),
      addMirrorTransfer: (d) => mirrorTransferForm(sharedGroupById(d.groupId)),
      addSharedTransfer: (d) => sharedTransferForm(sharedGroupById(d.groupId), d),
      editSharedEntry: (d) => {
        const entry = data.sharedEntries.find(e => e.id === d.entryId);
        return entry ? editSharedEntryScreen(entry) : null;
      },
      menuPeople:   ()  => <PeopleListPage people={data.debtPeople} debtEvents={data.debtEvents} sharedMembers={data.sharedMembers} sharedEntries={data.sharedEntries} accounts={data.accounts} onReload={data.reload} onBack={() => goBack(false)}/>,
      addDebt:      ()  => <DebtFormPage debtPeople={data.debtPeople} setDebtPeople={data.setDebtPeople} accounts={data.accounts} onBack={goBack}/>,
      priceCatalog: ()  => <PriceCatalogSection onBack={() => goBack(false)}/>,
      loanCalc:     (d) => <LoanCalculatorPage onBack={goBack} saveMode={!!d?.saveMode}/>,
      menuMonthly:  ()  => <MonthlyPaymentsListPage recurring={data.recurring} loans={data.loans} accounts={data.accounts} navigate={navigate} onReload={data.reload} onBack={() => goBack(false)}/>,
      addBill:      ()  => <BillFormPage onBack={goBack}/>,
      editBill:     (d) => <BillFormPage onBack={goBack} edit={d}/>,
      loanDetail:   (d) => <LoanDetailPage loan={data.loans.find(l => l.id === d.id) || d} accounts={data.accounts} navigate={navigate} onReload={data.reload} onBack={goBack}/>,
      cashflow:     ()  => <CashflowPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} recurring={data.recurring} loans={data.loans} monthPlans={data.monthPlans} plannedIncomes={data.plannedIncomes} plannedExpenses={data.plannedExpenses} navigate={navigate} onReload={data.reload} onBack={() => goBack(false)}/>,
      addPlannedIncome:  ()  => <PlannedIncomeFormPage incCats={data.incCats} onBack={goBack}/>,
      editPlannedIncome: (d) => <PlannedIncomeFormPage incCats={data.incCats} onBack={goBack} edit={d}/>,
      addPlannedExpense:  ()  => <PlannedExpenseFormPage expCats={data.expCats} onBack={goBack}/>,
      editPlannedExpense: (d) => <PlannedExpenseFormPage expCats={data.expCats} onBack={goBack} edit={d}/>,
      catTxs: (d) => {
        const week = new Date(); week.setDate(week.getDate() - 7);
        // «Мои» транзакции, как в итоге категории на Главной (доли, виртуальные строки, §11.1).
        const liveTxs = data.personalTransactions.filter(t => {
          if (t.type !== d.txType || t.category_id !== d.catId) return false;
          if (d.selAccId && t.account_id !== d.selAccId) return false;
          const dt = new Date(t.date);
          if (d.period === "day")   return t.date === todayStr();
          if (d.period === "week")  return dt >= week;
          if (d.period === "month") return dt.getMonth() === d.viewMonth && dt.getFullYear() === d.viewYear;
          if (d.period === "year")  return dt.getFullYear() === d.viewYear;
          if (d.period === "range") return d.rangeStart && d.rangeEnd ? t.date >= d.rangeStart && t.date <= d.rangeEnd : true;
          return true;
        });
        return <CatTxsPageMon cat={d.cat} txs={liveTxs} rawById={rawTxById} sharedTxIndex={data.sharedTxIndex} periodLabel={d.periodLabel} txType={d.txType} accounts={data.accounts} navigate={navigate} onBack={() => goBack(false)}/>;
      },
      addGoal:      ()  => <GoalFormPage accounts={data.accounts} onBack={goBack}/>,
      editGoal:     (d) => <GoalFormPage accounts={data.accounts} onBack={goBack} onDelete={goToGoalsList} edit={d}/>,
      goalDetail:   (d) => <GoalDetailPage goal={data.goals.find(g => g.id === d.id) || d} goalTopups={data.goalTopups} accounts={data.accounts} transactions={data.personalTransactions} navigate={navigate} onBack={goBack}/>,
      addTopup:     (d) => <GoalTopupPage goal={d.goal} onBack={goBack}/>,
      editTopup:    (d) => <GoalTopupPage goal={d.goal} onBack={goBack} edit={d.topup}/>,
    };
    const render = screenMap[name];
    if (render) return render(d);
  }

  return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))", color: "#fff" }}>
      <div ref={contentRef} style={{ overflowY: "auto", height: `calc(100dvh - var(--app-header-h) - var(--mon-nav-h, ${MON_NAV_HEIGHT}px))` }}>
        {monTab === "home"      && <MoneyHomeSection      data={data} navigate={navigate} view={homeView} setView={setHomeView}/>}
        {monTab === "accounts"  && <MoneyAccountsSection  data={data} navigate={navigate}/>}
        {monTab === "budget"    && <MoneyBudgetSection    data={data} navigate={navigate} budgetTab={budgetTab} setBudgetTab={setBudgetTabP} planMonth={planMonth} setPlanMonth={setPlanMonth} planYear={planYear} setPlanYear={setPlanYear}/>}
        {monTab === "analytics" && <MoneyAnalyticsSection data={data} navigate={navigate}/>}
        {monTab === "menu"      && <MoneyMenuPage         navigate={navigate}/>}
      </div>

      {/* Bottom nav */}
      <div ref={navRef}
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: `calc(${MON_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`, paddingBottom: "env(safe-area-inset-bottom, 0px)", background: C.monHeader, borderTop: "1px solid rgba(76,175,80,0.1)", display: "flex", zIndex: 30 }}>
        {MON_TABS.map(t => (
          <button key={t.id} onClick={() => { setMonTabP(t.id); setStack([]); }}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: monTab === t.id ? C.green : "rgba(255,255,255,0.3)", minWidth: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {t.d.split("M").filter(Boolean).map((p, i) => <path key={i} d={`M${p}`}/>)}
            </svg>
            <span style={{ fontSize: 9, fontWeight: 500, lineHeight: 1 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
