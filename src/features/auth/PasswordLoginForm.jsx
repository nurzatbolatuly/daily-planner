import { useRef, useState } from "react";
import { signInWithPassword } from "../../lib/auth";
import { useSave } from "../../hooks/useSave";
import { AuthCard, EmailField, PasswordField, PrimaryButton, errorText, ghostBtn, lead, normalizeEmail, saveLastEmail } from "./authUi";
import { authErrorText, isValidEmail } from "./authErrors";

// Обычный вход: email + пароль, без писем (Supabase Auth). Успех — onAuthStateChange в AuthProvider.
// «Забыли пароль?» — восстановление кодом из письма (EmailCodeForm, reset): так же задаёт пароль
// тот, кто раньше входил только по коду.
export function PasswordLoginForm({ email, onEmailChange, header, onForgot }) {
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const normEmail = normalizeEmail(email);

  const signInRef = useRef(null);
  const { save: execSignIn, saving, saveError, setSaveError } = useSave(() => signInRef.current(), { errorMsg: authErrorText });
  signInRef.current = async () => {
    await signInWithPassword(normEmail, password);
    saveLastEmail(normEmail);
  };

  const submit = e => {
    e.preventDefault();
    if (saving) return;
    if (!isValidEmail(normEmail)) { setFieldError({ email: "Введите email полностью, например you@mail.kz" }); return; }
    if (!password) { setFieldError({ password: "Введите пароль" }); return; }
    setFieldError(null);
    execSignIn();
  };
  const clear = () => { setFieldError(null); setSaveError(null); };
  const error = fieldError?.email || fieldError?.password || saveError;

  return (
    <AuthCard stepKey="login">
      <form onSubmit={submit} noValidate>
        {header}
        <p style={lead}>Войдите по email и паролю.</p>
        <EmailField value={email} onChange={v => { onEmailChange(v); clear(); }} error={fieldError?.email} autoFocus={!email}/>
        <PasswordField value={password} onChange={v => { setPassword(v); clear(); }} error={fieldError?.password || saveError}
          autoFocus={!!email} style={{ marginTop: 16 }}
          labelAction={<button type="button" onClick={onForgot} style={{ ...ghostBtn(false), padding: "2px 0", fontSize: 13 }}>Забыли пароль?</button>}/>
        {error && <p role="alert" style={errorText}>{error}</p>}
        <PrimaryButton busy={saving}>{saving ? "Входим..." : "Войти"}</PrimaryButton>
      </form>
    </AuthCard>
  );
}
