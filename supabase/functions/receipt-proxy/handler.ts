// Прокси чеков (docs/receipts.md §8). Браузер не может загрузить чек с сайта ОФД (нет CORS),
// функция загружает его за клиента. Только Web API (Request/Response/fetch): тот же код
// работает в Deno (index.ts) и проверяется в Node без Supabase CLI.
//
// Это НЕ открытый прокси: клиент передаёт не URL, а { source, i, f, s, t } — адрес собирается
// здесь из белого списка. Ничего не парсит и не хранит: формат чека разбирает клиент
// (src/utils/receipts), при смене формата ОФД функцию передеплоивать не нужно.

type Params = { i: string; f: string; s: string; t: string };
type Env = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
type Deps = { env: Env; fetch: typeof fetch };

// Белый список источников — дублирует RECEIPT_LINK_HOSTS клиента сознательно: сервер не доверяет
// клиенту. Новый ОФД — строка здесь и адаптер на клиенте.
const SOURCES: Record<string, (p: Params) => string> = {
  kaspi: p => `https://receipt.kaspi.kz/web/fiscal?${new URLSearchParams({ i: p.i, f: p.f, s: p.s, t: p.t })}`,
  oofd: p => `https://consumer.oofd.kz/api/consumer-proxy/api/tickets/get-by-url?${new URLSearchParams({ f: p.f, i: p.i, s: p.s, t: p.t })}`,
};

// Форматы параметров QR: ФП и РНМ — цифры, сумма — число, дата — цифры и разделители
// (Kaspi «2026-07-14 13:07:50.871995», oofd «20261008T175844»).
const PARAM_RULES: Record<keyof Params, RegExp> = {
  i: /^\d{1,32}$/,
  f: /^\d{1,32}$/,
  s: /^\d{1,12}(\.\d{1,2})?$/,
  t: /^[0-9T:.\- ]{8,40}$/,
};

const TIMEOUT_MS = 15000;
const MAX_BYTES = 1024 * 1024;   // чек — десятки КБ; больше — не чек

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Только залогиненный пользователь приложения (ensureAuth), не анонимный ключ.
async function isSignedIn(req: Request, { env, fetch }: Deps): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth) || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  return !!user?.id;
}

function readParams(body: unknown): { source: string; params: Params } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const source = String(b.source || "");
  if (!SOURCES[source]) return null;
  const params = {} as Params;
  for (const key of Object.keys(PARAM_RULES) as (keyof Params)[]) {
    const value = String(b[key] ?? "").trim();
    if (!PARAM_RULES[key].test(value)) return null;
    params[key] = value;
  }
  return { source, params };
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!(await isSignedIn(req, deps))) return json(401, { error: "unauthorized" });

  const parsed = readParams(await req.json().catch(() => null));
  if (!parsed) return json(400, { error: "bad_request" });

  let upstream: Response;
  try {
    upstream = await deps.fetch(SOURCES[parsed.source](parsed.params), {
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (receipt-proxy)", Accept: "text/html,application/json" },
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return json(504, { error: timeout ? "timeout" : "network" });
  }

  // Несуществующий чек оба ОФД отдают 500, а не 404 — отличить «нет чека» от «сервис лежит»
  // нельзя, клиент показывает одно сообщение (§3.4).
  if (!upstream.ok) return json(502, { error: "upstream", status: upstream.status });
  if (Number(upstream.headers.get("Content-Length") || 0) > MAX_BYTES) return json(502, { error: "too_large" });
  const body = await upstream.text();
  if (body.length > MAX_BYTES) return json(502, { error: "too_large" });

  return json(200, { contentType: upstream.headers.get("Content-Type") || "", body });
}
