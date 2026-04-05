# Studio Booking Platform

Production-ready сервис онлайн-записи для фотостудии и ивент-площадки с Telegram-ботом, админ-панелью, системой лояльности и маркетинговыми инструментами.

## Архитектура

```
project/
├── apps/
│   ├── api/           # Express API + BullMQ jobs (порт 4000)
│   ├── bot/           # Telegram бот (grammY)
│   └── admin/         # Next.js 15 админ-панель (порт 3000)
├── packages/
│   ├── database/      # Prisma ORM + схема + seed
│   ├── shared/        # Zod-схемы, константы, ошибки
│   ├── types/         # Общие TypeScript типы
│   └── utils/         # Утилиты (шаблоны, UTM, форматирование)
├── docker-compose.yml
└── turbo.json
```

## Стек

| Слой | Технология |
|------|-----------|
| Runtime | Node.js 20+ |
| Backend | Express + TypeScript + Prisma + PostgreSQL |
| Bot | grammY + conversations + Redis sessions |
| Queue | BullMQ + Redis (13 workers) |
| Admin | Next.js 15 + Tailwind CSS 4 + Recharts |
| Auth | JWT (access + refresh tokens) |
| Validation | Zod (общие схемы в packages/shared) |
| Monorepo | pnpm workspaces + Turborepo |
| Deploy | Docker Compose |

## Быстрый старт

```bash
# 1. Инфраструктура
docker compose up -d

# 2. Зависимости
pnpm install

# 3. Конфигурация
cp .env.example .env
# Указать BOT_TOKEN, JWT_SECRET и другие настройки

# 4. База данных
pnpm db:generate
pnpm db:push
pnpm db:seed

# 5. Запуск
pnpm dev
```

**Вход в админку:** http://localhost:3000 — admin@studio.ru / admin123

## Функциональность

### Система бронирования
- 2 типа площадок: PHOTO_STUDIO, EVENT_HALL
- Гибкое расписание по дням недели
- Динамическое ценообразование (выходные, вечер, длинные брони)
- Дополнительные услуги (ассистент, оборудование, кейтеринг)
- Блокировка слотов администратором
- Буфер 30 мин между бронированиями
- Лист ожидания для занятых дат
- Человекочитаемые ID: B-260405-001
- Полная детализация цены в чеке

### Telegram-бот
- Inline-календарь с цветовой индикацией загрузки (🟢🟡🔴)
- Визуальные временные слоты
- Выбор дополнительных услуг с ☐/☑ toggle
- Полный расчёт цены с разбивкой
- Регистрация: телефон + день рождения
- Мои бронирования + повторная бронь
- Система отзывов (1-5 звёзд + комментарий)
- UTM-трекинг через deep links
- Реферальная программа
- Подарочные сертификаты
- Social proof + urgency/scarcity
- Персональные рекомендации
- Opt-out от маркетинга
- i18n (ru/en)

### Система лояльности
- 4 уровня: Bronze → Silver → Gold → Platinum
- Накопительные скидки 0/5/10/15%
- Бонусные баллы (5% кешбэк от finalPrice)
- Списание: 1 балл = 1₽ (макс. 50% от суммы)
- Сгорание бонусов через N дней
- Реферальная программа (500 баллов обоим)
- Бонус за отзыв, день рождения, повышение уровня
- Milestone-бонусы (5, 10, 20, 50 бронь)
- Win-back неактивных клиентов
- Промокоды: %, фиксированная сумма, бонусы

### Маркетинг
- Кампании: рассылки, автоматические, запланированные
- 11 триггерных автосообщений
- Подарочные сертификаты (часы / сумма)
- UTM-трекинг с детализацией
- RFM-сегментация (6 сегментов)
- Cohort retention анализ
- Вирусный коэффициент
- LTV по когортам
- ROI кампаний

### BullMQ Jobs (13 workers)
| Worker | Расписание | Описание |
|--------|-----------|----------|
| campaign-sender | по запросу | Рассылка кампаний (30 msg/sec) |
| auto-messages | по запросу | Триггерные сообщения |
| abandoned-booking | каждые 5 мин | Брошенные бронирования |
| reminders | каждые 15 мин | Напоминания 24ч и 2ч |
| follow-up | каждые 30 мин | Запрос отзыва после визита |
| birthday | ежедневно 10:00 | Поздравления + бонусы |
| win-back | ежедневно 11:00 | Возврат неактивных |
| bonus-expiry | ежедневно 12:00 | Предупреждение о сгорании |
| waitlist | каждые 10 мин | Проверка свободных слотов |
| rfm-recalculate | ежедневно 02:00 | Пересчёт RFM-сегментов |
| daily-summary | ежедневно 09:00 | Сводка для админов |

### Админ-панель (20+ страниц)
- **Дашборд**: метрики, RFM, рефералы, ROI
- **Бронирования**: таблица + фильтры + массовые действия + CSV
- **Календарь**: неделя/месяц с цветовыми статусами
- **Площадки**: CRUD + расписание + ценообразование + аддоны
- **Клиенты**: профили + бонусы + таймлайн + рефералы
- **Кампании**: создание (3 шага) + воронка + статистика
- **Автосообщения**: тогглы + статистика 30 дней
- **Сертификаты**: продажа + использование
- **Промокоды**: CRUD + статистика
- **Лояльность**: настройка всех параметров
- **Отзывы**: модерация + ответы
- **Аналитика**: источники, RFM, когорты, LTV, маркетинг
- **Аудит-лог**: все действия админов
- **Логин**: JWT авторизация

## API Endpoints (50+)

### Auth
- `POST /api/auth/login`

### Dashboard
- `GET /api/dashboard/stats`
- `GET /api/dashboard/funnel`
- `GET /api/dashboard/heatmap`
- `GET /api/dashboard/upcoming`

### Bookings
- `GET/POST /api/bookings`
- `GET/PATCH /api/bookings/:id`
- `PATCH /api/bookings/:id/status`
- `GET /api/bookings/export`

### Venues
- `GET/POST /api/venues`
- `PATCH/DELETE /api/venues/:id`
- `GET/PUT /api/venues/:id/schedule`
- `GET/POST/PATCH/DELETE /api/venues/:id/pricing-rules`
- `GET/POST/PATCH /api/venues/:id/addons`
- `GET /api/venues/:id/availability`
- `POST/DELETE /api/venues/:id/blocked-slots`

### Clients
- `GET/POST /api/clients`
- `GET/PATCH /api/clients/:id`
- `POST /api/clients/:id/bonus-adjust`
- `POST /api/clients/:id/send-message`

### Campaigns
- `GET/POST /api/campaigns`
- `GET/PATCH/DELETE /api/campaigns/:id`
- `POST /api/campaigns/:id/send`
- `POST /api/campaigns/:id/preview`
- `GET /api/campaigns/:id/stats`

### Auto-messages, Gift Certificates, Analytics, Loyalty, Promocodes, Reviews, Audit, Admins
- Полный CRUD + статистика для каждой сущности

## Маркетинговые правила
- Макс. 1 рассылка клиенту в 3 дня
- Тихие часы: 21:00 — 10:00
- Тег `no-marketing` = исключение из рассылок
- Честный social proof (только реальные данные)
- Urgency только при реальном дефиците
- Все рассылки в AuditLog
- Все деньги — Decimal, все мутации — в транзакциях
