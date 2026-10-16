// Supabase Edge Function (Deno) — Send Email Hook. Логика — handler.ts, письмо — email.ts.
// Деплой: supabase functions deploy send-email --no-verify-jwt
//   (Supabase Auth вызывает хук без JWT пользователя; защита — подпись хука, handler.ts).
// Секреты (supabase secrets set …): SMTP_USER, SMTP_PASSWORD, SEND_EMAIL_HOOK_SECRET;
// необязательные: SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), SMTP_FROM_NAME (CashFlow).
// Порт 465 (TLS сразу): 25 и 587 из Edge Functions закрыты.
import nodemailer from "npm:nodemailer@6.9.16";
import { handleRequest } from "./handler.ts";
import { APP_NAME } from "./email.ts";

const env = (key: string, fallback = "") => Deno.env.get(key) || fallback;
const user = env("SMTP_USER");
const port = Number(env("SMTP_PORT", "465"));

const transport = nodemailer.createTransport({
  host: env("SMTP_HOST", "smtp.gmail.com"),
  port,
  secure: port === 465,
  auth: { user, pass: env("SMTP_PASSWORD") },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Gmail подставляет в From только свой адрес (или подтверждённый псевдоним) — отправитель = SMTP_USER.
const from = { name: env("SMTP_FROM_NAME", APP_NAME), address: user };

Deno.serve(req => handleRequest(req, {
  secret: Deno.env.get("SEND_EMAIL_HOOK_SECRET"),
  send: async letter => { await transport.sendMail({ from, ...letter }); },
}));
