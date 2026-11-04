import { C } from "../constants/theme";
import { Spinner } from "./Spinner";

const screenStyle = { background: C.monBg, minHeight: "calc(100dvh - var(--app-header-h))" };

// Экран раздела, пока грузятся данные.
export function LoadingScreen() {
  return <div style={screenStyle}><Spinner color={C.green}/></div>;
}

// Данные не загрузились: текст ошибки + «Повторить» (стандарт §18 — ошибка видна, не пустой экран).
export function LoadErrorScreen({ message, onRetry }) {
  return (
    <div role="alert" style={{ ...screenStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, color: C.errorLight, textAlign: "center" }}>{message}</p>
      <button onClick={onRetry} style={{ padding: "12px 28px", borderRadius: 30, background: C.greenDim, border: `1px solid ${C.green}`, color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
        Повторить
      </button>
    </div>
  );
}
