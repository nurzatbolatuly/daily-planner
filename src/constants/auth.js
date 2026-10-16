// Вход по паролю; код из письма — подтвердить почту при регистрации и смене пароля
// (features/auth, lib/auth.js, Edge Function auth-otp).
// Длина кода, пауза между письмами, лимиты и срок кода — на сервере (auth-otp/handler.ts
// DEFAULT_CONFIG, переопределяются секретами OTP_*): клиент получает их в ответе и не дублирует.

// Длина кода, пока сервер не ответил (поле кода показывается только после ответа — запасное значение).
export const OTP_LENGTH = 6;

// Минимальная длина пароля — для подсказки до отправки кода. Решает сервер (auth-otp
// PASSWORD_MIN_LENGTH): не совпало — его min_length приходит в ошибке weak_password и попадает в текст.
export const PASSWORD_MIN_LENGTH = 8;

// Режимы экрана входа. signup / reset — это же intent запроса кода (auth-otp).
export const AUTH_MODES = { login: "login", signup: "signup", reset: "reset" };

// Последний email — единственное, что переживает выход (подставляется в форму входа).
export const LAST_EMAIL_KEY = "auth.lastEmail";
