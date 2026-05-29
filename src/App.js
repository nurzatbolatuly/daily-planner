import { useState } from "react";
import PlannerSection from "./features/planner/PlannerSection";
import MoneyManagerSection from "./features/money/MoneyManagerSection";

export default function App() {
  const [section, setSection] = useState(() => localStorage.getItem("app.section") || "planner");

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      {/* Section switcher */}
      <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, display:"flex", background:"rgba(8,8,20,0.97)", backdropFilter:"blur(16px)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"6px 16px 6px" }}>
        <button onClick={() => { setSection("planner"); localStorage.setItem("app.section","planner"); }} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:section==="planner"?"rgba(99,102,241,0.2)":"transparent", color:section==="planner"?"#a5b4fc":"rgba(255,255,255,0.3)", transition:"all 0.2s" }}>
          📋 Планнер
        </button>
        <button onClick={() => { setSection("money"); localStorage.setItem("app.section","money"); }} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:section==="money"?"rgba(76,175,80,0.2)":"transparent", color:section==="money"?"#86efac":"rgba(255,255,255,0.3)", transition:"all 0.2s" }}>
          💰 Финансы
        </button>
      </div>

      {/* Content — padded for top switcher */}
      <div style={{ paddingTop:50 }}>
        {section === "planner" && <PlannerSection/>}
        {section === "money"   && <MoneyManagerSection/>}
      </div>
    </div>
  );
}
