// Ошибка Supabase Auth → текст для пользователя. code — из AuthApiError (supabase-js v2).
const BY_CODE = {
  otp_expired: "Код неверный или устарел — запросите новый",
  otp_disabled: "Для этого email вход не открыт",
  signup_disabled: "Для этого email вход не открыт",
  user_not_found: "Для этого email вход не открыт",
  email_address_invalid: "Проверьте email",
  validation_failed: "Проверьте email",
  over_email_send_rate_limit: "Слишком много писем — подождите минуту",
  over_request_rate_limit: "Слишком много попыток — подождите немного",
};

export function authErrorText(error) {
  if (BY_CODE[error?.code]) return BY_CODE[error.code];
  if (error?.name === "AuthRetryableFetchError" || error?.status === 0) return "Нет соединения — попробуйте ещё раз";
  if (error?.status === 429) return BY_CODE.over_request_rate_limit;
  return "Не удалось войти — попробуйте ещё раз";
}

export const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
