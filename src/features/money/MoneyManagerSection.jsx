import { useState, useCallback, useRef, useLayoutEffect } from "react";
import { C } from "../../constants/theme";
import { Spinner } from "../../components/Spinner";
import { useMoneyData } from "./hooks/useMoneyData";
import { TxPage } from "./pages/TxPage";
import { AccPage } from "./pages/AccPage";
import { TransferPageMon } from "./pages/TransferPageMon";
import { TransferHistoryPageMon } from "./pages/TransferHistoryPageMon";
import { MoneyHomeSection } from "./pages/MoneyHomeSection";
import { MoneyAccountsSection } from "./pages/MoneyAccountsSection";
import { MoneyPlansSection } from "./pages/MoneyPlansSection";
import { MoneyMenuPage } from "./pages/MoneyMenuPage";
import { CatPageMon } from "./pages/CatPageMon";
import { RecPageMon } from "./pages/RecPageMon";
import { PlanRowPageMon } from "./pages/PlanRowPageMon";
import { TripEditPageMon } from "./pages/TripEditPageMon";
import { TripDetailPageMon } from "./pages/TripDetailPageMon";
import { CatsListPageMon } from "./pages/CatsListPageMon";
import { RecListPageMon } from "./pages/RecListPageMon";
import { CatTxsPageMon } from "./pages/CatTxsPageMon";

export default function MoneyManagerSection() {
  const data = useMoneyData();
  const [monTab, setMonTab] = useState(() => localStorage.getItem("mon.tab") || "home");
  const [plansTab, setPlansTab] = useState(() => localStorage.getItem("mon.plansTab") || "month");
  // Стек экранов: navigate — push, goBack — pop одного уровня. Текущий экран — вершина стека.
  const [stack, setStack] = useState([]);
  const screen = stack[stack.length - 1] || null;

  const navRef = useRef(null);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--mon-nav-h", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setMonTabP  = useCallback((t) => { setMonTab(t);   localStorage.setItem("mon.tab", t); }, []);
  const setPlansTabP = useCallback((t) => { setPlansTab(t); localStorage.setItem("mon.plansTab", t); }, []);

  const navigate = useCallback((name, d) => setStack(s => [...s, { name, data: d }]), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const goBack = useCallback((reload = false) => { if (reload) data.reload(); setStack(s => s.slice(0, -1)); }, [data.reload]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const goBackToTrips = useCallback((reload = false) => { setPlansTabP("trips"); setMonTabP("plans"); if (reload) data.reload(); setStack([]); }, [setPlansTabP, setMonTabP, data.reload]);

  if (data.loading) return <div style={{ background:C.monBg, minHeight:"calc(100dvh - var(--app-header-h))" }}><Spinner color={C.green}/></div>;

  // Декларативный роутер: каждый экран — функция (d) => JSX
  if (screen) {
    const { name, data: d } = screen;
    const screenMap = {
      addTx:        ()  => <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} onBack={goBack}/>,
      editTx:       (d) => <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d}/>,
      addAcc:       ()  => <AccPage onBack={goBack}/>,
      editAcc:      (d) => <AccPage onBack={goBack} edit={d}/>,
      transfer:     ()  => <TransferPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack}/>,
      trHistory:    ()  => <TransferHistoryPageMon transfers={data.transfers} accounts={data.accounts} navigate={navigate} onBack={goBack}/>,
      editTransfer: (d) => <TransferPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack} edit={d}/>,
      addCat:       (d) => <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} catType={d?.catType}/>,
      editCat:      (d) => <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d} catType={d?.catType}/>,
      addRec:       ()  => <RecPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack}/>,
      editRec:      (d) => <RecPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack} edit={d}/>,
      addPlan:      (d) => <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} month={d?.month} prefillCatId={d?.cat_id} prefillAccId={d?.acc_id} prefillType={d?.type}/>,
      editPlan:     (d) => <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} edit={d}/>,
      addTrip:      ()  => <TripEditPageMon onBack={goBackToTrips}/>,
      editTrip:     (d) => <TripEditPageMon onBack={goBackToTrips} edit={d}/>,
      tripDetail:   (d) => <TripDetailPageMon plan={d} accounts={data.accounts} navigate={navigate} onBack={goBack}/>,
      menuCats:     ()  => <CatsListPageMon expCats={data.expCats} incCats={data.incCats} dispatch={data} navigate={navigate} onBack={() => goBack(false)}/>,
      menuRec:      ()  => <RecListPageMon recurring={data.recurring} accounts={data.accounts} expCats={data.expCats} navigate={navigate} onBack={() => goBack(false)}/>,
      catTxs:       (d) => <CatTxsPageMon cat={d.cat} txs={d.txs} periodLabel={d.periodLabel} txType={d.txType} accounts={data.accounts} navigate={navigate} onBack={() => goBack(false)}/>,
    };
    const render = screenMap[name];
    if (render) return render(d);
  }

  const MON_TABS = [
    { id:"home",     d:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10", label:"Главная" },
    { id:"accounts", d:"M3 4h18v16H3zM3 10h18", label:"Счета" },
    { id:"plans",    d:"M18 20V10M12 20V4M6 20v-6", label:"Планы" },
    { id:"menu",     d:"M3 12h18M3 6h18M3 18h18", label:"Меню" },
  ];

  return (
    <div style={{ background:C.monBg, minHeight:"calc(100dvh - var(--app-header-h))", color:"#fff" }}>
      {/* Scrollable content — height accounts for app header (CSS var) + bottom nav + iOS safe area */}
      <div style={{ overflowY:"auto", height:"calc(100dvh - var(--app-header-h) - var(--mon-nav-h, 64px))" }}>
        {monTab === "home"     && <MoneyHomeSection     data={data} navigate={navigate}/>}
        {monTab === "accounts" && <MoneyAccountsSection data={data} navigate={navigate}/>}
        {monTab === "plans"    && <MoneyPlansSection    data={data} navigate={navigate} plansTab={plansTab} setPlansTab={setPlansTabP}/>}
        {monTab === "menu"     && <MoneyMenuPage        navigate={navigate}/>}
      </div>
      {/* Bottom nav — height grows with iOS safe area so buttons stay above home indicator */}
      <div ref={navRef} style={{ position:"fixed", bottom:0, left:0, right:0, height:"calc(64px + env(safe-area-inset-bottom, 0px))", paddingBottom:"env(safe-area-inset-bottom, 0px)", background:C.monHeader, borderTop:"1px solid rgba(76,175,80,0.1)", display:"flex", zIndex:30 }}>
        {MON_TABS.map(t => (
          <button key={t.id} onClick={() => { setMonTabP(t.id); setStack([]); }} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, background:"none", border:"none", cursor:"pointer", color:monTab===t.id?C.green:"rgba(255,255,255,0.3)" }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {t.d.split("M").filter(Boolean).map((p,i) => <path key={i} d={`M${p}`}/>)}
            </svg>
            <span style={{ fontSize:10, fontWeight:500 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
