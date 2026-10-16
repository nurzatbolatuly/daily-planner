// Вход по коду из письма (features/auth). Значения должны совпадать с Supabase → Authentication.

// Длина кода: Authentication → Providers → Email → «Email OTP Length» = 6.
// Набран OTP_LENGTH — код отправляется сам. Поле при этом принимает любой код в пределах
// Supabase (6–10): разойдётся настройка с константой — вход кнопкой «Войти» всё равно работает.
export const OTP_LENGTH = 6;
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

// Пауза перед «Отправить снова».
// ⚠️ ТЕСТОВОЕ значение (15 сек). Перед продом — 60 и такой же интервал в Supabase
// (instruction.md §23 «Перед продом»). Если сервер всё же попросит подождать — отсчёт берётся из его ответа.
export const OTP_RESEND_SEC = 15;

// false — входят только уже созданные пользователи (Authentication → Users → Invite).
// Тот же запрет — в дашборде: «Allow new users to sign up» выключен (клиенту одному не доверяем).
export const ALLOW_SIGNUP = false;

// Последний email — единственное, что переживает выход (подставляется в форму входа).
export const LAST_EMAIL_KEY = "auth.lastEmail";
