# **Комплексная модель безопасности мультитенантных приложений Telegram Mini Apps**

Обеспечение изоляции данных в мультитенантных приложениях Telegram Mini Apps (TMA) требует отказа от доверия клиентскому контексту и построения сквозной системы разграничения доступа на основе принципа наименьших привилегий. При совместном использовании изолированных пространств («холодильников») ключевой архитектурный вектор риска смещается от классических сетевых атак к уязвимостям авторизации уровня объекта (Broken Object Level Authorization, BOLA/IDOR). Ошибки в коде сервисного слоя, исключающие предикат принадлежности к пространству в операциях выборки или мутации данных, приводят к мгновенной компрометации смежных тенантов.

Архитектурный оптимум для парирования данного класса угроз строится на двухуровневой демаркации: сервисный слой (FastAPI Dependency Injection) выполняет гранулярный ролевой контроль операций (RBAC), тогда как ядро СУБД (PostgreSQL Row-Level Security под управлением сессионных переменных транзакции) служит неотключаемым аппаратным барьером, физически исключающим чтение или модификацию чужих записей даже при наличии логических дефектов в коде API-маршрутов. Криптографическая целостность сессий при этом обеспечивается валидацией входящего контекста Telegram initData по алгоритму HMAC-SHA256, пресечением атак повторного воспроизведения (replay attacks) и выпуском короткоживущих токенов в оперативной памяти с изоляцией сессионного состояния в Redis.

Вспомогательный контур взаимодействия — Telegram Bot API и конечные точки вебхуков — защищается криптографической верификацией заголовков X-Telegram-Bot-Api-Secret-Token, фильтрацией входящего трафика по официальным подсетям Telegram на уровне обратного прокси, защитой инвайт-ссылок хранением хэшей высокой энтропии и многоуровневым ограничением частоты запросов (Rate Limiting). Подобный подход формирует замкнутый доверенный контур от среды исполнения Telegram WebView до дисковой подсистемы базы данных.

## **Матрица угроз безопасности по стандартам OWASP**

Специфика TMA проистекает из гибридной природы клиента: веб\-приложение функционирует внутри контейнера WebView на мобильных устройствах или в изолированном \<iframe\> десктопной веб\-версии мессенджера, взаимодействуя одновременно с серверами Telegram и собственным бэкендом. Ниже систематизированы критические векторы атак, сопоставленные с классификаторами OWASP Top 10 и OWASP API Security Top 10\.

| Идентификатор | Категория OWASP | Вектор атаки и механика реализации | Воздействие на систему | Архитектурные меры нейтрализации |
| :---- | :---- | :---- | :---- | :---- |
| **THR-01: Cross-Tenant Data Access (BOLA)** | API1:2023 / A01:2021 | Манипуляция идентификаторами space\_id или item\_id в REST-запросах авторизованным пользователем смежного пространства. | Несанкционированное чтение, модификация или полное удаление чужих записей тенанта. | Активация PostgreSQL RLS (FORCE ROW LEVEL SECURITY) в связке с предпроверкой прав в FastAPI Dependency. |
| **THR-02: initData Cryptographic Forgery** | API2:2023 / A07:2021 | Эксплуатация initDataUnsafe, использование некорректного алгоритма деривации HMAC или подмена идентификатора пользователя. | Полный захват произвольной учетной записи (Account Takeover) путем передачи фиктивного user.id. | Вычисление HMAC-SHA256 с константой b"WebAppData", константное сравнение дайджестов compare\_digest. |
| **THR-03: Replay of Signed Launch Data** | API2:2023 / A07:2021 | Перехват легитимной строки initData и ее многократная повторная отправка для несанкционированного входа. | Неограниченная по времени аутентификация в обход завершения сессии легитимным пользователем. | Контроль параметра auth\_date (\\le 300 с), отсечение опережения часов, атомарное кэширование jti/хэша в Redis. |
| **THR-04: Tenant Leak via Connection Pool** | API8:2023 / A05:2021 | Установка переменной SET app.tenant\_id в пулере PgBouncer (pool\_mode \= transaction); сохранение контекста для чужого клиента. | Межпользовательская утечка данных внутри пула соединений без явных признаков взлома. | Применение исключительно транзакционной директивы SET LOCAL либо set\_config(..., true). |
| **THR-05: Invite Token Brute-Force** | API4:2023 / A05:2021 | Автоматизированный перебор инвайт-токенов низкой энтропии или отсутствие лимитов на эндпоинте активации. | Неконтролируемое внедрение неавторизованных субъектов в приватные пространства. | Генерация CSPRNG токенов (\\ge 130 бит энтропии), хранение в виде SHA-256 (Hash-at-Rest), атомарный счетчик использований. |
| **THR-06: Webhook Impersonation** | API7:2023 / A10:2021 | Отправка поддельных HTTP POST запросов обновлений на URL вебхука бота со сторонних IP-адресов. | Эмуляция команд бота, фальсификация действий пользователей, проведение L7 DoS-атак. | Валидация заголовка X-Telegram-Bot-Api-Secret-Token и сетевой allowlist официальных CIDR Telegram. |
| **THR-07: Bot API 8.0 Signature Collision** | API8:2023 / A05:2021 | Наличие параметра signature в initData, ломающее каноническую конкатенацию строки проверки хэша. | Отказ в обслуживании (DoS) и сбой аутентификации для клиентов современных версий Telegram. | Исключение параметров hash и signature перед лексикографической сортировкой data\_check\_string. |
| **THR-08: Privilege Escalation in Space** | API5:2023 / A01:2021 | Исполнение административных действий (удаление холодильника, смена ролей) участником с правами viewer. | Нарушение целостности и доступности общего ресурса, саботаж прав владения. | Декларативная матрица прав на базе RBAC в FastAPI Dependency перед передачей управления обработчику. |

