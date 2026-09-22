# **Отказоустойчивая система фоновой доставки уведомлений в Telegram на миллионных объемах данных**

Архитектурное решение задачи ежедневной доставки персонализированных дайджестов по миллионам записей продуктов строится на строгом разделении контуров: вычисление расписания с учетом временных зон отделяется от пространств хранения продуктов, а выборка данных изолируется от сетевого взаимодействия с внешним API. Попытка объединить агрегацию сроков годности и вызовы Telegram Bot API в синхронный процесс неизбежно приводит к исчерпанию пула соединений реляционной базы данных при наступлении круглого часа в популярных регионах, деградации дисковой подсистемы из\-за последовательных сканирований и блокировке бота со стороны платформы Telegram по коду HTTP 429\.

Масштабируемый пайплайн реализуется в виде пятиступенчатого асинхронного конвейера. Планировщик дискретизирует сутки на минутные интервалы UTC, сглаживая пиковые нагрузки («эффект 09:00») посредством детерминированного псевдослучайного сдвига (джиттера). Выборка продуктов опирается на композитные частичные B-Tree индексы и курсорную пагинацию, что исключает Full Table Scan на многомиллионных таблицах. В качестве транспортной очереди выступает легковесный асинхронный брокер на базе Redis (Arq / Redis Streams), тогда как Celery и PG-Boss отсекаются из\-за избыточных накладных расходов на сериализацию и риска блокировок транзакционного пула соединений базы данных. Доставка в сеть регулируется распределенным двухфакторным алгоритмом Token Bucket на базе Redis Lua, жестко лимитирующим исходящий трафик планкой 25–28 запросов в секунду суммарно и одним запросом в секунду на чат, с безусловным подчинением серверному заголовку retry\_after.

## **Сквозной конвейер доставки и архитектура очередей**

Система разделена на пять слабосвязанных этапов, взаимодействующих через постоянные буферы. Подобная декомпозиция защищает реляционную базу данных от прямого воздействия нестабильности внешней сети и гарантирует доставку по модели at-least-once с сохранением строгой идемпотентности.

| Этап конвейера | Системный компонент | Механизм обработки | Результирующее состояние |
| :---- | :---- | :---- | :---- |
| 1\. Диспетчеризация | PostgreSQL Cron Scheduler | Ежеминутный опрос расписаний по ключу (utc\_minute, jitter\_bucket). Keyset-пагинация блоками по 5 000 строк. | Список user\_id, чье персональное окно доставки наступило в текущую минуту. |
| 2\. Буферизация задач | Ingestion Queue (Redis Streams / Arq) | Публикация легковесных сообщений BuildDigestTask(user\_id) с дедупликацией по ключу digest:{user\_id}:{date}. | Задачи равномерно распределены по воркерам сборки; дублирование исключено. |
| 3\. Сборка дайджеста | Digest Aggregator Workers | Пакетный сбор продуктов для пространств пользователя через частичный индекс (household\_id, expiration\_date). | Сформированное HTML-сообщение и компактный payload инлайн-кнопок в очереди доставки. |
| 4\. Троттлинг | Two-Tier Distributed Rate Limiter | Атомарная проверка глобального лимита (28 RPS) и локального лимита чата (1 RPS) через Redis Lua. | Выдача разрешения на отправку либо вычисление точного времени задержки задачи (backpressure). |
| 5\. Доставка в API | Transport Worker (HTTPX Client) | Асинхронный HTTP POST в метод sendMessage Telegram Bot API с перехватом кодов 429 / retry\_after. | Доставка сообщения, сохранение messag\[span\_1\](start\_span)\[span\_1\](end\_span)\[span\_4\](start\_span)\[span\_4\](end\_span)e\_id в базе данных для последующих инлайн-мутаций. |

Диспетчер планировщика полностью изолирован от формирования содержимого сообщений: его ответственность сведена к извлечению идентификаторов пользователей и немедленной передаче задач в очередь буферизации. Воркеры агрегации параллельно собирают данные из PostgreSQL и передают сформированный payload воркерам доставки. Транспортный пул взаимодействует исключительно с Telegram Bot API, подчиняясь сигналам распределенного ограничителя скорости.

