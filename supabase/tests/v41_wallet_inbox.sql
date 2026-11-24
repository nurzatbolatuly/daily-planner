-- Тесты v41 (docs/apple-pay-inbox.md §11): ключи, приём, лимит, подтверждение, правила, дубли,
-- общий счёт, отклонение, отзыв. Идут на боевой БД ВНУТРИ транзакции с откатом — данные не меняются:
--   make db-test file=supabase/tests/v41_wallet_inbox.sql
-- Нужен хотя бы один пользователь со счётом и категорией расхода. Ошибка — RAISE с «FAIL …».
BEGIN;
CREATE TEMP TABLE t_ctx (k text PRIMARY KEY, v text);
GRANT ALL ON t_ctx TO authenticated;
INSERT INTO t_ctx (k, v) SELECT 'uid' AS k, u.id::text AS v FROM auth.users AS u ORDER BY u.created_at LIMIT 1;
INSERT INTO t_ctx (k, v) SELECT 'acc' AS k, a.id AS v FROM accounts AS a
  WHERE a.user_id = (SELECT c.v::uuid FROM t_ctx AS c WHERE c.k = 'uid') ORDER BY a.id LIMIT 1;
INSERT INTO t_ctx (k, v) SELECT 'cat' AS k, e.id AS v FROM exp_categories AS e
  WHERE e.user_id = (SELECT c.v::uuid FROM t_ctx AS c WHERE c.k = 'uid') ORDER BY e.id LIMIT 1;

-- как пользователь
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM t_ctx WHERE k='uid'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
INSERT INTO t_ctx (k, v) SELECT 'tok' AS k, issue_api_token('test') ->> 'token' AS v;

DO $$ BEGIN
  PERFORM token_hash FROM api_tokens;
  RAISE EXCEPTION 'FAIL: token_hash readable';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: token_hash hidden';
END $$;
DO $$ BEGIN
  INSERT INTO wallet_inbox (merchant) VALUES ('x');
  RAISE EXCEPTION 'FAIL: client can insert inbox';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: inbox insert denied';
END $$;
DO $$ BEGIN
  PERFORM wallet_ingest('{}');
  RAISE EXCEPTION 'FAIL: client can call wallet_ingest';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: wallet_ingest denied';
END $$;

-- как сервер (service_role ≈ владелец)
RESET ROLE;
DO $$
DECLARE tok text := (SELECT v FROM t_ctx WHERE k='tok'); h text := encode(sha256(convert_to(tok,'UTF8')),'hex'); r jsonb;
BEGIN
  r := wallet_ingest(jsonb_build_object('token_hash', 'nope', 'max_per_hour', 60, 'retention_days', 90));
  IF r->>'status' <> 'invalid_token' THEN RAISE EXCEPTION 'FAIL invalid token: %', r; END IF;
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'test', true, 'max_per_hour', 60, 'retention_days', 90));
  IF r->>'status' <> 'ok' OR (r->>'test') IS NULL THEN RAISE EXCEPTION 'FAIL test ping: %', r; END IF;
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'max_per_hour', 60, 'retention_days', 90,
        'amount', 2500, 'currency', 'KZT', 'merchant', 'MAGNUM 0123', 'merchant_key', 'magnum',
        'card_label', 'Kaspi Gold', 'occurred_at', '2026-11-24T19:05:12+05:00', 'raw', '{"amount":"2 500 ₸"}'::jsonb));
  IF r->>'status' <> 'ok' OR r->>'account_id' IS NOT NULL THEN RAISE EXCEPTION 'FAIL ingest 1: %', r; END IF;
  INSERT INTO t_ctx VALUES ('in1', r->>'id');
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'max_per_hour', 60, 'retention_days', 90,
        'amount', null, 'merchant', '', 'merchant_key', '', 'card_label', 'Kaspi Gold'));
  INSERT INTO t_ctx VALUES ('in2', r->>'id');
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'max_per_hour', 3, 'retention_days', 90, 'card_label', 'Kaspi Gold'));
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'FAIL ingest 3: %', r; END IF;
  INSERT INTO t_ctx VALUES ('in3', r->>'id');
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'max_per_hour', 3, 'retention_days', 90, 'card_label', 'Kaspi Gold'));
  IF r->>'status' <> 'too_many' OR (r->>'retry_after')::int < 1 THEN RAISE EXCEPTION 'FAIL rate limit: %', r; END IF;
  RAISE NOTICE 'ok: ingest, test ping, invalid token, rate limit';
END $$;

-- как пользователь: подтверждение
SET LOCAL ROLE authenticated;
DO $$
DECLARE acc text := (SELECT v FROM t_ctx WHERE k='acc'); cat text := (SELECT v FROM t_ctx WHERE k='cat');
        in1 text := (SELECT v FROM t_ctx WHERE k='in1'); in2 text := (SELECT v FROM t_ctx WHERE k='in2');
        in3 text := (SELECT v FROM t_ctx WHERE k='in3'); bal numeric; st text; n int;
