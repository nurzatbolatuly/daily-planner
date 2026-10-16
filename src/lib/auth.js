import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Вход — по паролю (Supabase Auth, писем нет). Код из письма — только подтвердить почту, когда
// пароль задаётся: регистрация и «забыли пароль» (Edge Function auth-otp, instruction.md §23).
// Ошибки кода — AuthOtpError с code из ответа функции (тексты — features/auth/authErrors.js).

const FUNCTION = "auth-otp";

export class AuthOtpError extends Error {
  constructor(code, { retryAfter = null, minLength = null } = {}) {
    super(code);
    this.code = code;
    this.retryAfter = retryAfter;   // сек — для too_soon / too_many / signup_busy
    this.minLength = minLength;     // weak_password — требование сервера
  }
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = await error.context?.json?.().catch(() => null);
    throw new AuthOtpError(res?.error || "server_error", { retryAfter: res?.retry_after ?? null, minLength: res?.min_length ?? null });
  }
  throw new AuthOtpError("network");
}

// Ошибка — AuthApiError Supabase (invalid_credentials и т.п.), успех — onAuthStateChange в AuthProvider.
export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// intent — AUTH_MODES.signup | AUTH_MODES.reset (constants/auth.js). signup разрешает код адресу без аккаунта.
// → { code_length, resend_after, expires_in, new_user } — длину кода и паузу задаёт сервер;
// new_user: false при регистрации — аккаунт уже есть, код задаст ему новый пароль.
export const requestCode = (email, intent) => call({ action: "send", email, intent });

// Код верный → функция задаёт пароль (новому — создаёт аккаунт) и отдаёт одноразовый token_hash,
// он меняется на обычную сессию. Пароль задан по коду — остальные устройства выходят: старый
// пароль мог быть у чужого (у нового аккаунта других сессий нет — вызов ничего не меняет).
export async function verifyCode(email, code, password) {
  const { token_hash, type } = await call({ action: "verify", email, code, password });
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) throw error;
  // Не удалось — не ошибка входа: пароль уже задан, сессия есть.
  await supabase.auth.signOut({ scope: "others" }).catch(() => {});
}