## **Расписание, часовые пояса и сглаживание пиковых нагрузок**

Физическая привязка продукта к общему пространству (холодильнику) исключает возможность связывания времени отправки с самим объектом продукта. Продукт хранится в общем пространстве (household\_id), тогда как окно доставки является сугубо персональной настройкой учетной записи пользователя (user\_id). Продукт характеризуется календарным сроком окончания пригодности типа DATE. Уведомление генерируется не по факту наступления полночи в часовом поясе холодильника, а в момент наступления локального окна доставки конкретного пользователя.

Динамическое применение выражений вида AT TIME ZONE к миллионам записей в рамках ежеминутного опроса неминуемо перегружает процессор и приводит к последовательному сканированию таблицы учетных записей. Для обеспечения масштабируемости сутки разбиваются на 1440 дискретных минутных интервалов (M \\in \[0, 1439\]). Локальное время пользователя, выраженное в минутах от полуночи (T\_{\\text{local}} \= \\text{hours} \\times 60 \+ \\text{minutes}), транслируется в фиксированное смещение относительно нулевого меридиана. В таблицу пользователей добавляется денормализованное поле notification\_utc\_minute:

M\_{\\text{utc}} \= (T\_{\\text{local}} \- \\Delta\_{\\text{offset}}) \\pmod{1440}

Поскольку переход на летнее и зимнее время (DST) изменяет смещение \\Delta\_{\\text{offset}}, низкоприоритетный фоновый процесс выполняет перерасчет поля notification\_utc\_minute один раз в сутки в 00:00 UTC для всех пользователей, используя официальные таблицы часовых поясов IANA.

Концентрация пользователей в крупных часовых поясах (например, UTC+3) формирует критический пик в 09:00 по локальному времени (06:00 UTC). При базе в 600 000 пользователей данного региона одномоментное создание задач привело бы к переполнению очередей. Исходя из глобального ограничения платформы в 30 сообщений в секунду, минимальное физическое время отправки такого объема составляет:

T \= \\frac{600\\,000}{30} \= 20\\,000 \\text{ с} \\approx 5.55 \\text{ ч}

Для ликвидации «эффекта начала часа» применяется детерминированный псевдослучайный джиттер на основе хеша идентификатора пользователя. Каждому пользователю назначается постоянный сдвиг отправки внутри 15-минутного интервала (W \= 900 секунд):

J \= \\text{hash32}(\\text{user\\\_id}) \\pmod{900}

Сдвиг J, переведенный в минуты (J\_{\\text{min}} \= \\lfloor J / 60 \\rfloor), суммируется с базовой минутой отправки. За счет этого единовременный спайк в 600 000 пользователей равномерно размывается по 15 минутным слотам (по 40 000 пользователей в минуту). Интенсивность поступления задач в очередь стабилизируется на уровне:

\\lambda \= \\frac{40\\,000}{60} \\approx 666 \\text{ задач/с}

Такой объем задач плавно распределяется по воркерам агрегации и вычитывается транспортным пулом со скоростью, соответствующей лимитам API.

## **Моделирование схемы PostgreSQL и выборка данных без Full Table Scan**

Таблица позиций продуктов аккумулирует миллионы записей, однако в конкретные сутки обработки требуют лишь доли процента от общего массива данных. Классические запросы с фильтрацией по дате и последующим объединением таблиц приводят к деградации СУБД при отсутствии узкоспециализированных индексов.

### **Схема реляционных связей и частичные индексы**

Записи продуктов связываются с пространствами хранения через внешний ключ. Для отсечения неактуальных позиций (уже списанных или употребленных продуктов) создается частичный композитный индекс, индексирующий исключительно активные записи:

`CREATE TYPE product_status AS ENUM ('active', 'consumed', 'discarded');`

