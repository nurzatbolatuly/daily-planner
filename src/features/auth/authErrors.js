// Ошибка Supabase Auth → текст для пользователя. code — из AuthApiError (supabase-js v2).
const BY_CODE = {
  otp_expired: "Код неверный или устарел — запросите новый",
  otp_disabled: "Для этого email вход не открыт",
  signup_disabled: "Для этого email вход не открыт",
  user_not_found: "Для этого email вход не открыт",
  email_address_invalid: "Проверьте email",
  validation_failed: "Проверьте email",
  over_request_rate_limit: "Слишком много попыток — подождите немного",
  // Письмо шлёт наш хук (supabase/functions/send-email): упал или не ответил вовремя.
  hook_timeout: "Не удалось отправить письмо — попробуйте ещё раз",
  hook_timeout_after_retry: "Не удалось отправить письмо — попробуйте ещё раз",
  hook_payload_invalid_content_type: "Не удалось отправить письмо — попробуйте ещё раз",
  unexpected_failure: "Не удалось отправить письмо — попробуйте ещё раз",
};

// Supabase на частую отправку: «…you can only request this after 37 seconds» → 37. Нет числа → null.
export function retryAfterSec(error) {
  const m = /after (\d+) second/i.exec(error?.message || "");
  return m ? Number(m[1]) : null;
}

export function authErrorText(error) {
  if (error?.code === "over_email_send_rate_limit") {
    const sec = retryAfterSec(error);
    return sec ? `Новое письмо можно запросить через ${sec} сек` : "Лимит писем на час исчерпан — попробуйте позже";
  }
  if (BY_CODE[error?.code]) return BY_CODE[error.code];
  if (error?.name === "AuthRetryableFetchError" || error?.status === 0) return "Нет соединения — попробуйте ещё раз";
  if (error?.status === 429) return BY_CODE.over_request_rate_limit;
  return "Не удалось войти — попробуйте ещё раз";
}

export const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
