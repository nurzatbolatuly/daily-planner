import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Свой код входа (Edge Function auth-otp, instruction.md §23): Supabase Auth писем не шлёт.
// Ошибки — AuthOtpError с code из ответа функции (тексты — features/auth/authErrors.js).

const FUNCTION = "auth-otp";

export class AuthOtpError extends Error {
  constructor(code, retryAfter = null) {
    super(code);
    this.code = code;
    this.retryAfter = retryAfter;   // сек — для too_soon / too_many
  }
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = await error.context?.json?.().catch(() => null);
    throw new AuthOtpError(res?.error || "server_error", res?.retry_after ?? null);
  }
  throw new AuthOtpError("network");
}

// → { code_length, resend_after, expires_in } — длину кода и паузу задаёт сервер.
export const requestCode = email => call({ action: "send", email });

// Код верный → функция отдаёт одноразовый token_hash, он меняется на обычную сессию Supabase
// (дальше — onAuthStateChange в AuthProvider).
export async function verifyCode(email, code) {
  const { token_hash, type } = await call({ action: "verify", email, code });
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) throw error;
}
