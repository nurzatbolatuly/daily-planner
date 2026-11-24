-- ════════════════════════════════════════════════════════════════
-- v41: APPLE PAY → «ВХОДЯЩИЕ» (docs/apple-pay-inbox.md §4)
--   Команда iOS (автоматизация «Транзакция») шлёт покупку в Edge Function wallet-ingest →
--   RPC wallet_ingest кладёт ЧЕРНОВИК в wallet_inbox. Балансы сервер не трогает: их считает
--   клиент (save_tx принимает готовый баланс), серверная запись гонялась бы с открытыми вкладками.
--   Покупка закрывается в той же транзакции БД, что и расход: колонка transactions.wallet_inbox_id
--   + триггер wallet_inbox_resolve (+ уникальный индекс — одна покупка → одна транзакция).
--   Путь записи любой (save_tx, save_shared_entry, link_inbox_tx) — закрытие одно, в триггере.
--   Новые таблицы — по правилам v36: user_id, политика, tenant_owner, tenant_refs.
--   save_tx — та же сигнатура, + wallet_inbox_id при вставке (правка его не перезаписывает).
--   save_shared_entry — копия v32, + wallet_inbox_id в двух вставках транзакций.
--   Порядок: миграция (make db-push) → функция (make fn-deploy name=wallet-ingest) → фронт.
-- ════════════════════════════════════════════════════════════════

-- ── Личные ключи для команды iOS ─────────────────────────────────
-- Хранится только SHA-256 ключа (случайные 256 бит — перебор невозможен, секрет не нужен).
-- Ключ умеет одно — добавить покупку во «Входящие» (scope).
CREATE TABLE public.api_tokens (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  token_hash   text        NOT NULL UNIQUE,
  prefix       text        NOT NULL,                       -- «cf_a1b2c3» — показать в списке
  scope        text        NOT NULL DEFAULT 'wallet_ingest' CHECK (scope IN ('wallet_ingest')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,                                -- «последний сигнал» в настройках
  revoked_at   timestamptz
);
CREATE INDEX api_tokens_user_idx ON public.api_tokens (user_id);

-- ── Очередь покупок ──────────────────────────────────────────────
CREATE TABLE public.wallet_inbox (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id       text        REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'confirmed', 'dismissed', 'duplicate')),
  amount         numeric     CHECK (amount IS NULL OR amount > 0),      -- NULL: сумма не пришла
  currency       text        CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'), -- NULL: валюта счёта
  merchant       text        NOT NULL DEFAULT '' CHECK (char_length(merchant) <= 200),
  merchant_key   text        NOT NULL DEFAULT '' CHECK (char_length(merchant_key) <= 200),
  card_label     text        NOT NULL DEFAULT '' CHECK (char_length(card_label) <= 100),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  received_at    timestamptz NOT NULL DEFAULT now(),
  raw            jsonb       NOT NULL DEFAULT '{}'
                             CHECK (jsonb_typeof(raw) = 'object' AND octet_length(raw::text) <= 4096),
  transaction_id text        REFERENCES public.transactions(id) ON DELETE SET NULL,
  resolved_at    timestamptz
);
CREATE INDEX wallet_inbox_user_status_idx ON public.wallet_inbox (user_id, status, occurred_at DESC);
CREATE INDEX wallet_inbox_token_idx       ON public.wallet_inbox (token_id, received_at);

-- ── Правила: карта → счёт, продавец → категория (пишет триггер из подтверждения) ─────
CREATE TABLE public.wallet_cards (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  card_label text        NOT NULL CHECK (char_length(card_label) BETWEEN 1 AND 100),
  account_id text        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_label)
);

CREATE TABLE public.wallet_merchants (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_key text        NOT NULL CHECK (char_length(merchant_key) BETWEEN 1 AND 200),
  category_id  text        NOT NULL REFERENCES public.exp_categories(id) ON DELETE CASCADE,
  uses         int         NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_key)
);

-- ── Владелец и ссылки — как v36 ──────────────────────────────────
-- Ключи и очередь клиент только читает (пишут RPC ниже), правила — правит сам (настройки).
DO $$
DECLARE
  spec jsonb := '{
    "api_tokens":       [],
    "wallet_inbox":     ["token_id", "api_tokens", "transaction_id", "transactions"],
    "wallet_cards":     ["account_id", "accounts"],
    "wallet_merchants": ["category_id", "exp_categories"]
  }';
  read_only text[] := ARRAY['api_tokens', 'wallet_inbox'];
  t text; refs text;
