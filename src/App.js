import { Component, useState, useEffect } from "react";
import { C } from "./constants/theme";
import { ensureAuth } from "./lib/supabase";
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
  const [authStatus, setAuthStatus] = useState("loading"); // "loading" | "ok" | "error"
  const [authError, setAuthError]   = useState(null);

  useEffect(() => {
    ensureAuth()
      .then(() => setAuthStatus("ok"))
      .catch((e) => { setAuthError(e.message); setAuthStatus("error"); });
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
      <div style={{ flex:1, overflow:"auto" }}>
        <ErrorBoundary>
          <MoneyManagerSection/>
        </ErrorBoundary>
      </div>
    </div>
  );
}
