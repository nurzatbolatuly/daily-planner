// Apple Pay → «Входящие» (docs/apple-pay-inbox.md). Настройки фронта в одном месте.

// Адрес функции приёма — из того же URL проекта, что и клиент Supabase (не хардкод).
export const WALLET_INGEST_URL = `${import.meta.env.REACT_APP_SUPABASE_URL}/functions/v1/wallet-ingest`;
// Готовая команда: собирается `make shortcut` в public/ (подписанный файл, ключа в нём нет).
// REACT_APP_WALLET_SHORTCUT_URL — переопределить (например, iCloud-ссылкой).
export const WALLET_SHORTCUT_URL = import.meta.env.REACT_APP_WALLET_SHORTCUT_URL || "/cashflow-purchase.shortcut";

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

// Установка готовой команды (экран «Apple Pay», шаг 2).
export const INSTALL_STEPS = [
  "Нажмите «Установить команду» → «Добавить команду».",
  "Команда спросит ключ — вставьте скопированный в шаге 1.",
];

// Запасной путь — собрать команду вручную, если файл не открывается. Названия — как в «Командах».
export const SHORTCUT_STEPS = [
  "«Команды» → ＋ → назовите «CashFlow: покупка».",
  "«Текст» — вставьте ключ из шага 1.",
  "«Получить содержимое URL»: адрес ниже, метод POST, заголовок Authorization = «Bearer » + Текст, тело JSON: amount = Вход команды → Сумма, merchant = → Продавец, card = → Карта, input = Вход команды.",
  "«Получить значение» alert из «Содержимого URL»; «Если» оно имеет любое значение → «Показать уведомление» с ним.",
]

export const AUTOMATION_STEPS = [
  "«Команды» → «Автоматизация» → ＋ → «Транзакция».",
  "Выберите все карты, «Запускать сразу», уведомление о запуске — выключить.",
  "Команда — «CashFlow: покупка».",
];
