---
id: "MASTERPLAN-002"
title: "Исчерпывающий генеральный план реализации Спринта 2: Премиум UI через Inspo MCP, контур Post-Build QA и Семейный Edge Sync"
type: "masterplan"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "ready"
tags:
  - masterplan
  - sprint-02
  - inspo-mcp
  - motion
  - cloudflare
  - qa-gate
created_at: 2026-09-23T01:40:00Z
updated_at: 2026-09-23T01:40:00Z
related_documents:
  - "[[00_Meta/Prompts/Frontend_Lead_Prompt.md]]"
  - "[[00_Meta/Prompts/QA_Data_Hygiene_Prompt.md]]"
  - "[[01_Architecture/ADR/ADR-006_Agent_Orchestration_Inspo_MCP_and_Post_Build_QA.md]]"
  - "[[03_Design_System/Tokens.md]]"
  - "[[03_Design_System/Anti_Slop_Checklist.md]]"
  - "[[04_Tasks/Sprint_02_Roadmap.md]]"
---

# Генеральный план реализации Спринта 2: Премиум UI, Post-Build QA и Семейный Edge Sync

## 1. Стратегический контекст и архитектурный манифест
Проект переходит от этапа базового функционального прототипа к премиальному утилитарному продукту мирового уровня (эстетика Linear, Apple Health, Cron).
Главный инженерный императив: **Никакого «нейрослопа»**. Каждая строчка CSS, каждый переход, микро-анимация и взаимодействие обязаны опираться на проверенные продакшн-референсы из MCP-сервера `inspo` и проверяться автоматизированным контуром QA после каждой сборки.

---

## 2. Декомпозиция работ по специализированным агентам

```
+-----------------------------------------------------------------------------------+
|                            АРХИТЕКТОР (Оркестратор)                                |
|  - Ведет SSOT в Obsidian                                                          |
|  - Формирует изолированные контракты (JIT)                                        |
|  - Назначает задачи исполнительным агентам                                         |
|  - Запускает субагента QA после сборки                                            |
+--------------------------+--------------------------------+-----------------------+
                           |                                |
                           v                                v
+-------------------------------------+   +-----------------------------------------+
|     FRONTEND & TMA LEAD             |   |      CLOUD & EDGE INTEGRATIONS          |
|  1. Запрос референсов в MCP Inspo   |   |  1. Cloudflare D1/KV схемы               |
|  2. Внедрение микро-анимаций (Motion|   |  2. Обработка start_param (Deep Linking) |
|  3. Рефакторинг дизайн-системы      |   |  3. Delta-sync эндпоинты pull/push      |
|  4. Прогон локальной сборки         |   |  4. HMAC-авторизация сессий             |
+------------------+------------------+   +--------------------+--------------------+
                   |                                           |
                   +---------------------+---------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        QA & HYGIENE OPERATOR (Субагент)                           |
|  - npm run build (0 ошибок TypeScript, бандл < 110 КБ)                            |
|  - npm run lint (0 warnings/errors)                                               |
|  - npx vitest run (25/25 тестов green)                                            |
|  - Anti-Slop визуальный и структурный аудит                                        |
|  - Вердикт: PASS -> Архитектор коммитит в Git / FAIL -> возврат на доработку     |
+-----------------------------------------------------------------------------------+
```

---

## 3. Модуль А: Премиум UI через MCP `inspo` (Задача Frontend Lead)

### 3.1. Точный протокол запросов к MCP `inspo`
Frontend Lead выполняет следующую последовательность вызовов:
1. `call_mcp_tool("inspo", "recommend", { brief: "dark minimalist food inventory tracking mobile card list spring animations", mode: "dark", device: "mobile" })`
   - Извлечение эталонной цветовой палитры и типографических шкал.
2. `call_mcp_tool("inspo", "search_screens", { query: "dark mobile cards list active states", mode: "dark", device: "mobile" })`
   - Изучение паттернов отступов (padding-inline 16-20px, gap 8-12px) и компоновки индикаторов свежести.
3. `call_mcp_tool("inspo", "find_components", { query: "swipeable list item action menu", category: "card" })`
   - Получение архитектуры жестов свайпа (Swipe-to-eat / Swipe-to-trash).
4. `call_mcp_tool("inspo", "get_reference_jsx", { id: "...", type: "..." })`
   - Анализ продакшн-реализации Tailwind-классов и CSS-трансформаций.

### 3.2. Архитектура микроконтрастов (Анти-нейрослоп)
В строгом соответствии с `inf_base/Дизайн-система Telegram Mini App.md`:
* **Фон экрана (Surface Ground):** `#09090b` (Zinc-950).
* **Контейнеры и карточки (Surface Elevated):** `#121215` (Zinc-900).
* **Внутренние чипы и инпуты (Surface Subtle):** `#18181b` (Zinc-800).
* **Субпиксельные границы (Hairline Borders):** 1px `rgba(255, 255, 255, 0.08)`. При фокусе/нажатии: `rgba(255, 255, 255, 0.20)`.
* **Полный запрет:** никаких `box-shadow: 0 10px 25px rgba(...)`, никаких градиентов `from-purple-600 to-indigo-600`.
* **Семантическая палитра свежести (единственные цветные акценты):**
  - Свежее ($R > 0.4$): `emerald-500` (`#10b981`), фон чипа `emerald-500/10`, текст `emerald-400`.
  - Скоро истекает ($0.15 < R \le 0.4$): `amber-500` (`#f59e0b`), фон чипа `amber-500/10`, текст `amber-400`.
  - Просрочено / Сегодня ($R \le 0.15$): `rose-500` (`#f43f5e`), фон чипа `rose-500/10`, текст `rose-400`.

