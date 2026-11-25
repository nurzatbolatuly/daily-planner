// «Входящие» Apple Pay (docs/apple-pay-inbox.md §6–§9) — чистые функции: подсказки, валюта,
// сборка транзакции, дубли, группировка, пачка. Тесты — __tests__/walletInbox.test.js.
import { localDate, daysBetween } from "./date";
import { fmtM, fmtAmtAuto, fmtDateShort, getPrecision, roundTo, convertAmount, pluralRu } from "./format";
import { txDelta } from "./txSave";
import { REPEAT_WINDOW_MS, MATCH_DAYS } from "../constants/wallet";

// Счёт по карте и категория по продавцу — только из правил, записанных подтверждениями пользователя.
// Правило на удалённый счёт/категорию не подставляется.
export function suggestForItem(item, { cards = [], merchants = [], accounts = [], expCats = [] }) {
  const card = item.card_label ? cards.find(c => c.card_label === item.card_label) : null;
  const merchant = item.merchant_key ? merchants.find(m => m.merchant_key === item.merchant_key) : null;
  return {
    accountId: card && accounts.some(a => a.id === card.account_id) ? card.account_id : "",
    categoryId: merchant && expCats.some(c => c.id === merchant.category_id) ? merchant.category_id : "",
  };
}

// Валюта покупки: пришла с телефона — она; нет — как у счёта (подпись «как у счёта»).
export const itemCurrency = (item, account) => item.currency || account?.currency || null;

// Покупка в валюте, отличной от валюты счёта (валютная карта за границей, тенговая — в долларах):
// транзакция пишется в валюте счёта, поэтому нужно «Списалось со счёта» (§6.1).
export const isForeign = (item, account) => !!(account && item.currency && item.currency !== account.currency);

// «≈ по курсу» — подсказка по тапу, не подставляется молча. Округление — до точности валюты счёта.
export const estimateCharged = (item, account, rates) =>
  roundTo(convertAmount(item.amount, item.currency, account.currency, rates), getPrecision(account.currency));

// Заметка транзакции: продавец; у валютной покупки — ещё исходная сумма («Apple · $12.99»).
export function inboxNote(item, account) {
  const parts = [item.merchant || ""];
  if (isForeign(item, account) && item.amount) parts.push(fmtM(item.amount, item.currency));
  return parts.filter(Boolean).join(" · ");
}

// Проверка карточки перед записью. amount/charged — строки из полей ввода.
export function validateConfirm({ item, account, categoryId, amount, charged }) {
  const e = {};
  if (!account) e.account = "Выберите счёт";
  if (!categoryId) e.category = "Выберите категорию";
  if (account && isForeign(item, account)) {
    if (!(Number(charged) > 0)) e.charged = "Сколько списалось со счёта";
  } else if (!(Number(amount) > 0)) {
    e.amount = "Введите сумму";
  }
  return e;
}

// Транзакция из покупки: всегда в валюте счёта; wallet_inbox_id закрывает покупку в БД (триггер v41).
export function buildInboxTx({ id, item, account, categoryId, amount, charged }) {
  const value = isForeign(item, account) ? Number(charged) : Number(amount);
  return {
    id, type: "expense", amount: value, currency: account.currency, category_id: categoryId,
    account_id: account.id, date: localDate(item.occurred_at), note: inboxNote(item, account),
    wallet_inbox_id: item.id,
  };
}

// Уже введённый вручную расход, похожий на покупку (§7.1): тот же счёт (если известен), сумма
// совпадает с точностью валюты, дата ±MATCH_DAYS, ещё не привязан к другой покупке.
// Валютная покупка не сравнивается: в транзакции сумма в валюте счёта.
export function findInboxMatches(item, transactions, account) {
  if (!item.amount || !account || isForeign(item, account)) return [];
  const day = localDate(item.occurred_at);
  const tolerance = 10 ** -getPrecision(account.currency) / 2;
  return transactions
    .filter(t => t.type === "expense" && !t.virtual && !t.wallet_inbox_id && t.account_id === account.id
      && Math.abs(Number(t.amount) - item.amount) <= tolerance
      && Math.abs(daysBetween(day, t.date)) <= MATCH_DAYS)
    .sort((a, b) => Math.abs(daysBetween(day, a.date)) - Math.abs(daysBetween(day, b.date)));
}

// Команда отправила ту же покупку ещё раз (§7.2): более ранняя строка с той же картой, суммой,
// валютой и продавцом в пределах окна. Сервер такие не отклоняет — два одинаковых кофе подряд реальны.
export function isPossibleRepeat(item, items) {
  const t = Date.parse(item.occurred_at);
  return items.some(o => o.id !== item.id
    && o.card_label === item.card_label && o.amount === item.amount && o.currency === item.currency
    && o.merchant === item.merchant
    && Date.parse(o.occurred_at) <= t && t - Date.parse(o.occurred_at) <= REPEAT_WINDOW_MS
    && (Date.parse(o.occurred_at) < t || o.id < item.id));
}

