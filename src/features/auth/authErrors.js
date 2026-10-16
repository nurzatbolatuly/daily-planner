import { PASSWORD_MIN_LENGTH } from "../../constants/auth";

// Ошибка входа → текст для пользователя. code — из AuthOtpError (lib/auth.js, ответ auth-otp)
// или из AuthApiError Supabase (вход по паролю, обмен token_hash на сессию, выход).
const BY_CODE = {
  user_not_found: "Аккаунта с этим email нет",
  invalid_credentials: "Неверный email или пароль",
  password_too_long: "Пароль слишком длинный — не больше 72 латинских символов",
  signup_closed: "Регистрация новых пользователей сейчас закрыта",
  invalid_email: "Проверьте email",
  invalid_code: "Код неверный — проверьте и введите ещё раз",
  code_expired: "Код устарел или попытки закончились — запросите новый",
  send_failed: "Не удалось отправить письмо — попробуйте ещё раз",
  otp_expired: "Ссылка входа устарела — запросите новый код",
  over_request_rate_limit: "Слишком много попыток — подождите немного",
  network: "Нет соединения — попробуйте ещё раз",
};

// Сколько ждать (сек) — сервер присылает для too_soon / too_many. Нет → null.
export const retryAfterSec = error => (Number(error?.retryAfter) > 0 ? Math.ceil(error.retryAfter) : null);
const inMinutes = sec => (sec ? Math.ceil(sec / 60) : "несколько");

// min — от сервера (weak_password), иначе клиентская константа.
export const passwordHint = min => `Пароль — не короче ${min || PASSWORD_MIN_LENGTH} символов`;
export const isValidPassword = p => p.length >= PASSWORD_MIN_LENGTH;

export function authErrorText(error) {
  const wait = retryAfterSec(error);
  if (error?.code === "too_soon") return `Новое письмо можно запросить через ${wait ?? "несколько"} сек`;
  if (error?.code === "too_many") {
    return `Слишком много писем на этот адрес — повторить можно через ${inMinutes(wait)} мин`;
  }
  if (error?.code === "weak_password") return passwordHint(error.minLength);
  if (error?.code === "signup_busy") return `Сейчас много регистраций — попробуйте через ${inMinutes(wait)} мин`;
  if (BY_CODE[error?.code]) return BY_CODE[error.code];
  if (error?.name === "AuthRetryableFetchError" || error?.status === 0) return BY_CODE.network;
  if (error?.status === 429) return BY_CODE.over_request_rate_limit;
  return "Не удалось войти — попробуйте ещё раз";
}

export const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
