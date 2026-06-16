# BudLog — Техническая документация

Голосовой журнал стройплощадки. Прораб надиктовывает в Telegram («залили фундамент, ушло
40 мешков цемента, завтра электрик»), а бот ведёт структурированный лог работ, материалов и
фото и формирует чистый веб-отчёт + PDF для клиента без логина.

> English: [../en/TECHNICAL.md](../en/TECHNICAL.md) · Руководство пользователя: [USER_GUIDE.md](USER_GUIDE.md)

## 1. Архитектура

Монорепозиторий Turborepo:

| Пакет | Технологии | Назначение |
|---|---|---|
| `apps/api` | NestJS 10 · Prisma 5 · PostgreSQL · Redis · Telegraf | REST API + Telegram-бот |
| `apps/web` | Next.js 14 · Tailwind | Публичный отчёт `/r/[token]` + админка `/admin` |
| `packages/shared-types` | TypeScript | Общие интерфейсы сущностей/DTO |
| `packages/shared-utils` | Zod | Общая валидация/форматирование |

Поток данных: **Telegram → API (Whisper + GPT function-calling) → Postgres → веб-отчёт / PDF**.

## 2. Модули API (`apps/api/src/modules`)

`auth` · `users` · `accounts` · `sites` · `ai` · `reports` · `admin` · `telegram` ·
`notifications` · `mail` · `health` + `common/` (кэш, гварды, Redis-троттлер) и
`database/` (PrismaService).

- **Auth** — JWT (`JwtAuthGuard`); регистрация/вход, 6-значные коды сброса и верификации email.
- **Accounts** — роли owner/editor/viewer; `AccountContextGuard` читает `X-Account-Id`. В BudLog: компания / прораб / клиент.
- **Sites** — строительный домен (см. §3). Каждый запрос скоупится по `accountId`; запись для `viewer` блокирует `ViewerBlockGuard`.
- **AI** — `WhisperService` (голос→текст), `OcrService` (текст с фото), `SiteToolsService` (5 строительных функций-инструментов), `ChatService` (оркестратор).
- **Reports** — публичный отчёт по площадке за токеном (JSON + прокси фото + PDF).
- **Admin** — `/admin/*` за `JwtAuthGuard + AdminGuard` (`ADMIN_EMAILS`).
- **Telegram** — бот: команды + захват голоса/фото/текста с флоу подтверждения.

## 3. Модель данных (Prisma)

Ядро: `User`, `Account`, `AccountMember`, `AccountInvitation`, `TelegramLink`,
`TelegramLinkCode`, `ChatConversation`, `ChatMessage`, `UsageLog`, `NotificationLog`,
`ScheduledNotification`.

Строительный домен:
- **Site** — `accountId, name, address?, clientName?, status(active|archived), createdById`
- **WorkEntry** — `siteId, authorUserId, description, workDate, source(voice|manual|photo)`
- **MaterialEntry** — `siteId, name, quantity, unit?, workEntryId?, entryDate`
- **SitePhoto** — `siteId, telegramFileId, caption?, takenAt` (хранится Telegram `file_id`, не сам файл)
- **ReportLink** — `siteId, token@unique, expiresAt?, revoked` (публичная ссылка-шара)

`TelegramLink.activeSiteId` — активная площадка прораба для захвата в боте.

## 4. AI-конвейер захвата (LangGraph)

Построен на **LangChain + LangGraph**, трассируется через **LangSmith**.

1. Голосовое → `WhisperService.transcribe` → текст (язык авто). OpenAI-клиенты Whisper/OCR обёрнуты в `wrapOpenAI` → трассируются в LangSmith.
2. `ChatService.start(text, ctx, source)` запускает **LangGraph** `StateGraph`:
   - `reason` — `ChatOpenAI` (GPT-4o) с 5 строительными инструментами (`log_work`, `log_materials`, `log_work_with_materials`, `plan_next`, `set_active_site`); `SiteToolsService.parseLangchainToolCalls` → структурированные действия.
   - `confirm` — `interrupt()` ставит граф на паузу (human-in-the-loop). Состояние **durably чекпойнтится в Postgres** (`PostgresSaver`) по thread id.
   - `persist` — на возобновлении пишет действия через `SitesService`.