## **Криптографическая валидация Telegram initData и управление сессионным контекстом**

### **Механика деривации HMAC-SHA256 и скрытые векторы атак**

Процедура криптографической аутентификации в Telegram Mini Apps фундаментально отличается от стандартного протокола OAuth2: клиент передает бэкенду сформированную серверами Telegram строку параметров initData, содержащую метаданные среды, строковый JSON-объект пользователя, временную метку auth\_date и контрольный дайджест hash.

Основная критическая ошибка реализации алгоритма проверки — некорректная деривация секретного ключа. Спецификация Telegram требует двухступенчатого вычисления: секретный ключ генерируется посредством алгоритма HMAC-SHA256, где ключом хеширования выступает константная строка в байтовом представлении b"WebAppData", а подписываемым сообщением — токен бота, полученный от @BotFather. Интуитивная попытка использовать сам токен бота в качестве ключа HMAC, равно как и вычисление простого дайджеста \\text{SHA256}(\\text{bot\\\_token}) (применяемого в устаревшем Telegram Login Widget), приводит к систематическому несовпадению подписи и неработоспособности сервиса.

Секретный ключ вычисляется единожды при старте приложения:

\\text{SecretKey} \= \\text{HMAC-SHA256}(\\text{key} \= \\text{"WebAppData"}, \\text{msg} \= \\text{bot\\\_token})

Формирование строки проверки (data\_check\_string) подчиняется строгим правилам:

> * Исходная query-строка парсится на пары «ключ-значение» с обязательным декодированием URL-последовательностей.  
> * Из набора параметров исключается контрольное поле hash.  
> * Начиная с Telegram Bot API 8.0, клиенты могут отправлять поле signature (Ed25519-подпись третьей стороны). Данный параметр **в обязательном порядке** должен исключаться из набора данных перед формированием проверочной строки, иначе расчет HMAC завершится фатальным несовпадением.  
> * Оставшиеся пары сортируются в строгом алфавитном порядке по имени ключа.  
> * Элементы объединяются через символ переноса строки \\n в формате key=value.

Итоговый проверочный дайджест вычисляется по формуле:

\\text{ComputedHash} \= \\text{HMAC-SHA256}(\\text{key} \= \\text{SecretKey}, \\text{msg} \= \\text{data\\\_check\\\_string})

Сравнение полученного шестнадцатеричного значения с переданным параметром hash должно производиться строго через алгоритмы константного времени (hmac.compare\_digest), нивелирующие атаки по сторонним каналам (Timing Attacks).

Неочевидные векторы компрометации на этапе верификации:

> * **Дрейф сериализации JSON (JSON Serialization Drift):** Параметр user представляет собой сериализованный JSON-объект. Если бэкенд производит предварительную десериализацию JSON в структуру данных языка с последующей обратной сериализацией в строку для включения в data\_check\_string, порядок ключей, отступы и правила экранирования многобайтовых символов Unicode неизбежно изменятся. Это сделает невозможным вход для пользователей с нестандартными символами в именах. Сырое строковое значение поля user после декодирования URL должно подставляться в проверочную строку без малейших модификаций.  
> * **Атаки повторного воспроизведения (Replay Attacks):** Валидная криптографическая подпись подтверждает целостность данных в момент выпуска сервером Telegram, но сама по себе не ограничивает срок их применения. Сервер обязан проверять метку времени auth\_date: окно допустимости для первичного обмена не должно превышать 300 секунд. Также обязательна проверка опережения системного времени (Clock Skew): при \\text{auth\\\_date} \- \\text{current\\\_time} \> 60 запрос признается аномальным и отклоняется.  
> * **Многократный обмен (Nonce / Query-ID Tracking):** В рамках допустимого 300-секундного окна злоумышленник, перехвативший initData через логи обратного прокси или вредоносное расширение, может использовать ее повторно. Для исключения этой возможности уникальный идентификатор сессии запуска (query\_id, либо значение hash, если запуск произведен из вложений) должен атомарно регистрироваться в Redis с TTL, равным окну устаревания.

### **Жизненный цикл сессии в гетерогенных средах WebView и iframe**

Организация постоянной пользовательской сессии после валидации initData сталкивается с жесткими ограничениями сред рендеринга TMA:

> * В мобильных клиентах (iOS, Android) Mini App исполняется во встроенном системном веб\-контейнере. В операционной системе iOS движок WebKit регулярно производит автоматическую очистку локального хранилища (localStorage) и баз данных IndexedDB при нехватке памяти или перезапуске процесса приложения, что приводит к внезапной потере авторизации пользователем.  
> * В десктопной веб\-версии Telegram (web.telegram.org) приложение загружается внутри изолированного \<iframe\>. Современные механизмы защиты приватности (Safari Intelligent Tracking Prevention, Chrome Privacy Sandbox) по умолчанию блокируют сторонние куки (Third-Party Cookies) в изолированных фреймах, делая стандартную схему авторизации через cookies неработоспособной.

Для преодоления этих ограничений внедряется **двухтокеновая архитектура с поддержкой стандарта CHIPS (Cookies Having Independent Partitioned State)**:

> 1. **Первичный обмен:** Клиент отправляет сырую строку initData в заголовке X-Telegram-Init-Data на защищенный эндпоинт /api/v1/auth/exchange.  
> 2. **Выпуск токенов:**  
   * **Access Token:** Короткоживущий JWT (время жизни 15 минут), содержащий внутренний user\_id, текущую активную роль в системе и уникальный идентификатор jti. Токен возвращается в теле JSON-ответа и удерживается фронтендом **исключительно в оперативной памяти** (State Management), что исключает его компрометацию через постоянные хранилища при XSS-атаках.  
   * **Refresh Token:** Криптографически стойкая случайная строка высокой энтропии (время жизни 14 дней). Передается через заголовок ответа Set-Cookie с атрибутами HttpOnly; Secure; SameSite=None; Partitioned; Path=/api/v1/auth. Атрибут Partitioned указывает браузеру сохранять куки в изолированном контексте родительского домена web.telegram.org, восстанавливая работоспособность механизма в cross-origin iframe.  
