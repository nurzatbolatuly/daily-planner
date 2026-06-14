import { useState } from "react";
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

export default function MoneyManagerSection() {
  const data = useMoneyData();
  const [monTab, setMonTab] = useState(() => localStorage.getItem("mon.tab") || "home");
  const [plansTab, setPlansTab] = useState(() => localStorage.getItem("mon.plansTab") || "month");
  // Стек экранов: navigate — push, goBack — pop одного уровня. Текущий экран — вершина стека.
  const [stack, setStack] = useState([]);
  const screen = stack[stack.length - 1] || null;

  const setMonTabP  = (t) => { setMonTab(t);   localStorage.setItem("mon.tab", t); };
  const setPlansTabP = (t) => { setPlansTab(t); localStorage.setItem("mon.plansTab", t); };

  const navigate = (name, d) => setStack(s => [...s, { name, data: d }]);
  const goBack = (reload = false) => { if (reload) data.reload(); setStack(s => s.slice(0, -1)); };
  const goBackToTrips = (reload = false) => { setPlansTabP("trips"); setMonTabP("plans"); if (reload) data.reload(); setStack([]); };

  if (data.loading) return <div style={{ background:C.monBg, minHeight:"calc(100dvh - var(--app-header-h))" }}><Spinner color={C.green}/></div>;

  // Full-page screens
  if (screen) {
    const { name, data: d } = screen;
    if (name === "addTx")      return <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} onBack={goBack}/>;
    if (name === "editTx")     return <TxPage accounts={data.accounts} expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d}/>;
    if (name === "addAcc")     return <AccPage onBack={goBack}/>;
    if (name === "editAcc")    return <AccPage onBack={goBack} edit={d}/>;
    if (name === "transfer")   return <TransferPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack}/>;
    if (name === "trHistory")  return <TransferHistoryPageMon transfers={data.transfers} accounts={data.accounts} navigate={navigate} onBack={() => goBack(true)}/>;
    if (name === "editTransfer") return <TransferPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack} edit={d}/>;
    if (name === "addCat")     return <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} catType={d?.catType}/>;
    if (name === "editCat")    return <CatPageMon expCats={data.expCats} incCats={data.incCats} onBack={goBack} edit={d} catType={d?.catType}/>;
    if (name === "addRec")     return <RecPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack}/>;
    if (name === "editRec")    return <RecPageMon accounts={data.accounts} expCats={data.expCats} onBack={goBack} edit={d}/>;
    if (name === "addPlan")    return <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} month={d?.month} prefillCatId={d?.cat_id} prefillAccId={d?.acc_id} prefillType={d?.type}/>;
    if (name === "editPlan")   return <PlanRowPageMon expCats={data.expCats} incCats={data.incCats} accounts={data.accounts} onBack={goBack} edit={d}/>;
    if (name === "addTrip")    return <TripEditPageMon onBack={goBackToTrips}/>;
    if (name === "editTrip")   return <TripEditPageMon onBack={goBackToTrips} edit={d}/>;
    if (name === "tripDetail") return <TripDetailPageMon plan={d} accounts={data.accounts} navigate={navigate} onBack={goBack}/>;
    if (name === "menu")       return <MoneyMenuPage navigate={navigate} onBack={() => goBack(false)}/>;
    if (name === "menuCats")   return <CatsListPageMon expCats={data.expCats} incCats={data.incCats} dispatch={data} navigate={navigate} onBack={() => goBack(false)}/>;
    if (name === "menuRec")    return <RecListPageMon recurring={data.recurring} accounts={data.accounts} expCats={data.expCats} navigate={navigate} onBack={() => goBack(false)}/>;
  }

  const MON_TABS = [
    { id:"home",     d:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10", label:"Home" },
    { id:"accounts", d:"M3 4h18v16H3zM3 10h18", label:"Accounts" },
    { id:"plans",    d:"M18 20V10M12 20V4M6 20v-6", label:"Plans" },
    { id:"menu",     d:"M3 12h18M3 6h18M3 18h18", label:"Menu" },
  ];

  return (
    <div style={{ background:C.monBg, minHeight:"calc(100dvh - var(--app-header-h))", color:"#fff" }}>
      {/* Scrollable content — height accounts for app header (CSS var) + bottom nav + iOS safe area */}
      <div style={{ overflowY:"auto", height:"calc(100dvh - var(--app-header-h) - 64px - env(safe-area-inset-bottom, 0px))" }}>
        {monTab === "home"     && <MoneyHomeSection     data={data} navigate={navigate}/>}
        {monTab === "accounts" && <MoneyAccountsSection data={data} navigate={navigate}/>}
        {monTab === "plans"    && <MoneyPlansSection    data={data} navigate={navigate} plansTab={plansTab} setPlansTab={setPlansTabP}/>}
      </div>
      {/* Bottom nav — height grows with iOS safe area so buttons stay above home indicator */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:"calc(64px + env(safe-area-inset-bottom, 0px))", paddingBottom:"env(safe-area-inset-bottom, 0px)", background:C.monHeader, borderTop:"1px solid rgba(76,175,80,0.1)", display:"flex", zIndex:30 }}>
        {MON_TABS.map(t => (
          <button key={t.id} onClick={() => { if(t.id==="menu") navigate("menu"); else { setMonTabP(t.id); setStack([]); } }} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, background:"none", border:"none", cursor:"pointer", color:monTab===t.id&&t.id!=="menu"?C.green:"rgba(255,255,255,0.3)" }}>
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
