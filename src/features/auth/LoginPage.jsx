import { useEffect, useRef, useState } from "react";
import { requestCode, verifyCode } from "../../lib/authOtp";
import { C } from "../../constants/theme";
import { OTP_LENGTH, LAST_EMAIL_KEY } from "../../constants/auth";
import { useSave } from "../../hooks/useSave";
import { Ico } from "../../components/Ico";
import { OtpInput } from "./OtpInput";
import { authErrorText, isValidEmail, retryAfterSec } from "./authErrors";

const APP_NAME = "CashFlow";

const readLastEmail = () => { try { return localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch { return ""; } };
const saveLastEmail = v => { try { localStorage.setItem(LAST_EMAIL_KEY, v); } catch { /* без подсказки */ } };
const formatSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const card = {
  background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 24, padding: "28px clamp(16px, 5vw, 20px) 24px",
  boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
};
const title = { margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.main };
const lead = { margin: "0 0 22px", fontSize: 15, color: C.mid, lineHeight: 1.5 };
const errorText = { margin: "12px 0 0", fontSize: 13, color: C.errorLight, lineHeight: 1.4 };
const ghostBtn = disabled => ({
  background: "none", border: "none", padding: "10px 6px", fontSize: 14, fontWeight: 600,
  color: disabled ? C.dim : C.green, cursor: disabled ? "default" : "pointer",
});

// Основная кнопка: недоступна — серая (а не полупрозрачная зелёная), занята — со спиннером.
function PrimaryButton({ children, disabled, busy }) {
  const off = disabled && !busy;
  return (
    <button type="submit" disabled={disabled || busy}
      style={{ width: "100%", height: 52, marginTop: 20, borderRadius: 14, border: "none",
        background: off ? C.fieldBg : C.green, color: off ? C.dim : "#fff", fontSize: 16, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        cursor: disabled || busy ? "default" : "pointer", transition: "background 0.15s, color 0.15s" }}>
      {busy && <span style={{ width: 18, height: 18, borderRadius: 9, border: "2.5px solid rgba(255,255,255,0.35)",
        borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }}/>}
      {children}
    </button>
  );
}

// Вход кодом из письма, а не ссылкой: ссылка на iOS открывается в Safari, а не в PWA с
// домашнего экрана — сессия оказалась бы в чужом хранилище. Шаги: email → код.
// Код шлёт и проверяет наша функция auth-otp (lib/authOtp), не Supabase Auth.
export function LoginPage() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(readLastEmail);
  const [code, setCode] = useState("");
  const [codeLength, setCodeLength] = useState(OTP_LENGTH);   // из ответа сервера
  const [emailError, setEmailError] = useState(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const codeRef = useRef(null);

  const normEmail = email.trim().toLowerCase();

  // Отсчёт до повторной отправки: один интервал на отсчёт, а не таймер на каждую секунду.
  const counting = resendIn > 0;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [counting]);

  // Пауза до повторной отправки и длина кода — из ответа сервера (в т.ч. «подождите N сек»).
  const sendRef = useRef(null);
  const { save: execSend, saving: sending, saveError: sendError, setSaveError: setSendError } =
    useSave(() => sendRef.current(), { errorMsg: authErrorText });
  sendRef.current = async () => {
    let res;
    try {
      res = await requestCode(normEmail);
    } catch (e) {
      const wait = retryAfterSec(e);
      if (wait) setResendIn(wait);
      throw e;
    }
    saveLastEmail(normEmail);
    setCode("");
    setCodeLength(res?.code_length || OTP_LENGTH);
    setStep("code");
    setResendIn(res?.resend_after || 0);
  };

  // Успех — onAuthStateChange в AuthProvider сам переключит на приложение.
  const verifyRef = useRef(null);
  const { save: execVerify, saving: verifying, saveError: verifyError, setSaveError: setVerifyError } =
    useSave(c => verifyRef.current(c), { errorMsg: authErrorText });
  verifyRef.current = async value => {
    try {
      await verifyCode(normEmail, value);
    } catch (e) {
      setCode("");
      setShakeKey(k => k + 1);
      throw e;
    }
  };

  // Фокус в поле кода — при открытии шага и после неверного кода (поле было disabled).
  useEffect(() => { if (step === "code" && !verifying) codeRef.current?.focus(); }, [step, verifying]);

  const submitEmail = e => {
    e.preventDefault();
    if (sending || counting) return;
    if (!isValidEmail(normEmail)) { setEmailError("Введите email полностью, например you@mail.kz"); return; }
    setEmailError(null);
    execSend();
  };

  const onCodeChange = v => {
    const digits = v.replace(/\D/g, "").slice(0, codeLength);
    setCode(digits);
    setVerifyError(null);
    // Автоотправка, когда код набран или подставлен iOS из письма.
    if (digits.length === codeLength && !verifying) execVerify(digits);
  };

  const codeReady = code.length === codeLength;
  const submitCode = e => {
    e.preventDefault();
    if (codeReady && !verifying) execVerify(code);
  };

  const changeEmail = () => { setStep("email"); setCode(""); setSendError(null); setVerifyError(null); };
  const resend = () => { if (!counting && !sending) { setVerifyError(null); execSend(); } };

  const emailBorder = emailError ? C.errorBorder : emailFocused ? C.green : C.border;

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
          <div style={{ fontSize: 28, fontWeight: 800, color: C.main, letterSpacing: -0.5 }}>{APP_NAME}</div>
          <div style={{ marginTop: 4, fontSize: 14, color: C.mid }}>Личные финансы под контролем</div>
        </header>

        <div key={step} className="auth-in" style={card}>
          {step === "email" ? (
            <form onSubmit={submitEmail} noValidate>
              <h1 style={title}>Вход</h1>
              <p style={lead}>Введите email — пришлём код для входа. Пароль не нужен.</p>

              <label htmlFor="auth-email" style={{ display: "block", margin: "0 0 8px", fontSize: 13, color: C.dim }}>Email</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 52, padding: "0 14px", borderRadius: 14,
                background: C.fieldBg, border: `1.5px solid ${emailBorder}`, transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: emailFocused && !emailError ? `0 0 0 4px ${C.greenTint}` : "none" }}>
                <Ico n="mail" s={18} c={emailFocused ? C.green : C.dim}/>
                <input
                  id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
                  spellCheck={false} enterKeyHint="send" autoFocus={!email} placeholder="you@example.com"
                  value={email} onChange={e => { setEmail(e.target.value); setEmailError(null); setSendError(null); }}
                  onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
                  aria-invalid={!!emailError}
                  style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none",
                    color: C.main, fontSize: 16 }}
                />
              </div>
              {(emailError || sendError) && <p role="alert" style={errorText}>{emailError || sendError}</p>}

              <PrimaryButton busy={sending} disabled={counting}>
                {sending ? "Отправляем..." : counting ? `Получить код через ${formatSec(resendIn)}` : "Получить код"}
              </PrimaryButton>
            </form>
          ) : (
            <form onSubmit={submitCode} noValidate>
              <button type="button" onClick={changeEmail}
                style={{ ...ghostBtn(false), display: "inline-flex", alignItems: "center", gap: 4, margin: "-10px 0 8px -6px", color: C.mid }}>
                <Ico n="chevL" s={18} c={C.mid}/> Изменить email
              </button>
              <h1 style={title}>Введите код</h1>
              <p style={lead}>
                Отправили код на <span style={{ color: C.main, fontWeight: 600, overflowWrap: "anywhere" }}>{normEmail}</span>.
                {" "}Нет письма — загляните в «Спам».
              </p>

              <OtpInput
                value={code} onChange={onCodeChange} length={codeLength} maxLength={codeLength}
                disabled={verifying} error={!!verifyError} inputRef={codeRef} shakeKey={shakeKey} label="Код из письма"
              />
              {(verifyError || sendError) && <p role="alert" style={errorText}>{verifyError || sendError}</p>}

              <PrimaryButton busy={verifying} disabled={!codeReady}>{verifying ? "Проверяем..." : "Войти"}</PrimaryButton>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: 10, fontSize: 14, color: C.dim }}>
                Не пришёл код?
                <button type="button" onClick={resend} disabled={counting || sending} style={ghostBtn(counting || sending)}>
                  {sending ? "Отправляем..." : counting ? `Отправить снова через ${formatSec(resendIn)}` : "Отправить снова"}
                </button>
              </div>
            </form>
          )}
        </div>

        <footer style={{ marginTop: "auto", paddingTop: 28, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, fontSize: 12, color: C.dim, textAlign: "center" }}>
          <Ico n="shield" s={14} c={C.dim}/>
          Вход без пароля — только по коду из вашей почты
        </footer>
      </div>
    </div>
  );
}
