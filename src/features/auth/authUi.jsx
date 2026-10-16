import { useState } from "react";
import { C } from "../../constants/theme";
import { LAST_EMAIL_KEY } from "../../constants/auth";
import { Ico } from "../../components/Ico";

// Общее для форм экрана входа (LoginPage, PasswordLoginForm, EmailCodeForm): стили, кнопки, поля.

export const readLastEmail = () => { try { return localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch { return ""; } };
export const saveLastEmail = v => { try { localStorage.setItem(LAST_EMAIL_KEY, v); } catch { /* без подсказки */ } };
export const formatSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const normalizeEmail = v => v.trim().toLowerCase();

export const title = { margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.main };
export const lead = { margin: "0 0 22px", fontSize: 15, color: C.mid, lineHeight: 1.5 };
export const errorText = { margin: "12px 0 0", fontSize: 13, color: C.errorLight, lineHeight: 1.4 };
export const hintText = { margin: "8px 0 0", fontSize: 13, color: C.dim, lineHeight: 1.4 };
export const notice = {
  margin: "-8px 0 18px", padding: "10px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.45, color: C.main,
  background: C.greenTint, border: `1px solid ${C.greenBorder}`,
};
export const ghostBtn = disabled => ({
  background: "none", border: "none", padding: "10px 6px", fontSize: 14, fontWeight: 600,
  color: disabled ? C.dim : C.green, cursor: disabled ? "default" : "pointer",
});
const card = {
  background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 24, padding: "28px clamp(16px, 5vw, 20px) 24px",
  boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
};

// Карточка шага. Новый stepKey — анимация появления (.auth-in) заново.
export function AuthCard({ stepKey, children }) {
  return <div key={stepKey} className="auth-in" style={card}>{children}</div>;
}

// «‹ Назад» над заголовком шага.
export function BackLink({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ ...ghostBtn(false), display: "inline-flex", alignItems: "center", gap: 4, margin: "-10px 0 8px -6px", color: C.mid }}>
      <Ico n="chevL" s={18} c={C.mid}/> {children}
    </button>
  );
}

// Основная кнопка: недоступна — серая (а не полупрозрачная зелёная), занята — со спиннером.
export function PrimaryButton({ children, disabled, busy }) {
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

// Поле с иконкой и подсветкой фокуса. right — элемент справа внутри поля (кнопка «показать пароль»).
// label сверху; labelAction — ссылка справа от подписи («Забыли пароль?»).
export function AuthField({ id, label, labelAction, icon, error, right, style, ...input }) {
  const [focused, setFocused] = useState(false);
  const border = error ? C.errorBorder : focused ? C.green : C.border;
  return (
    <div style={style}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 22, margin: "0 0 6px" }}>
        <label htmlFor={id} style={{ fontSize: 13, color: C.dim }}>{label}</label>
        {labelAction}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 52, padding: right ? "0 4px 0 14px" : "0 14px",
        borderRadius: 14, background: C.fieldBg, border: `1.5px solid ${border}`, transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: focused && !error ? `0 0 0 4px ${C.greenTint}` : "none" }}>
        <Ico n={icon} s={18} c={focused ? C.green : C.dim}/>
        <input id={id} aria-invalid={!!error} {...input}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none",
            color: C.main, fontSize: 16 }}/>
        {right}
      </div>
    </div>
  );
}

export function EmailField({ value, onChange, error, autoFocus, enterKeyHint = "next", style }) {
  return (
    <AuthField id="auth-email" label="Email" icon="mail" error={error} style={style}
      type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      enterKeyHint={enterKeyHint} autoFocus={autoFocus} placeholder="you@example.com"
      value={value} onChange={e => onChange(e.target.value)}/>
  );
}

// isNew — новый пароль (iOS/менеджеры паролей предложат надёжный), иначе — текущий.
// Повтора пароля нет: «показать» видно сразу, а забытый пароль восстанавливается кодом.
export function PasswordField({ value, onChange, error, isNew, label = "Пароль", labelAction, autoFocus, style }) {
  const [shown, setShown] = useState(false);
  const toggle = (
    <button type="button" onClick={() => setShown(v => !v)} aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
      aria-pressed={shown}
      style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: "none", border: "none", borderRadius: 12, cursor: "pointer" }}>
      <Ico n={shown ? "eyeOff" : "eye"} s={18} c={C.mid}/>
    </button>
  );
  return (
    <AuthField id={isNew ? "auth-new-password" : "auth-password"} label={label} labelAction={labelAction} icon="lock"
      error={error} right={toggle} style={style}
      type={shown ? "text" : "password"} autoComplete={isNew ? "new-password" : "current-password"}
      autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" autoFocus={autoFocus}
      placeholder={isNew ? "Придумайте пароль" : "Ваш пароль"}
      value={value} onChange={e => onChange(e.target.value)}/>
  );
}