`CREATE TABLE households (`  
&nbsp;&nbsp;&nbsp;&nbsp;`id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
&nbsp;&nbsp;&nbsp;&nbsp;`name VARCHAR(128) NOT NULL,`  
&nbsp;&nbsp;&nbsp;&nbsp;`created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`  
`);`

`CREATE TABLE users (`  
&nbsp;&nbsp;&nbsp;&nbsp;`id BIGINT PRIMARY KEY, -- Telegram User ID`  
&nbsp;&nbsp;&nbsp;&nbsp;`chat_id BIGINT NOT NULL,`  
&nbsp;&nbsp;&nbsp;&nbsp;`timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',`  
&nbsp;&nbsp;&nbsp;&nbsp;`preferred_delivery_time TIME NOT NULL DEFAULT '09:00:00',`  
&nbsp;&nbsp;&nbsp;&nbsp;`notification_utc_minute SMALLINT NOT NULL,`  
&nbsp;&nbsp;&nbsp;&nbsp;`is_active BOOLEAN NOT NULL DEFAULT TRUE,`  
&nbsp;&nbsp;&nbsp;&nbsp;`created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`  
`);`

`CREATE TABLE household_members (`  
&nbsp;&nbsp;&nbsp;&nbsp;`household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,`  
&nbsp;&nbsp;&nbsp;&nbsp;`user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,`  
&nbsp;&nbsp;&nbsp;&nbsp;`PRIMARY KEY (household_id, user_id)`  
`);`

`CREATE TABLE products (`  
&nbsp;&nbsp;&nbsp;&nbsp;`id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
&nbsp;&nbsp;&nbsp;&nbsp;`household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,`  
&nbsp;&nbsp;&nbsp;&nbsp;`name VARCHAR(255) NOT NULL,`  
&nbsp;&nbsp;&nbsp;&nbsp;`expiration_date DATE NOT NULL,`  
&nbsp;&nbsp;&nbsp;&nbsp;`status product_status NOT NULL DEFAULT 'active',`  
&nbsp;&nbsp;&nbsp;&nbsp;`created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`  
`);`

`-- Индекс для диспетчеризации слотов отправки пользователей`  
`CREATE INDEX idx_users_minute_active`&nbsp;  
`ON users (notification_utc_minute, id)`&nbsp;  
`WHERE is_active = TRUE;`

`-- Индекс для связи участников и пространств`  
`CREATE INDEX idx_household_members_user_fk`&nbsp;  
`ON household_members (user_id, household_id);`

`-- Частичный индекс выборки активных продуктов по пространствам`  
`CREATE INDEX idx_products_active_exp`&nbsp;  
`ON products (household_id, expiration_date)`&nbsp;  
`WHERE status = 'active';`

При масштабировании таблицы products свыше 50 миллионов строк применяется декларативное секционирование по диапазонам дат (PARTITION BY RANGE (expiration\_date)) с шагом в один месяц. Старые секции отключаются и переводятся в архив, что полностью защищает рабочие индексы от деградации кэша в оперативной памяти (Shared Buffers).

### **Двухэтапная пакетная выборка через Keyset-пагинацию**

Использование оператора OFFSET на больших объемах приводит к последовательному чтению всех предшествующих строк, вызывая квадратичную сложность O(N^2). Диспетчер планировщика производит чтение порциями по 5 000 строк с использованием детерминированного курсора по первичному ключу id:

`-- Шаг 1: Извлечение пачки целевых пользователей диспетчером`  
`SELECT id, chat_id`  
`FROM users`  
`WHERE is_active = TRUE`&nbsp;  
&nbsp;&nbsp;`AND notification_utc_minute = :target_minute`  
&nbsp;&nbsp;`AND id > :cursor_user_id`  
`ORDER BY id ASC`  
`LIMIT 5000;`

Воркеры сборки дайджестов получают пачку user\_id, извлекают соответствующие им household\_id и выполняют один агрегирующий запрос к таблице products. Запрос транслируется оптимизатором PostgreSQL в эффективный Index Scan по индексу idx\_products\_active\_exp:

`-- Шаг 2: Извлечение позиций с истекающим сроком годности`  
`SELECT`&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;`p.household_id,`  
&nbsp;&nbsp;&nbsp;&nbsp;`p.id AS product_id,`  
&nbsp;&nbsp;&nbsp;&nbsp;`p.name,`  
&nbsp;&nbsp;&nbsp;&nbsp;`p.expiration_date,`  
&nbsp;&nbsp;&nbsp;&nbsp;`(p.expiration_date - :current_local_date) AS days_left`  
`FROM products p`  
`WHERE p.household_id = ANY(:household_ids_list)`  
&nbsp;&nbsp;`AND p.status = 'active'`  
&nbsp;&nbsp;`AND p.expiration_date <= (:current_local_date + INTERVAL '2 days')`  
`ORDER BY p.household_id, p.expiration_date ASC;`

Данный алгоритм гарантированно отсекает весь массив долгохранящихся продуктов и передает воркеру плоский набор данных, трансформируемый в структуры дайджеста в оперативной памяти.

## **Сравнительный анализ брокеров очередей и оркестраторов**

Выбор механизма буферизации определяет устойчивость системы при пиковых всплесках и накладные расходы на инфраструктуру при миллионных объемах задач.

| Критерий | Arq (AsyncIO \+ Redis) | Celery (RabbitMQ / Redis) | Temporal | PG-Boss (PostgreSQL) |
| :---- | :---- | :---- | :---- | :---- |
| Архитектурная модель | Нативный асинхронный цикл событий поверх структур Redis. | Мультипроцессинг с пулом процессов поверх внешнего брокера. | Event-Sourcing оркестратор долгоживущих распределенных саг. | Движок очередей на базе конкурентных блокировок PostgreSQL (FOR UPDATE SKIP LOCKED). |
| Пропускная способность | До 25 000–30 000 легковесных задач в секунду на узел. | 1 500–4 000 задач в секунду. Ограничена блокирующим вводом-выводом воркеров. | 500–2 000 переходов состояний в секунду. Высокая нагрузка на gRPC и историю шагов. | 1 000–3 000 задач в секунду. Упирается в I/O диска, лог WAL и транзакционный оверхед. |
| Гарантии доставки | At-least-once при настройке job\_timeout и отложенных задач. | At-least-once, однако при падении воркеров без acks\_late=True возможна потеря сообщений. | Строго детерминированное выполнение (Durable Execution) с гарантией Exactly-once на шагах бизнес-логики. | At-least-once с поддержкой единой транзакции базы данных (паттерн Transactional Outbox). |
| Инфраструктурный след | Минимальный: субмиллисекундная обработка в RAM Redis. | Высокий: требует администрирования брокера и тяжелых фоновых воркеров. | Критический: требует поддержки кластера сервисов Temporal (Frontend, History, Matching) и внешней БД. | Опасный: вызывает раздувание (bloat) системных таблиц PostgreSQL и исчерпание пула соединений. |
| Управление бэкпрешером | Нативное через сортированные множества Redis (ZSET) для отложенных задач. | Ограниченное: ETA-задачи перегружают оперативную память воркеров. | Развитое: встроенные долговечные таймеры без удержания потоков. | Удовлетворительное: задержки вычисляются по индексированному полю времени запуска. |
| Применимость в задаче | Идеальное решение для I/O-bound сетевой доставки дайджестов в Telegram. | Избыточен; неэффективен для чисто сетевых асинхронных задач рассылки. | Избыточен для коротких задач доставки (sub-second jobs); неоправданные затраты на оркестрацию. | Непригоден для миллионных очередей нотификаций из\-за деградации основной СУБД. |

Анализ показывает, что PG-Boss создает критические риски для транзакционной СУБД под нагрузкой из\-за постоянной перезаписи строк очереди и генерации WAL. Temporal незаменим для распределенных бизнес-транзакций (например, в процессах оплаты), однако на коротких сетевых операциях отправки сообщений его накладные расходы на запись истории переходов избыточны. Celery страдает от рассинхронизации механизмов упреждающей выборки (prefetch) и неэффективного расхода памяти в сценариях ожидания ответов внешнего API. Оптимальным выбором является Arq (или сырые Redis Streams), обеспечивающий максимальную пропускную способность ввода-вывода при минимальном расходе вычислительных ресурсов.

## **Механика лимитов Telegram Bot API и двухфакторный Token Bucket**

Сетевой транспорт платформы Telegram защищен многоуровневой системой ограничения трафика, нарушение которой приводит к принудительной изоляции бота.

Исходящий шлюз подчиняется следующим правилам:

> * Глобальное ограничение: бот не может отправлять более 30 сообщений в секунду суммарно по всем адресатам. Кратковременные всплески сглаживаются серверами Telegram, однако продолжительный поток выше 30 RPS вызывает глобальную блокировку по коду HTTP 429\.  
> * Ограничение на диалог: отправка в конкретный приватный чат с пользователем лимитирована 1 сообщением в секунду. Попытка отправить серию сообщений одному пользователю подряд гарантированно отклоняется.  
> * Ограничение на группы: частота сообщений в групповые чаты и каналы ограничена 20 сообщениями в минуту.  
> * Механизм платного вещания (allow\_paid\_broadcast): платформа предоставляет техническую возможность поднять порог до 1000 сообщений в секунду с оплатой 0.1 Telegram Stars за каждое доставленное сообщение, однако для стандартных сервисных дайджестов данная схема экономически нецелесообразна.

Для соблюдения этих требований в распределенной среде необходим централизованный двухфакторный ограничитель скорости. Решение на базе атомарного скрипта Redis Lua проверяет доступность емкости одновременно в глобальном бакете и в бакете конкретного чата. Глобальный лимит конфигурируется с консервативным запасом на уровне 25–28 RPS для компенсации сетевой задержки, а локальный — строго на уровне 1 RPS.

При возникновении непредвиденной ошибки HTTP 429 тело ответа всегда содержит параметр parameters.retry\_after, задающий время ожидания в секундах. Система обязана воспринимать это значение как абсолютную инструкцию: на указанный срок активируется распределенный прерыватель цепи (Circuit Breaker), который немедленно останавливает отправку всех исходящих пакетов, защищая бота от расширения окна бана. Повторная отправка отклоненного пакета планируется по алгоритму экспоненциальной задержки с добавлением случайного джиттера.

## **Агрегация данных дайджеста и протокол инлайн-мутаций**

Трансляция отдельных сообщений на каждый продукт недопустима: помимо перегрузки пользователя, это моментально нарушает локальный лимит чата в 1 RPS. Данные объединяются в единый дайджест, ранжированный по степени критичности сроков годности.

Форматирование дайджеста выполняется в стандарте HTML, поскольку синтаксис MarkdownV2 требует экранирования 18 зарезервированных символов и регулярно дает сбои при обработке пользовательских названий продуктов с дефисами или скобками. Продукты группируются по двум основным блокам: критические позиции со сроком истечения сегодня или в прошлом, и предупреждающие позиции со сроком истечения через 1–2 дня:

`<b>Сводка по холодильнику: Основной</b>`  
`<i>24 октября</i>`

`🔴 <b>Срочно (сегодня):</b>`  
`• Йогурт греческий — <i>употребить сегодня</i>`  
`• Молоко 3.2% — <b>срок истек!</b>`

`🟡 <b>Скоро (1–2 дня):</b>`  
`• Сыр Чеддер — <i>остался 1 день</i>`  
`• Индейка филе — <i>осталось 2 дня</i>`

`<i>Действия с продуктами:</i>`

Под сообщением формируется инлайн-клавиатура для быстрого изменения статуса. Длина поля callback\_data в Telegram API жестко ограничена 64 байтами, что исключает передачу сложных структур. Протокол взаимодействия кодируется компактным строковым форматом \<действие\>:\<id\_продукта\>, например: c:8492019 (c — consumed, съедено), w:8492019 (w — wasted, выброшено).

При нажатии инлайн-кнопки бот производит следующие операции:

> 1. Вызывает метод answerCallbackQuery в пределах 1.5 секунд для отключения индикатора загрузки на клиенте.  
> 2. Фиксирует изменение статуса позиции в базе данных с проверкой текущего состояния:  
>    `UPDATE products`&nbsp;  
>    `SET status = 'consumed'`&nbsp;  
>    `WHERE id = :product_id AND status = 'active';`

> 3. Выполняет редактирование исходного сообщения через метод editMessageText: вычеркивает обработанную позицию с помощью тега \<s\>, а соответствующую строку кнопок удаляет из разметки клавиатуры. Если все продукты обработаны, сообщение обновляется финальным статусом: «Все продукты успешно списаны».

## **Асинхронный клиент с распределенным ограничением частоты запросов**

Ниже приведена промышленная реализация клиента для взаимодействия с Telegram Bot API на базе Python 3.11+, асинхронного HTTP-клиента httpx и redis.asyncio. Клиент реализует атомарную двухфакторную валидацию квот в Redis через Token Bucket, глобальный Circuit Breaker для синхронизации воркеров и экспоненциальный бэкофф с джиттером.

`from __future__ import annotations`

`import asyncio`  
`import logging`  
`import random`  
`import time`  
`from typing import Any, Dict, Optional`  
`import httpx`  
`import redis.asyncio as aioredis`  
`from redis.asyncio.client import Script`

`logger = logging.getLogger("telegram_transport")`

`LUA_TOKEN_BUCKET = """`  
`local global_key = KEYS[1]`  
`local chat_key   = KEYS[2]`

`local now         = tonumber(ARGV[1])`  
`local global_cap  = tonumber(ARGV[2])`  
`local global_rate = tonumber(ARGV[3])`  
`local chat_cap    = tonumber(ARGV[4])`  
`local chat_rate   = tonumber(ARGV[5])`

`local function update_bucket(key, cap, rate)`  
&nbsp;&nbsp;&nbsp;&nbsp;`local data = redis.call('HMGET', key, 'tokens', 'last_updated')`  
&nbsp;&nbsp;&nbsp;&nbsp;`local tokens = tonumber(data[1])`  
&nbsp;&nbsp;&nbsp;&nbsp;`local last_updated = tonumber(data[2])`

&nbsp;&nbsp;&nbsp;&nbsp;`if not tokens then`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`tokens = cap`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`last_updated = now`  
&nbsp;&nbsp;&nbsp;&nbsp;`else`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`local delta = math.max(0, now - last_updated)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`tokens = math.min(cap, tokens + delta * rate)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`last_updated = now`  
&nbsp;&nbsp;&nbsp;&nbsp;`end`  
&nbsp;&nbsp;&nbsp;&nbsp;`return {tokens = tokens, last_updated = last_updated}`  
`end`

`local g = update_bucket(global_key, global_cap, global_rate)`  
`local c = update_bucket(chat_key, chat_cap, chat_rate)`

`if g.tokens < 1.0 then`  
&nbsp;&nbsp;&nbsp;&nbsp;`local wait_sec = (1.0 - g.tokens) / global_rate`  
&nbsp;&nbsp;&nbsp;&nbsp;`return {0, math.ceil(wait_sec * 1000)}`  
`end`

`if c.tokens < 1.0 then`  
&nbsp;&nbsp;&nbsp;&nbsp;`local wait_sec = (1.0 - c.tokens) / chat_rate`  
&nbsp;&nbsp;&nbsp;&nbsp;`return {0, math.ceil(wait_sec * 1000)}`  
`end`

`g.tokens = g.tokens - 1.0`  
`c.tokens = c.tokens - 1.0`

`redis.call('HMSET', global_key, 'tokens', g.tokens, 'last_updated', g.last_updated)`  
`redis.call('EXPIRE', global_key, 60)`

`redis.call('HMSET', chat_key, 'tokens', c.tokens, 'last_updated', c.last_updated)`  
`redis.call('EXPIRE', chat_key, 60)`

`return {1, 0}`  
`"""`

`class TelegramRateLimiterClient:`  
&nbsp;&nbsp;&nbsp;&nbsp;`def __init__(`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`token: str,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`redis_client: aioredis.Redis,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`global_rate_limit: float = 27.0,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`chat_rate_limit: float = 1.0,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`max_retries: int = 5,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`base_api_url: str = "https://api.telegram.org"`  
&nbsp;&nbsp;&nbsp;&nbsp;`) -> None:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self.base_url = f"{base_api_url}/bot{token}"`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self.redis = redis_client`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self.max_retries = max_retries`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self.global_rate_limit = global_rate_limit`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self.chat_rate_limit = chat_rate_limit`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self._http_client = httpx.AsyncClient(`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`timeout=httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=30.0),`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self._lua_script: Optional[Script] = None`

&nbsp;&nbsp;&nbsp;&nbsp;`async def init(self) -> None:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self._lua_script = self.redis.register_script(LUA_TOKEN_BUCKET)`

&nbsp;&nbsp;&nbsp;&nbsp;`async def _acquire_permit(self, chat_id: int) -> None:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if self._lua_script is None:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await self.init()`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`global_key = "tg:limiter:global"`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`chat_key = f"tg:limiter:chat:{chat_id}"`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`while True:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`cb_val = await self.redis.get("tg:circuit_breaker")`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if cb_val:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`wait_time = float(cb_val) - time.time()`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if wait_time > 0:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`logger.warning("Активирован Circuit Breaker. Задержка %.2f с", wait_time)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await asyncio.sleep(wait_time)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`continue`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`now = time.time()`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`result = await self._lua_script(`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`keys=[global_key, chat_key],`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`args=[now, self.global_rate_limit, self.global_rate_limit, 1.0, self.chat_rate_limit]`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`allowed, delay_ms = result[0], result[1]`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if allowed == 1:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`return`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`sleep_duration = (delay_ms / 1000.0) + random.uniform(0.01, 0.05)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await asyncio.sleep(sleep_duration)`

&nbsp;&nbsp;&nbsp;&nbsp;`async def send_message(`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`self,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`chat_id: int,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`text: str,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`reply_markup: Optional[Dict[str, Any]] = None,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`parse_mode: str = "HTML"`  
&nbsp;&nbsp;&nbsp;&nbsp;`) -> Dict[str, Any]:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`payload: Dict[str, Any] = {`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"chat_id": chat_id,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"text": text,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"parse_mode": parse_mode,`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"disable_web_page_preview": True`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`}`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if reply_markup:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`payload["reply_markup"] = reply_markup`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`url = f"{self.base_url}/sendMessage"`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`for attempt in range(1, self.max_retries + 1):`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await self._acquire_permit(chat_id)`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`try:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`response = await self._http_client.post(url, json=payload)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if response.status_code == 200:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`return response.json()`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if response.status_code == 429:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`error_data = response.json()`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`retry_after = error_data.get("parameters", {}).get("retry_after", 1)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`logger.error(`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"Лимит исчерпан (429) для chat_id %s. Серверный retry_after: %s с (попытка %d)",`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`chat_id, retry_after, attempt`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await self.redis.set(`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"tg:circuit_breaker",`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`str(time.time() + retry_after),`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`ex=retry_after + 2`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`sleep_time = retry_after + random.uniform(0.2, 0.8)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await asyncio.sleep(sleep_time)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`continue`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`if 500 <= response.status_code < 600:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`backoff = (2 ** attempt) + random.uniform(0.1, 1.0)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`logger.warning("Сбой Telegram API (%d). Повтор через %.2f с", response.status_code, backoff)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await asyncio.sleep(backoff)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`continue`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`response.raise_for_status()`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`except (httpx.TransportError, httpx.TimeoutException) as exc:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`backoff = (2 ** attempt) + random.uniform(0.1, 0.5)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`logger.warning("Сетевая ошибка при обращении к Telegram: %s. Повтор через %.2f с", exc, backoff)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await asyncio.sleep(backoff)`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`raise RuntimeError(f"Превышен лимит попыток отправки ({self.max_retries}) для адресата: {chat_id}")`

&nbsp;&nbsp;&nbsp;&nbsp;`async def close(self) -> None:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`await self._http_client.aclose()`

Архитектурная устойчивость систем нотификаций высокой интенсивности определяется не наращиванием серверных мощностей воркеров, а математически выверенным согласованием пропускной способности инфраструктуры с физическими ограничениями принимающего API. Разделение расписаний и моделей хранения, детерминированное размытие пиковых нагрузок джиттером и фильтрация данных на уровне частичных B-Tree индексов трансформируют неравномерный трафик в стабильный, легко контролируемый поток задач. Делегирование контроля задержек централизованному скрипту в Redis изолирует базу данных от внешних сетевых флуктуаций и исключает каскадные сбои при любых объемах пользовательской базы.