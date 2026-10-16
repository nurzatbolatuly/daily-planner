// Ошибка входа → текст для пользователя. code — из AuthOtpError (lib/authOtp.js, ответ auth-otp)
// или из AuthApiError Supabase (обмен token_hash на сессию, выход).
const BY_CODE = {
  user_not_found: "Для этого email вход не открыт",
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

export function authErrorText(error) {
  const wait = retryAfterSec(error);
  if (error?.code === "too_soon") return `Новое письмо можно запросить через ${wait ?? "несколько"} сек`;
  if (error?.code === "too_many") {
    return `Слишком много писем на этот адрес — повторить можно через ${wait ? Math.ceil(wait / 60) : "несколько"} мин`;
  }
  if (BY_CODE[error?.code]) return BY_CODE[error.code];
  if (error?.name === "AuthRetryableFetchError" || error?.status === 0) return BY_CODE.network;
  if (error?.status === 429) return BY_CODE.over_request_rate_limit;
  return "Не удалось войти — попробуйте ещё раз";
}

export const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
