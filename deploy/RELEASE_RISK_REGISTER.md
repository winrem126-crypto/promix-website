# PROMIX: риски релиза на FirstVDS

23 октября 2026 года. Подготовка релиза на основе завершённого QA, без повторного аудита, обновления пакетов или изменения production.

Основа: [FINAL_REPORT](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/FINAL_REPORT.md), [FINDINGS_STATUS](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/FINDINGS_STATUS.md), [REQUIRED_INPUTS](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/REQUIRED_INPUTS.md), [TEST_COVERAGE](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/TEST_COVERAGE.md), [предыдущий разбор DEP-01](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/notes/DEP-01.md).

## Решение по DEP-01

**DEP-01 остаётся открытым условным риском среды разработки и сборки. По имеющимся доказательствам он не требует переделывать уже проверенный интерфейс и не доказывает возможность эксплуатации 14 уязвимостей публичного сайта.** Допуск текущего кандидата к размещению обоснован только архитектурой «готовый `dist` через Nginx + отдельный PHP-FPM endpoint». Серверная приёмка этой архитектуры ещё **NOT TESTED**.

В предыдущем registry audit было 14 записей: 3 low, 5 moderate, 5 high, 1 critical. Это исторический результат QA, а не новый audit на дату этого документа. Здесь повторно прочитаны официальные описания именно этих 14 записей; новый поиск всех уязвимостей и новый registry audit не запускались. Версии и lock не изменялись.

Текущие версии по lock/установленному Astro: Astro 5.18.2, Sharp 0.34.5, esbuild 0.27.7 в цепочке Astro и 0.25.12 в цепочке Vite. PHP runtime использует PHPMailer 6.12.0 по Composer lock. Предыдущий `composer audit --locked` дал 0 advisories; это результат 22 октября, не бессрочная гарантия.

В `astro.config.mjs` нет SSR adapter и `output: 'server'`, сайт собирается статически. По завершённой проверке путей нет публичного Node image service, actions, server islands, hydrated islands, запроса к Node для 404 или загрузок пользовательских изображений. Уточняющее чтение текущего config/package и поиск тех же конструкций 23 октября этого не изменили. Единственный `define:vars` обнаружен в исключённой из release локальной preview-странице с локальными данными. Служебные image-скрипты действительно используют Sharp: риск обработки нового недоверенного исходника относится к сборочной машине, даже если Node не установлен на FirstVDS.

### Все 14 записей и применимость

Ссылки ведут на первичные advisories сопровождающих пакетов, прочитанные 23 октября. «Fix» — опубликованный upstream порог, а не команда обновления данного проекта. Severity в таблице сохраняет предыдущий registry snapshot.