### 3.3. Кинематика и микро-анимации
1. **Карточка продукта (`ProductCard`):**
   - Интерактивный отклик: `active:scale-[0.985] transition-transform duration-100 ease-out`.
   - Тактильность: вызов `Telegram.WebApp.HapticFeedback.impactOccurred('light')` при любом нажатии.
   - Появление в списке: плавный `fade-in` + `translate-y-1` с задержкой по индексу (`stagger`).
   - Удаление/списание: анимация сдвига по горизонтали с последующим плавным схлопыванием `max-height` до 0 за 200 мс.
2. **Переключатель разделов (Табы «Холодильник» / «Съедено» / «Утиль»):**
   - Плавающий скользящий индикатор (Sliding Pill Indicator) под активным табом с `transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]`.
   - Смена контента через мягкий cross-fade.
3. **Шторка добавления (`AddProductDrawer`):**
   - Удержание физики Vaul (drag handle, пружинный возврат при неполном свайпе).
   - Кнопка сохранения `Положить в холодильник` зафиксирована в `sticky bottom-0`, имеет сплошной контрастный фон `#fafafa` с черным текстом `#09090b` и аппаратный тактильный отклик `notificationOccurred('success')`.

---

## 4. Модуль Б: Автоматизированный контур QA (Задача QA Inspector)

### 4.1. Автоматический проверочный скрипт
QA-субагент запускает следующую тестовую матрицу:
```bash
# 1. Проверка компилятора TypeScript и размера бандла
npm run build --prefix frontend

# 2. Проверка статического анализа кода
npm run lint --prefix frontend

# 3. Полный регрессионный прогон юнит-тестов (Edge Gateway, Presets, Notifier)
npx vitest run

# 4. Аудит на отсутствие запрещенных CSS-паттернов
# Поиск дешевых градиентов и тяжелых теней
```

### 4.2. Формальный протокол вердикта
QA-субагент обязан выдать отчет строгого формата:
```markdown
### QA Verification Report
- **TypeScript & Build:** PASS (Размер gzipped: XX КБ < 110 КБ)
- **ESLint:** PASS (0 errors, 0 warnings)
- **Vitest Suite:** PASS (25/25 passing)
- **Design Tokens & Anti-Slop:** PASS (Zero gradients, 1px hairline borders, Zinc-950 base)
- **VERDICT:** VERIFICATION: PASS
```

---

## 5. Модуль В: Семейная синхронизация и Cloudflare Edge (Задача Cloud Integrations)

### 5.1. Архитектура пространств (Workspace Model)
* **Таблица пространств `fridge_spaces` (Cloudflare D1 / KV):**
  - `id`: UUIDv4 (например, `spc_8a7b9c...`).
  - `name`: Название холодильника (по умолчанию «Наш Холодильник»).
  - `owner_id`: `telegram_id` создателя.
  - `members`: JSON-массив `{ telegram_id, first_name, username, role, joined_at }`.
  - `items`: JSON-массив актуальных продуктов с полями `id`, `name`, `category`, `expiration_date`, `added_at`, `status`, `updated_at`, `updated_by`.
  - `updated_at`: ISO временная метка последней мутации.

### 5.2. Сценарий Deep Link (`startapp=fridge_<ID>`)
1. Пользователь А нажимает в шапке «Поделиться» -> генерируется ссылка `https://t.me/Svezhestt_bot?startapp=fridge_spc_8a7b9c`.
2. Пользователь Б переходит по ссылке:
   - Telegram инжектирует `start_param: "fridge_spc_8a7b9c"` в `Telegram.WebApp.initData`.
   - Клиент считывает `start_param` и отправляет `POST /api/spaces/join` с заголовком `Authorization: tma <initData>`.
   - Воркер криптографически проверяет HMAC-SHA256, добавляет пользователя Б в массив `members` и возвращает актуальный снимок `items`.
   - Пользователь Б мгновенно видит все продукты пользователя А.
3. Разрешение конфликтов: Last-Write-Wins по полю `updated_at` для каждой отдельной позиции.

---

## 6. Детальный план действий на завтра (Готов к запуску)

1. **Фаза 1: Прием обновлений `inf_base`**
   - Архитектор анализирует добавленные пользователем заметки в `inf_base/`.
   - Актуализация контрактов и базы пресетов продуктов при необходимости.

2. **Фаза 2: Редизайн UI (Запуск Frontend Lead через MCP `inspo`)**
   - Выдача изолированного контракта `TASK-006` агенту `frontend_lead`.
   - Выполнение запросов к MCP `inspo` (`recommend`, `find_components`).
   - Рефакторинг `frontend/src/components/ProductCard.tsx` (spring-анимации, микро-скейл, статус-бейдж).
   - Рефакторинг `frontend/src/components/AddProductDrawer.tsx` (премиум-верстка, пресеты, sticky CTA).
   - Рефакторинг главного экрана `App.tsx` (плавающий слайдер табов, плавная смена разделов).

3. **Фаза 3: Автоматический QA-аудит (Запуск QA-субагента)**
   - Выполнение проверочной матрицы `TASK-007`.
   - Получение вердикта `VERIFICATION: PASS`.
   - Фиксация в Git и пуш на GitHub.

4. **Фаза 4: Семейный Edge Sync (Запуск Cloud Integrations)**
   - Настройка Cloudflare D1/KV для многопользовательского доступа (`TASK-008`).
   - Подключение обработчика `start_param` в TMA.
   - Финальная сквозная проверка на устройствах.
