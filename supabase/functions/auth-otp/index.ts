// Supabase Edge Function (Deno) — свой код входа. Логика — handler.ts.
// Деплой: supabase functions deploy auth-otp --no-verify-jwt
//   (вызывается до входа — JWT пользователя ещё нет; защита — лимиты и попытки в БД).
// Секреты: SMTP_* (_shared/smtp.ts). SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase задаёт сам.
// Необязательные: OTP_CODE_LENGTH, OTP_TTL_SEC, OTP_MIN_INTERVAL_SEC, OTP_MAX_PER_HOUR, OTP_MAX_ATTEMPTS.
import { handleRequest, DEFAULT_CONFIG, type Config } from "./handler.ts";
import { createMailer } from "../_shared/smtp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const num = (key: string, fallback: number) => {
  const v = Number(Deno.env.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const config: Config = {
  codeLength: num("OTP_CODE_LENGTH", DEFAULT_CONFIG.codeLength),
  codeTtlSec: num("OTP_TTL_SEC", DEFAULT_CONFIG.codeTtlSec),
  minIntervalSec: num("OTP_MIN_INTERVAL_SEC", DEFAULT_CONFIG.minIntervalSec),
  maxPerHour: num("OTP_MAX_PER_HOUR", DEFAULT_CONFIG.maxPerHour),
  maxAttempts: num("OTP_MAX_ATTEMPTS", DEFAULT_CONFIG.maxAttempts),
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

const send = createMailer();
// Ключ хеша кодов — серверный секрет (в браузер не попадает).
const hmacKey = Deno.env.get("AUTH_OTP_SECRET") || SERVICE_KEY;

Deno.serve(req => handleRequest(req, { config, hmacKey, rpc, send, issueSession }));