| Запись | QA severity | Условие из первичного источника / fix | Применимость текущему размещению |
| --- | --- | --- | --- |
| Astro [GHSA-j687-52p2-xcff](https://github.com/withastro/astro/security/advisories/GHSA-j687-52p2-xcff) | moderate | Недоверенные значения в `define:vars`; fix 6.1.6 | Нет такого production sink; request → Astro rendering отсутствует. Не передавать недоверенный контент в build. |
| Astro [GHSA-xr5h-phrj-8vxv](https://github.com/withastro/astro/security/advisories/GHSA-xr5h-phrj-8vxv) | low | Replay параметров server islands; fix 6.1.10 | Server islands отсутствуют. |
| esbuild [GHSA-g7r4-m6w7-qqqr](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr) | low | Чтение файлов через Windows `serve`/`servedir`; fix 0.28.1 | Публичного esbuild server нет, `esbuild.serve` не вызывается. Установленный пакет сам по себе не создаёт этот endpoint. |
| Astro [GHSA-jrpj-wcv7-9fh9](https://github.com/withastro/astro/security/advisories/GHSA-jrpj-wcv7-9fh9) | moderate | Недоверенные ключи spread props при rendering; fix 6.4.6 | Нет request-driven Astro rendering/недоверенных prop keys. |
| Sharp [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) | high | Декодирование недоверенных изображений libvips; fix 0.35.0 | Нет image/upload runtime; остаётся build-риск при новых недоверенных файлах. |
| Astro [GHSA-f48w-9m4c-m7f5](https://github.com/withastro/astro/security/advisories/GHSA-f48w-9m4c-m7f5) | moderate | Недоверенные ключи custom HTMLElement props и DOM-capable SSR; maintainer fix 7.0.5 | Условий SSR/DOM shim и такого rendering нет. |
| Astro [GHSA-7pw4-f3q4-r2p2](https://github.com/withastro/astro/security/advisories/GHSA-7pw4-f3q4-r2p2) | low | Недоверенные transition directives на hydrated islands; fix 7.0.4 | Hydrated islands и эти директивы отсутствуют. |
| Astro [GHSA-4g3v-8h47-v7g6](https://github.com/withastro/astro/security/advisories/GHSA-4g3v-8h47-v7g6) | moderate | Недоверенные свойства View Transition animation; fix 7.1.0 | View Transition rendering отсутствует. |
| Astro [GHSA-2pvr-wf23-7pc7](https://github.com/withastro/astro/security/advisories/GHSA-2pvr-wf23-7pc7) | high | SSR HTTP-fetch prerendered error page с Host-derived origin; fix 6.4.6 | Nginx читает готовый `404.html` с диска; Node SSR/error fetch отсутствуют. |
| Astro [GHSA-8hv8-536x-4wqp](https://github.com/withastro/astro/security/advisories/GHSA-8hv8-536x-4wqp) | high | Недоверенные slot names в hydrated component; fix 6.3.3 | Hydration/client directives и динамический SSR отсутствуют. |
| Astro [GHSA-26w7-cxv4-gfx2](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2) | critical | Обработка специально сформированного AVIF через Sharp/libheif; fix Astro 7.2.8 | Готовый WebP/PNG не исполняет optimizer. Нельзя принимать недоверенные AVIF в текущую build-среду. |
| Astro [GHSA-376h-93r7-7g6f](https://github.com/withastro/astro/security/advisories/GHSA-376h-93r7-7g6f) | moderate | Non-root base + middleware pathname authorization; fix 7.2.4 | Нет non-root base и runtime middleware authorization. |
| Sharp [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c) | high | Недоверенные AVIF/libheif, возможен RCE; fix 0.35.4 | Условный build-риск; сетевого optimizer на FirstVDS нет. |
| Sharp [GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) | high | Декодирование SVG через librsvg, возможен RCE при условиях runtime; fix 0.35.5 | Существующие SVG — локальные доверенные исходники; новые сторонние SVG нельзя автоматически обрабатывать старым toolchain. |

Источники неодинаково детализируют affected ranges. Например, текущая maintainer-страница `f48w` указывает low и 7.0.5, а сохранённый registry record — moderate и >=7.0.6; esbuild maintainer перечисляет 0.27.3, snapshot registry отмечает установленную 0.27.7; slot advisory демонстрирует 6.3.1, snapshot также охватывает 5.18.2. Эти расхождения сохранены явно. Ни запись registry, ни более узкое описание примера не используются как самостоятельное доказательство наличия/отсутствия reachable пути. Старый QA snapshot не переписан ради уменьшения счётчика.

## Обязательные условия перед разрешением запуска

| Приоритет | Условие | Почему / критерий приёмки | Текущий production статус / ответственный |
| --- | --- | --- | --- |
| Блокирует публикацию | Webroot только release `dist`; backend/config/vendor/storage и ZIP вне webroot | Нельзя публиковать репозиторий целиком. HTTP `.env`, config, `.git`, backup, произвольный PHP/API → 404; выполняется только точный `/api/lead.php`. | NOT TESTED — администратор |
| Блокирует публикацию | Настоящие Nginx + PHP-FPM, без `astro dev`, `astro preview`, `php -S` или Node optimizer на публичном порту | Сохраняет архитектурную границу, на которой основана оценка DEP-01. | NOT TESTED — администратор |
| Блокирует публикацию | Актуальные security updates ОС/Nginx/PHP/OpenSSL и рабочий TLS | Их фактические версии/пакеты FirstVDS ещё неизвестны; локальный QA их не проверяет. | NOT TESTED — администратор |
| Блокирует рабочие формы | Приватный `config.php`, безопасная передача SMTP credentials, фиксированный получатель | Пароли не в Git/ZIP/dist/CLI/history; `LEADS_TO_EMAIL=simkraski@mail.ru`, разрешённый From и TLS подтверждены провайдером. | NOT TESTED — администратор почты |
| Блокирует рабочие формы | Общие локальные state и secret сохраняются при release switch/rollback | PHP workers используют один writable private каталог, `flock`/atomic rename; `LEADS_STORAGE_SECRET` не меняется вместе с релизом. При недоступности — 503, не ложный success. | NOT TESTED — администратор |
| Блокирует рабочие формы | Правильный client IP, proxy trust и лимиты | Без proxy — пустой trust и REMOTE_ADDR. С proxy — exact IP и overwrite одного XFF; не доверять произвольному клиентскому XFF. | NOT TESTED — администратор/владелец |
| Блокирует объявление mail-ready | Отдельно разрешённая синтетическая доставка и подтверждение mailbox | `201 accepted` означает SMTP acceptance; требуется фактическое письмо в `simkraski@mail.ru` и проверка заголовков/содержимого. | NOT TESTED — владелец mailbox |
| Блокирует объявление mail-ready | SPF/DKIM/DMARC фактического From/envelope/signing домена | Сайт `pro-mix.ru` и почтовый домен не обязаны совпадать. Нужны реальный From, transport, selector, authentication results. | NOT TESTED — администратор почты/DNS |
| Обязательная эксплуатационная мера | Логи без payload, credentials, полных SMTP trace и URL query | API body не логировать; обычный access-log с `$request`/referer может сохранять query. Выбрать безопасный формат/retention и ограничить доступ. | NOT TESTED — администратор/ответственный за данные |

Эти пункты являются требованиями к будущему размещению, а не утверждением обнаруженной ошибки на сервере. Без доступа к архитектуре нельзя присвоить им PASS или FAIL.

### Граница Git, ZIP и размещаемых файлов

Релиз-кандидат: `promix-2026.10.23-rc1`; точный commit/build/ZIP SHA фиксирует основной release manifest. Подготовленные инструкции не означают разрешение применять конфигурацию.

- Git и source ZIP должны включать исходники, lock-файлы, публичные assets, шаблоны config (`.env.example`/`config.example.php`) и инструкции. Реальные `.env`, `backend/config/config.php`, state, логи, keys, SMTP credentials, cache/browser profiles и старые QA/backup каталоги исключаются независимо от `.gitignore`.
- Для ZIP использовать список разрешённых файлов зафиксированного commit, а затем проверить состав архива; нельзя просто архивировать весь рабочий каталог с untracked файлами. `.git` и сам ZIP также не нужны внутри source backup.
- Для Nginx webroot допустим только проверенный build `dist`, где нет preview, исходников backend, отчётов, конфигурации и резервных архивов. Source ZIP хранится вне public root и не является деревом для прямого HTTP serving.
- Полная QA-папка не входит в source ZIP: переносимая [QA_BASELINE_SUMMARY.md](QA_BASELINE_SUMMARY.md) сохраняет результаты и SHA четырёх первичных отчётов, без test MIME, browser data и частных журналов.
- Проверка build-состава/манифеста фиксирует локальную пригодность пакета, а не безопасность пока неизвестного production filesystem. Изменение lock/приложения после tag требует нового build и новой версии, а не изменения содержимого прежнего tag.

## Условные риски и следующий отдельный этап

- Собирать релиз в изолированной среде с доверенными исходниками и frozen lock; не запускать toolchain от root, не передавать ему production SMTP secrets. На сервер переносить готовый статический build. Зависимости runtime PHP устанавливать по Composer lock с `--no-dev`.
- Не открывать dev/preview наружу и не разрешать `allowedHosts: true`. Loopback уменьшает поверхность, но не исправляет affected пакеты и не делает обработку недоверенного файла безопасной.
- До появления upload/CMS с недоверенным контентом, Node SSR/actions/islands, remote image processing либо публичного dev server **сначала** выполнить отдельную миграцию Astro/Sharp/esbuild с регрессией и свежим dependency audit. Для untrusted image processing critical/high записи становятся обязательным исправлением до включения пути.
- Для полного закрытия DEP-01 запланировать проверенную миграцию к совместимому стеку с исправлениями всех 14 записей либо upstream backports. Не применять forced overrides или major update в уже зафиксированном кандидате без отдельной проверки. Owner риска: разработчик/ответственный за релиз. Дата принятия остаточного риска владельцем: не получена.
- Антиспам текущего API: honeypot, 1,2 s min-fill, валидация, 32 KiB JSON, лимиты и идемпотентность. Это не гарантирует защиту от DDoS или распределённого спама; потребность в edge-ограничениях оценивается по реальному трафику без ослабления API-контракта.
- Single-host storage не поддерживает несколько узлов с независимыми дисками. Масштабирование требует единого transactional store, а не копирования state в произвольный NFS.

## Коммерческие и документальные риски

Без выдумывания характеристик сохраняются CAT-01/CAT-02/DOC-01: решение по трём hidden SKU, утверждённые данные двух грунтовок и транспортировки 20 SKU, фото H 0,3, документы 19 SKU. Это вопросы производителя/владельца, не PHP security fixes. [Исходный точный список](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/REQUIRED_INPUTS.md) остаётся действующим; недостающие документы перечислены отдельно в [MISSING_PRODUCT_DOCUMENTS.md](MISSING_PRODUCT_DOCUMENTS.md).

Все реальные серверные и почтовые проверки на момент подготовки имеют **NOT TESTED**. Действующие DNS/SMTP/server config не читались и не менялись; SMTP-соединений и писем в этом этапе не было.