BEGIN
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF t = ANY (read_only) THEN
      EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated '
                     'USING (user_id = (select auth.uid()))', t);
    ELSE
      EXECUTE format('CREATE POLICY owner ON public.%I FOR ALL TO authenticated '
                     'USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))', t);
    END IF;
    EXECUTE format('CREATE TRIGGER tenant_owner BEFORE INSERT OR UPDATE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION tenant_owner()', t);
    IF jsonb_array_length(spec -> t) > 0 THEN
      SELECT string_agg(quote_literal(r), ', ') INTO refs FROM jsonb_array_elements_text(spec -> t) r;
      EXECUTE format('CREATE TRIGGER tenant_refs AFTER INSERT OR UPDATE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION tenant_refs(%s)', t, refs);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON public.api_tokens, public.wallet_inbox, public.wallet_cards, public.wallet_merchants FROM anon;
REVOKE ALL ON public.api_tokens, public.wallet_inbox FROM authenticated;
-- token_hash клиенту не виден: select('*') упадёт — клиент перечисляет колонки.
GRANT SELECT (id, name, prefix, scope, created_at, last_used_at, revoked_at) ON public.api_tokens TO authenticated;
GRANT SELECT ON public.wallet_inbox TO authenticated;

-- ── Связь транзакции с покупкой ──────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN wallet_inbox_id text REFERENCES public.wallet_inbox(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX transactions_wallet_inbox_id_key ON public.transactions (wallet_inbox_id)
  WHERE wallet_inbox_id IS NOT NULL;
-- v36 не ставил tenant_refs на transactions (ссылок не было) — теперь есть одна.
DROP TRIGGER IF EXISTS tenant_refs ON public.transactions;
CREATE TRIGGER tenant_refs AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION tenant_refs('wallet_inbox_id', 'wallet_inbox');

-- Закрыть покупку, к которой привязали транзакцию, и запомнить правила.
--   INSERT транзакции → 'confirmed' (записана из «Входящих»);
--   UPDATE NULL → id  → 'duplicate' («Уже записано», link_inbox_tx).
-- Привязку нельзя перевесить на другую покупку; снять её может только FK (удаление покупки).
-- SECURITY DEFINER: клиент не пишет wallet_inbox и правила напрямую — только через этот путь.
CREATE OR REPLACE FUNCTION public.wallet_inbox_resolve() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.wallet_inbox;
BEGIN
  IF NEW.wallet_inbox_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.wallet_inbox_id IS NOT DISTINCT FROM NEW.wallet_inbox_id THEN RETURN NULL; END IF;
    IF OLD.wallet_inbox_id IS NOT NULL THEN
      RAISE EXCEPTION 'inbox_link_immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO r FROM public.wallet_inbox
  WHERE id = NEW.wallet_inbox_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inbox_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'inbox_already_resolved' USING ERRCODE = '55000'; END IF;

  UPDATE public.wallet_inbox
  SET status = CASE WHEN TG_OP = 'INSERT' THEN 'confirmed' ELSE 'duplicate' END,
      transaction_id = NEW.id, resolved_at = now()
  WHERE id = r.id;

  IF r.card_label <> '' AND NEW.account_id IS NOT NULL THEN
    INSERT INTO public.wallet_cards AS c (user_id, card_label, account_id)
    VALUES (NEW.user_id, r.card_label, NEW.account_id)
    ON CONFLICT (user_id, card_label) DO UPDATE SET account_id = excluded.account_id, updated_at = now();
  END IF;

  IF r.merchant_key <> '' AND NEW.type = 'expense' AND NEW.category_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.exp_categories WHERE id = NEW.category_id AND user_id = NEW.user_id) THEN
    INSERT INTO public.wallet_merchants AS m (user_id, merchant_key, category_id)
    VALUES (NEW.user_id, r.merchant_key, NEW.category_id)
    ON CONFLICT (user_id, merchant_key) DO UPDATE
      SET category_id = excluded.category_id, uses = m.uses + 1, last_used_at = now();
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER wallet_inbox_resolve AFTER INSERT OR UPDATE OF wallet_inbox_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.wallet_inbox_resolve();

-- ── save_tx: + wallet_inbox_id (сигнатура прежняя — права сохраняются) ─────────────
create or replace function save_tx(p_tx jsonb, p_account_id text, p_new_balance numeric)
returns void language plpgsql as $$
begin
  insert into transactions (id, type, amount, currency, category_id, account_id, date, note, wallet_inbox_id)
  values (
    p_tx->>'id', p_tx->>'type', (p_tx->>'amount')::numeric, p_tx->>'currency',
    p_tx->>'category_id', p_tx->>'account_id', p_tx->>'date', coalesce(p_tx->>'note', ''),
    nullif(p_tx->>'wallet_inbox_id', '')
  )
  -- wallet_inbox_id не обновляется: правка транзакции не отвязывает и не перевешивает покупку.
  on conflict (id) do update set
    type = excluded.type, amount = excluded.amount, currency = excluded.currency,
    category_id = excluded.category_id, account_id = excluded.account_id,
    date = excluded.date, note = excluded.note;
  if p_account_id is not null then
    update accounts set balance = p_new_balance where id = p_account_id;
  end if;
