// Письма с кодом (Send Email Hook, handler.ts). Чистые функции: тема, текст и HTML.
// HTML — таблицы и инлайн-стили: почтовые клиенты (Gmail, Mail iOS, Outlook) не поддерживают
// внешний CSS и flex. Пользовательских строк в разметке нет — только код (цифры) и константы.

export const APP_NAME = "CashFlow";

export type Letter = { to: string; subject: string; text: string; html: string };

// Тип письма из Supabase → заголовок. Неизвестный тип — общий текст (новый тип Supabase не ломает отправку).
const TITLES: Record<string, string> = {
  magiclink: "Код для входа",
  signup: "Код для входа",
  invite: "Код для входа",
  recovery: "Код для восстановления доступа",
  email_change: "Код для смены email",
  reauthentication: "Код подтверждения",
};
const titleOf = (type: string) => TITLES[type] ?? "Код подтверждения";

const COLORS = { bg: "#0a1a0a", card: "#141e14", green: "#4caf50", text: "#ffffff", mid: "#a3ada3", dim: "#6f7a6f" };

export function buildLetter(to: string, code: string, type: string): Letter {
  const title = titleOf(type);
  // Код — в теме: виден в уведомлении, вводить можно не открывая письмо.
  const subject = `${code} — ${title.toLowerCase()} в ${APP_NAME}`;
  const text = [
    `${title} в ${APP_NAME}: ${code}`,
    "",
    "Введите его в приложении. Код одноразовый.",
    "Если вы не запрашивали код — просто проигнорируйте это письмо.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
    <tr><td align="center" style="padding-bottom:20px;font:800 24px -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${COLORS.text};">
      ${APP_NAME}
    </td></tr>
    <tr><td style="background:${COLORS.card};border-radius:20px;padding:28px 24px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
      <div style="font-size:20px;font-weight:700;color:${COLORS.text};margin:0 0 8px;">${title}</div>
      <div style="font-size:15px;line-height:1.5;color:${COLORS.mid};margin:0 0 22px;">Введите этот код в приложении:</div>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:${COLORS.green};text-align:center;
        background:rgba(76,175,80,0.10);border:1px solid rgba(76,175,80,0.35);border-radius:14px;padding:16px 8px;">${code}</div>
      <div style="font-size:13px;line-height:1.5;color:${COLORS.dim};margin:22px 0 0;">
        Код одноразовый. Если вы не запрашивали его — просто проигнорируйте письмо, без кода войти нельзя.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  return { to, subject, text, html };
}
