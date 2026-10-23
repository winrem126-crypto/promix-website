# PROMIX: подготовка SMTP и приёмка рабочей почты

23 октября 2026 года. Получатель заявок: **simkraski@mail.ru**. Это инструкция подготовки и будущей приёмки; реальная доставка на FirstVDS **NOT TESTED**. До отдельного разрешения владельца не выполнять отправку заявок с production, не менять серверную конфигурацию и DNS. В этом этапе SMTP-соединения/аутентификация/письма не выполнялись, приватные `.env`/`config.php`/пароли не читались.

## Установленный контракт

Проверены только исходники `backend/public/api/lead.php`, `backend/src/LeadMailer.php`, `LeadValidator.php`, `LeadStore.php` и публичные примеры конфигурации. Пройденные 22 октября [18/18 локальных API/SMTP и 11/11 browser → API → controlled SMTP](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/notes/backend-final.md) подтверждают код с локальным транспортом. Они **не подтверждают** доступность SMTP с FirstVDS, настоящую аутентификацию или получение письма рабочим mailbox.

- Публичный endpoint: **POST `/api/lead.php`**, JSON, максимум 32768 bytes. Никакого `/api/contact`, нового mail framework или клиентского SMTP не требуется.
- `LeadMailer` использует SMTP с authentication, UTF-8, HTML и plain-text alternative. `From: PROMIX <LEADS_FROM_EMAIL>` задаётся приватным серверным config. `To` читается только из `LEADS_TO_EMAIL`; payload посетителя не выбирает адресата. В production требуется точно `simkraski@mail.ru`.
- **Reply-To сейчас не устанавливается.** В форме нет поля email; имя/телефон нельзя подставлять как email. Отсутствующий Reply-To — ожидаемый текущий контракт: ответ почтовой программой пойдёт на From, обратная связь с клиентом — по телефону из заявки. Если бизнесу нужен другой Reply-To, требуется отдельно утвердить конкретный адрес/поле и изменение; это не скрытая настройка существующего кода.
- PHPMailer `Sender` отдельно приложением не задаётся. Фактические SMTP envelope sender/Return-Path, разрешение From и подпись DKIM зависят от transport/provider; проверить их у полученного письма. Не подменять From адресом посетителя.
- Темы: партнёрство / выбранный товар / консультация. Тело содержит непустые поля: тип обращения, имя, телефон, город, товар, код товара, комментарий, страница, источник, пять UTM, дату и Submission ID. HTML-значения экранируются. `consent=true` валидируется сервером, но отдельной строкой в письме не выводится.

## Данные от администратора почты

| Данные | Что требуется | Сейчас |
| --- | --- | --- |
| SMTP-провайдер | Mail.ru, корпоративный провайдер или согласованный relay; доступ с IP FirstVDS и лимиты | Не подтверждён |
| SMTP host / port / security | Полное имя, точный порт и SMTPS либо STARTTLS; не отключать проверку сертификата | Не подтверждены |
| Учётная запись | Полный login, разрешённый From, способ выдачи/ротации секрета | Не предоставлены |
| From | Разрешённый провайдером адрес отправителя, домен и имя PROMIX | Не подтверждён |
| To | `simkraski@mail.ru`; кто лично подтвердит получение и папку | Адрес известен; приёмка не назначена |
| SPF/DKIM/DMARC | Фактический envelope domain, From domain, DKIM d=/s=, ответственный DNS, все легитимные отправители домена | Не предоставлены |
| Политики | Rate thresholds, хранение state/логов, кампании без персональных UTM, contact при unknown | Нужны утверждения владельца |
| Разрешение теста | Окно, тестирующий, один synthetic сценарий, явное разрешение отправки на рабочий mailbox | Не получено |

