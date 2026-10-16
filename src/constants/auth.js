// Вход по коду из письма (features/auth). Значения должны совпадать с Supabase → Authentication.

// Длина кода: Authentication → Providers → Email → «Email OTP Length» (в проекте — 8).
// Набран OTP_LENGTH — код отправляется сам. Поле при этом принимает любой код в пределах
// Supabase (6–10): разойдётся настройка с константой — вход кнопкой «Войти» всё равно работает.
export const OTP_LENGTH = 8;
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

// Повторная отправка кода: Supabase не даёт чаще раза в 60 сек на один email.
export const OTP_RESEND_SEC = 60;

// false — входят только уже созданные пользователи (Authentication → Users → Invite).
// Тот же запрет — в дашборде: «Allow new users to sign up» выключен (клиенту одному не доверяем).
export const ALLOW_SIGNUP = false;

// Последний email — единственное, что переживает выход (подставляется в форму входа).
export const LAST_EMAIL_KEY = "auth.lastEmail";