end; $$;

-- ── save_shared_entry: копия v32 + wallet_inbox_id в p.tx и p.txs ─────────────────
CREATE OR REPLACE FUNCTION save_shared_entry(p jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- v25: новые люди («Сохранить в Люди», §7.2) — до участников, которые на них ссылаются.
  INSERT INTO debt_people (id, name, color, archived)
  SELECT r.id, r.name, coalesce(r.color, '#4caf50'), coalesce(r.archived, false)
  FROM jsonb_populate_recordset(null::debt_people, coalesce(p->'people', '[]')) r
  ON CONFLICT (id) DO NOTHING;
  IF jsonb_typeof(p->'group') = 'object' THEN
    INSERT INTO shared_groups (id, name, mode, currency, date, icon, color, minor_category_id, archived)
    SELECT r.id, r.name, coalesce(r.mode, 'event'), coalesce(r.currency, 'KZT'), r.date,
           coalesce(r.icon, 'other'), coalesce(r.color, '#4caf50'), r.minor_category_id, coalesce(r.archived, false)
    FROM jsonb_populate_record(null::shared_groups, p->'group') r
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, currency = excluded.currency, date = excluded.date, icon = excluded.icon,
      color = excluded.color, minor_category_id = excluded.minor_category_id, archived = excluded.archived;
  END IF;

  INSERT INTO shared_members (id, group_id, is_me, label, heads, person_id, guest_name, sort_order)
  SELECT r.id, r.group_id, coalesce(r.is_me, false), r.label, coalesce(r.heads, 1), r.person_id,
         r.guest_name, coalesce(r.sort_order, 0)
  FROM jsonb_populate_recordset(null::shared_members, coalesce(p->'members', '[]')) r
  ON CONFLICT (id) DO UPDATE SET
    label = excluded.label, heads = excluded.heads, person_id = excluded.person_id,
    guest_name = excluded.guest_name, sort_order = excluded.sort_order;

  -- Записи, которые заменяются (старые корректировки перевода при его правке, §7.6).
  DELETE FROM shared_entries
  WHERE id IN (SELECT jsonb_array_elements_text(coalesce(p->'delete_entry_ids', '[]')));

  IF jsonb_typeof(p->'tx') = 'object' THEN
    INSERT INTO transactions (id, type, amount, currency, category_id, account_id, date, note, wallet_inbox_id)
    VALUES (
      p->'tx'->>'id', p->'tx'->>'type', (p->'tx'->>'amount')::numeric, p->'tx'->>'currency',
      nullif(p->'tx'->>'category_id', ''), p->'tx'->>'account_id', p->'tx'->>'date', coalesce(p->'tx'->>'note', ''),
      nullif(p->'tx'->>'wallet_inbox_id', '')
    )
    ON CONFLICT (id) DO UPDATE SET
      type = excluded.type, amount = excluded.amount, currency = excluded.currency,
      category_id = excluded.category_id, account_id = excluded.account_id,
      date = excluded.date, note = excluded.note;
  END IF;

  -- v28: несколько транзакций одним вызовом («Повторить из прошлого месяца», §5.17).
  INSERT INTO transactions (id, type, amount, currency, category_id, account_id, date, note, wallet_inbox_id)
  SELECT t->>'id', t->>'type', (t->>'amount')::numeric, t->>'currency', nullif(t->>'category_id', ''),
         t->>'account_id', t->>'date', coalesce(t->>'note', ''), nullif(t->>'wallet_inbox_id', '')
  FROM jsonb_array_elements(coalesce(p->'txs', '[]')) t
  ON CONFLICT (id) DO UPDATE SET
    type = excluded.type, amount = excluded.amount, currency = excluded.currency,
    category_id = excluded.category_id, account_id = excluded.account_id,
    date = excluded.date, note = excluded.note;

  -- v29: зачёт с личным долгом (§10) — событие offset пишется до записи, которая на него ссылается.
  IF jsonb_typeof(p->'debt_event') = 'object' THEN
    INSERT INTO debt_events (id, person_id, type, amount, currency, date, note, transaction_id, account_id)
    SELECT r.id, r.person_id, 'offset', r.amount, coalesce(r.currency, 'KZT'), r.date, coalesce(r.note, ''), NULL, NULL
    FROM jsonb_populate_record(null::debt_events, p->'debt_event') r
    ON CONFLICT (id) DO UPDATE SET
      person_id = excluded.person_id, amount = excluded.amount, currency = excluded.currency,
      date = excluded.date, note = excluded.note;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(null::shared_entries, coalesce(p->'entries', '[]')) e,
         jsonb_array_elements(coalesce(e.shares, '[]')) s
    WHERE NOT EXISTS (SELECT 1 FROM shared_members m WHERE m.id = s->>'member_id' AND m.group_id = e.group_id)
  ) THEN
    RAISE EXCEPTION 'shared_entries.shares: участник не из этой группы';
  END IF;

  INSERT INTO shared_entries (
    id, group_id, kind, date, currency, amount_group, note, title, amount, account_amount, venue_total,
    category_id, payer_member_id, shares, split_people, from_member_id, to_member_id, method,
    sender_person_id, sender_name, heads_covered, batch_id, member_id, reason, bill_id, transfer_id,
    account_id, transaction_id, debt_event_id, linked_tx_snapshot, fees
  )
  SELECT
    r.id, r.group_id, r.kind, r.date, coalesce(r.currency, 'KZT'), r.amount_group, coalesce(r.note, ''),
    coalesce(r.title, ''), r.amount, r.account_amount, r.venue_total, r.category_id, r.payer_member_id,
    coalesce(r.shares, '[]'), r.split_people, r.from_member_id, r.to_member_id, r.method,
    r.sender_person_id, r.sender_name, r.heads_covered, r.batch_id, r.member_id, r.reason, r.bill_id,
    r.transfer_id, r.account_id, r.transaction_id, r.debt_event_id, r.linked_tx_snapshot, coalesce(r.fees, '[]')
  FROM jsonb_populate_recordset(null::shared_entries, coalesce(p->'entries', '[]')) r
  ON CONFLICT (id) DO UPDATE SET
    kind = excluded.kind, date = excluded.date, currency = excluded.currency,
    amount_group = excluded.amount_group, note = excluded.note, title = excluded.title,
    amount = excluded.amount, account_amount = excluded.account_amount, venue_total = excluded.venue_total,
    category_id = excluded.category_id, payer_member_id = excluded.payer_member_id, shares = excluded.shares,
    split_people = excluded.split_people, from_member_id = excluded.from_member_id,
    to_member_id = excluded.to_member_id, method = excluded.method,
    sender_person_id = excluded.sender_person_id, sender_name = excluded.sender_name,
    heads_covered = excluded.heads_covered, batch_id = excluded.batch_id, member_id = excluded.member_id,
    reason = excluded.reason, bill_id = excluded.bill_id, transfer_id = excluded.transfer_id,
    account_id = excluded.account_id, transaction_id = excluded.transaction_id,
    debt_event_id = excluded.debt_event_id, linked_tx_snapshot = excluded.linked_tx_snapshot, fees = excluded.fees;

  IF p->>'tx_delete_id' IS NOT NULL THEN
    DELETE FROM transactions WHERE id = p->>'tx_delete_id';
  END IF;

  -- v29: перевод перестал быть зачётом — его событие offset удаляется (личный долг возвращается).
  IF p->>'debt_event_delete_id' IS NOT NULL THEN
    DELETE FROM debt_events WHERE id = p->>'debt_event_delete_id' AND type = 'offset';
  END IF;

  PERFORM shared_apply_balances(p->'balances');