> 3. **Резервное хранение в CloudStorage:** В средах, где сторонние куки заблокированы на уровне политик ОС, клиентское приложение дублирует хранение Refresh Token через защищенный нативный API мессенджера Telegram.WebApp.CloudStorage, передавая его в служебном заголовке X-Refresh-Token при вызове процедуры ротации.  
> 4. **Реестр сессий в Redis:** При каждом выпуске токенов в Redis создается запись session:{user\_id}:{session\_id}. При вызове операции деавторизации («Выйти со всех устройств») или изменении ролей пользователя в тенанте запись удаляется, что мгновенно аннулирует возможность использования Refresh Token и обеспечивает быструю инвалидацию скомпрометированных сессий.

## **Проверенная реализация верификации initData на FastAPI**

Ниже представлен законченный программный модуль валидации сессий Telegram для Python 3.11+ / FastAPI, обрабатывающий спецификацию Bot API 8.0, предотвращающий дрейф сериализации и блокирующий атаки повторного использования через Redis.

import hmac  
import hashlib  
import json  
import time  
import urllib.parse  
from typing import Optional  
from pydantic import BaseModel, ValidationError  
from fas\[span\_59\](start\_span)\[span\_59\](end\_span)tapi import FastAPI, HTTPException, status, Header  
import redis.asyncio as aioredis

app \= FastAPI(title="TMA Security Gateway", version="1.0.0")

\# Инициализация асинхронного клиента Redis  
redis\_client \= aioredis.from\_url("redis://localhost:6379/0", decode\_responses=True)

\# Секретный токен бота Telegram  
BOT\_TOKEN \= "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ\_SECURE\_TOKEN"

\# Предварительный расчет секретного ключа по алгоритму спецификации Telegram  
TELEGRAM\_SECRET\_KEY \= hmac.new(  
&nbsp;&nbsp;&nbsp;&nbsp;key=b"WebAppData",  
&nbsp;&nbsp;&nbsp;&nbsp;msg=BOT\_TOKEN.encode("utf-8"),  
&nbsp;&nbsp;&nbsp;&nbsp;digestmod=hashlib.sha256  
).digest()

class TelegramUser(BaseModel):  
&nbsp;&nbsp;&nbsp;&nbsp;id: int  
&nbsp;&nbsp;&nbsp;&nbsp;first\_name: str  
&nbsp;&nbsp;&nbsp;&nbsp;last\_name: Optional\[str\] \= None  
&nbsp;&nbsp;&nbsp;&nbsp;username: Optional\[str\] \= None  
&nbsp;&nbsp;&nbsp;&nbsp;language\_code: Optional\[str\] \= None  
&nbsp;&nbsp;&nbsp;&nbsp;is\_premium: Optional\[bool\] \= False

class ValidatedSessionContext(BaseModel):  
&nbsp;&nbsp;&nbsp;&nbsp;query\_id: Optional\[str\] \= None  
&nbsp;&nbsp;&nbsp;&nbsp;user: TelegramUser  
&nbsp;&nbsp;&nbsp;&nbsp;auth\_date: int  
&nbsp;&nbsp;&nbsp;&nbsp;hash: str

class TokenExchangeResponse(BaseModel):  
&nbsp;&nbsp;&nbsp;&nbsp;access\_token: str  
&nbsp;&nbsp;&nbsp;&nbsp;token\_type: str \= "Bearer"  
&nbsp;&nbsp;&nbsp;&nbsp;expires\_in: int

def verify\_telegram\_init\_data(  
&nbsp;&nbsp;&nbsp;&nbsp;raw\_init\_data: str,  
&nbsp;&nbsp;&nbsp;&nbsp;secret\_key: bytes,  
&nbsp;&nbsp;&nbsp;&nbsp;max\_age\_seconds: int \= 300,  
&nbsp;&nbsp;&nbsp;&nbsp;max\_clock\_skew: int \= 60  
) \-\> ValidatedSessionContext:  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;Выполняет криптографическую валидацию строки Telegram initData.  
&nbsp;&nbsp;&nbsp;&nbsp;Исключает поля 'hash' и 'signature' (Bot API 8.0), сверяет HMAC в константном  
&nbsp;&nbsp;&nbsp;&nbsp;времени и предотвращает использование устаревших данных.  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;try:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;parsed\_qsl \= urllib.parse.parse\_qsl(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raw\_init\_data,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;keep\_blank\_values=True,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;strict\_parsing=True  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)  
&nbsp;&nbsp;&nbsp;&nbsp;except ValueError:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_400\_BAD\_REQUEST,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Malformed initData query string"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;params \= dict(parsed\_qsl)  
&nbsp;&nbsp;&nbsp;&nbsp;received\_hash \= params.get("hash")  
&nbsp;&nbsp;&nbsp;&nbsp;if not received\_hash:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_401\_UNAUTHORIZED,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Missing required hash parameter"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;\# Bot API 8.0+: исключаем 'hash' и 'signature' из проверочной строки  
&nbsp;&nbsp;&nbsp;&nbsp;filtered\_pairs \= \[  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(k, v) for k, v in parsed\_qsl&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;if k not in ("hash", "signature")  
&nbsp;&nbsp;&nbsp;&nbsp;\]  
&nbsp;&nbsp;&nbsp;&nbsp;\# Лексикографическая сортировка параметров по ключу  
&nbsp;&nbsp;&nbsp;&nbsp;sorted\_pairs \= sorted(filtered\_pairs, key=lambda item: item\[0\])  
&nbsp;&nbsp;&nbsp;&nbsp;data\_check\_string \= "\\n".join(f"{k}={v}" for k, v in sorted\_pairs)

