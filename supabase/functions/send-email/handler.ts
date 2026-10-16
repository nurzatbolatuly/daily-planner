// Send Email Hook (instruction.md §23): Supabase Auth не шлёт письма сам, а вызывает эту функцию
// с email и кодом — письмо уходит по SMTP с нашей почты (index.ts). Только Web API — тот же код
// работает в Deno и проверяется в Node без Supabase CLI.
//
// Вызывать может только Supabase: запрос подписан по Standard Webhooks (секрет хука). Без верной
// подписи — 401, письма нет: иначе через функцию можно было бы слать письма с нашего адреса.
import { buildLetter, type Letter } from "./email.ts";

type Deps = { secret?: string; send: (letter: Letter) => Promise<void>; now?: () => number };

const TOLERANCE_SEC = 5 * 60;   // подпись старше — повтор перехваченного запроса
const CODE_RE = /^\d{4,10}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// Формат ошибки, который Supabase Auth показывает клиенту.
const hookError = (status: number, message: string) => json(status, { error: { http_code: status, message } });

// В логах — без адреса целиком: n***@gmail.com.
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

const b64decode = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64encode = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

// Сравнение без раннего выхода — время не выдаёт, сколько символов подписи совпало.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Standard Webhooks: HMAC-SHA256(`${id}.${timestamp}.${body}`), ключ — base64 после «whsec_»
// (в дашборде секрет выглядит как «v1,whsec_…»). Заголовок подписи — «v1,<b64> v1,<b64>…».
export async function verifySignature(headers: Headers, body: string, secret: string, nowSec: number): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader || !/^\d+$/.test(ts)) return false;
  if (Math.abs(nowSec - Number(ts)) > TOLERANCE_SEC) return false;

  const keyB64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  let keyBytes: Uint8Array;
  try { keyBytes = b64decode(keyB64); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64encode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));

  return sigHeader.split(" ").some(part => {
    const [version, sig] = part.split(",");
    return version === "v1" && !!sig && safeEqual(sig, expected);
  });
}

type HookPayload = {
  user?: { email?: string; new_email?: string };
  email_data?: { token?: string; token_new?: string; email_action_type?: string };
};

// Какие письма отправить. Смена email — код на старый адрес и (если есть) отдельный на новый.
export function lettersFor(payload: HookPayload): Letter[] {
  const email = payload.user?.email;
  const data = payload.email_data;
  const type = data?.email_action_type || "";
  const out: Letter[] = [];
  if (email && data?.token && CODE_RE.test(data.token)) out.push(buildLetter(email, data.token, type));
  const newEmail = payload.user?.new_email;
  if (type === "email_change" && newEmail && data?.token_new && CODE_RE.test(data.token_new)) {
    out.push(buildLetter(newEmail, data.token_new, type));
  }
  return out;
}

export async function handleRequest(req: Request, { secret, send, now = Date.now }: Deps): Promise<Response> {
  if (req.method !== "POST") return hookError(405, "method_not_allowed");
  if (!secret) {
    console.error("send-email: нет SEND_EMAIL_HOOK_SECRET");
    return hookError(500, "Почта не настроена");
  }

  const body = await req.text();
  const nowSec = Math.floor(now() / 1000);
  if (!(await verifySignature(req.headers, body, secret, nowSec))) {
    // Что пришло — без самих значений подписи: по этому видно, чужой ли запрос или не тот секрет.
    const ts = Number(req.headers.get("webhook-timestamp"));
    console.warn("send-email: подпись не прошла", JSON.stringify({
      id: !!req.headers.get("webhook-id"), signature: !!req.headers.get("webhook-signature"),
      skewSec: Number.isFinite(ts) ? nowSec - ts : null,
    }));
    return hookError(401, "unauthorized");
  }

  let payload: HookPayload;
  try { payload = JSON.parse(body); } catch { return hookError(400, "bad_request"); }
  const letters = lettersFor(payload);
  if (!letters.length) {
    console.warn("send-email: нечего отправлять", JSON.stringify({ type: payload.email_data?.email_action_type,
      hasEmail: !!payload.user?.email, hasToken: !!payload.email_data?.token }));
    return hookError(400, "bad_request");
  }

  try {
    for (const letter of letters) await send(letter);
  } catch (e) {
    console.error("send-email: SMTP", e instanceof Error ? e.message : e);
    return hookError(502, "Не удалось отправить письмо — попробуйте ещё раз");
  }
  console.log("send-email: отправлено", letters.map(l => maskEmail(l.to)).join(", "), payload.email_data?.email_action_type);
  return json(200, {});
}
