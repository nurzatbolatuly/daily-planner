// Свой код входа (instruction.md §23): Supabase Auth писем не шлёт и их лимит не считает.
//   { action: "send", email }        → код в БД (только HMAC) + письмо по SMTP
//   { action: "verify", email, code } → проверка → одноразовый token_hash; клиент меняет его на сессию
//                                       supabase.auth.verifyOtp({ token_hash, type })
// Только Web API — тот же код работает в Deno (index.ts) и проверяется в Node без Supabase CLI.
// Лимиты и попытки — атомарно в БД (auth_otp_issue / auth_otp_check, tables.sql v37).
import { buildLetter, type Letter } from "../_shared/email.ts";

export type Config = {
  codeLength: number;      // цифр в коде
  codeTtlSec: number;      // сколько код действует
  minIntervalSec: number;  // пауза между письмами на один адрес
  maxPerHour: number;      // писем в час на один адрес
  maxAttempts: number;     // неверных вводов одного кода
};

export const DEFAULT_CONFIG: Config = { codeLength: 6, codeTtlSec: 10 * 60, minIntervalSec: 15, maxPerHour: 20, maxAttempts: 5 };

export type Deps = {
  config: Config;
  hmacKey: string;
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
  send: (letter: Letter) => Promise<void>;
  issueSession: (email: string) => Promise<{ token_hash: string; type: string }>;
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

type IssueResult = { status: "ok" | "user_not_found" | "too_soon" | "too_many"; retry_after?: number };

async function sendCode(email: string, deps: Deps): Promise<Response> {
  const { config } = deps;
  const code = (deps.randomCode ?? randomDigits)(config.codeLength);
  const res = await deps.rpc("auth_otp_issue", {
    p_email: email, p_code_hash: await codeHash(deps.hmacKey, email, code),
    p_ttl_sec: config.codeTtlSec, p_min_interval_sec: config.minIntervalSec, p_max_per_hour: config.maxPerHour,
  }) as IssueResult;

  if (res.status === "user_not_found") return fail(404, "user_not_found");
  if (res.status === "too_soon" || res.status === "too_many") return fail(429, res.status, { retry_after: res.retry_after ?? config.minIntervalSec });
  if (res.status !== "ok") throw new Error(`auth_otp_issue: ${JSON.stringify(res)}`);

  try {
    await deps.send(buildLetter(email, code, "magiclink"));
  } catch (e) {
    console.error("auth-otp: SMTP", maskEmail(email), e instanceof Error ? e.message : e);
    return fail(502, "send_failed");
  }
  console.log("auth-otp: код отправлен", maskEmail(email));
  // Клиент берёт длину кода и паузу отсюда — настройки в одном месте (сервер), без расхождений.
  return json(200, { code_length: config.codeLength, resend_after: config.minIntervalSec, expires_in: config.codeTtlSec });
}

async function verifyCode(email: string, rawCode: unknown, deps: Deps): Promise<Response> {
  const code = String(rawCode ?? "");
  if (!/^\d{4,10}$/.test(code)) return fail(400, "invalid_code");
  const status = await deps.rpc("auth_otp_check", {
    p_email: email, p_code_hash: await codeHash(deps.hmacKey, email, code), p_max_attempts: deps.config.maxAttempts,
  });
  if (status === "invalid") return fail(400, "invalid_code");
  if (status !== "ok") return fail(400, "code_expired");
  return json(200, await deps.issueSession(email));
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const email = normEmail(body?.email);
  if (!body || email.length > 254 || !EMAIL_RE.test(email)) return fail(400, "invalid_email");

  try {
    if (body.action === "send") return await sendCode(email, deps);
    if (body.action === "verify") return await verifyCode(email, body.code, deps);
    return fail(400, "bad_request");
  } catch (e) {
    console.error("auth-otp:", e instanceof Error ? e.message : e);
    return fail(500, "server_error");
  }
}