**Возможный вариант, только если владелец подтверждает именно этот Mail.ru account:** `SMTP_HOST=smtp.mail.ru`, `SMTP_PORT=465`, `SMTP_SECURE=smtps`, `SMTP_USER=simkraski@mail.ru`, `LEADS_FROM_EMAIL=simkraski@mail.ru`, `LEADS_TO_EMAIL=simkraski@mail.ru`. Нужен отдельный пароль приложения, лучше с доступом только на отправку; обычный пароль почты не подходит согласно [официальной инструкции Mail](https://help.mail.ru/mail/login/mailer/). Примерные defaults проекта не являются доказательством выбранного production-провайдера или наличия credentials.

Для другого провайдера использовать его подтверждённые данные. PHPMailer различает SMTPS на 465 и STARTTLS обычно на 587; конкретную пару утверждает провайдер. [Официальный пример PHPMailer](https://github.com/PHPMailer/PHPMailer/blob/master/examples/ssl_options.phps). Не копировать из примера опции self-signed: в проекте проверки TLS не отключены.

## Имена настроек, которые действительно читает PHP

`backend/config/config.php` — приватный исполняемый config, возвращающий array. Публичный `config.example.php` читает **process environment через `getenv()`**. Корневой `.env` автоматически PHP не загружается; `MAIL_FROM`/`MAIL_TO` не являются aliases. При `clear_env=yes` в PHP-FPM нужны явно переданные `env[...]` либо приватный config, получающий секрет из согласованного серверного хранилища. Выбор должен быть отражён в фактическом pool, без вывода значений в терминал/логи.

Для выбранной в [FIRSTVDS_DEPLOY_PLAN.md](FIRSTVDS_DEPLOY_PLAN.md) схемы `backend/config/config.php` ссылается на постоянный `shared/config.php`, а `LEADS_STORAGE_PATH` явно задаётся абсолютным `/var/www/promix/shared/state`. Нельзя полагаться на относительный/default путь example при переносе adapter: `__DIR__` внутри symlink-конфига относится к его фактическому shared расположению. FPM получает allowlist окружения из защищённого EnvironmentFile; изменение наследуемого окружения требует согласованного перезапуска master после drain, а не предположения о pool reload.

| Переменная окружения → ключ PHP array | Значение / правило |
| --- | --- |
| `SMTP_HOST` → `smtp_host` | Подтверждённое имя SMTP, без URL-схемы |
| `SMTP_PORT` → `smtp_port` | 465 для утверждённого SMTPS или подтверждённый порт STARTTLS |
| `SMTP_SECURE` → `smtp_secure` | Использовать `smtps`/`ssl`/`true` или `starttls`/`tls`. В текущем `LeadMailer` ветка else задаёт `SMTPSecure=''` и `SMTPAutoTLS=false`: не требует TLS, выключает автоматический STARTTLS и допускает plaintext; для production недопустима |
| `SMTP_USER` → `smtp_user` | Подтверждённый login |
| `SMTP_PASSWORD` → `smtp_password` | Только private secret; empty/CHANGE_ME отклоняется; не Git/ZIP/CLI/history |
| `LEADS_FROM_EMAIL` → `leads_from_email` | Разрешённый адрес From |
| `LEADS_TO_EMAIL` → `leads_to_email` | **simkraski@mail.ru** |
| `SMTP_TIMEOUT_SECONDS` → `smtp_timeout_seconds` | По умолчанию 8 с, код ограничивает 1–20 с; на отдельную стадию, а не на весь запрос |
| `LEADS_STORAGE_PATH` → `storage_path` | Приватный локальный каталог вне dist/public, общий PHP workers, сохраняется между релизами |
| `LEADS_STORAGE_SECRET` → `storage_secret` | Случайный секрет ≥32 bytes, не example; постоянный между релизами |
| `LEADS_RATE_WINDOW_SECONDS` → `rate_window_seconds` | По умолчанию 900 с, допустимо 60–86400 с |
| `LEADS_RATE_CLIENT_LIMIT` → `rate_client_limit` | По умолчанию 5 новых валидных попыток на client за окно; допустимо 1–1000 |
| `LEADS_RATE_GLOBAL_LIMIT` → `rate_global_limit` | По умолчанию 100 новых попыток на весь сайт; не меньше client limit, максимум 100000 |
| `LEADS_IDEMPOTENCY_TTL_SECONDS` → `idempotency_ttl_seconds` | По умолчанию 86400 с; допустимо 86400–604800 с, не меньше 24 ч |
| `LEADS_TRUSTED_PROXIES` → `trusted_proxies` | Пусто без reverse proxy; иначе exact IP через запятую, не CIDR/произвольная цепочка |

Секреты предоставляет администратор защищённым способом. PHP-FPM должен читать config, но статический web server не должен обслуживать его как файл. Код/библиотеки read-only для worker; только приватный state writable. Нельзя загружать ZIP или весь source repo в webroot.

## SPF, DKIM и DMARC: только фактический почтовый домен

Пока From/transport не утверждены, готовые TXT-records создавать нельзя. Домен сайта `pro-mix.ru` не доказывает, что отправитель использует его. Если From — `simkraski@mail.ru`, зона `mail.ru` управляется Mail, и добавление SPF/DKIM в `pro-mix.ru` эту отправку не аутентифицирует. Для корпоративного From нужны records, выданные выбранным почтовым провайдером, с учётом всех существующих отправителей.

Будущая проверка после получения точных domains/selector (переменные ниже — утверждённые администратором имена, не секреты):

```bash
dig +short TXT "$ENVELOPE_DOMAIN"
dig +short TXT "$DKIM_SELECTOR._domainkey.$DKIM_DOMAIN"
dig +short TXT "_dmarc.$FROM_DOMAIN"
```

SPF проверяется для envelope/MAIL FROM domain; DKIM — для d= и s= реально полученной подписи; DMARC требует alignment с From domain хотя бы одного прошедшего механизма. Наличие DNS TXT ещё не доказывает, что конкретное письмо прошло проверку. Текущий стандарт — [RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.html), опубликованный в мае 2026 года вместо RFC 7489. Ответственный DNS должен выбрать policy/отчётность с учётом существующего потока, а не вслепую ставить `p=reject`.

После разрешённой доставки владелец открывает служебные заголовки в mailbox и фиксирует `Authentication-Results`: spf, dkim, dmarc, используемые domains, From и Return-Path. [Инструкция Mail по этим результатам](https://help.mail.ru/developers/notes/authentication/). PASS delivery требует самого письма и его содержимого, а не только DNS, `201` или SMTP 250. Полные заголовки могут содержать IP/адреса; хранить их приватно и публиковать только редактированное подтверждение.

## Будущая техническая приёмка после отдельного разрешения

Команды ниже **не выполнялись**. Они не отправляют письмо, но устанавливают соединение с рабочим SMTP; запускать только администратору в согласованном окне, после утверждения host/port.

```bash
# Только для подтверждённой пары SMTPS/465:
openssl s_client -connect "$SMTP_HOST:465" -servername "$SMTP_HOST" \
  -verify_hostname "$SMTP_HOST" -verify_return_error </dev/null

# Альтернатива, только если провайдер подтвердил STARTTLS/587:
openssl s_client -starttls smtp -connect "$SMTP_HOST:587" -servername "$SMTP_HOST" \
  -verify_hostname "$SMTP_HOST" -verify_return_error </dev/null
```

Не посылать AUTH вручную и не передавать пароль аргументом команды. TLS/session проверка без AUTH ещё не проверяет credentials/From/доставку. После разрешения отправлять через штатную форму/API, с тем же приватным config и тем же PHP-FPM, что будут обслуживать сайт. Не подключать SMTPdebug к production responses/logs.

### Таблица реальных production-проверок

PASS ставится только после фактического выполнения на FirstVDS; FAIL — при наблюдённой ошибке; иначе NOT TESTED. Ожидаемый результат указан заранее, локальный QA не переносит сюда PASS.

| Проверка | Критерий | Production статус |
| --- | --- | --- |
| Runtime и зависимости | Поддерживаемый security-patched PHP-FPM; JSON/OpenSSL/mbstring/ctype/filter/hash; Composer install по lock без dev | NOT TESTED |
| Private config | PHP-FPM видит правильные значения; config/env/secret недоступны HTTP и не попали в backup ZIP/source | NOT TESTED |
| DNS/egress/TLS | FirstVDS достигает подтверждённого host/port; валидная цепочка и hostname, без downgrade | NOT TESTED |
| SMTP AUTH | Реальная учётная запись и отдельный секрет приняты; провайдер разрешает From | NOT TESTED |
| From / Reply-To / envelope | From PROMIX с утверждённым адресом; To simkraski@mail.ru; Reply-To отсутствует по контракту; Return-Path/domain подтверждены | NOT TESTED |
| Синтетическая заявка | Явно отмеченное тестовое имя/комментарий и согласованный тестовый телефон; HTTP 201 accepted с совпадающим UUID | NOT TESTED |
| Получение mailbox | Владелец simkraski@mail.ru видит ровно одно письмо, фиксирует время и папку Inbox/Spam | NOT TESTED |
| Содержание | Русский текст/HTML+AltBody, телефон/город/комментарий, выбранный product+slug, sourcePage/source, Submission ID совпадают с тестом | NOT TESTED |
| Атрибуция | Вход с неперсональными UTM → каталог → PDP → форма: пять допустимых UTM в письме с analytics consent | NOT TESTED |
| Без analytics consent | Заявка разрешена при consent обработки данных, UTM пусты; рабочий счётчик отдельно не включается без разрешения | NOT TESTED |
| SPF/DKIM/DMARC | DNS и реальные Authentication-Results проверены для фактических domains; соответствуют утверждённой sender policy | NOT TESTED |
| Повтор / lost response | В контролируемом окне повтор той же заявки/UUID не создаёт второе письмо; HTTP 200 accepted replay либо ожидаемый pending/unknown | NOT TESTED |
| Rate/proxy | Подтверждены реальные IP и число лимитов; 429/Retry-After без SMTP; тест не вытесняет живые заявки из global limit | NOT TESTED |
| Ошибка транспорта | Только в изолированном staging/config: 503/unknown, понятная ошибка без ложного success, введённые поля сохранены | NOT TESTED |
| Privacy/логи | Нет имени/телефона/message/raw MIME/пароля/SMTP trace в access/error logs; есть лишь безопасная категория/статус | NOT TESTED |
| Storage/restart/rollback | Приватный state и secret не теряются после FPM restart/release switch; write/lock/rename работают | NOT TESTED |

Negative transport/rate тесты не проводить на открытом production за счёт реальных посетителей. Подготовить staging с тем же runtime и отдельным state/test recipient либо закрытое согласованное окно; получатель меняется только администратором в private config по отдельному разрешению. Не вызывать намеренно десятки рабочих писем ради проверки лимита.

## Защиты и пределы, которые важно сохранить

- Валидатор требует consent=true, UUIDv4, корректный телефон, пустой honeypot и минимум 1,2 с заполнения. CRLF однострочных полей отклоняются; JSON field lengths ограничены. Это дополняет, но не заменяет rate limiting.
- Per-client и global slots резервируются атомарно до SMTP. Проверенные повторы accepted/unknown не создают новый send и не расходуют новый slot. Защита односерверная: единый local filesystem с `flock`/atomic rename, не несколько независимых workers-дисков/узлов.
- Идемпотентность хранит UUID/HMAC/state/timestamps, без формы/raw IP/UTM. Клиентские metadata хранятся 24 ч в sessionStorage/history fallback без значений формы. Если оба store unwritable, POST не начинается. Это не бесконечная/cross-tab exactly-once гарантия.
- После timeout повторять то же содержимое с тем же ID. `202 pending` не success; `503 unknown` не success и **не повод генерировать новый ID/вручную повторять отправку**. SMTP мог принять письмо до потери ответа; сначала проверить mailbox по Submission ID и согласовать дальнейшее действие. Unknown не переотправляется автоматически.
- Удаление state/смена secret/истечение TTL/удаление browser history разрывают continuity. Не очищать storage при deploy/rollback. Cleanup логический по TTL и физически ограниченный при новых запросах; при простое файлы могут оставаться. Точное физическое retention требует отдельного согласованного job, не удаления активных locks.
- Browser timeout — 12 с; SMTP timeout — 8 с по отдельным этапам, финальный DATA reply может ждать 16 с, весь запрос может длиться дольше. Nginx/FPM budgets должны позволить завершение и запись состояния; быстрый kill не доказывает недоставку.
- PHP логирует фиксированные категории `delivery_outcome_unknown`/`configuration_or_storage_unavailable`, не сырой exception. Не включать debug/логирование body на reverse proxy. State HMAC — технические metadata, не основание публиковать файлы или хранить их бессрочно.
- UTM работают 30 мин по правилу latest tagged entry в текущей вкладке и только при analytics consent. Без sessionStorage метки живут в памяти текущей страницы и теряются при полной навигации; history fallback заявки не переносит UTM. Владелец кампаний отвечает за неперсональные labels.

Подтверждение готовности рабочей почты подписывают администратор SMTP и владелец mailbox после разрешённого теста. Сейчас итог: **NOT TESTED; production mail-ready не объявляется**.
