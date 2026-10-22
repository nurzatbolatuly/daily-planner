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
FUNCTIONS := $(filter-out _shared,$(notdir $(wildcard supabase/functions/*)))

.DEFAULT_GOAL := help
.PHONY: help install start test test-watch lint build check \
        db-new db-status db-dry db-push db-query \
        fn-deploy fn-deploy-all secrets

help: ## Список команд
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── Фронт ────────────────────────────────────────────────────────

install: ## Зависимости (npm ci — строго по package-lock)
	npm ci

start: ## Дев-сервер
	npm start

test: ## Все тесты один раз
	CI=true npx react-scripts test --watchAll=false

test-watch: ## Тесты в режиме наблюдения
	npx react-scripts test

lint: ## ESLint по src
	npx eslint src

build: ## Продакшен-сборка в build/
	npm run build

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

# ── Edge Functions ───────────────────────────────────────────────

fn-deploy: ## Задеплоить функцию: make fn-deploy name=receipt-proxy
	@test -n "$(name)" || { echo "Укажи имя: make fn-deploy name=<$(FUNCTIONS)>"; exit 1; }
	$(SUPABASE) functions deploy $(name) --project-ref $(PROJECT_REF) $(FN_FLAGS_$(name))

fn-deploy-all: ## Задеплоить все функции
	@for fn in $(FUNCTIONS); do $(MAKE) --no-print-directory fn-deploy name=$$fn || exit 1; done

secrets: ## Список секретов функций (только имена)
	$(SUPABASE) secrets list --project-ref $(PROJECT_REF)
