# PROMIX: ручное применение performance-настроек FirstVDS

Этот документ и `nginx-promix-performance.conf.example` — подготовленные примеры. Во время аудита сервер не изменяется, сайт не публикуется, реальные заявки не отправляются. Итоговые проверки сервера выполняет администратор после согласованного размещения.

## Реальная архитектура и размещение

Astro 5.18.2 создаёт статическую папку `dist/`. HTML, CSS, JS, изображения и PDF нужно отдавать непосредственно Nginx. Node.js нужен для сборки; отдельный Node-процесс для публичных страниц не требуется. Единственный backend — PHP 8.1+ / PHPMailer по прежнему URL `/api/lead.php`. SMTP, адресаты и PHP-код этим примером не изменяются.

Пример структуры на сервере:

```text
/var/www/promix/current/dist/       # только проверенная production-сборка
/var/www/promix/backend/public/api/lead.php
/var/www/promix/backend/config/    # вне document root
/var/www/promix/backend/src/       # вне document root
/var/www/promix/backend/vendor/    # вне document root
```

Пути условные. Существующее расположение сайта, сертификаты и socket PHP-FPM необходимо подставить вручную. Не копировать весь проект, `.env`, `node_modules`, отчёты, screenshots или исходные PNG в document root сверх проверенного состава `dist/`.

## Сборка текущего проекта

