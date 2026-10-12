import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { parseReceiptLink, parseLinkPayload, ReceiptError, RECEIPT_ERRORS } from "../utils/receipts";

// Загрузка чека по ссылке из QR через Edge Function receipt-proxy (docs/receipts.md §8):
// браузер сам не может — у сайтов ОФД нет CORS. Разбор — utils/receipts (чистые функции).

const PROXY_FUNCTION = "receipt-proxy";

// Код ошибки прокси → ReceiptError с текстом для пользователя (§3.4).
const PROXY_ERRORS = {
  upstream: [RECEIPT_ERRORS.upstream, "Не удалось получить чек. Если он только что пробит — ОФД получает чеки с задержкой, попробуйте позже"],
  too_large: [RECEIPT_ERRORS.upstream, "Не удалось получить чек"],
  timeout: [RECEIPT_ERRORS.network, "Сервис чеков не ответил. Попробуйте ещё раз"],
  network: [RECEIPT_ERRORS.network, "Не удалось связаться с сервисом чеков. Попробуйте ещё раз"],
  bad_request: [RECEIPT_ERRORS.unsupportedLink, "Поддерживаются чеки Kaspi и oofd.kz"],
};

async function proxyError(error) {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context?.json?.().catch(() => null);
    const known = PROXY_ERRORS[body?.error];
    if (known) return new ReceiptError(...known);
  }
  return new ReceiptError(RECEIPT_ERRORS.network, "Не удалось загрузить чек. Проверьте соединение");
}

// Ссылка (parseReceiptLink) → тело ответа ОФД: HTML Kaspi / JSON oofd (строкой).
export async function fetchReceiptPayload(link) {
  const { data, error } = await supabase.functions.invoke(PROXY_FUNCTION, { body: { source: link.source, ...link.params } });
  if (error) throw await proxyError(error);
  return data.body;
}

// Текст со ссылкой → разобранный чек (модель §4). Ошибки — ReceiptError с code.
export async function loadReceiptFromLink(text) {
  const link = parseReceiptLink(text);
  return parseLinkPayload(link, await fetchReceiptPayload(link));
}
