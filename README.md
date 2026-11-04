# CashFlow

Личное мобильное PWA для учёта финансов: React 19, Vite, Supabase.

## Запуск

Нужен `.env` в корне (не коммитится):

```sh
REACT_APP_SUPABASE_URL=https://xxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=...
```

Команды — через `make` (`make` без цели — список):

| Команда | Что делает |
| --- | --- |
| `make install` | Зависимости строго по `package-lock.json` |
| `make start` | Дев-сервер на <http://localhost:3000> (доступен и по IP в локальной сети) |
| `make test` | Тесты (Vitest) |
| `make lint` | ESLint, предупреждения тоже роняют проверку |
| `make build` | Продакшен-сборка в `build/` |
| `make preview` | Открыть собранный `build/` локально |
| `make check` | Линт, тесты и сборка — перед коммитом |

Миграции БД и Edge Functions — тоже через `make` (`db-*`, `fn-*`).

## CI

`.github/workflows/lint.yml` на каждый PR и пуш в `main`: ESLint, тесты и сборка,
`deno lint` и `deno check` для `supabase/functions`, Super-Linter для CSS, HTML, SQL, YAML и секретов.

## Деплой

Vercel, настройки — в `vercel.json` (Vite, результат сборки в `build/`).
