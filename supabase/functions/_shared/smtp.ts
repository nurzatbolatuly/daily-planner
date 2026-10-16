// Отправка писем по SMTP (Deno, Edge Functions). Порт 465 (TLS сразу): 25 и 587 из Edge Functions закрыты.
// Секреты (supabase secrets set …): SMTP_USER, SMTP_PASSWORD (пароль приложения Google, 16 символов);
// необязательные: SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), SMTP_FROM_NAME (CashFlow).
import nodemailer from "npm:nodemailer@6.9.16";
import { APP_NAME, type Letter } from "./email.ts";

const env = (key: string, fallback = "") => Deno.env.get(key) || fallback;

export function createMailer(): (letter: Letter) => Promise<void> {
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
  return async letter => {
    const info = await transport.sendMail({ from, ...letter });
    console.log("smtp:", info.response);   // «250 2.0.0 OK …» — письмо принято сервером
  };
}
