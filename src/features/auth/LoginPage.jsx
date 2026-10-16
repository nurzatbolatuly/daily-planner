import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { C } from "../../constants/theme";
import { OTP_LENGTH, OTP_MIN_LENGTH, OTP_MAX_LENGTH, OTP_RESEND_SEC, ALLOW_SIGNUP, LAST_EMAIL_KEY } from "../../constants/auth";
import { useSave } from "../../hooks/useSave";
import { FieldLabel } from "../../components/FieldLabel";
import { authErrorText, isValidEmail } from "./authErrors";

const readLastEmail = () => { try { return localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch { return ""; } };
const saveLastEmail = v => { try { localStorage.setItem(LAST_EMAIL_KEY, v); } catch { /* без подсказки */ } };
const formatSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// 16px — иначе iOS зумит поле при фокусе.
const inputStyle = {
  width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "14px", color: C.main, fontSize: 16, outline: "none",
};
const primaryBtn = busy => ({
  width: "100%", padding: 16, borderRadius: 14, background: C.green, border: "none", color: "#fff",
  fontSize: 16, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, marginTop: 16,
});
const linkBtn = disabled => ({
  background: "none", border: "none", padding: "8px 4px", fontSize: 14, fontWeight: 500,
  color: disabled ? C.dim : C.green, cursor: disabled ? "default" : "pointer",
});

// Вход кодом из письма, а не ссылкой: ссылка на iOS открывается в Safari, а не в PWA с
// домашнего экрана — сессия оказалась бы в чужом хранилище. Шаги: email → код.
export function LoginPage() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(readLastEmail);
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef(null);

  const normEmail = email.trim().toLowerCase();

  // Отсчёт до повторной отправки: один интервал на шаг, а не таймер на каждую секунду.
  const counting = resendIn > 0;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const sendRef = useRef(null);
  const { save: execSend, saving: sending, saveError: sendError, setSaveError: setSendError } =
    useSave(() => sendRef.current(), { errorMsg: authErrorText });
  sendRef.current = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email: normEmail, options: { shouldCreateUser: ALLOW_SIGNUP } });
    if (error) throw error;
    saveLastEmail(normEmail);
    setCode("");
    setStep("code");
    setResendIn(OTP_RESEND_SEC);
  };

  // Успех — onAuthStateChange в AuthProvider сам переключит на приложение.
  const verifyRef = useRef(null);
  const { save: execVerify, saving: verifying, saveError: verifyError, setSaveError: setVerifyError } =
    useSave(c => verifyRef.current(c), { errorMsg: authErrorText });
  verifyRef.current = async code => {
    const { error } = await supabase.auth.verifyOtp({ email: normEmail, token: code, type: "email" });
    if (error) { setCode(""); throw error; }
  };

  // Фокус в поле кода — при открытии шага и после неверного кода (поле было disabled).
  useEffect(() => { if (step === "code" && !verifying) codeRef.current?.focus(); }, [step, verifying]);

  const submitEmail = e => {
    e.preventDefault();
    if (sending) return;
    if (!isValidEmail(normEmail)) { setEmailError("введите email"); return; }
    setEmailError(null);
    execSend();
  };

  const onCodeChange = v => {
    const digits = v.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH);
    setCode(digits);
    setVerifyError(null);
    // Автоотправка, когда код набран или подставлен iOS из письма.
    if (digits.length === OTP_LENGTH && !verifying) execVerify(digits);
  };

  const codeReady = code.length >= OTP_MIN_LENGTH;
  const submitCode = e => {
    e.preventDefault();
    if (codeReady && !verifying) execVerify(code);
  };

  const changeEmail = () => { setStep("email"); setSendError(null); setVerifyError(null); };
  const resend = () => { if (!counting && !sending) { setVerifyError(null); execSend(); } };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.monBg, boxSizing: "border-box",
      padding: "env(safe-area-inset-top, 0px) 16px calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ width: "100%", maxWidth: 400, margin: "0 auto", paddingTop: "max(48px, 14vh)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, color: C.main }}>Вход</h1>

        {step === "email" ? (
          <form onSubmit={submitEmail} noValidate>
            <p style={{ margin: "0 0 24px", fontSize: 15, color: C.mid, lineHeight: 1.5 }}>
              Пришлём код на почту — пароль не нужен.
            </p>
            <FieldLabel error={emailError}>Email</FieldLabel>
            <input
              type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
              spellCheck={false} enterKeyHint="send" autoFocus={!email} placeholder="you@example.com"
              value={email} onChange={e => { setEmail(e.target.value); setEmailError(null); setSendError(null); }}
              aria-invalid={!!emailError} style={{ ...inputStyle, borderColor: emailError ? C.errorBorder : C.border }}
            />
            {sendError && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: C.errorLight }}>{sendError}</p>}
            <button type="submit" disabled={sending} style={primaryBtn(sending)}>
              {sending ? "Отправляем..." : "Получить код"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} noValidate>
            <p style={{ margin: "0 0 24px", fontSize: 15, color: C.mid, lineHeight: 1.5, overflowWrap: "anywhere" }}>
              Код отправлен на <span style={{ color: C.main, fontWeight: 600 }}>{normEmail}</span>.
              {" "}Проверьте «Спам», если письма нет.
            </p>
            <FieldLabel>Код из письма</FieldLabel>
            <input
              ref={codeRef} aria-label="Код из письма"
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" enterKeyHint="go"
              maxLength={OTP_MAX_LENGTH} placeholder={"•".repeat(OTP_LENGTH)} disabled={verifying}
              value={code} onChange={e => onCodeChange(e.target.value)}
              aria-invalid={!!verifyError}
              style={{ ...inputStyle, fontSize: 24, letterSpacing: "0.4em", textAlign: "center", fontVariantNumeric: "tabular-nums",
                borderColor: verifyError ? C.errorBorder : C.border }}
            />
            {(verifyError || sendError) && (
              <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: C.errorLight }}>{verifyError || sendError}</p>
            )}
            <button type="submit" disabled={verifying || !codeReady} style={primaryBtn(verifying || !codeReady)}>
              {verifying ? "Проверяем..." : "Войти"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={changeEmail} style={linkBtn(false)}>Другой email</button>
              <button type="button" onClick={resend} disabled={counting || sending} style={linkBtn(counting || sending)}>
                {counting ? `Отправить снова через ${formatSec(resendIn)}` : sending ? "Отправляем..." : "Отправить снова"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