3. Бот показывает **карточку подтверждения** (`ca:<threadId>` / `ra:<threadId>`). По ✅/❌ вызывает `ChatService.resume(threadId, 'approve'|'reject')` → граф продолжается с чекпойнта → persist или конец. **Ничего не пишется до подтверждения.**
4. Трассировка LangSmith включается через env (`LANGSMITH_TRACING` + `LANGSMITH_API_KEY`); по умолчанию выключена, без ключа — no-op.

## 5. Справочник эндпоинтов (префикс `/api/v1`)

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| GET | `/health` | — | живость + проверка БД |
| POST | `/auth/register`, `/auth/login` | — | аккаунты |
| GET | `/users/me` | JWT | текущий пользователь |
| POST | `/users/me/telegram-link-code` | JWT + acct | код привязки бота |
| GET/POST/PATCH | `/accounts…` | JWT | аккаунты и участники |
| GET | `/sites` | JWT + acct | список площадок |
| POST | `/sites` · `/sites/work` · `/sites/materials` · `/sites/photos` | JWT + acct (+ViewerBlock) | создание площадки/записей |
| GET | `/sites/:id/journal` | JWT + acct | хронологический журнал |
| POST/DELETE | `/sites/:id/report-link[/:token]` | JWT + acct (+ViewerBlock) | создать/отозвать публичную ссылку |
| GET | `/public/report/:token` | — | JSON отчёта |
| GET | `/public/report/:token/photo/:photoId` | — | байты фото (прокси Telegram) |
| GET | `/public/report/:token/pdf?lang=` | — | экспорт PDF |
| GET | `/admin/{stats,users,accounts,sites}` | JWT + Admin | данные админки |

## 6. Локальный запуск

Требуется: Docker, Node ≥20. Инфра — в Docker (порты выбраны так, чтобы не конфликтовать с другими локальными проектами).

```bash
# 1. Инфра: Postgres на 5435, Redis на 6380
docker compose -f docker-compose.dev.yml up -d

# 2. Установка + миграции + сид
npm install
cd apps/api
npx prisma migrate dev        # применяет все миграции
npm run db:seed               # сидит alice@test.com / TestPass123 (админ)

# 3. Секреты — в apps/api/.env задать:
#    OPENAI_API_KEY=...      (голос/AI-захват)
#    TELEGRAM_BOT_TOKEN=...  (от @BotFather; пусто = бот no-op)
#    ADMIN_EMAILS=alice@test.com

# 4. Запуск
cd apps/api && npm run dev    # API на http://localhost:3000
cd apps/web && npm run dev    # web на http://localhost:3001
```

## 7. Как проверить (разработчику)

```bash
npm run typecheck             # все воркспейсы чистые
npm test                      # 58 тестов проходят

# Health + auth
curl -s localhost:3000/api/v1/health                 # {"status":"ok","db":"ok",...}
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"TestPass123"}' \
  | grep -o '"accessToken":"[^"]*"' | sed 's/.*:"//;s/"//')

# Площадки (X-Account-Id = сиженный аккаунт)
ACC=$(curl -s localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
curl -s -X POST localhost:3000/api/v1/sites -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC" \
  -H 'Content-Type: application/json' -d '{"name":"Dom Kowalski","clientName":"Jan"}'

# Админка
curl -s localhost:3000/api/v1/admin/stats -H "Authorization: Bearer $TOKEN"
```

Полный сценарий бот/отчёт/PDF/админка — в [USER_GUIDE.md](USER_GUIDE.md).

## 8. Продакшен

См. [`../ops/deploy-runbook.md`](../ops/deploy-runbook.md). Прод-стек —
`docker-compose.prod.yml` (db/redis/api/web + migrator); `git push` в `main` запускает
`.github/workflows/deploy.yml`. Бэкапы, uptime и инфра-алерты — по расписанию в workflows.

## 9. Статус

Фазы 1–3 и 5 реализованы; Фаза 4 (биллинг Stripe + WhatsApp) не начата.
Роадмап: [`../plans/README.md`](../plans/README.md).
