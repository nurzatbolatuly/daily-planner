// Supabase Edge Function (Deno) — свой код входа. Логика — handler.ts.
// Деплой: supabase functions deploy auth-otp --no-verify-jwt
//   (вызывается до входа — JWT пользователя ещё нет; защита — лимиты и попытки в БД).
// Секреты: SMTP_* (_shared/smtp.ts). SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase задаёт сам.
// Необязательные: OTP_CODE_LENGTH, OTP_TTL_SEC, OTP_MIN_INTERVAL_SEC, OTP_MAX_PER_HOUR, OTP_MAX_ATTEMPTS,
//   OTP_ALLOW_SIGNUP ("false" — закрыть регистрацию), OTP_MAX_NEW_PER_HOUR, PASSWORD_MIN_LENGTH.
import { handleRequest, DEFAULT_CONFIG, WeakPasswordError, type Config } from "./handler.ts";
import { createMailer } from "../_shared/smtp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const num = (key: string, fallback: number) => {
  const v = Number(Deno.env.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const bool = (key: string, fallback: boolean) => {
  const v = Deno.env.get(key)?.trim().toLowerCase();
  return v === "true" ? true : v === "false" ? false : fallback;
};
const config: Config = {
  codeLength: num("OTP_CODE_LENGTH", DEFAULT_CONFIG.codeLength),
  codeTtlSec: num("OTP_TTL_SEC", DEFAULT_CONFIG.codeTtlSec),
  minIntervalSec: num("OTP_MIN_INTERVAL_SEC", DEFAULT_CONFIG.minIntervalSec),
  maxPerHour: num("OTP_MAX_PER_HOUR", DEFAULT_CONFIG.maxPerHour),
  maxAttempts: num("OTP_MAX_ATTEMPTS", DEFAULT_CONFIG.maxAttempts),
  allowSignup: bool("OTP_ALLOW_SIGNUP", DEFAULT_CONFIG.allowSignup),
  maxNewPerHour: num("OTP_MAX_NEW_PER_HOUR", DEFAULT_CONFIG.maxNewPerHour),
  passwordMinLength: num("PASSWORD_MIN_LENGTH", DEFAULT_CONFIG.passwordMinLength),
};

async function rpc(fn: string, params: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: admin, body: JSON.stringify(params) });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Ссылка входа через admin API — письмо при этом НЕ отправляется. Наружу — только token_hash
// (одноразовый, короткоживущий), сама ссылка клиенту не нужна.
async function issueSession(email: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) throw new Error(`generate_link: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const token_hash = data.hashed_token ?? data.properties?.hashed_token;
  if (!token_hash) throw new Error("generate_link: нет hashed_token");
  return { token_hash, type: data.verification_type ?? data.properties?.verification_type ?? "magiclink" };
}

// Пароль — только после верного кода (auth_otp_check → 'ok' | 'new_user'). Нет пользователя — создаём
// (email подтверждён этим кодом), есть — меняем пароль. Admin API не зависит от «Allow new users to
// sign up» — его держим выключенным: публичный /auth/v1/signup закрыт, единственный путь — этот.
const userId = (email: string) => rpc("auth_user_id", { p_email: email }) as Promise<string | null>;

async function adminUser(method: "POST" | "PUT", path: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users${path}`, { method, headers: admin, body: JSON.stringify(body) });
  const data = res.ok ? null : await res.json().catch(() => null);
  return { res, code: data?.error_code ?? "", msg: data?.msg ?? data?.message ?? "" };
}

async function setPassword(email: string, password: string) {
  let id = await userId(email);
  if (!id) {
    const r = await adminUser("POST", "", { email, password, email_confirm: true });
    if (r.res.ok) return;
    if (r.code === "weak_password") throw new WeakPasswordError(r.msg);
    // Второе устройство успело создать раньше — меняем пароль ему.
    // error_code — нынешний GoTrue; msg — более старые версии.
    if (r.res.status !== 422 || !(r.code === "email_exists" || /already been registered/i.test(r.msg))) {
      throw new Error(`create user: ${r.res.status} ${r.code} ${r.msg}`);
    }
    id = await userId(email);
    if (!id) throw new Error("create user: email_exists, но пользователь не найден");
  }
  const r = await adminUser("PUT", `/${id}`, { password });
  if (r.res.ok) return;
  if (r.code === "weak_password") throw new WeakPasswordError(r.msg);
  throw new Error(`update password: ${r.res.status} ${r.code} ${r.msg}`);
}

const send = createMailer();
// Ключ хеша кодов — серверный секрет (в браузер не попадает).
const hmacKey = Deno.env.get("AUTH_OTP_SECRET") || SERVICE_KEY;

Deno.serve(req => handleRequest(req, { config, hmacKey, rpc, send, issueSession, setPassword }));
