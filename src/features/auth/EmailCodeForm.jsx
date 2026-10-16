import { useEffect, useRef, useState } from "react";
import { requestCode, verifyCode } from "../../lib/auth";
import { C } from "../../constants/theme";
import { OTP_LENGTH, AUTH_MODES } from "../../constants/auth";
import { useSave } from "../../hooks/useSave";
import { OtpInput } from "./OtpInput";
import { authErrorText, isValidEmail, isValidPassword, passwordHint, retryAfterSec } from "./authErrors";
import {
  AuthCard, BackLink, EmailField, PasswordField, PrimaryButton, errorText, formatSec, ghostBtn, hintText, lead, normalizeEmail,
  notice, saveLastEmail, title,
} from "./authUi";

// Пароль задаётся только после кода из письма: почта подтверждена → пароль сохранён → сразу вход.
// Шаги: email + пароль → код. mode — AUTH_MODES.signup (регистрация) | AUTH_MODES.reset (забыли пароль /
// пароль ещё не задан). LoginPage рендерит один экземпляр на оба режима: переход reset → signup
// («аккаунта нет — зарегистрироваться?») сохраняет введённые email и пароль.
const COPY = {
  [AUTH_MODES.signup]: {
    lead: "Придумайте пароль и подтвердите почту кодом из письма. Дальше — вход по паролю, без кодов.",
    codeTitle: "Подтвердите email", confirm: "Создать аккаунт", confirming: "Создаём аккаунт...",
  },
  [AUTH_MODES.reset]: {
    lead: "Придумайте новый пароль — пришлём код на почту, чтобы подтвердить, что это вы. Так же задаётся первый пароль, если раньше вы входили по коду.",
    codeTitle: "Введите код", confirm: "Сохранить пароль и войти", confirming: "Сохраняем...",
  },
};
// Ошибки пароля при проверке кода — вернуться к полю пароля (код ещё действует: сервер проверяет
// пароль до кода).
const PASSWORD_ERRORS = new Set(["weak_password", "password_too_long"]);

