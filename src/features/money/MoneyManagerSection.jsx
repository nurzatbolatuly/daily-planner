import { useState, useCallback, useRef, useLayoutEffect } from "react";
import { todayStr } from "../../utils/date";
import { C } from "../../constants/theme";
import { Spinner } from "../../components/Spinner";
import { useMoneyData } from "./hooks/useMoneyData";
import { TxPage } from "./pages/TxPage";
import { AccPage } from "./pages/AccPage";
import { AccDetailPage } from "./pages/AccDetailPage";
import { TransferPageMon } from "./pages/TransferPageMon";
import { TransferHistoryPageMon } from "./pages/TransferHistoryPageMon";
import { MoneyHomeSection } from "./pages/MoneyHomeSection";
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
    const screenMap = {
      addTx:        (d) => <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtPeople={data.debtPeople} setDebtPeople={data.setDebtPeople} debtEvents={data.debtEvents} onBack={goBack} prefill={d}/>,
      editTx:       (d) => <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtPeople={data.debtPeople} setDebtPeople={data.setDebtPeople} debtEvents={data.debtEvents} onBack={goBack} edit={d}/>,
      addAcc:       ()  => <AccPage onBack={goBack}/>,
      editAcc:      (d) => <AccPage onBack={goBack} edit={d}/>,
      accDetail:    (d) => <AccDetailPage account={data.accounts.find(a => a.id === d.id) || d} transactions={data.transactions} transfers={data.transfers} accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} debtEvents={data.debtEvents} debtPeople={data.debtPeople} navigate={navigate} onBack={goBack}/>,
      transfer:     (d) => <TransferPageMon accounts={data.accounts} transfers={data.transfers} expCats={data.expCats} goals={data.goals} transactions={data.transactions} fxAccount={data.accounts.find(a => a.is_fx_account)} onBack={goBack} prefill={d}/>,
      trHistory:    ()  => <TransferHistoryPageMon transfers={data.transfers} accounts={data.accounts} navigate={navigate} onReload={data.reload} onBack={goBack}/>,
      editTransfer: (d) => <TransferPageMon accounts={data.accounts} transfers={data.transfers} expCats={data.expCats} goals={data.goals} transactions={data.transactions} fxAccount={data.accounts.find(a => a.is_fx_account)} onBack={goBack} edit={d}/>,
      addCat:       (d) => <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} catType={d?.catType}/>,
      editCat:      (d) => <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d} catType={d?.catType}/>,
      addPlan:      (d) => <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} month={d?.month} prefillCatId={d?.cat_id} prefillAccId={d?.acc_id} prefillType={d?.type}/>,
      editPlan:     (d) => <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} edit={d}/>,
      addTrip:      ()  => <TripEditPageMon onBack={goBackToTrips}/>,
      editTrip:     (d) => <TripEditPageMon onBack={goBackToTrips} edit={d}/>,
      tripDetail:   (d) => <TripDetailPageMon plan={d} accounts={data.accounts} navigate={navigate} onBack={goBack}/>,
      menuCats:     ()  => <CatsListPageMon expCats={data.expCats} incCats={data.incCats} dispatch={data} navigate={navigate} onBack={() => goBack(false)}/>,
      menuDebts:    ()  => <DebtsListPage debtPeople={data.debtPeople} debtEvents={data.debtEvents} accounts={data.accounts} navigate={navigate} onBack={() => goBack(false)}/>,
      debtPersonDetail: (d) => <DebtPersonDetailPage person={data.debtPeople.find(p => p.id === d.id) || d} debtEvents={data.debtEvents} accounts={data.accounts} transactions={data.transactions} navigate={navigate} onReload={data.reload} onBack={goBack}/>,
      addDebt:      ()  => <DebtFormPage debtPeople={data.debtPeople} setDebtPeople={data.setDebtPeople} accounts={data.accounts} onBack={goBack}/>,
      catTxs: (d) => {
        const week = new Date(); week.setDate(week.getDate() - 7);
        const liveTxs = data.transactions.filter(t => {
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
        return <CatTxsPageMon cat={d.cat} txs={liveTxs} periodLabel={d.periodLabel} txType={d.txType} accounts={data.accounts} debtEvents={data.debtEvents} navigate={navigate} onBack={() => goBack(false)}/>;
      },
      addGoal:      ()  => <GoalFormPage accounts={data.accounts} onBack={goBack}/>,
      editGoal:     (d) => <GoalFormPage accounts={data.accounts} onBack={goBack} onDelete={goToGoalsList} edit={d}/>,
      goalDetail:   (d) => <GoalDetailPage goal={data.goals.find(g => g.id === d.id) || d} goalTopups={data.goalTopups} accounts={data.accounts} transactions={data.transactions} debtEvents={data.debtEvents} navigate={navigate} onBack={goBack}/>,
      addTopup:     (d) => <GoalTopupPage goal={d.goal} onBack={goBack}/>,
      editTopup:    (d) => <GoalTopupPage goal={d.goal} onBack={goBack} edit={d.topup}/>,
    };
    const render = screenMap[name];
    if (render) return render(d);
  }

  return (
    <div style={{ background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))", color: "#fff" }}>
      <div ref={contentRef} style={{ overflowY: "auto", height: `calc(100dvh - var(--app-header-h) - var(--mon-nav-h, ${MON_NAV_HEIGHT}px))` }}>
        {monTab === "home"      && <MoneyHomeSection      data={data} navigate={navigate} onGoToBudget={() => setMonTabP("budget")}/>}
        {monTab === "accounts"  && <MoneyAccountsSection  data={data} navigate={navigate}/>}
        {monTab === "budget"    && <MoneyBudgetSection    data={data} navigate={navigate} budgetTab={budgetTab} setBudgetTab={setBudgetTabP}/>}
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