&nbsp;&nbsp;&nbsp;&nbsp;\# Вычисление проверочного HMAC-SHA256  
&nbsp;&nbsp;&nbsp;&nbsp;calculated\_hash \= hmac.new(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;key=secret\_key,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;msg=data\_check\_string.encode("utf-8"),  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;digestmod=hashlib.sha256  
&nbsp;&nbsp;&nbsp;&nbsp;).hexdigest()

&nbsp;&nbsp;&nbsp;&nbsp;\# Сравнение за константное время против Timing Attacks  
&nbsp;&nbsp;&nbsp;&nbsp;if not hmac.compare\_digest(calculated\_hash, received\_hash):  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_401\_UNAUTHORIZED,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Invalid cryptographic signature"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;auth\_date\_raw \= params.get("auth\_date")  
&nbsp;&nbsp;&nbsp;&nbsp;if not auth\_date\_raw or not auth\_date\_raw.isdigit():  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_401\_UNAUTHORIZED,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Invalid auth\_date parameter"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;auth\_date \= int(auth\_date\_raw)  
&nbsp;&nbsp;&nbsp;&nbsp;current\_time \= int(time.time())

&nbsp;&nbsp;&nbsp;&nbsp;\# Проверка окна актуальности  
&nbsp;&nbsp;&nbsp;&nbsp;if current\_time \- auth\_date \> max\_age\_seconds:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_401\_UNAUTHORIZED,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Telegram session context has expired"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;\# Проверка опережения времени сервера  
&nbsp;&nbsp;&nbsp;&nbsp;if auth\_date \- current\_time \> max\_clock\_skew:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_401\_UNAUTHORIZED,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Clock skew detected: auth\_date is set in the future"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;user\_payload \= params.get("user")  
&nbsp;&nbsp;&nbsp;&nbsp;if not user\_payload:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_400\_BAD\_REQUEST,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Missing user field in initData"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;try:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;user\_dict \= json.loads(user\_payload)  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;user \= TelegramUser(\*\*user\_dict)  
&nbsp;&nbsp;&nbsp;&nbsp;except (json.JSONDecodeError, ValidationError):  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_400\_BAD\_REQUEST,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Invalid JSON structure in user parameter"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;return ValidatedSessionContext(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;query\_id=params.get("query\_id"),  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;user=user,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;auth\_date=auth\_date,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;hash=received\_hash  
&nbsp;&nbsp;&nbsp;&nbsp;)