export function EmailCodeForm({ mode, email, onEmailChange, header, onModeChange }) {
  const [step, setStep] = useState("form");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeLength, setCodeLength] = useState(OTP_LENGTH);   // из ответа сервера
  const [fieldError, setFieldError] = useState(null);          // { email } | { password }
  const [resendIn, setResendIn] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [sendErrorCode, setSendErrorCode] = useState(null);
  const [existingAccount, setExistingAccount] = useState(false);   // регистрация, а аккаунт уже есть
  const codeRef = useRef(null);
  const copy = COPY[mode];
  const normEmail = normalizeEmail(email);

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
    useSave(intent => sendRef.current(intent), { errorMsg: authErrorText });
  // intent — явно, когда режим меняется в этом же нажатии (onModeChange ещё не применился).
  sendRef.current = async (intent = mode) => {
    let res;
    setSendErrorCode(null);
    try {
      res = await requestCode(normEmail, intent);
    } catch (e) {
      setSendErrorCode(e?.code ?? null);
      // signup_busy — общий лимит новых адресов, а не пауза этого адреса: кнопку не блокируем.
      const wait = e?.code === "signup_busy" ? null : retryAfterSec(e);
      if (wait) setResendIn(wait);
      throw e;
    }
    saveLastEmail(normEmail);
    setExistingAccount(intent === AUTH_MODES.signup && res?.new_user === false);
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
      await verifyCode(normEmail, value, password);
    } catch (e) {
      setCode("");
      if (PASSWORD_ERRORS.has(e?.code)) {
        setStep("form");
        setFieldError({ password: authErrorText(e) });
        return;
      }
      setShakeKey(k => k + 1);
      throw e;
    }
  };

  // Фокус в поле кода — при открытии шага и после неверного кода (поле было disabled).
  useEffect(() => { if (step === "code" && !verifying) codeRef.current?.focus(); }, [step, verifying]);

  const clearErrors = () => { setFieldError(null); setSendError(null); setSendErrorCode(null); setVerifyError(null); };

  const submitForm = e => {
    e.preventDefault();
    if (sending || counting) return;
    if (!isValidEmail(normEmail)) { setFieldError({ email: "Введите email полностью, например you@mail.kz" }); return; }
    if (!isValidPassword(password)) { setFieldError({ password: passwordHint() }); return; }
    setFieldError(null);
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

  const backToForm = () => { setStep("form"); setCode(""); setExistingAccount(false); clearErrors(); };
  const resend = () => { if (!counting && !sending) { setVerifyError(null); execSend(); } };
  // Восстанавливали пароль, а аккаунта нет — email и пароль уже введены: одно нажатие = регистрация.
  const offerSignup = sendErrorCode === "user_not_found" && mode === AUTH_MODES.reset;
  const signupInstead = () => { clearErrors(); onModeChange(AUTH_MODES.signup); execSend(AUTH_MODES.signup); };

  if (step === "code") {
    // Регистрация на существующий адрес — по сути смена пароля: и тексты такие же.
    const codeCopy = existingAccount ? COPY[AUTH_MODES.reset] : copy;
    return (
      <AuthCard stepKey="code">
        <form onSubmit={submitCode} noValidate>
          <BackLink onClick={backToForm}>Изменить email или пароль</BackLink>
          <h2 style={title}>{codeCopy.codeTitle}</h2>
          {existingAccount && (
            <p role="status" style={notice}>Аккаунт с этим email уже есть — код подтвердит новый пароль.</p>
          )}
          <p style={lead}>
            Отправили код на <span style={{ color: C.main, fontWeight: 600, overflowWrap: "anywhere" }}>{normEmail}</span>.
            {" "}Нет письма — загляните в «Спам».
          </p>

          <OtpInput
            value={code} onChange={onCodeChange} length={codeLength} maxLength={codeLength}
            disabled={verifying} error={!!verifyError} inputRef={codeRef} shakeKey={shakeKey} label="Код из письма"
          />
          {(verifyError || sendError) && <p role="alert" style={errorText}>{verifyError || sendError}</p>}

          <PrimaryButton busy={verifying} disabled={!codeReady}>{verifying ? codeCopy.confirming : codeCopy.confirm}</PrimaryButton>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: 10, fontSize: 14, color: C.dim }}>
            Не пришёл код?
            <button type="button" onClick={resend} disabled={counting || sending} style={ghostBtn(counting || sending)}>
              {sending ? "Отправляем..." : counting ? `Отправить снова через ${formatSec(resendIn)}` : "Отправить снова"}
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  const passwordError = fieldError?.password;
  const error = fieldError?.email || sendError;
  return (
    <AuthCard stepKey={`form-${mode}`}>
      <form onSubmit={submitForm} noValidate>
        {header}
        <p style={lead}>{copy.lead}</p>
        <EmailField value={email} onChange={v => { onEmailChange(v); clearErrors(); }} error={fieldError?.email} autoFocus={!email}/>
        <PasswordField isNew label={mode === AUTH_MODES.reset ? "Новый пароль" : "Пароль"} value={password}
          onChange={v => { setPassword(v); setFieldError(null); }} error={passwordError} autoFocus={!!email} style={{ marginTop: 16 }}/>
        {passwordError
          ? <p role="alert" style={errorText}>{passwordError}</p>
          : <p style={hintText}>{passwordHint()}</p>}
        {error && (
          <p role="alert" style={errorText}>
            {error}
            {offerSignup && (
              <>
                {" — "}
                <button type="button" onClick={signupInstead} disabled={sending}
                  style={{ ...ghostBtn(false), padding: "4px 2px", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  зарегистрироваться с ним?
                </button>
              </>
            )}
          </p>
        )}
        <PrimaryButton busy={sending} disabled={counting}>
          {sending ? "Отправляем..." : counting ? `Получить код через ${formatSec(resendIn)}` : "Получить код"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
}
