// Код из письма — подтвердить почту и задать пароль (instruction.md §23). Обычный вход — по паролю
// (Supabase Auth напрямую, без этой функции и без писем). Supabase Auth писем не шлёт.
//   { action: "send", email, intent } → код в БД (только HMAC) + письмо по SMTP.
//        intent "signup" — код можно выдать и адресу без аккаунта (если регистрация открыта);
//        аккаунт уже есть — new_user: false в ответе (код задаст ему новый пароль).
//        intent "reset" — только существующему (забыли пароль / пароль ещё не задан).
//   { action: "verify", email, code, password } → проверка кода → пароль задан (новому пользователю —
//        вместе с созданием аккаунта) → одноразовый token_hash; клиент меняет его на сессию
//        supabase.auth.verifyOtp({ token_hash, type }). Пароль проверяется ДО кода: слабый пароль
//        не тратит ни код, ни попытку.
// Только Web API — тот же код работает в Deno (index.ts) и проверяется в Node без Supabase CLI.
// Лимиты и попытки — атомарно в БД (auth_otp_issue / auth_otp_check, tables.sql v37).
import { buildLetter, type Letter } from "../_shared/email.ts";

export type Config = {
  codeLength: number;      // цифр в коде
  codeTtlSec: number;      // сколько код действует
  minIntervalSec: number;  // пауза между письмами на один адрес
  maxPerHour: number;      // писем в час на один адрес
  maxAttempts: number;     // неверных вводов одного кода
  allowSignup: boolean;    // регистрация новых адресов открыта
  maxNewPerHour: number;   // новых адресов в час на всех (защита SMTP от рассылки по чужим адресам)
  passwordMinLength: number;  // не больше требований Supabase (Authentication → Providers → Email)
};

// bcrypt (Supabase Auth) учитывает только первые 72 байта — длиннее не принимаем, а не обрезаем молча.
export const PASSWORD_MAX_BYTES = 72;
export const INTENTS = ["signup", "reset"] as const;

export const DEFAULT_CONFIG: Config = {
  codeLength: 6, codeTtlSec: 10 * 60, minIntervalSec: 15, maxPerHour: 20, maxAttempts: 5,
  allowSignup: true, maxNewPerHour: 30, passwordMinLength: 8,
};

export type Deps = {
  config: Config;
  hmacKey: string;
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
  send: (letter: Letter) => Promise<void>;
  issueSession: (email: string) => Promise<{ token_hash: string; type: string }>;
  // Задать пароль: пользователя нет — создать (email подтверждён кодом), есть — сменить.
  // Supabase отверг пароль (его требования строже наших) — WeakPasswordError.
  setPassword: (email: string, password: string) => Promise<void>;
  randomCode?: (length: number) => string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { error, ...extra });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

// Равномерно случайные цифры: отбрасываем хвост диапазона Uint32, иначе младшие цифры чаще.
export function randomDigits(length: number): string {
  const limit = 4294967290;   // кратно 10, ≤ 2^32
  let out = "";
  const buf = new Uint32Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) out += String(buf[0] % 10);
  }
  return out;
}

// Хеш кода привязан к адресу: код одного адреса не подходит к другому. Ключ — серверный секрет.
export async function codeHash(key: string, email: string, code: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${email}:${code}`));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
}

export class WeakPasswordError extends Error {}

// null — пароль годится, иначе ответ с ошибкой (min_length — клиенту для текста).
function passwordProblem(raw: unknown, config: Config): Response | null {
  if (typeof raw !== "string" || raw.length < config.passwordMinLength) {
    return fail(400, "weak_password", { min_length: config.passwordMinLength });
  }
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX_BYTES) return fail(400, "password_too_long");
  return null;
}

type IssueResult = {
  status: "ok" | "user_not_found" | "too_soon" | "too_many" | "signup_busy";
  retry_after?: number;
  new_user?: boolean;
};
const LIMIT_STATUSES = new Set(["too_soon", "too_many", "signup_busy"]);

async function sendCode(email: string, intent: unknown, deps: Deps): Promise<Response> {
  const { config } = deps;
  if (!INTENTS.includes(intent as typeof INTENTS[number])) return fail(400, "bad_request");
  const signup = intent === "signup";
  if (signup && !config.allowSignup) return fail(403, "signup_closed");

  const code = (deps.randomCode ?? randomDigits)(config.codeLength);
  const res = await deps.rpc("auth_otp_issue", {
    p_email: email, p_code_hash: await codeHash(deps.hmacKey, email, code),
    p_ttl_sec: config.codeTtlSec, p_min_interval_sec: config.minIntervalSec, p_max_per_hour: config.maxPerHour,
    p_allow_new: signup, p_max_new_per_hour: config.maxNewPerHour,
  }) as IssueResult;

  if (res.status === "user_not_found") return fail(404, "user_not_found");
  if (LIMIT_STATUSES.has(res.status)) return fail(429, res.status, { retry_after: res.retry_after ?? config.minIntervalSec });
  if (res.status !== "ok") throw new Error(`auth_otp_issue: ${JSON.stringify(res)}`);
  const newUser = res.new_user === true;

  try {
    await deps.send(buildLetter(email, code, newUser ? "signup" : "recovery"));
  } catch (e) {
    console.error("auth-otp: SMTP", maskEmail(email), e instanceof Error ? e.message : e);
    return fail(502, "send_failed");
  }
  console.log(`auth-otp: код ${newUser ? "регистрации" : "смены пароля"} отправлен`, maskEmail(email));
  // Клиент берёт длину кода и паузу отсюда — настройки в одном месте (сервер), без расхождений.
  return json(200, {
    code_length: config.codeLength, resend_after: config.minIntervalSec, expires_in: config.codeTtlSec, new_user: newUser,
  });
}

async function verifyCode(email: string, rawCode: unknown, password: unknown, deps: Deps): Promise<Response> {
  const weak = passwordProblem(password, deps.config);
  if (weak) return weak;
  const code = String(rawCode ?? "");
  if (!/^\d{4,10}$/.test(code)) return fail(400, "invalid_code");
  const status = await deps.rpc("auth_otp_check", {
    p_email: email, p_code_hash: await codeHash(deps.hmacKey, email, code), p_max_attempts: deps.config.maxAttempts,
  });
  if (status === "invalid") return fail(400, "invalid_code");
  if (status !== "ok" && status !== "new_user") return fail(400, "code_expired");
  // Регистрацию закрыли, пока код был в пути, — аккаунт не создаём.
  if (status === "new_user" && !deps.config.allowSignup) return fail(403, "signup_closed");

  try {
    await deps.setPassword(email, password as string);
  } catch (e) {
    if (e instanceof WeakPasswordError) return fail(400, "weak_password", { min_length: deps.config.passwordMinLength });
    throw e;
  }
  console.log(`auth-otp: ${status === "new_user" ? "зарегистрирован" : "пароль задан"}`, maskEmail(email));
  return json(200, await deps.issueSession(email));
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const email = normEmail(body?.email);
  if (!body || email.length > 254 || !EMAIL_RE.test(email)) return fail(400, "invalid_email");

  try {
    if (body.action === "send") return await sendCode(email, body.intent, deps);
    if (body.action === "verify") return await verifyCode(email, body.code, body.password, deps);
    return fail(400, "bad_request");
  } catch (e) {
    console.error("auth-otp:", e instanceof Error ? e.message : e);
    return fail(500, "server_error");
  }
}
