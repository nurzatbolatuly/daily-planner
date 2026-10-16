import { useState } from "react";
import { C } from "../../constants/theme";
import { AUTH_MODES } from "../../constants/auth";
import { Ico } from "../../components/Ico";
import { PasswordLoginForm } from "./PasswordLoginForm";
import { EmailCodeForm } from "./EmailCodeForm";
import { BackLink, readLastEmail, title } from "./authUi";

const APP_NAME = "CashFlow";

// Вход — по паролю. Код из письма — только подтвердить почту, когда задаётся пароль: регистрация
// и «Забыли пароль?» (EmailCodeForm). Код, а не ссылка: ссылка на iOS открывается в Safari, а не в PWA
// с домашнего экрана — сессия оказалась бы в чужом хранилище. Email общий для всех режимов.
const TABS = [
  { mode: AUTH_MODES.login, label: "Вход" },
  { mode: AUTH_MODES.signup, label: "Регистрация" },
];
const FOOTER = {
  [AUTH_MODES.login]: "Код из письма нужен только при регистрации и смене пароля",
  [AUTH_MODES.signup]: "Ваши данные видны только вам — у каждого аккаунта своё пространство",
  [AUTH_MODES.reset]: "Без кода из вашей почты пароль не сменить",
};

// Вход / Регистрация — сегменты, а не ссылка внизу: выбор виден сразу, переключение не теряет email.
function ModeSwitch({ mode, onChange }) {
  return (
    <div role="tablist" aria-label="Вход или регистрация"
      style={{ display: "flex", gap: 4, padding: 4, margin: "0 0 20px", borderRadius: 14, background: C.segmentBg }}>
      {TABS.map(t => {
        const on = t.mode === mode;
        return (
          <button key={t.mode} type="button" role="tab" aria-selected={on} onClick={() => !on && onChange(t.mode)}
            style={{ flex: 1, minWidth: 0, minHeight: 40, borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700,
              background: on ? C.green : "transparent", color: on ? "#fff" : C.mid,
              cursor: on ? "default" : "pointer", transition: "background 0.15s, color 0.15s" }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState(AUTH_MODES.login);
  const [email, setEmail] = useState(readLastEmail);

  const header = mode === AUTH_MODES.reset
    ? <><BackLink onClick={() => setMode(AUTH_MODES.login)}>Ко входу</BackLink><h2 style={title}>Новый пароль</h2></>
    : <ModeSwitch mode={mode} onChange={setMode}/>;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", boxSizing: "border-box",
      background: `radial-gradient(120% 55% at 50% 0%, ${C.greenTintStrong} 0%, transparent 70%), ${C.monBg}`,
      padding: "env(safe-area-inset-top, 0px) 16px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ width: "100%", maxWidth: 400, minHeight: "100%", margin: "0 auto", display: "flex", flexDirection: "column" }}>

        <header style={{ textAlign: "center", padding: "max(40px, 9vh) 0 28px" }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 16px", borderRadius: 20, display: "flex",
            alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.green}, ${C.emerald})`,
            boxShadow: `0 12px 32px ${C.greenBorder}` }}>
            <Ico n="walletLine" s={30} c="#fff"/>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: C.main, letterSpacing: -0.5 }}>{APP_NAME}</h1>
          <div style={{ marginTop: 4, fontSize: 14, color: C.mid }}>Личные финансы под контролем</div>
        </header>

        {/* Один EmailCodeForm на signup и reset: переход reset → signup сохраняет введённое. */}
        {mode === AUTH_MODES.login
          ? <PasswordLoginForm email={email} onEmailChange={setEmail} header={header} onForgot={() => setMode(AUTH_MODES.reset)}/>
          : <EmailCodeForm mode={mode} email={email} onEmailChange={setEmail} header={header} onModeChange={setMode}/>}

        <footer style={{ marginTop: "auto", paddingTop: 28, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, fontSize: 12, color: C.dim, textAlign: "center" }}>
          <Ico n="shield" s={14} c={C.dim}/>
          {FOOTER[mode]}
        </footer>
      </div>
    </div>
  );
}
