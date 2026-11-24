# CashFlow — частые команды. `make` без цели — список.
#
# Миграции БД — supabase/migrations/<время>_<имя>.sql, применяются `make db-push` к проекту Supabase.
# История — в БД (supabase_migrations.schema_migrations): уже применённые не запускаются повторно.
# tables.sql — архив схемы до v39 включительно, новые изменения туда не пишутся.
# Вход в CLI — `supabase login` (токен), пароль БД не нужен.

SUPABASE    ?= supabase
PROJECT_REF ?= dfsojlxtlceiuxcelcdo
LINKED      := --linked --project-ref $(PROJECT_REF)

# Флаги деплоя функций, которых нет в config.toml: auth-otp вызывается до входа — без JWT.
FN_FLAGS_auth-otp := --no-verify-jwt
# wallet-ingest вызывает команда iOS со своим ключом (api_tokens), JWT у неё нет.
FN_FLAGS_wallet-ingest := --no-verify-jwt
FUNCTIONS := $(filter-out _shared,$(notdir $(wildcard supabase/functions/*)))

.DEFAULT_GOAL := help
.PHONY: help install start test test-watch lint build preview check \
        db-new db-status db-dry db-push db-query db-test \
        fn-deploy fn-deploy-all secrets shortcut

help: ## Список команд
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── Фронт ────────────────────────────────────────────────────────

install: ## Зависимости (npm ci — строго по package-lock)
	npm ci

start: ## Дев-сервер Vite (http://localhost:3000, доступен и по IP в локальной сети)
	npm start

test: ## Все тесты один раз (Vitest)
	npm test

test-watch: ## Тесты в режиме наблюдения
	npm run test:watch

lint: ## ESLint (eslint.config.js); предупреждения тоже роняют — как в CI
	npm run lint

build: ## Продакшен-сборка в build/
	npm run build

preview: ## Открыть собранный build/ локально (проверка перед деплоем)
	npm run preview

check: lint test build ## Всё перед коммитом: линт, тесты, сборка

# ── БД (Supabase) ────────────────────────────────────────────────

db-new: ## Новая миграция: make db-new name=v41_что_меняем
	@test -n "$(name)" || { echo "Укажи имя: make db-new name=v41_что_меняем"; exit 1; }
	$(SUPABASE) migration new $(name)

db-status: ## Какие миграции применены в БД, какие — нет
	$(SUPABASE) migration list $(LINKED)

db-dry: ## Что применит db-push (без изменений в БД)
	$(SUPABASE) db push $(LINKED) --dry-run

db-push: ## Применить новые миграции к БД
	$(SUPABASE) db push $(LINKED) --yes

db-query: ## SQL к БД: make db-query sql="select 1"  |  make db-query file=path.sql
	@test -n "$(sql)$(file)" || { echo 'Укажи sql="…" или file=путь.sql'; exit 1; }
	$(SUPABASE) db query $(LINKED) $(if $(file),--file $(file),"$(sql)")

db-test: ## SQL-тесты в транзакции с откатом: make db-test file=supabase/tests/v41_wallet_inbox.sql
	@test -n "$(file)" || { echo 'Укажи file=supabase/tests/<тест>.sql'; exit 1; }
	@grep -q '^ROLLBACK;' $(file) || { echo 'Тест должен заканчиваться ROLLBACK;'; exit 1; }
	$(SUPABASE) db query $(LINKED) --file $(file)

# ── Команда iOS ──────────────────────────────────────────────────

shortcut: ## Собрать и подписать команду iOS «CashFlow: покупка» → public/ (macOS, вход в iCloud)
	node --env-file=.env scripts/build-wallet-shortcut.mjs

# ── Edge Functions ───────────────────────────────────────────────

fn-deploy: ## Задеплоить функцию: make fn-deploy name=receipt-proxy
	@test -n "$(name)" || { echo "Укажи имя: make fn-deploy name=<$(FUNCTIONS)>"; exit 1; }
	$(SUPABASE) functions deploy $(name) --project-ref $(PROJECT_REF) $(FN_FLAGS_$(name))

fn-deploy-all: ## Задеплоить все функции
	@for fn in $(FUNCTIONS); do $(MAKE) --no-print-directory fn-deploy name=$$fn || exit 1; done

secrets: ## Список секретов функций (только имена)
	$(SUPABASE) secrets list --project-ref $(PROJECT_REF)