BEGIN
  IF (SELECT count(*) FROM wallet_inbox WHERE status='pending') < 3 THEN RAISE EXCEPTION 'FAIL: inbox not visible'; END IF;
  SELECT balance INTO bal FROM accounts WHERE id = acc;
  PERFORM save_tx(jsonb_build_object('id','t41a','type','expense','amount',2500,'currency','KZT','category_id',cat,
     'account_id',acc,'date','2026-11-24','note','Magnum','wallet_inbox_id',in1), acc, bal - 2500);
  SELECT status INTO st FROM wallet_inbox WHERE id = in1;
  IF st <> 'confirmed' THEN RAISE EXCEPTION 'FAIL confirm: %', st; END IF;
  IF NOT EXISTS (SELECT 1 FROM wallet_cards WHERE card_label='Kaspi Gold' AND account_id=acc) THEN RAISE EXCEPTION 'FAIL card rule'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wallet_merchants WHERE merchant_key='magnum' AND category_id=cat) THEN RAISE EXCEPTION 'FAIL merchant rule'; END IF;

  -- правка транзакции не отвязывает покупку
  PERFORM save_tx(jsonb_build_object('id','t41a','type','expense','amount',2400,'currency','KZT','category_id',cat,
     'account_id',acc,'date','2026-11-24','note','Magnum'), acc, bal - 2400);
  IF (SELECT wallet_inbox_id FROM transactions WHERE id='t41a') IS DISTINCT FROM in1 THEN RAISE EXCEPTION 'FAIL: edit unlinked'; END IF;

  -- вторая запись той же покупки
  BEGIN
    PERFORM save_tx(jsonb_build_object('id','t41b','type','expense','amount',2500,'currency','KZT','category_id',cat,
       'account_id',acc,'date','2026-11-24','wallet_inbox_id',in1), acc, bal);
    RAISE EXCEPTION 'FAIL: double confirm allowed';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok: double confirm blocked';
  END;

  -- перевесить привязку нельзя
  BEGIN
    UPDATE transactions SET wallet_inbox_id = in2 WHERE id = 't41a';
    RAISE EXCEPTION 'FAIL: relink allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: relink blocked';
  END;

  -- «Уже записано»
  INSERT INTO transactions (id, type, amount, currency, category_id, account_id, date) VALUES ('t41c','expense',100,'KZT',cat,acc,'2026-11-24');
  PERFORM link_inbox_tx(jsonb_build_object('inbox_id', in2, 'transaction_id', 't41c'));
  IF (SELECT status FROM wallet_inbox WHERE id = in2) <> 'duplicate' THEN RAISE EXCEPTION 'FAIL duplicate'; END IF;
  BEGIN
    PERFORM link_inbox_tx(jsonb_build_object('inbox_id', in3, 'transaction_id', 't41c'));
    RAISE EXCEPTION 'FAIL: link to linked tx';
  EXCEPTION WHEN no_data_found THEN RAISE NOTICE 'ok: tx_not_linkable';
  END;

  -- общий счёт: save_shared_entry с wallet_inbox_id в p.tx
  PERFORM save_shared_entry(jsonb_build_object('tx', jsonb_build_object('id','t41d','type','expense','amount',900,
     'currency','KZT','category_id',cat,'account_id',acc,'date','2026-11-24','wallet_inbox_id',in3)));
  IF (SELECT status FROM wallet_inbox WHERE id = in3) <> 'confirmed' THEN RAISE EXCEPTION 'FAIL shared confirm'; END IF;

  -- закрытую не отклонить
  n := dismiss_inbox(jsonb_build_object('ids', jsonb_build_array(in1, in2, in3)));
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL dismiss resolved: %', n; END IF;

  -- удаление транзакции: покупка остаётся confirmed, ссылка обнуляется
  DELETE FROM transactions WHERE id = 't41a';
  IF (SELECT transaction_id FROM wallet_inbox WHERE id = in1) IS NOT NULL THEN RAISE EXCEPTION 'FAIL set null'; END IF;
  RAISE NOTICE 'ok: confirm, rules, edit, double, relink, duplicate, shared, dismiss, delete';
END $$;

-- правило карты используется при приёме; отзыв ключа
RESET ROLE;
DO $$
DECLARE tok text := (SELECT v FROM t_ctx WHERE k='tok'); h text := encode(sha256(convert_to(tok,'UTF8')),'hex'); r jsonb; n int;
BEGIN
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'max_per_hour', 60, 'retention_days', 90,
        'amount', 10, 'merchant_key', 'magnum', 'card_label', 'Kaspi Gold'));
  IF r->>'account_id' IS NULL OR r->>'category_id' IS NULL THEN RAISE EXCEPTION 'FAIL suggestion: %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM t_ctx WHERE k='uid'), 'role', 'authenticated')::text, true);
  PERFORM revoke_api_token((SELECT id FROM api_tokens WHERE name = 'test' AND user_id = (SELECT v::uuid FROM t_ctx WHERE k='uid')));
  r := wallet_ingest(jsonb_build_object('token_hash', h, 'max_per_hour', 60, 'retention_days', 90));
  IF r->>'status' <> 'invalid_token' THEN RAISE EXCEPTION 'FAIL revoked: %', r; END IF;
  -- dismiss pending
  n := (SELECT count(*) FROM wallet_inbox WHERE status = 'pending' AND user_id = (SELECT v::uuid FROM t_ctx WHERE k='uid'));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL pending count: %', n; END IF;
  n := dismiss_inbox(jsonb_build_object('ids', (SELECT jsonb_agg(id) FROM wallet_inbox WHERE status = 'pending')));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL dismiss: %', n; END IF;
  RAISE NOTICE 'ok: suggestion, revoke, dismiss';
END $$;

SELECT 'ALL V41 TESTS PASSED' AS result;
ROLLBACK;
