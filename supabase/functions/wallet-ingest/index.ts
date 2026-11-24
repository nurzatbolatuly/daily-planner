// Supabase Edge Function (Deno) — покупки из команды iOS во «Входящие». Логика — handler.ts.
// Деплой: make fn-deploy name=wallet-ingest (--no-verify-jwt: у команды свой ключ, JWT нет).
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase задаёт сам. Необязательные секреты:
//   WALLET_MAX_PER_HOUR, WALLET_MAX_BODY_BYTES, WALLET_RETENTION_DAYS — без деплоя фронта.
import { handleRequest, DEFAULT_CONFIG, type Config } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const num = (key: string, fallback: number) => {
  const v = Number(Deno.env.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const config: Config = {
  maxPerHour: num("WALLET_MAX_PER_HOUR", DEFAULT_CONFIG.maxPerHour),
  maxBodyBytes: num("WALLET_MAX_BODY_BYTES", DEFAULT_CONFIG.maxBodyBytes),
  retentionDays: num("WALLET_RETENTION_DAYS", DEFAULT_CONFIG.retentionDays),
};

async function rpc(fn: string, params: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: admin, body: JSON.stringify(params) });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

Deno.serve(req => handleRequest(req, { config, rpc, log: msg => console.error(msg) }));