@app.post("/api/v1/auth/exchange", response\_model=TokenExchangeResponse)  
async def exchange\_session\_token(  
&nbsp;&nbsp;&nbsp;&nbsp;init\_data\_raw: str \= Header(..., alias="X-Telegram-Init-Data")  
):  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;Эндпоинт аутентификации: проверяет подпись, блокирует Replay-атаки через Redis  
&nbsp;&nbsp;&nbsp;&nbsp;и возвращает короткоживущий Access Token.  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;session\_ctx \= verify\_telegram\_init\_data(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raw\_init\_data=init\_data\_raw,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;secret\_key=TELEGRAM\_SECRET\_KEY,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;max\_age\_seconds=300  
&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;\# Идентификатор дедупликации: используем query\_id либо hash  
&nbsp;&nbsp;&nbsp;&nbsp;replay\_identifier \= session\_ctx.query\_id or session\_ctx.hash  
&nbsp;&nbsp;&nbsp;&nbsp;cache\_key \= f"tma:replay:{session\_ctx.user.id}:{replay\_identifier}"

&nbsp;&nbsp;&nbsp;&nbsp;\# Атомарная фиксация маркера с TTL 300 секунд (NX \= Not Exists)  
&nbsp;&nbsp;&nbsp;&nbsp;is\_unique \= await redis\_client.set(cache\_key, "1", ex=300, nx=True)  
&nbsp;&nbsp;&nbsp;&nbsp;if not is\_unique:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_409\_CONFLICT,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Replay attack detected: initData has already been consumed"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;\# Генерация сессионного токена (в продакшене используется PyJWT с приватным RSA/ECDSA ключом)  
&nbsp;&nbsp;&nbsp;&nbsp;ephemeral\_access\_token \= f"jwt.dev.payload.{session\_ctx.user.id}.{int(time.time())}"

&nbsp;&nbsp;&nbsp;&nbsp;return TokenExchangeResponse(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;access\_token=ephemeral\_access\_token,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;expires\_in=900  
&nbsp;&nbsp;&nbsp;&nbsp;)

## **Мультитенантная защита от BOLA/IDOR: Сравнительный анализ RLS и сервисного RBAC**

Уязвимости BOLA/IDOR (Broken Object Level Authorization) возникают, когда приложение ориентируется исключительно на переданный клиентом идентификатор сущности (например, item\_id), не проверяя фактическую принадлежность этой сущности пространству авторизованного пользователя. Если в кодовой базе мультитенантного сервиса изоляция возложена только на разработчика эндпоинта, любая ошибка фильтрации приводит к несанкционированному доступу к чужим ресурсам.

### **Архитектурный выбор: Сервисный слой против Row-Level Security**

Для обеспечения абсолютной изоляции рассматриваются две конкурирующие парадигмы разграничения доступа.

| Критерий оценки | Сервисный уровень (FastAPI Dependencies / Middleware) | Ядро базы данных (PostgreSQL Row-Level Security) |
| :---- | :---- | :---- |
| **Устойчивость к человеческому фактору** | **Низкая.** Забытая зависимость Depends(check\_space) или пропуск WHERE space\_id \= ... создает уязвимость BOLA. | **Абсолютная.** Политика RLS компилируется в дерево AST каждого запроса ядром СУБД независимо от текста SQL. |
| **Централизация правил** | **Децентрализовано.** Проверки рассеяны по сотням контроллеров, сервисов и ORM-репозиториев приложения. | **Централизовано.** Правила описаны декларативно в системных каталогах СУБД через миграции. |
| **Влияние на производительность** | **Минимальное.** Однократная предпроверка прав по сессии через Redis или первичный ключ. | **Низкое при индексации.** Требует обязательных индексов по (space\_id, id) во избежание Sequential Scan при наложении фильтра. |
| **Совместимость с Transaction Pooling** | **Полная.** Не зависит от состояния низкоуровневых физических соединений пулера. | **Критическая зона.** Требует обязательного использования SET LOCAL во избежание утечки контекста. |
| **Полнота покрытия запросов** | **Ограниченная.** Не защищает от ошибок в сложных SQL-джойнах, подзапросах и агрегатных функциях. | **Сквозная.** Фильтрует любые операции (SELECT, UPDATE, DELETE, INSERT) на уровне отдельных строк. |

Оптимальная стратегия заключается в комбинировании подходов:

> 1. **FastAPI Dependency Injection:** Берет на себя проверку ролевой модели (RBAC) до начала выполнения тяжелых операций. Зависимость проверяет, состоит ли пользователь в данном пространстве и имеет ли его роль (owner, editor, viewer) право вызывать данный эндпоинт (например, мутировать номенклатуру).  
> 2. **PostgreSQL RLS:** Выступает в роли отказоустойчивого предохранителя (Fail-Safe Defense). Даже если разработчик допустит логическую ошибку и напишет запрос DELETE FROM space\_items WHERE id \= :item\_id, СУБД физически ограничит область видимости строк текущим space\_id транзакции.

### **Тонкости работы PgBouncer в режиме Transaction Pooling**

Подавляющее большинство масштабируемых инсталляций использует PgBouncer в режиме пулинга транзакций (pool\_mode \= transaction), при котором физическое соединение к СУБД возвращается в общий пул сразу после завершения команды COMMIT или ROLLBACK.

Если передача идентификатора тенанта в СУБД выполняется стандартным выражением:

\-- КРИТИЧЕСКИЙ ДЕФЕКТ БЕЗОПАСНОСТИ В TRANSACTION POOLING  
SET app.current\_space\_id \= 'c8b2a1a0-4f5b-4c7b-a1b2-c3d4e5f6a7b8';

конфигурационный параметр сохраняется в глобальном состоянии физической сессии соединения PostgreSQL. При возврате соединения в пул PgBouncer **не очищает сессионные параметры автоматически**. Следующий HTTP-запрос от совершенно другого пользователя, получивший то же физическое соединение, выполнит свои запросы с правами чужого пространства, что влечет массовую утечку приватных данных.

Для гарантированного устранения утечек контекста необходимо соблюдать три правила:

> * Применять команду SET LOCAL app.current\_space\_id \= '...' вместо SET. Конструкция SET LOCAL действует строго в границах открытого блока BEGIN ... COMMIT и автоматически сбрасывается СУБД при закрытии транзакции.  
> * Либо использовать безопасный функциональный вызов с третьим аргументом:  
>   SELECT set\_config('app.current\_space\_id', :space\_id, true);  
>   Значение is\_local \= true принудительно ограничивает время жизни переменной текущей транзакцией.  
> * Суперпользователи (SUPERUSER) и владельцы таблиц (TABLE OWNER) по умолчанию игнорируют политики RLS. Приложение обязано подключаться к БД под непривилегированной учетной записью, а на всех изолируемых таблицах должна быть выполнена директива ALTER TABLE ... FORCE ROW LEVEL SECURITY.

### **Проектирование схемы данных и авторизационного слоя**

Ниже приведен DDL-сценарий создания мультитенантной структуры с поддержкой RBAC и отказоустойчивой изоляции RLS:

\-- Создание изолированной сервисной роли приложения  
CREATE ROLE app\_runtime\_user WITH LOGIN PASSWORD 'StrictAppSecPassword\#2026';

\-- Таблица пространств (Холодильников)  
CREATE TABLE spaces (  
&nbsp;&nbsp;&nbsp;&nbsp;id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
&nbsp;&nbsp;&nbsp;&nbsp;name VARCHAR(128) NOT NULL,  
&nbsp;&nbsp;&nbsp;&nbsp;created\_at TIMESTAMPTZ DEFAULT clock\_timestamp()  
);

\-- Ролевая модель участников пространств  
CREATE TYPE space\_member\_role AS ENUM ('owner', 'edit\[span\_4\](start\_span)\[span\_4\](end\_span)\[span\_10\](start\_span)\[span\_10\](end\_span)or', 'viewer');

CREATE TABLE space\_members (  
&nbsp;&nbsp;&nbsp;&nbsp;space\_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,  
&nbsp;&nbsp;&nbsp;&nbsp;telegram\_user\_id BIGINT NOT NULL,  
&nbsp;&nbsp;&nbsp;&nbsp;role space\_member\_role NOT NULL DEFAULT 'viewer',  
&nbsp;&nbsp;&nbsp;&nbsp;joined\_at TIMESTAMPTZ DEFAULT clock\_timestamp(),  
&nbsp;&nbsp;&nbsp;&nbsp;PRIMARY KEY (space\_id, telegram\_user\_id)  
);

\-- Изолированные сущности продуктов внутри пространства  
CREATE TABLE space\_items (  
&nbsp;&nbsp;&nbsp;&nbsp;id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
&nbsp;&nbsp;&nbsp;&nbsp;space\_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,  
&nbsp;&nbsp;&nbsp;&nbsp;title VARCHAR(255) NOT NULL,  
&nbsp;&nbsp;&nbsp;&nbsp;quantity INT NOT NULL DEFAULT 1,  
&nbsp;&nbsp;&nbsp;&nbsp;created\_at TIMESTAMPTZ DEFAULT clock\_timestamp()  
);

\-- Включение и принудительное применение RLS для всех ролей  
ALTER TABLE space\_items ENABLE ROW LEVEL SECURITY;  
ALTER TABLE space\_items FORCE ROW LEVEL SECURITY;

\-- Индекс для высокопроизводительной фильтрации по тенанту  
CREATE INDEX idx\_space\_items\_tenant\_composite ON space\_items (space\_id, id);

\-- Политика изоляции строк: nullif предотвращает чтение при пустом контексте  
CREATE POLICY space\_items\_isolation\_policy ON space\_items  
&nbsp;&nbsp;&nbsp;&nbsp;FOR ALL  
&nbsp;&nbsp;&nbsp;&nbsp;TO app\_runtime\_user  
&nbsp;&nbsp;&nbsp;&nbsp;USING (  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;space\_id \= NULLIF(current\_setting('app.current\_space\_id', true), '')::uuid  
&nbsp;&nbsp;&nbsp;&nbsp;)  
&nbsp;&nbsp;&nbsp;&nbsp;WITH CHECK (  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;space\_id \= NULLIF(current\_setting('app.current\_space\_id', true), '')::uuid  
&nbsp;&nbsp;&nbsp;&nbsp;);

\-- Выдача минимально необходимых привилегий  
GRANT USAGE ON SCHEMA public TO app\_runtime\_user;  
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app\_runtime\_user;

Интеграция контекста и RBAC в FastAPI осуществляется через внедрение зависимостей:

import uuid  
from typing import Annotated  
from fastapi import APIRouter, Depends, HTTPException, status  
from sqlalchemy.ext.asyncio import AsyncSession  
from sqlalchemy import text

\# Модуль фабрики асинхронных сессий SQLAlchemy  
from database import get\_db\_session

router \= APIRouter(prefix="/spaces/{space\_id}")

class UserContext:  
&nbsp;&nbsp;&nbsp;&nbsp;def \_\_init\_\_(self, user\_id: int):  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;self.user\_id \= user\_id

class TenantMembership:  
&nbsp;&nbsp;&nbsp;&nbsp;def \_\_init\_\_(self, user\_id: int, space\_id: uuid.UUID, role: str):  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;self.user\_id \= user\_id  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;self.space\_id \= space\_id  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;self.role \= role

async def resolve\_authenticated\_user() \-\> UserContext:  
&nbsp;&nbsp;&nbsp;&nbsp;\# Заглушка валидации входящего JWT из заголовка Authorization  
&nbsp;&nbsp;&nbsp;&nbsp;return UserContext(user\_id=5167898484)

async def enforce\_space\_access(  
&nbsp;&nbsp;&nbsp;&nbsp;space\_id: uuid.UUID,  
&nbsp;&nbsp;&nbsp;&nbsp;user: Annotated\[UserContext, Depends(resolve\_authenticated\_user)\],  
&nbsp;&nbsp;&nbsp;&nbsp;db: Annotated\[AsyncSession, Depends(get\_db\_session)\]  
) \-\> TenantMembership:  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;Верифицирует членство в пространстве и безопасно привязывает  
&nbsp;&nbsp;&nbsp;&nbsp;контекст RLS к текущей транзакции для совместимости с PgBouncer.  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;\# 1\. Проверка членства и получение роли (RBAC)  
&nbsp;&nbsp;&nbsp;&nbsp;check\_membership\_sql \= text("""  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;SELECT role FROM space\_members&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;WHERE space\_id \= :space\_id AND telegram\_user\_id \= :user\_id  
&nbsp;&nbsp;&nbsp;&nbsp;""")  
&nbsp;&nbsp;&nbsp;&nbsp;result \= await db.execute(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;check\_membership\_sql,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{"space\_id": space\_id, "user\_id": user.user\_id}  
&nbsp;&nbsp;&nbsp;&nbsp;)  
&nbsp;&nbsp;&nbsp;&nbsp;role \= result.scalar\_one\_or\_none()

&nbsp;&nbsp;&nbsp;&nbsp;if not role:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_403\_FORBIDDEN,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Forbidden: User does not belong to the requested space"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;\# 2\. Инициализация транзакционного контекста RLS  
&nbsp;&nbsp;&nbsp;&nbsp;\# is\_local \= true предотвращает утечку значения в пул соединений  
&nbsp;&nbsp;&nbsp;&nbsp;await db.execute(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;text("SELECT set\_config('app.current\_space\_id', :space\_id, true)"),  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{"space\_id": str(space\_id)}  
&nbsp;&nbsp;&nbsp;&nbsp;)

&nbsp;&nbsp;&nbsp;&nbsp;return TenantMembership(user\_id=user.user\_id, space\_id=space\_id, role=role)

def require\_roles(\*allowed\_roles: str):  
&nbsp;&nbsp;&nbsp;&nbsp;"""Фабрика зависимостей для декларативного контроля прав."""  
&nbsp;&nbsp;&nbsp;&nbsp;def role\_checker(membership: Annotated\[TenantMembership, Depends(enforce\_space\_access)\]):  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;if membership.role not in allowed\_roles:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_403\_FORBIDDEN,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail=f"Action requires one of the following roles: {allowed\_roles}"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;return membership  
&nbsp;&nbsp;&nbsp;&nbsp;return role\_checker

@router.delete("/items/{item\_id}", status\_code=status.HTTP\_204\_NO\_CONTENT)  
async def delete\_item\_from\_space(  
&nbsp;&nbsp;&nbsp;&nbsp;item\_id: uuid.UUID,  
&nbsp;&nbsp;&nbsp;&nbsp;membership: Annotated\[TenantMembership, Depends(require\_roles("owner", "editor"))\],  
&nbsp;&nbsp;&nbsp;&nbsp;db: Annotated\[AsyncSession, Depends(get\_db\_session)\]  
):  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;Удаление сущности. Даже если запрос сформирован без фильтрации по space\_id,  
&nbsp;&nbsp;&nbsp;&nbsp;политика RLS заблокирует удаление продукта из чужого пространства.  
&nbsp;&nbsp;&nbsp;&nbsp;"""  
&nbsp;&nbsp;&nbsp;&nbsp;delete\_query \= text("DELETE FROM space\_items WHERE id \= :item\_id")  
&nbsp;&nbsp;&nbsp;&nbsp;result \= await db.execute(delete\_query, {"item\_id": item\_id})  
&nbsp;&nbsp;&nbsp;&nbsp;await db.commit()

&nbsp;&nbsp;&nbsp;&nbsp;if result.rowcount \== 0:  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise HTTPException(  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status\_code=status.HTTP\_404\_NOT\_FOUND,&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;detail="Item not found in current space"  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)

## **Безопасность Telegram Bot API, вебхуков и контроль сетевого периметра**

### **Аутентификация вебхуков и защита от спуфинга**

Публичный URL вебхука бота доступен для входящих сетевых пакетов из глобального интернета. Злоумышленник может инжектировать ложные обновления (Updates) для эмуляции команд пользователей. Защита периметра строится на объединении двух независимых рубежей контроля:

Во-первых, при регистрации вебхука через API-вызов setWebhook передается параметр secret\_token. Telegram направляет этот секрет в HTTP-заголовке X-Telegram-Bot-Api-Secret-Token при каждом вызове. Токен должен содержать от 1 до 256 символов (\[A-Za-z0-9\_-\]) и генерироваться через криптографически стойкий генератор случайных чисел (secrets.token\_urlsafe(32)). Проверка на уровне обработчика FastAPI производится строго в константном времени.

Во-вторых, на уровне пограничного обратного прокси (Nginx или Cloudflare WAF) трафик к эндпоинту вебхука фильтруется по белым спискам официальных диапазонов IP-адресов Telegram. Актуальный перечень CIDR-диапазонов Telegram Bot API публикуется по каналу https://core.telegram.org/resources/cidr.txt:

> * 149.154.160.0/20  
> * 91.10\[span\_62\](start\_span)\[span\_62\](end\_span)8.4.0/22

Любые запросы от адресов, не входящих в указанные подсети, сбрасываются обратным прокси на этапе TCP-соединения (return 444 в Nginx), не создавая нагрузки на интерпретатор Python.

### **Криптографическая модель генерации и активации инвайт-ссылок**

Механизм приглашения пользователей в общий холодильник является высокорисковой точкой входа. Проектирование модели инвайтов требует соблюдения строгих инвариантов:

> * **Высокая энтропия токенов:** Запрещается применение инкрементальных числовых ID, коротких кодов или хешей от имени пространства. Инвайт генерируется через CSPRNG (например, NanoID алфавита Base62 длиной не менее 22 символов либо secrets.token\_urlsafe(24)). Пространство состояний для 22 символов Base62 составляет 62^{22} \\approx 2.7 \\times 10^{39} комбинаций (\>130 бит энтропии). Вероятность успешного подбора токена при распределенной атаке со скоростью 10^8 запросов в секунду математически ничтожна.  
> * **Хранение дайджестов (Hash-at-Rest):** В базе данных токены не сохраняются в открытом виде. В таблицу помещается исключительно криптографический дайджест \\text{SHA-256}(\\text{raw\\\_token}). При утечке снимка БД злоумышленник не сможет восстановить ссылки для доступа в чужие холодильники.  
> * **Контроль срока действия (TTL) и лимит использования:** Инвайт снабжается полями expires\_at (рекомендуемый срок жизни — не более 24–48 часов), max\_uses (по умолчанию 1\) и uses\_count.  
> * **Исключение состояния гонки (Concurrency Race Conditions):** Параллельная активация одноразовой ссылки несколькими клиентами блокируется выполнением операции строго внутри транзакции с пессимистической блокировкой строки FOR UPDATE:

BEGIN;

\-- Блокировка строки токена от параллельных модификаций  
SELECT id, space\_id, uses\_count, max\_uses, expires\_at&nbsp;  
FROM space\_invites&nbsp;  
WHERE token\_hash \= :calculated\_token\_hash&nbsp;  
&nbsp;&nbsp;AND is\_revoked \= FALSE&nbsp;  
FOR UPDATE;

\-- Проверка условий валидности:  
\-- 1\. Если expires\_at \< NOW() \-\> ROLLBACK и возврат 410 Gone  
\-- 2\. Если uses\_count \>= max\_uses \-\> ROLLBACK и возврат 409 Conflict

UPDATE space\_invites&nbsp;  
SET uses\_count \= uses\_count \+ 1&nbsp;  
WHERE id \= :invite\_id;

\-- Добавление пользователя в пространство с ролью по умолчанию  
INSERT INTO space\_members (space\_id, telegram\_user\_id, role)  
VALUES (:space\_id, :target\_user\_id, 'editor')  
ON CONFLICT (space\_id, telegram\_user\_id) DO NOTHING;

COMMIT;

### **Иерархическая стратегия Rate Limiting**

Для предотвращения истощения вычислительных ресурсов СУБД, спама номенклатурой продуктов и распределенного перебора инвайтов внедряется трехуровневая система ограничения частоты запросов на базе алгоритма со скользящим окном (Sliding Window Counter) в Redis.

Атомарный Lua-скрипт гарантирует отсутствие рассинхронизации счетчиков между распределенными узлами бэкенда:

\-- rate\_limit\_sliding\_window.lua  
local key \= KEYS\[1\]  
local now \= tonumber(ARGV\[1\])  
local window \= tonumber(ARGV\[2\])  
local max\_limit \= tonumber(ARGV\[3\])  
local clear\_threshold \= now \- window

\-- Очистка записей за пределами активного временного окна  
redis.call('ZREMRANGEBYSCORE', key, 0, clear\_threshold)

local total\_requests \= redis.call('ZCARD', key)

if total\_requests \< max\_limit then  
&nbsp;&nbsp;&nbsp;&nbsp;\-- Фиксация нового запроса меткой времени  
&nbsp;&nbsp;&nbsp;&nbsp;redis.call('ZADD', key, now, now)  
&nbsp;&nbsp;&nbsp;&nbsp;redis.call('PEXPIRE', key, window)  
&nbsp;&nbsp;&nbsp;&nbsp;return 1 \-- Запрос разрешен  
else  
&nbsp;&nbsp;&nbsp;&nbsp;return 0 \-- Лимит превышен  
end

Нормативные пороги пропускной способности распределены по четырем функциональным слоям системы:

| Уровень изоляции | Идентификатор ключа лимитирования | Рекомендуемый лимит (Threshold) | Назначение и логика защиты |
| :---- | :---- | :---- | :---- |
| **L1: Global Perimeter** | rl:global:ip:{ip} | 100 запросов / сек на IP | Отражение распределенного HTTP-флудинга на уровне пограничного шлюза. |
| **L2: Per-User Tier** | rl:user:{user\_id}:api | 60 запросов / мин на пользователя | Предотвращение агрессивного скрапинга и нештатной работы фронтенд-клиента. |
| **L3: Sensitive Actions** | rl:user:{user\_id}:auth | 5 попыток / мин на действие | Эндпоинты /auth/exchange, ввод инвайтов, операции удаления пространства. |
| **L4: Per-Fridge (Tenant)** | rl:space:{space\_id}:mutations | 300 операций / мин на тенант | Защита от эффекта «шумного соседа» (Noisy Neighbor): массовый спам записями в общий холодильник. |

## **Сквозная архитектурная цепочка безопасной обработки запроса**

Конвейер обработки данных объединяет все эшелоны защиты в единую детерминированную последовательность шагов, гарантирующую валидацию контекста на каждом системном барьере.

| Этап конвейера | Компонент системы | Состояние и входные данные | Применяемый механизм защиты | Результирующее состояние безопасности |
| :---- | :---- | :---- | :---- | :---- |
| **1\. Клиентская инициализация** | Telegram Web / WebView | Запуск TMA внутри мессенджера пользователем. | Сервер Telegram формирует и подписывает launch-параметры; выставляет window.Telegram.WebApp.initData. | На клиенте сформирована криптографически подписанная строка параметров. |
| **2\. Сетевой периметр и WAF** | Пограничный Nginx / Cloudflare | Входящий HTTP-запрос к API сервиса. | Проверка TLSv1.3, сетевой фильтр IP по подсетям Telegram для вебхуков, L1 Rate Limiting по IP. | Отсечен нелегитимный трафик глобального интернета и объемный L7-флуд. |
| **3\. Аутентификационный барьер** | FastAPI Auth Subsystem | Строка \[span\_68\](start\_span)\[span\_68\](end\_span)initData в заголовке X-Telegram-Init-Data. | Расчет HMAC-SHA256, проверка auth\_date (\\le 300 с), константное сравнение, фиксация query\_id в Redis. | Защита от спуфинга и Replay-атак; клиенту выпущен короткоживущий Access Token. |
| **4\. Контроль доступа к объекту** | FastAPI Dependency (enforce\_space\_access) | Запрос DELETE /spaces/{id}/items/{id} с JWT. | Проверка подписи JWT, валидация прав пользователя в таблице space\_members по ролевой матрице RBAC. | Запрос авторизован: субъект имеет право совершать мутации в данном тенанте. |
| **5\. Инициализация транзакции** | SQLAlchemy / Пул соединений PgBouncer | Открытие транзакции в пулере соединений. | Вызов SELECT set\_config('app.current\_space\_id', :id, true) строго внутри BEGIN ... COMMIT. | Физическое соединение СУБД изолировано на уровне текущей транзакции без риска утечки в пул. |
| **6\. Выполнение запроса в СУБД** | PostgreSQL Query Engine | Произвольный SQL-запрос бизнес-логики. | Ядро СУБД применяет предикат RLS USING (space\_id \= current\_setting(...)), игнорируя попытки выхода за пределы тенанта. | Абсолютная изоляция: строки чужих пространств полностью скрыты от движка исполнения запроса. |

Построение мультитенантной архитектуры Telegram Mini Apps на основе строгой криптографической деривации входящих сессий, эшелонированного контроля ролей на уровне API-шлюза и изоляции данных посредством PostgreSQL Row-Level Security полностью нивелирует угрозы классов BOLA, IDOR и спуфинга сессионных данных. Перенос критической границы разграничения доступа непосредственно в ядро СУБД гарантирует сохранность данных даже в условиях неизбежных программных ошибок в кодовой базе отдельных микросервисов.