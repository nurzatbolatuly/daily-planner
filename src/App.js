import { Component, useState, useEffect, useRef, useLayoutEffect } from "react";
import { C } from "./constants/theme";
import { ensureAuth } from "./lib/supabase";
import PlannerSection from "./features/planner/PlannerSection";
import MoneyManagerSection from "./features/money/MoneyManagerSection";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding:32, color:C.errorLight, fontFamily:"monospace" }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Что-то пошло не так</div>
          <div style={{ fontSize:13, opacity:0.7 }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop:16, padding:"8px 16px", background:`rgba(248,113,113,0.15)`, border:`1px solid ${C.errorLight}`, borderRadius:8, color:C.errorLight, cursor:"pointer", fontSize:13 }}>
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [section, setSection] = useState(() => localStorage.getItem("app.section") || "planner");
  const [authStatus, setAuthStatus] = useState("loading"); // "loading" | "ok" | "error"
  const [authError, setAuthError]   = useState(null);
  const headerRef = useRef(null);

  useEffect(() => {
    ensureAuth()
      .then(() => setAuthStatus("ok"))
      .catch((e) => { setAuthError(e.message); setAuthStatus("error"); });
  }, []);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (authStatus === "loading") {
    return (
      <div style={{ height:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, color:C.textMuted, fontSize:14 }}>
        Подключение...
      </div>
    );
  }

  if (authStatus === "error") {
    return (
      <div style={{ height:"100dvh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:C.bg, color:C.errorLight, fontFamily:"monospace", padding:32, gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Ошибка авторизации</div>
        <div style={{ fontSize:13, opacity:0.7, textAlign:"center" }}>{authError}</div>
        <button onClick={() => { setAuthStatus("loading"); setAuthError(null); ensureAuth().then(() => setAuthStatus("ok")).catch((e) => { setAuthError(e.message); setAuthStatus("error"); }); }} style={{ marginTop:8, padding:"8px 20px", background:`rgba(248,113,113,0.15)`, border:`1px solid ${C.errorLight}`, borderRadius:8, color:C.errorLight, cursor:"pointer", fontSize:13 }}>
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", display:"flex", flexDirection:"column", height:"100dvh", overflow:"hidden" }}>
      {/* Section switcher — in flow, not fixed */}
      <div ref={headerRef} style={{ flexShrink:0, display:"flex", background:"rgba(8,8,20,0.97)", backdropFilter:"blur(16px)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"6px 16px 6px", zIndex:100 }}>
        <button onClick={() => { setSection("planner"); localStorage.setItem("app.section","planner"); }} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer", fontSize:14, fontWeight:700, background:section==="planner"?"rgba(99,102,241,0.2)":"transparent", color:section==="planner"?"#a5b4fc":"rgba(255,255,255,0.3)", transition:"all 0.2s" }}>
          📋 Планнер
        </button>
        <button onClick={() => { setSection("money"); localStorage.setItem("app.section","money"); }} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer", fontSize:14, fontWeight:700, background:section==="money"?"rgba(76,175,80,0.2)":"transparent", color:section==="money"?"#86efac":"rgba(255,255,255,0.3)", transition:"all 0.2s" }}>
          💰 Финансы
        </button>
      </div>

      {/* Content — fills remaining height, each section manages its own scroll */}
      <div style={{ flex:1, overflow:"auto" }}>
        <ErrorBoundary key={section}>
          {section === "planner" && <PlannerSection/>}
          {section === "money"   && <MoneyManagerSection/>}
        </ErrorBoundary>
      </div>
    </div>
  );
}