END; $$;

-- ── Ключи: выдать (ключ возвращается ОДИН раз) и отозвать ─────────
CREATE OR REPLACE FUNCTION public.issue_api_token(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); nm text := btrim(coalesce(p_name, '')); tok text; rid text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF char_length(nm) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'bad_token_name' USING ERRCODE = '22023'; END IF;
  -- Параллельные выдачи одного пользователя не обходят лимит.
  PERFORM pg_advisory_xact_lock(hashtextextended('api_tokens:' || uid::text, 0));
  IF (SELECT count(*) FROM public.api_tokens WHERE user_id = uid AND revoked_at IS NULL) >= 10 THEN
    RAISE EXCEPTION 'too_many_tokens' USING ERRCODE = '54000';
  END IF;
  tok := 'cf_' || encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix)
  VALUES (uid, nm, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), left(tok, 9))
  RETURNING id INTO rid;
  RETURN jsonb_build_object('id', rid, 'token', tok, 'prefix', left(tok, 9), 'name', nm);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_api_token(p_id text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.api_tokens SET revoked_at = now()
  WHERE id = p_id AND user_id = auth.uid() AND revoked_at IS NULL
$$;

-- ── Приём покупки (только service_role — из Edge Function wallet-ingest) ──────────
-- p: token_hash, max_per_hour, retention_days, test, amount, currency, merchant, merchant_key,
--    card_label, occurred_at, raw. Разбор суммы/продавца — в функции (_shared/walletParse.ts).
-- → { status: 'ok' | 'invalid_token' | 'too_many', id, retry_after, account_id, account_currency,
--     account_name, category_id }
CREATE OR REPLACE FUNCTION public.wallet_ingest(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.api_tokens; n int; first_at timestamptz; rid text; acc record; cat text;
BEGIN
  -- FOR UPDATE: запросы одного ключа идут по очереди — лимит не обходится параллельно.
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = p->>'token_hash' AND revoked_at IS NULL AND scope = 'wallet_ingest' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid_token'); END IF;
  UPDATE public.api_tokens SET last_used_at = now() WHERE id = t.id;
  -- Проверка связи (команду запустили вручную, без покупки) — только «последний сигнал».
  IF coalesce((p->>'test')::boolean, false) THEN RETURN jsonb_build_object('status', 'ok', 'test', true); END IF;

  SELECT count(*), min(received_at) INTO n, first_at FROM public.wallet_inbox
  WHERE token_id = t.id AND received_at > now() - interval '1 hour';
  IF n >= (p->>'max_per_hour')::int THEN
    RETURN jsonb_build_object('status', 'too_many',
      'retry_after', greatest(1, ceil(extract(epoch FROM first_at + interval '1 hour' - now()))));
  END IF;

  -- Уборка разобранных покупок старше срока — без cron, при приёме новой.
  DELETE FROM public.wallet_inbox
  WHERE user_id = t.user_id AND status <> 'pending'
    AND received_at < now() - make_interval(days => (p->>'retention_days')::int);

  INSERT INTO public.wallet_inbox (user_id, token_id, amount, currency, merchant, merchant_key, card_label, occurred_at, raw)
  VALUES (t.user_id, t.id, nullif(p->>'amount', '')::numeric, nullif(p->>'currency', ''),
          coalesce(p->>'merchant', ''), coalesce(p->>'merchant_key', ''), coalesce(p->>'card_label', ''),
          coalesce(nullif(p->>'occurred_at', '')::timestamptz, now()), coalesce(p->'raw', '{}'))
  RETURNING id INTO rid;

  SELECT a.id, a.currency, a.name INTO acc
  FROM public.wallet_cards c JOIN public.accounts a ON a.id = c.account_id
  WHERE c.user_id = t.user_id AND c.card_label = coalesce(p->>'card_label', '');
  SELECT category_id INTO cat FROM public.wallet_merchants
  WHERE user_id = t.user_id AND merchant_key = coalesce(p->>'merchant_key', '') AND merchant_key <> '';

  RETURN jsonb_build_object('status', 'ok', 'id', rid, 'account_id', acc.id,
    'account_currency', acc.currency, 'account_name', acc.name, 'category_id', cat);
END $$;

-- ── Разбор очереди из приложения ─────────────────────────────────
-- «Не записывать»: только свои и только pending. → сколько строк закрыто.
CREATE OR REPLACE FUNCTION public.dismiss_inbox(p jsonb) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n int;
BEGIN
  UPDATE public.wallet_inbox SET status = 'dismissed', resolved_at = now()
  WHERE user_id = auth.uid() AND status = 'pending'
    AND id IN (SELECT jsonb_array_elements_text(coalesce(p->'ids', '[]')));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- «Уже записано»: привязать покупку к существующей транзакции (баланс не меняется).
-- SECURITY INVOKER: RLS transactions — только своя транзакция; закрытие — триггер.
CREATE OR REPLACE FUNCTION public.link_inbox_tx(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.transactions SET wallet_inbox_id = p->>'inbox_id'
  WHERE id = p->>'transaction_id' AND wallet_inbox_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_linkable' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Supabase выдаёт EXECUTE на новые функции anon/authenticated — права явно.
REVOKE EXECUTE ON FUNCTION public.wallet_inbox_resolve()     FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_api_token(text)      FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_api_token(text)     FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.wallet_ingest(jsonb)       FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dismiss_inbox(jsonb)       FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.link_inbox_tx(jsonb)       FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.issue_api_token(text)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.revoke_api_token(text)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.dismiss_inbox(jsonb)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.link_inbox_tx(jsonb)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.wallet_ingest(jsonb)       TO service_role;
