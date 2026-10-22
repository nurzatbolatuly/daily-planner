import { supaRpc } from "../lib/supabase";

// Порядок счетов хранится в БД (accounts.sort_order, v39): useMoneyData грузит их уже
// отсортированными, страницы берут `accounts` как есть. До v39 порядок жил в localStorage —
// этот ключ читается только для разового переноса.
const LEGACY_KEY = "accountOrder";

// Нумерация по позиции в списке — то же, что reorder_accounts пишет в БД (с 1).
export const withSortOrder = list => list.map((a, i) => ({ ...a, sort_order: i + 1 }));

// Перестановка: оптимистичный список + сохранение. Ошибку бросает — откат на вызывающем.
export const saveAccountOrder = list => supaRpc("reorder_accounts", { p_ids: list.map(a => a.id) });

// Счета в порядке ids; кого нет в ids (созданы позже) — в конце, в прежнем порядке.
export function sortByIds(accounts, ids) {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...accounts].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity));
}

// Разовый перенос порядка из localStorage в БД. Ключ удаляется только после успешной записи —
// при ошибке (нет сети) перенос повторится при следующей загрузке, а пока порядок применяется
// локально. Нет ключа или он битый → счета как пришли из БД.
export async function migrateLegacyOrder(accounts) {
  let ids;
  try { ids = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch { ids = null; }
  if (!Array.isArray(ids)) return accounts;
  const ordered = withSortOrder(sortByIds(accounts, ids));
  try {
    if (ordered.length) await saveAccountOrder(ordered);
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.error("Перенос порядка счетов:", e);
  }
  return ordered;
}
