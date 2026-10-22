-- ════════════════════════════════════════════════════════════════
-- v40: ЧЕКИ ОФД «ТРАНСТЕЛЕКОМ» (PDF) — новый источник 'ttc' (utils/receipts/ttc.js)
--   Ссылку ofd1.kz сервер не загрузит (чек за reCAPTCHA) — пользователь прикладывает PDF со страницы
--   чека. external_id — ttc:ФП:РНМ, как у других ОФД. Меняется только CHECK источника.
--   Порядок: миграция (make db-push) → фронт (без неё сохранение такого чека упадёт на CHECK).
-- ════════════════════════════════════════════════════════════════
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_source_check;
ALTER TABLE receipts ADD CONSTRAINT receipts_source_check CHECK (source IN ('kaspi', 'oofd', 'arbuz', 'ttc'));
