-- ════════════════════════════════════════════════════════════════
-- v42: СОСТАВ ПЛАТЕЖА И «ГДЕ ПЛАТИТЬ» (instruction.md §20.1)
--   recurring.items — из чего состоит объединённый платёж («Подписки» = Spotify + iCloud):
--     [{ "id": text, "name": text, "amount": number | null }]. Пустой массив — обычный платёж.
--     Итог платежа по-прежнему в recurring.amount: клиент пишет туда Σ позиций, если суммы
--     указаны у всех (utils/billItems.js), поэтому RPC и «Денежный поток» о составе не знают.
--   recurring.pay_place / loans.pay_place — где платить (Kaspi, eGov, автосписание…):
--     свободный текст, подсказки — из значений самого пользователя, не из справочника.
--   Колонки с DEFAULT — старые строки и старый фронт продолжают работать.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.recurring
  ADD COLUMN items jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT recurring_items_is_array CHECK (jsonb_typeof(items) = 'array'),
  ADD COLUMN pay_place text NOT NULL DEFAULT ''
    CONSTRAINT recurring_pay_place_len CHECK (char_length(pay_place) <= 60);

ALTER TABLE public.loans
  ADD COLUMN pay_place text NOT NULL DEFAULT ''
    CONSTRAINT loans_pay_place_len CHECK (char_length(pay_place) <= 60);