// Группы по дню покупки (по местному времени), новые сверху: [{ key, label, items }].
export function groupByDay(items) {
  const groups = new Map();
  [...items].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).forEach(it => {
    const key = localDate(it.occurred_at);
    if (!groups.has(key)) groups.set(key, { key, label: fmtDateShort(key + "T12:00:00"), items: [] });
    groups.get(key).items.push(it);
  });
  return [...groups.values()];
}

// Сумма покупки: валюта неизвестна (не пришла, счёт не выбран) — без символа.
export const fmtInboxAmount = (amount, currency) => (currency ? fmtM(amount, currency) : fmtAmtAuto(amount));

export const timeLabel = iso => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// «Записать все с подсказкой» (§8.2): есть сумма, счёт и категория по правилам, валюта как у счёта,
// не похоже на повтор и на уже записанный расход — то, что пользователь подтвердил бы, не меняя.
export function bulkReady(items, ctx) {
  return items.filter(item => {
    const { accountId, categoryId } = suggestForItem(item, ctx);
    const account = ctx.accounts.find(a => a.id === accountId);
    return item.amount && account && categoryId && !isForeign(item, account)
      && !isPossibleRepeat(item, items) && findInboxMatches(item, ctx.transactions || [], account).length === 0;
  });
}

// Пачка для записи по одной: балансы — накопительно от стора (каждая следующая видит предыдущие).
// → [{ tx, params }] — params для RPC save_tx.
export function buildBulk(items, ctx, newId) {
  const balances = new Map(ctx.accounts.map(a => [a.id, Number(a.balance)]));
  return items.map(item => {
    const { accountId, categoryId } = suggestForItem(item, ctx);
    const account = ctx.accounts.find(a => a.id === accountId);
    const tx = buildInboxTx({ id: newId(), item, account, categoryId, amount: item.amount });
    const next = roundTo(balances.get(account.id) + txDelta(tx.type, tx.amount), 2);
    balances.set(account.id, next);
    return { tx, params: { p_tx: tx, p_account_id: account.id, p_new_balance: next } };
  });
}

// «В общие расходы» (§6.3): данные покупки для формы счёта тусы / покупки Tricount. Транзакцию
// создаёт сама форма (save_shared_entry), wallet_inbox_id закрывает покупку в той же транзакции БД.
// Валютная покупка: сумма чека — в валюте покупки, accountAmount — сколько списалось со счёта.
export function inboxSharePrefill({ item, account, categoryId, amount, charged }) {
  const foreign = isForeign(item, account);
  return {
    inboxId: item.id,
    title: item.merchant || "",
    date: localDate(item.occurred_at),
    currency: itemCurrency(item, account),
    amount: item.amount || (Number(amount) > 0 ? Number(amount) : null),
    accountId: account?.id || "",
    accountCurrency: account?.currency || null,
    accountAmount: foreign && Number(charged) > 0 ? Number(charged) : null,
    categoryId: categoryId || "",
  };
}

// Сумма для покупки Tricount: группа в одной валюте. Покупка в ней — как есть; иначе, если со счёта
// в валюте группы списалась известная сумма, — она; иначе пусто (введут руками).
export function purchaseAmountFor(prefill, groupCurrency) {
  if (prefill.currency === groupCurrency && prefill.amount) return prefill.amount;
  if (prefill.accountCurrency === groupCurrency && prefill.accountAmount) return prefill.accountAmount;
  return null;
}

// Куда отнести покупку «за всех»: активные группы, свежая активность — первой (туса идёт вечер:
// кафе → такси → бар — нужная окажется сверху без отдельных правил). → [{ group, kind, last }]
export function shareTargets(groups, entries) {
  const last = new Map();
  entries.forEach(e => {
    const t = Date.parse(e.created_at || e.date) || 0;
    if (t > (last.get(e.group_id) || 0)) last.set(e.group_id, t);
  });
  return groups.filter(g => !g.archived)
    .map(g => ({ group: g, kind: g.mode === "mirror" ? "Tricount" : "Туса", last: Math.max(last.get(g.id) || 0, Date.parse(g.created_at) || 0) }))
    .sort((a, b) => b.last - a.last);
}

// Ошибки записи из «Входящих» (и TxPage с покупкой) — понятным текстом.
export function inboxErrorText(e, fallback = "Не удалось сохранить") {
  const msg = `${e?.message || ""} ${e?.details || ""}`;
  if (/inbox_already_resolved|transactions_wallet_inbox_id_key/.test(msg)) return "Эта покупка уже записана — список обновлён";
  if (/tx_not_linkable/.test(msg)) return "Этот расход уже связан с другой покупкой";
  if (/inbox_not_found/.test(msg)) return "Покупка не найдена — обновите список";
  return fallback;
}

// «последний сигнал: 5 мин назад» (экран «Apple Pay»).
export function lastSignalText(iso, now = new Date()) {
  if (!iso) return "сигнала ещё не было";
  const min = Math.floor((now - new Date(iso)) / 60000);
  if (min < 1) return "сигнал только что";
  if (min < 60) return `сигнал ${min} ${pluralRu(min, ["минуту", "минуты", "минут"])} назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `сигнал ${h} ${pluralRu(h, ["час", "часа", "часов"])} назад`;
  return `сигнал ${fmtDateShort(localDate(iso) + "T12:00:00").toLowerCase()}`;
}
