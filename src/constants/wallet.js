// Apple Pay → «Входящие» (docs/apple-pay-inbox.md). Настройки фронта в одном месте.

// Адрес функции приёма — из того же URL проекта, что и клиент Supabase (не хардкод).
export const WALLET_INGEST_URL = `${import.meta.env.REACT_APP_SUPABASE_URL}/functions/v1/wallet-ingest`;
// iCloud-ссылка на готовую команду (этап 3). Пусто — экран показывает рецепт сборки.
export const WALLET_SHORTCUT_URL = import.meta.env.REACT_APP_WALLET_SHORTCUT_URL || "";

// Пределы — как в БД (v41): issue_api_token, CHECK api_tokens.name.
export const TOKEN_NAME_MAX = 40;
export const TOKEN_LIMIT = 10;
export const TOKEN_DEFAULT_NAME = "iPhone";

// «Проверить связь»: опрос last_used_at, пока экран открыт.
export const SIGNAL_POLL_MS = 5000;
export const SIGNAL_TIMEOUT_MS = 2 * 60 * 1000;

// Дубли (§7): та же покупка, отправленная командой дважды, — в пределах окна;
// уже введённый вручную расход — дата ±MATCH_DAYS.
export const REPEAT_WINDOW_MS = 2 * 60 * 1000;
export const MATCH_DAYS = 1;

// Шаги настройки (экран «Apple Pay»). Названия — как в русском интерфейсе «Команд».
export const SHORTCUT_STEPS = [
  "Откройте «Команды» → ＋ → назовите «CashFlow: покупка».",
  "«Текст» — вставьте ключ из шага 1.",
  "«Если» Вход команды имеет любое значение → «Словарь»: v = 1, amount = Сумма, merchant = Продавец, card = Карта, name = Имя, occurred_at = Текущая дата (ISO 8601). Иначе → «Словарь»: v = 1, test = да.",
  "«Получить содержимое URL»: адрес ниже, метод POST, заголовок Authorization = «Bearer » + Текст, тело — «Файл» = результат «Если».",
  "«Получить значение» notify; если да — «Показать уведомление» с message.",
];

export const AUTOMATION_STEPS = [
  "«Команды» → «Автоматизация» → ＋ → «Транзакция».",
  "Выберите все карты, «Запускать сразу», уведомление о запуске — выключить.",
  "Команда — «CashFlow: покупка».",
];
