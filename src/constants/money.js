// Категории нового пользователя (засеваются при первой загрузке, useMoneyData). Без id: id у каждой
// строки свой (newId) — первичный ключ общий на всех пользователей (tables.sql v38).
export const DEF_EXP = [
    {name: "Продукты", icon: "groceries", color: "#4caf50"},
    {name: "Транспорт", icon: "transport", color: "#1976d2"},
    {name: "Дом", icon: "home", color: "#388e3c"},
    {name: "Путешествия", icon: "travel", color: "#4caf50"},
    {name: "Кафе и рестораны", icon: "eating", color: "#f9a825"},
    {name: "Развлечения", icon: "entertainment", color: "#9c27b0"},
    {name: "Здоровье", icon: "health", color: "#f44336"},
    {name: "Одежда", icon: "clothes", color: "#e91e63"},
    {name: "Сервисы", icon: "services", color: "#f9a825"},
    {name: "Непредвиденное", icon: "unplanned", color: "#546e7a"},
];

export const DEF_INC = [
    {name: "Зарплата", icon: "salary", color: "#4caf50", plan_currency: "KZT"},
    {name: "Фриланс", icon: "freelance", color: "#1976d2", plan_currency: "USD"},
    {name: "Инвестиции", icon: "invest", color: "#f9a825", plan_currency: "KZT"},
    {name: "Подарок", icon: "gift", color: "#e91e63", plan_currency: "KZT"},
    {name: "Прочее", icon: "other", color: "#546e7a", plan_currency: "KZT"},
];

// Системные категории — приложение ставит их само, без выбора пользователем: оплата ежемесячных
// платежей/кредитов (MonthlyPaymentsListPage, LoanDetailPage, CashflowPage) и курсовая разница при
// продаже валюты/металла (TransferPageMon → счёт is_fx_account; прибыль — доход, убыток — расход,
// без категории не попали бы в статистику, docs/shared-expenses.md §6.1).
// Находятся по роли system_key (v38), а не по id: id у каждого пользователя свой. Создаются при
// первой загрузке (useMoneyData), id для форм — data.systemCats (utils/systemCategories.js).
export const SYSTEM_CATEGORIES = {
    bills:  { table: "exp", system_key: "bills",   name: "Платежи",          icon: "payments",   color: "#0097a7" },
    fxLoss: { table: "exp", system_key: "fx_loss", name: "Курсовая разница", icon: "investment", color: "#00796b" },
    fxGain: { table: "inc", system_key: "fx_gain", name: "Курсовая разница", icon: "investment", color: "#00796b" },
};

export const TRIP_CATS = ["transport", "accommodation", "eating", "entertainment", "travel", "service", "other", "train", "plane"];

export const TRIP_LABELS = {
    transport: "Транспорт",
    accommodation: "Жильё",
    eating: "Еда",
    entertainment: "Развлечения",
    travel: "Активности/Музеи",
    service: "Сервис",
    other: "Прочее",
    train: "Поезд",
    plane: "Самолёт"
};

export const ACC_PURPOSES = [
  { key: "daily",      label: "Ежедневные" },
  { key: "reserve",    label: "Резервные" },
  { key: "investment", label: "Инвестиционные" },
  { key: "savings",    label: "Накопления" },
  { key: "additional", label: "Дополнительные" },
];

export const SAVINGS_PURPOSES = ["investment", "savings", "reserve"];
export const BALANCE_ADJUSTMENT_NOTE = "Balance adjustment";
export const FEE_TX_NOTE = "Комиссия за перевод";

export const GOAL_TYPES = [
  { key: "custom",     label: "Цель" },
  { key: "safety_net", label: "Подушка" },
  { key: "purchase",   label: "Покупка" },
  { key: "vacation",   label: "Отпуск" },
  { key: "investment", label: "Инвестиции" },
];

// Долги людям (не путать с transfers.is_debt_repayment — "долг самому себе").
// amount в debt_events знаковый: + увеличивает "должен мне", − уменьшает.
export const DEBT_EVENT_TYPES = [
  { key: "paid_for_them", label: "Я оплатил за них" },
  { key: "they_paid",     label: "Они оплатили за меня" },
  { key: "lent",          label: "Дал в долг" },
  { key: "return",        label: "Возврат" },
  { key: "forgive",       label: "Прощено" },
  { key: "offset",        label: "Зачёт" },         // взаимозачёт с общей группой (docs/shared-expenses.md §10)
];

export const DEBT_RETURN_NOTE_PREFIX = "Возврат долга";
export const DEBT_BORROW_NOTE_PREFIX = "Получен в долг";
export const DEBT_LEND_NOTE_PREFIX = "Дал в долг";

// ─── Общие расходы (docs/shared-expenses.md) ───
export const SHARED_MODES = { mirror: "mirror", event: "event" };
// Способ перевода (shared_entries.method): со счёта, наличными, зачётом с личным долгом (§10),
// долг перенесён в группу Tricount («Записать в Tricount») — деньги не двигались.
export const SHARED_TRANSFER_METHODS = { account: "account", cash: "cash", offset: "offset", group: "group" };
// Префикс заметки транзакции перевода в группе: «Перевод · Вечер 03.10 ← Асан» (§11.4).
export const SHARED_TRANSFER_NOTE_PREFIX = "Перевод";
// «Перевод · 2 долга ← Бек» — заметка пачки (sharedSave) и бейдж в истории (txBadges), через pluralRu.
export const DEBT_WORDS = ["долг", "долга", "долгов"];
export const SHARED_ENTRY_KINDS = {
  bill: "bill", refund: "refund", transfer: "transfer",
  adjust: "adjust", opening: "opening", reconcile: "reconcile",
};
// Причины корректировки (§9). Сама сумма корректировки знаковая — см. utils/sharedExpenses.js.
export const SHARED_ADJUST_REASONS = {
  rounding: "rounding",           // он перевёл больше — разницу оставил себе как округление
  forgive: "forgive",             // он недоплатил — остаток простил
  treat: "treat",                 // угощаю: весь его долг на мне
  overpaid_them: "overpaid_them", // я перевёл ему больше — разницу оставил как округление
  treated_me: "treated_me",       // я перевёл меньше / меня угостили — «хватит»
};

export const PALETTE =["#4caf50", "#66bb6a", "#388e3c", "#1b5e20", "#f9a825", "#fbc02d", "#ff8f00", "#e65100", "#f44336", "#e53935", "#c62828", "#e91e63", "#c2185b", "#9c27b0", "#7b1fa2", "#673ab7", "#3f51b5", "#1976d2", "#0288d1", "#0097a7", "#00796b", "#5d4037", "#757575", "#546e7a", "#37474f", "#ffffff", "#000000", "#ff5722", "#795548", "#9e9e9e"];