В текущей среде проверены Node.js 24.19.0 и pnpm 11.25.0; используется `pnpm-lock.yaml`. На машине сборки из корня `promix-site`:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` — существующая команда из `package.json`: `astro check && astro build`. Для production-измерений локально используется существующая `pnpm preview`, для разработки — `pnpm dev`. Dev server не подходит для сравнения performance. Установку зависимостей и повторную сборку на сервере можно исключить, передав готовый проверенный `dist/`.

Backend зависимости при первоначальной подготовке устанавливаются отдельно, из каталога backend:

```sh
composer install --no-dev --optimize-autoloader
```

Существующий `config.php` и SMTP-переменные должны оставаться на сервере вне webroot. В этом проходе их значения не запрашиваются и не меняются.

## Что проверить перед применением

1. Изучить текущий virtual host и правила панели FirstVDS: пример интегрируется в существующую конфигурацию, а не заменяет её вслепую. Сохранить рабочую конфигурацию для отката.
2. Проверить `nginx -v` и `nginx -V`: TLS, HTTP/2, пути модулей; отдельно проверить используемый socket PHP-FPM, права чтения `dist/` и права PHP-пула на backend. PHP-FPM должен быть доступен через локальный socket или localhost, без публичного порта.
3. В примере включён современный `http2 on;` для Nginx **1.25.1+**. На более старой установленной версии удалить эту строку и добавить `http2` к двум `listen ... ssl` строкам. Использовать только один вариант. Это граница версии, указанная в [документации HTTP/2 Nginx](https://nginx.org/en/docs/http/ngx_http_v2_module.html#http2).
4. Подставить действительные TLS-сертификаты и сохранить существующий процесс их продления. Если используются HTTP ACME challenges, сохранить отдельный challenge handler до HTTPS redirect. Не менять существующую политику www/canonical-host и не создавать цепочки перенаправлений.
5. Подключить пример из контекста `http {}`: в нём есть `map`, затем два `server`. Не вставлять целиком внутрь другого `server`. Сопутствующий `nginx-promix-redirects.conf.example` установить как `/etc/nginx/snippets/nginx-promix-redirects.conf` либо согласованно изменить путь активного `include` внутри HTTPS server. Список из 42 точных решений и неразрешённых соответствий находится в `OLD_NEW_URL_MAP.md`.
6. Проверить `/etc/nginx/mime.types`: HTML `text/html`, CSS `text/css`, JS `application/javascript` или `text/javascript`, JSON `application/json`, SVG `image/svg+xml`, AVIF `image/avif`, WebP `image/webp`, WOFF2 `font/woff2`, PDF `application/pdf`. Для manifest в примере уже есть отдельный MIME. Если в старой системной таблице нет AVIF/WOFF2, добавить недостающие соответствия в управляемую таблицу MIME, без дублирования имеющихся записей. Nginx предоставляет [таблицу типов и механизм `types`](https://nginx.org/en/docs/http/ngx_http_core_module.html#types).
7. После ручного согласования и подготовки проверить конфигурацию и лишь затем применить её:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Эти команды здесь приведены для администратора; в аудите они не выполнялись. Без доступа к FirstVDS нельзя подтвердить установленную версию Nginx, Brotli, реальный socket PHP, работу TLS, TTFB и заголовки production.

## Кеширование и обновления

| Ресурс | Cache-Control |
| --- | --- |
| Успешно отданный `_astro` файл с fingerprint в имени | `public, max-age=31536000, immutable` |
| Проверенные `catalog-2026-10/{slug}-{12hex}-{640,960,1600}.webp` и SVG маски с fingerprint | `public, max-age=31536000, immutable` |
| Responsive derivatives `images/performance/{name}-{12hex}-{width}.webp` с проверенной шириной | `public, max-age=31536000, immutable` |
| Новые lossless `images/products/performance-2026-10/*-{480,800,1200}.webp` | `public, max-age=0, must-revalidate` |
| HTML, включая 404 | `no-cache` |
| PDF | `public, max-age=86400, must-revalidate` |
| Нехешированные изображения/шрифты, JSON/XML/manifest и другие нефингерпринтированные assets | `public, max-age=0, must-revalidate` |
| `/api/*` | `no-store` |

Имена проверены по текущим `dist/_astro`, `public/images/products/catalog-2026-10` и manifest responsive derivatives. Для `images/performance` проверены 47 URL и ширины 320/480/640/960/1024/1207/1600/2048; hash — 12 hex символов содержимого derivative. Immutable не применяется ко всей папке `images` или ко всем шрифтам. Новые hash-схемы сначала проверить, затем расширять узкий regex в `map`. Ошибки 404/500 не получают годового кеша. `ETag`/`Last-Modified` позволяют повторную проверку неизменившихся файлов; `no-cache` разрешает хранение, но требует проверки свежести.

При обновлении изображений с fingerprint выпускать новое имя и обновлять ссылку сборкой. Не менять bytes уже опубликованного immutable файла под прежним именем. Нехешированные assets должны перепроверяться браузером. PDF можно заменить по прежнему URL, учитывая суточный срок свежести. Если официальный PDF нужно обновлять немедленно, на время публикации согласовать более короткий cache policy или новое имя документа.

В оптимизированной сборке `site.js`, `catalog.js` и `metrika.js` включены в fingerprinted JS под `_astro`; исходные файлы сохранены в `public/`, а заменённые копии исключены из `dist/`. Для проверки production JS использовать реальные URL текущей страницы, а не прежний `/site.js`.

Не добавлять `expires` поверх приведённого `Cache-Control`: это может создать дополнительные конфликтующие поля. В примере используется единый `add_header` на уровне server. Если добавлять `add_header` в location, необходимо учитывать [правила наследования заголовков Nginx](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header); новый `add_header_inherit` намеренно не используется, чтобы не требовать Nginx 1.29.3+.

## Сжатие и API

Gzip применяется только к текстовым MIME; `text/html` Nginx включает автоматически. PNG/JPEG/WebP/AVIF/PDF/ZIP и WOFF2 повторно не сжимаются. `gzip_vary on` помогает кешам разделять варианты ответа. Подробности — [официальный gzip module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html). Ответы короче 1024 bytes могут законно оставаться без `Content-Encoding`.

Brotli в примере закомментирован. Включать только после проверки уже установленного совместимого модуля; для него нужен модуль из пакета/сборки сервера. `brotli_static` дополнительно требует корректные `.br` файлы. Нельзя оставлять старые `.br`/`.gz` рядом с обновлённым исходным файлом. Не устанавливать сторонние сервисы или модули автоматически. Gzip остаётся рабочим вариантом без Brotli.

Только точный `/api/lead.php` передаётся PHP-FPM с фиксированным `SCRIPT_FILENAME`; произвольные PHP URL возвращают 404. `fastcgi_intercept_errors off` сохраняет JSON и статус backend. FastCGI cache выключен, `Cache-Control` — `no-store`. Это следует модели [FastCGI Nginx и параметрам PHP](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html#fastcgi_param). SMTP-запрос выполняется внутри API, а не в пути отдачи HTML.

Frontend timeout составляет 12 секунд. Указанный `fastcgi_read_timeout 30s` — интервал ожидания данных от PHP, а не обещание успешной отправки за 12 секунд; SMTP и PHP-pool необходимо наблюдать отдельно при согласованном эксплуатационном тесте. В этом аудите реальная отправка не выполняется.

Страницы не должны использовать SPA fallback `/index.html` для любого адреса. `try_files` возвращает настоящий 404, что соответствует [механизму обработки файлов Nginx](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files). В примере активны `error_page 404 /404.html` и internal location для существующего одобренного `dist/404.html`: русская страница ошибки сохраняет статус 404 и noindex. Оба пространства `/preview` и `/previews` дополнительно закрыты в Nginx независимо от состава релиза. Новые lossless product derivatives намеренно используют перепроверку свежести, без обещания immutable.

## Проверка заголовков после ручного размещения

Команды ниже выполняют только GET/HEAD. Они не отправляют заявок. На Windows использовать `curl.exe` вместо PowerShell alias `curl`. Для shell примеров:

```sh
PROMIX_ORIGIN=https://pro-mix.ru

# HTML: 200, text/html, Cache-Control: no-cache
curl -sSI "$PROMIX_ORIGIN/"
curl -sSI "$PROMIX_ORIGIN/products/"

# HTTP/2; curl должен быть собран с поддержкой HTTP2
curl --http2 -sS -o /dev/null -w 'HTTP %{http_version}; TTFB %{time_starttransfer}s; total %{time_total}s\n' "$PROMIX_ORIGIN/"

# Gzip проверять GET: Content-Encoding: gzip и Vary: Accept-Encoding
curl -sS -H 'Accept-Encoding: gzip' -D - -o /dev/null "$PROMIX_ORIGIN/"
curl -sS -H 'Accept-Encoding: identity' -D - -o /dev/null "$PROMIX_ORIGIN/"

# Brotli только если модуль вручную включён: ожидается br для большого HTML
curl -sS -H 'Accept-Encoding: br' -D - -o /dev/null "$PROMIX_ORIGIN/"

# Ровно один HTTPS redirect; сохранить существующее поведение www
curl -sSIL --max-redirs 5 "http://pro-mix.ru/products/"
curl -sSIL --max-redirs 5 "https://www.pro-mix.ru/products/"

# Нехешированный локальный шрифт: revalidation, без gzip
curl -sSI "$PROMIX_ORIGIN/fonts/manrope/manrope-cyrillic-variable.woff2"

# Подставить реальный JS URL из текущего HTML/DevTools Network:
PROMIX_HASHED_JS='/_astro/REPLACE_WITH_REAL_BUILD_NAME.js'
curl -sSI "$PROMIX_ORIGIN$PROMIX_HASHED_JS"
curl -sS -H 'Accept-Encoding: gzip' -D - -o /dev/null "$PROMIX_ORIGIN$PROMIX_HASHED_JS"

# Проверенный fingerprint: immutable, image/webp, без Content-Encoding gzip
curl -sSI "$PROMIX_ORIGIN/images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-640.webp"

# PDF: application/pdf, public max-age=86400, без immutable/gzip
curl -sSI "$PROMIX_ORIGIN/documents/promix-sgr-shpatlevki-2026.pdf"

# Manifest: application/manifest+json; XML: корректный MIME
curl -sSI "$PROMIX_ORIGIN/site.webmanifest"
curl -sSI "$PROMIX_ORIGIN/sitemap-index.xml"

# Неизвестные URL/preview/assets: настоящий 404, без immutable
curl -sSI "$PROMIX_ORIGIN/performance-audit-missing-page/"
curl -sSI "$PROMIX_ORIGIN/_astro/performance-audit-missing.abcdefgh.js"
curl -sSI "$PROMIX_ORIGIN/previews/"

# Безопасный GET к API: 405 JSON/Allow: POST/no-store, письмо не отправляется
curl -sS -D - -o /dev/null "$PROMIX_ORIGIN/api/lead.php"
```

Для JS/CSS/WOFF2 из `_astro` брать реальные имена из текущего релиза, затем повторять `curl -sSI` и GET с `Accept-Encoding: gzip`; статический пример старого хеша после новой сборки может вернуть 404. Для JSON/SVG/XML/manifest меньше 1024 bytes отсутствие gzip ожидаемо. Проверить хотя бы один большой CSS/JS/SVG и каждый MIME. Для повторной проверки вставить фактический `ETag` из предыдущего ответа:

```sh
curl -sSI -H 'If-None-Match: "ACTUAL_ETAG_FROM_RESPONSE"' "$PROMIX_ORIGIN/fonts/manrope/manrope-cyrillic-variable.woff2"
```

Ожидается 304 для неизменившегося файла. Не копировать условное значение ETag буквально. Отдельно подтвердить cache-hit в DevTools на повторной навигации. Сравнить cold/warm Lighthouse и waterfall после реального применения серверной конфигурации; локальные измерения не подтверждают production compression, сеть до FirstVDS или TTFB внешнего посетителя.

В браузере проверить: главную, каталог с категорией/поиском/back-forward, продукт с PDF, длинный продукт, документы, anchors production/partners/contacts, mobile menu, cookies, modal keyboard focus. Success/error/timeout форм проверять только перехватом сетевого запроса с mock-ответами, блокируя реальный POST. Проверку SMTP-доставки проводить лишь отдельно по явному разрешению владельца.
