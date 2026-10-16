import { Component } from "react";
import { C } from "./constants/theme";
import { Spinner } from "./components/Spinner";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
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

// key={userId}: другой пользователь — приложение монтируется заново, стейт прошлого не переживает.
function AuthGate() {
  const { status, userId } = useAuth();
  if (status === "loading") return <div style={{ flex:1, background:C.monBg }}><Spinner/></div>;
  if (status === "signedOut") return <LoginPage/>;
  return (
    <div style={{ flex:1, overflow:"auto" }}>
      <ErrorBoundary>
        <MoneyManagerSection key={userId}/>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", display:"flex", flexDirection:"column", height:"100dvh", overflow:"hidden" }}>
      <AuthProvider>
        <AuthGate/>
      </AuthProvider>
    </div>
  );
}
