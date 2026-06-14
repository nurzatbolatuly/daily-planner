import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPA_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
export const supabase = createClient(SUPA_URL, SUPA_KEY);

export const supa = {
  select: async (table, filters = "") => {
    let q = supabase.from(table).select("*");
    if (filters) {
      for (const part of filters.split("&")) {
        const m = part.match(/^order=(\w+)\.(asc|desc)(?:\.(nullslast|nullsfirst))?$/);
        if (m) {
          const opts = { ascending: m[2] === "asc" };
          if (m[3]) opts.nullsFirst = m[3] === "nullsfirst";
          q = q.order(m[1], opts);
        }
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  update: async (table, data, filter) => {
    const m = filter.match(/^(\w+)=eq\.(.+)$/);
    const { error } = await supabase.from(table).update(data).eq(m[1], m[2]);
    if (error) throw error;
  },
  delete: async (table, filter) => {
    const m = filter.match(/^(\w+)=eq\.(.+)$/);
    const { error } = await supabase.from(table).delete().eq(m[1], m[2]);
    if (error) throw error;
  },
};

export async function supaUpsert(table, data) {
  const payload = Array.isArray(data) ? data : [data];
  const { error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: "id" })
    .select();
  if (error) throw error;
}

// Вызов Postgres-функции (RPC). Используется для атомарных операций,
// где нужно записать несколько строк (транзакция + баланс) одной транзакцией БД.
export async function supaRpc(fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data;
}
