// Supabase Edge Function (Deno). Вся логика — handler.ts. Деплой: supabase functions deploy receipt-proxy
import { handleRequest } from "./handler.ts";
import { OOFD_INTERMEDIATE_CA } from "./oofd-ca.ts";

// oofd.kz не отдаёт промежуточный сертификат — отдельный клиент с ним (oofd-ca.ts).
const oofdClient = Deno.createHttpClient({ caCerts: [OOFD_INTERMEDIATE_CA] });
const OOFD_ORIGIN = "https://consumer.oofd.kz/";

Deno.serve(req => handleRequest(req, {
  env: { SUPABASE_URL: Deno.env.get("SUPABASE_URL"), SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") },
  fetch: (input, init) => fetch(input, String(input).startsWith(OOFD_ORIGIN) ? { ...init, client: oofdClient } : init),
}));
