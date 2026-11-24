// Apple Pay → «Входящие»: обращения к БД (v41, docs/apple-pay-inbox.md §4). Логики здесь нет —
// чистые функции в utils/walletInbox.js, состояние — hooks/useWalletInbox.js.
import { supabase, supaRpc } from "./supabase";

// token_hash клиенту не выдан (права на колонки) — select("*") упал бы.
const TOKEN_COLUMNS = "id, name, prefix, scope, created_at, last_used_at, revoked_at";
// Таблицы нет — миграция v41 не применена (PostgREST: PGRST205; Postgres: 42P01).
const NO_TABLE = new Set(["PGRST205", "42P01"]);

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export async function fetchWalletState() {
  const [inbox, cards, merchants, tokens] = await Promise.all([
    supabase.from("wallet_inbox").select("*").eq("status", "pending").order("occurred_at", { ascending: false }),
    supabase.from("wallet_cards").select("*"),
    supabase.from("wallet_merchants").select("*").order("uses", { ascending: false }),
    supabase.from("api_tokens").select(TOKEN_COLUMNS).is("revoked_at", null).order("created_at", { ascending: true }),
  ]);
  if (NO_TABLE.has(inbox.error?.code)) return { available: false, items: [], cards: [], merchants: [], tokens: [] };
  return { available: true, items: unwrap(inbox), cards: unwrap(cards), merchants: unwrap(merchants), tokens: unwrap(tokens) };
}

export const fetchTokens = async () =>
  unwrap(await supabase.from("api_tokens").select(TOKEN_COLUMNS).is("revoked_at", null));

// → { id, token, prefix, name } — ключ виден ОДИН раз.
export const issueToken = name => supaRpc("issue_api_token", { p_name: name });
export const revokeToken = id => supaRpc("revoke_api_token", { p_id: id });

export const dismissInbox = ids => supaRpc("dismiss_inbox", { p: { ids } });
export const linkInboxTx = (inboxId, transactionId) =>
  supaRpc("link_inbox_tx", { p: { inbox_id: inboxId, transaction_id: transactionId } });

export const updateCard = async (id, accountId) =>
  unwrap(await supabase.from("wallet_cards").update({ account_id: accountId, updated_at: new Date().toISOString() }).eq("id", id));
export const deleteCard = async id => unwrap(await supabase.from("wallet_cards").delete().eq("id", id));
export const deleteMerchant = async id => unwrap(await supabase.from("wallet_merchants").delete().eq("id", id));
