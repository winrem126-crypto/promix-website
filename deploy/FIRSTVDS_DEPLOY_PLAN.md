# PROMIX — план размещения на FirstVDS и отката

Дата: 23.10.2026, Europe/Astrakhan. Кандидат: **`promix-2026.10.23-rc1`**. Точный Git commit и SHA архива фиксируются в релизном манифесте, а не подменяются версией `1.0.0` из package.json.

Это инструкция для будущего согласованного окна работ. **Ни одна приведённая серверная команда сейчас не выполнена. Production, SSH, OS, панель, TLS, PHP-FPM и реальная SMTP-доставка — NOT TESTED.** Отдельное разрешение владельца требуется перед изменением серверной конфигурации/DNS и перед любой реальной заявкой. Локальный SMTP QA не подтверждает доставку на FirstVDS.

Основой служат [итог QA](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/FINAL_REPORT.md), [статусы](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/FINDINGS_STATUS.md), [необходимые данные](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/REQUIRED_INPUTS.md) и [охват](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/TEST_COVERAGE.md). Повторный полный аудит и переделка проверенных компонентов не требуются.

## 1. Что администратор должен заполнить до работ

| Параметр | Нужное подтверждение |
|---|---|
| Сервер | IP v4/v6, SSH port/user/key, sudo, out-of-band console, firewall, свободное место/inodes |
| ОС/панель | `/etc/os-release`, актуальность security updates, ispmanager/другая панель или ручное управление |
| Фактическая архитектура | Кто принимает 80/443: Nginx/Apache/CDN/LB; активные vhost, public roots, другие сайты и proxy chain |
| PHP | Поддерживаемая и обновлённая minor, FPM binary/service/pool/socket, pool user/group, реальные ini/extensions и opcache |
| Домены | Владелец DNS, текущие A/AAAA/CNAME/CAA/TTL; подтверждение canonical `https://pro-mix.ru` из build и судьбы www |
| TLS | Существующий issuer/cert name/SAN/renewal timer или согласованный способ нового выпуска |
| Почта | Реальный провайдер, host, port, SMTPS/STARTTLS, login, app password через защищённый канал, разрешённый From, recipient `simkraski@mail.ru` |
| Proxy/лимиты | Нужен ли доверенный proxy; exact IP и overwrite XFF; принятие 5 новых/900с на client и 100/900с на инсталляцию |
| Старый сайт | Старый root, PHP/CMS, база/доступ к backup, конфиги, сертификаты, кто отвечает за восстановление |
| Решения компании | 52 предложения старых URL и оставшиеся документы/товары утверждены либо явно приняты как открытые риски |
| Окно и откат | Контакт владельца, наблюдение после переключения, rollback target, разрешение на отдельное тестовое письмо |

Эти данные сейчас не предоставлены. Ниже используется **проектируемый вариант Nginx + PHP-FPM на одном Linux-хосте**. Node/Astro dev/preview и встроенный `php -S` в production не запускаются; база данных новому сайту не нужна. Старый WordPress, если он есть, сохраняется вместе с базой для отката.

## 2. Разведка существующего сервера — сначала только чтение

После выдачи доступа выполнить и сохранить результат в приватной административной папке. `nginx -T`, Apache dump и конфиги могут содержать секреты: не вставлять их целиком в чат/публичный Git.

```bash
cat /etc/os-release
id
df -h
df -i
ss -lntp
systemctl --type=service --state=running
command -v nginx
command -v apachectl
command -v apache2ctl
command -v httpd
command -v php
command -v composer
php -v
php --ini
php -m
nginx -V
sudo nginx -t
systemctl list-units '*php*fpm*'
systemctl list-timers --all
```

Ветвление:

- **ispmanager/другая панель:** определить её поддерживаемый custom include/template и pool сайта. Использовать механизм панели и её backup; не заменять генерируемый vhost, не устанавливать второй стек поверх панели. У FirstVDS процедура SSL для ispmanager отличается от ручного Certbot. [FirstVDS: SSL в ispmanager](https://firstvds.ru/technology/besplatnyy-ssl-sertifikat).
- **Ручной Nginx + FPM:** применять кандидат ниже после подстановки фактического socket и путей.
- **Nginx → Apache либо Apache-only:** не выключать Apache и не менять proxy автоматически. Выбрать с администратором: отдельный Nginx static/FPM vhost либо адаптация Apache с тем же единственным PHP endpoint, приватными файлами, статусами 404/301 и cache. Перед работами требуется проверенный итоговый конфиг этой архитектуры; Nginx-файл нельзя вставить в Apache.
- **Новая выделенная Debian/Ubuntu без панели:** только после проверки поддерживаемой ОС, репозиториев и отдельного разрешения допустим следующий пример установки. Он не подходит для неизвестной/действующей панели и не выбирает PHP по устаревшему минимуму `^8.1`.

```bash
# Только новая/согласованная Debian/Ubuntu; сначала просмотреть кандидаты версий.
apt-cache policy nginx php-fpm php-cli php-mbstring php-xml php-zip unzip composer
# Затем администратор подтверждает security-supported версии и зависимости.
sudo apt-get update
sudo apt-get install nginx php-fpm php-cli php-mbstring php-xml php-zip unzip composer
```

На RHEL/AlmaLinux package/pool paths и SELinux отличаются: использовать соответствующие системные пакеты и контексты, не отключать SELinux ради доступа. PHP нужны JSON/OpenSSL/mbstring; ZIP/unzip нужен установке Composer. CLI и FPM могут читать разные ini: проверять оба, не публиковать phpinfo. Общий порядок Nginx/LEMP описан [FirstVDS](https://firstvds.ru/technology/kak-razmestit-sayt-na-servere-s-lemp); его старые package versions не копировать.

## 3. Приватная резервная копия до любых изменений

Сначала snapshot/backup у хостера, затем отдельная проверяемая копия файлов и конфигов. Защищённый server backup **может содержать секреты** и не равен подготовленному локальному ZIP без секретов. Хранить root-only, шифровать внешнюю копию и проверить возможность чтения/восстановления.

```bash
# Заполнить фактические пути. Команды выполняются в согласованной Bash-сессии.
APP_ROOT=/var/www/promix
RELEASE_ID=promix-2026.10.23-rc1
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=/var/backups/promix/$STAMP
sudo install -d -m 0700 "$BACKUP_DIR"
sudo nginx -t
# Список копируемых существующих конфигов администратор проверяет заранее.
sudo tar --acls --xattrs -cpf "$BACKUP_DIR/nginx-before.tar" /etc/nginx
# Аналогично: только фактические PHP-FPM/panel/Apache config dirs.
sudo readlink -f "$APP_ROOT/current"
```

Записать в приватный rollback record: прежний current target (если есть), старый vhost и способ его включения, владельцев/ACL, FPM service/pool, сертификат и его renewal. Старый root архивировать отдельным `tar --acls --xattrs -cpf ... <ПРОВЕРЕННЫЙ_СТАРЫЙ_ROOT>` без удаления исходника. Если это WordPress, дополнительно снять consistent DB dump, например `mysqldump --single-transaction --routines --triggers --events --databases "$DB_NAME" > <root-only-file>` с auth через защищённый client config, не пароль в argv. Для нетранзакционных таблиц согласовать блокировку/остановку записи. Проверить ненулевой dump и тест восстановления вне production; не заменять это одним файловым архивом.

При уже работающем новом backend сделать согласованную snapshot-копию **shared state + secret вместе**; на время такой копии исключить новые заявки и дождаться FPM/SMTP операций. Копия live JSON по отдельности не считается согласованным snapshot.

## 4. Релизная структура и права

```text
/var/www/promix/
  releases/promix-2026.10.23-rc1/
    dist/                              # единственный public root
    backend/{public,src,vendor,...}
    backend/config/config.php -> /var/www/promix/shared/config.php
  current -> releases/promix-2026.10.23-rc1
  shared/config.php                    # runtime adapter, вне Git/webroot
  shared/state/                        # постоянные locks/counters/idempotency
  shared/acme/.well-known/acme-challenge/
/etc/promix/promix.env                 # секреты: root-only, вне архива исходников
/var/backups/promix/...                # приватные backups, вне webroot
```

Выделить PHP-FPM pool/user `promix-php` и Unix group `promix-read`; включить Nginx worker, pool user и deploy user в group для чтения/прохода. Фактические пользователи могут называться иначе. Владельцем code/dist остаётся root/deploy, не PHP. Типовые права: directories 0750, source/static 0640; `shared/state` 0700 owner PHP, `shared/config.php` 0640 root:pool-group, `/etc/promix/promix.env` 0600 root. ACME webroot readable Nginx, writable только ACME/root. Не применять `chmod 777` или `chown -R www-data` ко всему проекту.

```bash
# После создания/проверки реальных user/group администратором:
WEB_READ_GROUP=promix-read
PHP_USER=promix-php
PHP_GROUP=promix-php
sudo install -d -o root -g "$WEB_READ_GROUP" -m 0750 "$APP_ROOT" "$APP_ROOT/releases" "$APP_ROOT/shared"
sudo install -d -o "$PHP_USER" -g "$PHP_GROUP" -m 0700 "$APP_ROOT/shared/state"
sudo install -d -o root -g "$WEB_READ_GROUP" -m 0750 "$APP_ROOT/shared/acme/.well-known/acme-challenge"
sudo install -d -o root -g root -m 0700 /etc/promix
```

Подготовлены два типа артефакта: `promix-2026.10.23-rc1-source-<shortSHA>.zip` — зафиксированные исходники с префиксом `promix-site/`; `promix-2026.10.23-rc1-runtime-<shortSHA>.zip` — dist, backend public/src/lock/composer/config.example и RELEASE_VERSION.json без vendor/секретов/state. Фактическое имя и SHA брать из манифеста. Source ZIP — резервная копия, не webroot; на сервер ставится runtime artifact, Node на VDS ему не нужен.

Создать **новый** release directory, перенести только проверенные dist и backend из манифеста, не распаковывать ZIP в живой current. Перед извлечением проверить список архива: никаких absolute/`..` paths/symlinks/секретов. Не переносить node_modules, QA/browser profiles, `.git`, отчёты, source ZIP в webroot. Backend `vendor` либо собрать по lock на совместимой staging-машине, либо установить в новом release:

```bash
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
DEPLOY_USER='<ФАКТИЧЕСКИЙ_DEPLOY_USER>'
test ! -e "$RELEASE_DIR"
sudo install -d -o "$DEPLOY_USER" -g "$WEB_READ_GROUP" -m 0750 "$RELEASE_DIR"
# Загрузить/распаковать artifact в RELEASE_DIR как DEPLOY_USER (вне current).
# Следующие Composer команды выполняет этот DEPLOY_USER, не root.
cd "$RELEASE_DIR/backend"
composer validate --no-check-publish
composer install --no-dev --prefer-dist --no-interaction --no-progress --classmap-authoritative
composer check-platform-reqs --no-dev
find public src config -type f -name '*.php' -exec php -l {} \;
```

Composer запускать deploy-user, не root, не выполнять update/ignore-platform-reqs. Проверить backend lock SHA; `check-platform-reqs` CLI не заменяет FPM. После установки заморозить обычные code dirs/files владельцем root:read-group с0750/0640 (не переходя по symlink к shared). Отдельно проверить проход Nginx/PHP, config readability и state writability от настоящего pool user. Пример: `sudo -u "$PHP_USER" test -w "$APP_ROOT/shared/state"`. На SELinux назначить постоянные корректные file contexts, не менять enforcing.

## 5. Runtime config, FPM и почта

`backend/public/api/lead.php` загружает `backend/config/config.php`; project `.env` автоматически **не читается**. Скопировать `config.example.php` в private `shared/config.php`, а release config.php сделать ссылкой. Для этого варианта значения поступают через allowlist FPM environment. Если конфиг — symlink, его `__DIR__` относится к shared path: обязательно задать **абсолютный** `LEADS_STORAGE_PATH=/var/www/promix/shared/state`, не полагаться на example default.

```bash
# Первый запуск: создать adapter, только если shared config ещё не существует.
if ! sudo test -e "$APP_ROOT/shared/config.php"; then
    sudo install -o root -g "$PHP_GROUP" -m 0640 "$RELEASE_DIR/backend/config/config.example.php" "$APP_ROOT/shared/config.php"
fi
# Не перезаписывает существующий release config; конфликт требует проверки.
test ! -e "$RELEASE_DIR/backend/config/config.php"
sudo ln -s "$APP_ROOT/shared/config.php" "$RELEASE_DIR/backend/config/config.php"
sudo -u "$PHP_USER" test -r "$APP_ROOT/shared/config.php"
```

Через защищённый редактор/secret manager подготовить `/etc/promix/promix.env`: реальные `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`smtps` для implicit TLS или `starttls` для explicit TLS), `SMTP_USER`, `SMTP_PASSWORD`, разрешённый `LEADS_FROM_EMAIL`, `LEADS_TO_EMAIL=simkraski@mail.ru`, `LEADS_STORAGE_PATH`, `LEADS_STORAGE_SECRET`, policy/timeouts. Не писать пароль/ключ в команды, чат, исходники и shell history; не использовать `set -x`. HMAC secret — криптографически случайные минимум32 bytes, один и тот же во всех workers и релизах. Secret ротация — отдельная миграция, не часть deploy/rollback.

Для systemd FPM администратор добавляет **к фактическому сервису**, не выдуманному `php8.3-fpm`:

```ini
# systemctl edit <ФАКТИЧЕСКИЙ_FPM_SERVICE>
[Service]
EnvironmentFile=/etc/promix/promix.env
```

В выделенном pool сохранить `clear_env = yes` и передать только следующие переменные (аналогично каждой строке):

```ini
env[SMTP_HOST] = $SMTP_HOST
env[SMTP_PORT] = $SMTP_PORT
env[SMTP_SECURE] = $SMTP_SECURE
env[SMTP_USER] = $SMTP_USER
env[SMTP_PASSWORD] = $SMTP_PASSWORD
env[LEADS_FROM_EMAIL] = $LEADS_FROM_EMAIL
env[LEADS_TO_EMAIL] = $LEADS_TO_EMAIL
env[LEADS_STORAGE_PATH] = $LEADS_STORAGE_PATH
env[LEADS_STORAGE_SECRET] = $LEADS_STORAGE_SECRET
env[LEADS_RATE_WINDOW_SECONDS] = $LEADS_RATE_WINDOW_SECONDS
env[LEADS_RATE_CLIENT_LIMIT] = $LEADS_RATE_CLIENT_LIMIT
env[LEADS_RATE_GLOBAL_LIMIT] = $LEADS_RATE_GLOBAL_LIMIT
env[LEADS_IDEMPOTENCY_TTL_SECONDS] = $LEADS_IDEMPOTENCY_TTL_SECONDS
env[LEADS_TRUSTED_PROXIES] = $LEADS_TRUSTED_PROXIES
env[SMTP_TIMEOUT_SECONDS] = $SMTP_TIMEOUT_SECONDS
php_admin_flag[display_errors] = off
php_admin_flag[log_errors] = on
```

Переменные объявить в private environment, включая пустой `LEADS_TRUSTED_PROXIES=` при отсутствии proxy. `SMTP_TIMEOUT_SECONDS=8`, TTL86400, client5/global100/window900 — текущие defaults, требующие принятия владельцем. FPM socket listener доступен только Nginx на Unix socket; никакого публичного9000. Ограничить pool memory/workers по ресурсам. `security.limit_extensions = .php`. FPM `open_basedir`, если включён, должен разрешать release, shared config/state, CA/system paths, требуемые PHP; запрет не снимать глобально.

SMTP timeout считается **на стадию**, финальный DATA может занять16с, весь запрос дольше12с ожидания браузера. В release Nginx read_timeout60с, но FPM request_terminate_timeout/внешний LB могут обрывать раньше: согласовать бюджет и не считать таймаут доказательством неотправки. PHP не должен иметь write к source/dist; app пишет только в state. Локальные `flock`/atomic rename обязательны; NFS/несколько VDS не подходят без отдельного transactional storage.

После разрешённого изменения EnvironmentFile systemd обычно нужен `daemon-reload` и перезапуск фактического FPM master, чтобы наследовать новый env; pool reload сам по себе этого не доказывает. Перед restart закрыть приём новых заявок, дождаться завершения текущих SMTP operations, не убивать их принудительно. Выполнить проверку FPM config (`<FPM_BINARY> -t`) и затем согласованный restart. Не выводить env/password в diagnostics и не публиковать phpinfo. [PHP: FPM pool/env/listen](https://www.php.net/manual/en/install.fpm.configuration.php).

В конфиге `leads_from_email` — проверенный серверный sender, получатель фиксирован server-side. Форма не собирает email; текущий backend **не задаёт Reply-To**. Не подставлять туда name/phone или непроверенный client input. SMTP, SPF/DKIM/DMARC и разрешённый единичный тест оформляются отдельной почтовой процедурой; recipient mail.ru не означает, что `pro-mix.ru` управляет DNS mail.ru.

## 6. TLS и Nginx — применить только после проверки архитектуры

Новый [nginx-promix-release.conf.example](nginx-promix-release.conf.example) — кандидат именно для структуры current/{dist,backend}. [Прежний проверенный performance example](nginx-promix-performance.conf.example) сохранён. Выбрать **один** вариант, поскольку maps совпадают. Новый include ставится один раз в `http {}`, не внутрь server. Заменить `PHP_FPM_SOCKET`, проверить существование сертификата и snippets. Не использовать default/example config без подстановок.

Новый release example отдельно проверен локальным portable Nginx1.31.8: syntax PASS,228/228 одношаговых redirect проверок (76 exact path ×3 контекста),7 canonical redirects,6 сохранённых200,15 настоящих404,ACME3/3,cache5/5,gzip и fixed API GET route через FastCGI stub. [Полное доказательство](../../PROMIX_RELEASE_PREP_2026-10-23_11-16-07/results/nginx-release-check.json) перечисляет адаптацию: plain HTTP loopback вместо TLS, локальные пути и stub вместо PHP-FPM. Внешние HTTP, POST, SMTP и production не использовались; TLS/реальный FPM/Linux права/FirstVDS остаются NOT TESTED.

Ключевые свойства: public root только dist; exact `/api/lead.php` исполняет один известный файл вне webroot; `$realpath_root` разрешает immutable release path для PHP/opcache; все прочие PHP/API/backend/dotfiles дают404. Это не универсальный `location ~ \.php$`. `HTTP_PROXY` очищен. POST не повторяется Nginx upstream retries, API no-store. Русская404 через `error_page 404 /404.html` + internal сохраняет статус; SPA fallback на200 отсутствует. [Nginx: try_files/realpath_root/error_page](https://nginx.org/en/docs/http/ngx_http_core_module.html), [Nginx: FastCGI params/timeouts](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html).

В релизе использовать новый [nginx-promix-release-redirects.conf.example](nginx-promix-release-redirects.conf.example) как `/etc/nginx/snippets/nginx-promix-release-redirects.conf`. Он сохраняет42 утверждённых смысловых соответствия/76 exact slash-вариантов прежнего [QA include](nginx-promix-redirects.conf.example), меняя только цель на абсолютную `https://pro-mix.ru/...`. Новый include подключён в HTTP apex/www и обоих HTTPS vhost; exact location срабатывает до generic redirect в `location /`, поэтому у утверждённых старых URL нет лишнего host/scheme hop. ACME остаётся отдельным исключением. Прежний QA-файл не меняется. 52 новых предложения не активировать без утверждения таблицы. Canonical выбран по текущему build: HTTP/apex/www → HTTPS apex301 с query/path. Новые абсолютные варианты проверить отдельно;42 соответствия не превращать в catch-all на главную.

Если текущий сертификат уже корректен, сохранить issuer/renewal. Если нужен новый: сначала DNS A/AAAA и доступность80 согласованы; добавить только ACME HTTP location в существующий сайт, не заменять его до переключения. При ручном Certbot выбрать установку по реальной ОС на [официальной странице](https://certbot.eff.org/instructions). Webroot challenge должен обслуживаться из постоянного shared/acme, а server-level return не должен перехватывать его. [Certbot: webroot и renewal](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

```bash
# Только после разрешения и настройки ACME location на реальном80.
sudo certbot certonly --webroot -w /var/www/promix/shared/acme -d pro-mix.ru -d www.pro-mix.ru
sudo certbot renew --cert-name pro-mix.ru --dry-run
```

Имя сертификата/пути могут отличаться — взять фактическое. Не запускать certbot --nginx поверх панели без согласования. ACME dry-run сам использует внешнюю staging CA и является будущим серверным действием. В renewal должен быть проверенный deploy-hook `nginx -t && systemctl reload nginx`; если timer уже управляется панелью, не создавать дубликат. HSTS/preload и принудительная смена DNS сейчас не включаются.

Статические fingerprints immutable только на200/206/304; HTML/неверсионированные JS/image revalidate, PDF1day, API no-store, gzip только текст. Brotli не требовать без установленного модуля. `open_file_cache off` исключает старые lookup при смене current. Root/public backup.tar/zip отсутствуют. Access log кандидата не пишет IP/query/body/Referer; API access log off. Nginx **error log всё ещё может включать URI/query**, FPM/panel/proxy логи имеют собственные политики: приватный доступ, минимальная разумная retention/rotation, без debug/телефонов в URL; это нужно проверить на настоящем стеке.

## 7. Проверка нового release до переключения

1. Сопоставить Git commit, архив SHA, file manifest; проверить полный dist и backend, а не пересобирать на сервере случайным Node/pnpm. Если пересборка нужна — те же зафиксированные Node/pnpm, frozen lock и новая запись манифеста.
2. В dist не должно быть preview/previews, reports/tools/tests, secret/config/env/ZIP/git. Настоящие35 обычных маршрутов +404 и29 PDP сверить с release sitemap. Служебный исходник preview допустим только в source ZIP, никогда в dist.
3. Проверить PHP lint/Composer platform, private config readability, persistent state write/locking и runtime env в FPM без вывода значений. Composer audit не заменяет OS/PHP security updates.
4. Подготовить отдельный **loopback/private candidate vhost** с root нового release и script_filename именно этого release; проверять через `curl --resolve`/локальный Host, без DNS switch. Не оставлять публичный staging, не подключать реальные заявки/аналитику. До разрешения на почту — только GET405/invalidJSON400 и статические GET, не valid POST.
5. Проверить Nginx combined config `nginx -t`, совпадение server_name, path traversal/несанкционированный PHP, настоящий404,42 redirects, content-type, cache/gzip. Локальный Windows-Nginx QA подтверждает шаблон, но не установленный Linux модуль/socket/permissions/TLS.

Пример безопасных будущих HTTP проверок без отправки (IP администратор подставляет сам):

```bash
SERVER_IP='<SERVER_IP>'
curl --resolve "pro-mix.ru:443:$SERVER_IP" -I https://pro-mix.ru/
curl --resolve "pro-mix.ru:443:$SERVER_IP" -i https://pro-mix.ru/api/lead.php
curl --resolve "pro-mix.ru:443:$SERVER_IP" -I https://pro-mix.ru/qa-page-that-does-not-exist/
curl --resolve "pro-mix.ru:443:$SERVER_IP" -I https://pro-mix.ru/products/latex-paint/
curl --resolve "pro-mix.ru:443:$SERVER_IP" -I https://pro-mix.ru/.env
```

Не использовать `curl -k` как доказательство TLS PASS. До публикации на реальном hostname даже GET может выполнить стороннюю аналитику в браузере; проверять HTTP без JS либо изолировать analytics до согласования.

## 8. Согласованное переключение

После отдельного разрешения, backup и успешных предыдущих шагов:

1. На переходное окно остановить приём **новых** валидных заявок на уровне контролируемого API location с503/no-store, сохранить статический сайт; проверить, что это не вызывает фальшивый успех. Дождаться завершения уже исполняющихся PHP/SMTP. Не `kill -9`: обрыв DATA создаёт unknown.
2. Symlink runtime config нового release направлен на сохранённый shared/config.php; shared state и HMAC secret уже готовы. Frontend и backend переключаются как единый release, их контракт совместим с предыдущим или назначено окно drain. Каждый worker использует общий state/secret; старые in-flight не пересылаются автоматически.
3. Сохранить старый target в приватный rollback record; `current` должен быть symlink либо отсутствовать при первом запуске. Никогда не заменять непроверенный существующий каталог через rm -rf.

```bash
# После проверки RELEASE_DIR внутри APP_ROOT/releases и отсутствия .current-next.
test -d "$RELEASE_DIR/dist"
test -f "$RELEASE_DIR/backend/public/api/lead.php"
test -L "$RELEASE_DIR/backend/config/config.php"
test ! -e "$APP_ROOT/.current-next"
# Существующий current разрешён только как symlink.
if test -e "$APP_ROOT/current" && ! test -L "$APP_ROOT/current"; then exit 1; fi
sudo ln -s "releases/$RELEASE_ID" "$APP_ROOT/.current-next"
sudo mv -Tf "$APP_ROOT/.current-next" "$APP_ROOT/current"
```

`mv -T` — GNU/Linux; temporary link и current находятся на одной filesystem. На первом переходе со старого root Nginx config также меняется отдельно: сохранить старый vhost, установить проверенный candidate/include, `sudo nginx -t`, затем `sudo systemctl reload nginx`. Ошибка -t — не reload, восстановить прежний include. Для последующих symlink releases конфиг обычно неизменен. В `SCRIPT_FILENAME` используется resolved release path, чтобы opcache не оставлял script старого current; не чистить глобальный opcache всех сайтов без необходимости.

4. Вернуть exact API location после drain и config validation, затем статические safe GET и приёмка. Рабочая SMTP-проверка — только в отдельно разрешённое владельцем время и с синтетической пометкой. Записать UTC, commit, результат и Submission ID, не реальные контакты. До разрешения строки mail остаются NOT TESTED.
5. Сохранять минимум предыдущий релиз и защищённый backup. Fingerprinted assets прежнего HTML могут запрашиваться из открытых вкладок: перед переключением согласовать сохранение прежних fingerprint файлов в новом public artifact с отдельным manifest либо короткое окно и reload; не копировать старые HTML/config/PHP в dist. Наличие старого release само по себе не делает его assets доступными через новый root. Если добавлялись assets, зафиксировать новый deploy manifest; исходный build SHA не подменять.

## 9. Приёмка и критерии остановки

Выполнить [PRODUCTION_ACCEPTANCE_CHECKLIST.md](PRODUCTION_ACCEPTANCE_CHECKLIST.md). В нём сейчас **все production строки NOT TESTED**. PASS ставит исполнитель после реального наблюдения. Проверить без DNS подмены после его согласованного переключения, оба домена и IPv4/IPv6; отдельно реальные телефоны и ключевые desktop сценарии.

Немедленно остановить переключение/начать согласованный откат при: PHP source/secret утечке, неработающем TLS, массовых404/5xx, неработающем каталоге, ложном успехе/повторном письме, потере shared state, несовместимом контракте. Ошибка доставки не лечится повтором с новым ID. При неизвестном исходе сверить Submission ID с рабочим mailbox/провайдером, не удалять state. Остаточные data/document/DEP риски из QA не объявлять закрытыми фактом размещения.

## 10. Быстрый откат

До старта указать конкретный rollback target, совместимый frontend/backend и backup vhost. Снова закрыть новые заявки, дождаться уже начатых SMTP. Старый release проверять на существование, целостность, совместимость schema/контракта **и поддержку общего state/HMAC**.

```bash
ROLLBACK_ID='<ПРОВЕРЕННЫЙ_PREVIOUS_RELEASE_ID>'
test -d "$APP_ROOT/releases/$ROLLBACK_ID/dist"
test -f "$APP_ROOT/releases/$ROLLBACK_ID/backend/public/api/lead.php"
test ! -e "$APP_ROOT/.current-rollback"
sudo ln -s "releases/$ROLLBACK_ID" "$APP_ROOT/.current-rollback"
sudo mv -Tf "$APP_ROOT/.current-rollback" "$APP_ROOT/current"
sudo nginx -t
sudo systemctl reload nginx
```

Не откатывать `shared/state`, не менять HMAC secret, не удалять unknown/pending, не снижать TTL. Восстановление старого snapshot state поверх новых операций может породить дубликаты; оно возможно только как отдельная аварийная процедура с остановкой заявок и сверкой доставок. Если previous backend не понимает текущую защиту/JSON schema, не включать его API автоматически: безопаснее статический rollback с временным503 формы до согласованной совместимой версии. Если это первое размещение и previous сайт — WordPress, восстановить прежний vhost/root, сертификат/renewal и DB **только при необходимости**; новый shared state сохранить. Старую публичную форму включать лишь после отдельного принятия её рисков, не обещать сохранение новых гарантий на старом коде.

Если менялись Nginx/FPM configs, восстановить их из backup, выполнить их -t и согласованный reload/restart (снова drain). Проверить HTTPS/home/catalog/404/API status и рабочую почту по уже разрешённой процедуре. DNS откат требуется только если DNS меняли; учитывать TTL/два IP и не выключать старый сервер до стабилизации. Длительность «несколько минут» не гарантируется без репетиции и доступов.

## 11. Что осталось владельцу и администратору

Владелец предоставляет/утверждает server/domain/mail параметры, 52 URL решения, принятые риски документов/характеристик/скрытыхSKU и отдельное разрешение на серверное окно и единичное письмо. Администратор делает read-only inventory, backup+restore rehearsal, выбирает фактическую архитектуру, подставляет paths/users/socket, provision secrets, проверяет OS/PHP/Composer/FPM, TLS/renewal/DNS, устанавливает candidate только после согласования, выполняет production checklist и сохраняет безопасные доказательства. До этого релиз подготовлен локально, а **доставка, production безопасность и успешное размещение не подтверждены**.
