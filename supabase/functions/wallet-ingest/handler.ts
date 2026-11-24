// Приём покупки из команды iOS «Транзакция» → черновик во «Входящих» (docs/apple-pay-inbox.md §5).
// Только Web API: проверяется в Node/Vitest без Supabase CLI, зависимости внедряются (Deps).
// Функция ничего не считает и не трогает балансы — один вызов RPC wallet_ingest (БД проверяет ключ,
// лимит, пишет строку). Отвечает быстро: автоматизация iOS отваливается по тайм-ауту.
//
// POST, Authorization: Bearer cf_<64 hex>, тело — JSON:
//   { v: 1, amount, merchant, card, name, occurred_at, tz }  — покупка;
//   { v: 1, test: true }                                      — проверка связи (команду запустили руками).
// Ответ 200: { id?, message, notify } — notify: команде показать уведомление (только при проблеме
// или проверке связи). 400 bad_request, 401 invalid_token, 405, 429 too_many + retry_after, 500 internal.
import {
  cleanText, formatMoney, merchantKey, parseAmount, parseOccurredAt,
} from "../_shared/walletParse.ts";

export type Config = {
  maxPerHour: number;     // покупок в час на один ключ
  maxBodyBytes: number;   // размер тела запроса. ≤ половины CHECK wallet_inbox.raw (4096): тело пишется
                          // в raw как jsonb, а его текст длиннее исходного («": "», «, »)
  retentionDays: number;  // сколько хранить разобранные покупки
};

export const DEFAULT_CONFIG: Config = { maxPerHour: 60, maxBodyBytes: 2048, retentionDays: 90 };

// Версии формата команды: новая команда → новая версия, старые установленные продолжают работать.
export const FORMAT_VERSIONS = [1];
export const MERCHANT_MAX = 200;
export const CARD_MAX = 100;
const TOKEN_RE = /^cf_[0-9a-f]{64}$/;

export type Deps = {
  config: Config;
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
  now?: () => Date;
  log?: (msg: string) => void;
};

type IngestResult = {
  status: "ok" | "invalid_token" | "too_many";
  test?: boolean;
  id?: string;
  retry_after?: number;
  account_id?: string | null;
  account_currency?: string | null;
  account_name?: string | null;
  category_id?: string | null;
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  json(status, { error, ...extra }, headers);

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Текст для команды. Уведомление — только когда пользователю есть что сделать (решение 24.11.2026):
// сумма не пришла или карта ещё не привязана к счёту. Иначе молча.
export function buildMessage(p: { amount: number | null; currency: string | null; merchant: string; card: string },
                             r: IngestResult): { message: string; notify: boolean } {
  const currency = p.currency ?? r.account_currency ?? null;
  const what = [p.amount !== null ? formatMoney(p.amount, currency) : null, p.merchant || null].filter(Boolean).join(" · ");
  const problems: string[] = [];
  if (p.amount === null) problems.push("сумма не пришла — введите её в CashFlow");
  if (!r.account_id) problems.push(p.card ? `карта «${p.card}» ещё не привязана к счёту` : "карта не определилась");
  if (!problems.length) return { message: `${what} → во «Входящих» CashFlow`, notify: false };
  return { message: `${what || "Покупка"} во «Входящих» CashFlow: ${problems.join("; ")}`, notify: true };
}

async function readBody(req: Request, maxBytes: number): Promise<Record<string, unknown> | null | "too_large"> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return "too_large";
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) return "too_large";
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  const { config, rpc } = deps;
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? (() => {});
  if (req.method !== "POST") return fail(405, "method_not_allowed", {}, { Allow: "POST" });

  // Ключ проверяем до тела: чужие запросы не разбираем. Причину 401 не уточняем.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!TOKEN_RE.test(token)) return fail(401, "invalid_token");
  const prefix = token.slice(0, 9);

  const body = await readBody(req, config.maxBodyBytes);
  if (body === "too_large") return fail(400, "bad_request", { reason: "too_large" });
  if (!body) return fail(400, "bad_request", { reason: "not_json" });
  const v = body.v ?? 1;
  if (!FORMAT_VERSIONS.includes(v as number)) return fail(400, "bad_request", { reason: "version" });

  const test = body.test === true;
  const { amount, currency } = parseAmount(body.amount);
  const merchant = cleanText(body.merchant, MERCHANT_MAX);
  const card = cleanText(body.card, CARD_MAX);

  let r: IngestResult;
  try {
    r = await rpc("wallet_ingest", {
      p: {
        token_hash: await sha256Hex(token),
        max_per_hour: config.maxPerHour,
        retention_days: config.retentionDays,
        test,
        amount,
        currency,
        merchant,
        merchant_key: merchantKey(merchant, MERCHANT_MAX),
        card_label: card,
        occurred_at: parseOccurredAt(body.occurred_at, now),
        raw: body,
      },
    }) as IngestResult;
  } catch (e) {
    log(`wallet-ingest ${prefix}: ${e instanceof Error ? e.message : String(e)}`);
    return fail(500, "internal");
  }

  if (r.status === "invalid_token") return fail(401, "invalid_token");
  if (r.status === "too_many") {
    const retry = Math.max(1, Math.ceil(Number(r.retry_after) || 60));
    return fail(429, "too_many", { retry_after: retry }, { "Retry-After": String(retry) });
  }
  if (test) return json(200, { message: "Связь с CashFlow есть ✅", notify: true });
  return json(200, { id: r.id, ...buildMessage({ amount, currency, merchant, card }, r) });
}
