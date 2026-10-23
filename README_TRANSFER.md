# PROMIX — перенос проекта

Архив содержит текущее рабочее состояние `promix-site`, включая локальные правки. Исходный проект: `E:\bulat\design\promix-site`. Старая копия ZIP от 28.09.2026 не использовалась. Дизайн, код, данные и рабочие изображения сохранены без изменений.

1. **Node.js.** Для повторения проверенного окружения рекомендуется Node.js **24.19.0**. Проект — Astro **5.18.2** по lock-файлу, TypeScript, статическая сборка.

2. **Package manager.** Используется **pnpm 11.25.0**, lock-файл `pnpm-lock.yaml`. При отсутствии pnpm установите его: `npm install --global pnpm@11.25.0`. Сохраните также `pnpm-workspace.yaml`: в нем настройки сборки зависимостей esbuild/sharp. Установке нужен доступ к реестру пакетов.

3. **Установка.** Распакуйте ZIP в новую папку, откройте вложенную папку `PROMIX_SITE_TRANSFER` как проект в Codex и выполните в ее терминале:

   ```powershell
   pnpm install --frozen-lockfile
   ```

   Команда устанавливает версии из lock-файла. `node_modules` в архиве отсутствует. Для воспроизведения проекта не заменяйте lock-файл и не используйте старую папку `dist`.

4. **Dev server.** В корне распакованного проекта:

   ```powershell
   pnpm run dev
   ```

   Адрес: `http://localhost:4173`. Команды соответствуют scripts текущего `package.json`.

5. **Production build.**

   ```powershell
   pnpm run build
   ```

   Скрипт выполняет `astro check && astro build`, результат появляется в `dist/`. Дополнительная проверка типов: `pnpm run check`.

6. **Preview.** После сборки:

   ```powershell
   pnpm run preview
   ```

   Адрес: `http://localhost:4173`. Preview показывает статическую сборку. PHP backend запускается отдельно; proxy `/api` задан в Astro для dev server.

7. **Env и отправка форм.** Для сборки и просмотра сайта env-переменные не требуются. Для реальной отправки заявок нужны PHP 8.1+, расширения OpenSSL/JSON, Composer 2 и приватные SMTP-настройки. Для распаковки зависимостей Composer включите расширение PHP ZIP либо установите unzip/7z. Все имена из текущего `backend/config/config.example.php` перечислены в `.env.example` без значений:

   `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `LEADS_FROM_EMAIL`, `LEADS_TO_EMAIL`, `SMTP_TIMEOUT_SECONDS`, `LEADS_STORAGE_PATH`, `LEADS_STORAGE_SECRET`, `LEADS_RATE_WINDOW_SECONDS`, `LEADS_RATE_CLIENT_LIMIT`, `LEADS_RATE_GLOBAL_LIMIT`, `LEADS_IDEMPOTENCY_TTL_SECONDS`, `LEADS_TRUSTED_PROXIES`. PHP исполняет приватный `backend/config/config.php` и читает process env через `getenv()`; корневой `.env` автоматически не загружается. `MAIL_FROM` / `MAIL_TO` не читаются. Актуальные API-коды, лимиты, idempotency, proxy trust и ограничения — в `backend/README.md`.

   PHP не загружает `.env` автоматически. Создайте локальную конфигурацию из шаблона, затем задайте настройки в ней либо передайте переменные окружения процессу PHP:

   ```powershell
   cd backend
   composer install --no-dev --optimize-autoloader
   Copy-Item config/config.example.php config/config.php
   cd ..
   ```

   В `backend/config/config.php` задайте подтверждённые SMTP-настройки, случайный секрет хранилища не менее 32 байт и приватный каталог state вне webroot, общий для PHP workers. Example с `CHANGE_ME` не является готовой настройкой. Файл приватный; не включайте его и state в публичные файлы. Чтобы проверить формы в dev, в отдельном терминале из корня проекта запустите:

   ```powershell
   php -S 127.0.0.1:8080 -t backend/public
   ```

   В другом терминале запустите `pnpm run dev`: запросы `/api/*` проксируются на PHP. Детали есть в `backend/README.md` и `BACKEND_DEPLOY.md`. Перенос проверяет сборку; реальные письма в рамках этой задачи не отправлялись.

8. **Product data.** `src/data/products.ts` — товары, категории, изображения, видимость и фильтры; `src/data/product-brochure-current.json` и `src/data/current-brochure.ts` — актуальные свойства; `product-brochure.ts` и `product-brochure-2025.json` — дополнительные данные; `finishing-stages.ts` — этапы отделки; `documents.ts` — связи документов с товарами.

9. **Изображения продукции.** `public/images/products/`, прежде всего `public/images/products/current/`. Сохранены новые SUPER TACK `*-transparent.png`, актуальный `su-kush-updated.png`, `deep-primer-ru.png` и остальные грунтовки. Категории, фоны и материалы — `public/images/categories/` и остальные подкаталоги `public/images/`. Исходники графики и prompts — `assets/`.

10. **PDF и документы.** СГР: `public/documents/promix-sgr-shpatlevki-2026.pdf`; сертификаты: `public/images/certificate-conformity.jpg` и `certificate-appendix.jpg`. Привязки — `src/data/documents.ts`, страница — `src/pages/documents/index.astro`. Сохранены `docs/`, документация backend и лицензии шрифтов.

11. **Основные routes.** `/`, `/products/`, `/products/<slug>/` (30 страниц товаров), `/documents/`, `/privacy/`, `/personal-data/`, `/cookies/`. Предпросмотры: `/previews/home-refinement/`, `/previews/task-compact/`, `/previews/task-grounding/`, `/previews/products-reference/`. Endpoint форм: `/api/lead.php` в `backend/public/api/lead.php`. `public/robots.txt` сохранен; sitemap генерируется при сборке интеграцией `@astrojs/sitemap`, домен задан в `astro.config.mjs`.

12. **Что важно сохранить.** Всю папку `src/`, всю рабочую графику и документы `public/`, `assets/`, `backend/`, `scripts/`, `package.json`, оба lock-файла pnpm/Composer, `pnpm-workspace.yaml`, конфигурации и `.gitignore`. Локальные шрифты — `public/fonts/`, бренд — `src/assets/brand/` и `public/brand/`, favicon — корневые файлы `public/`; подключения Inter/Playfair восстанавливаются из npm-зависимостей. Motion, каталог, фильтры, формы и SEO сохранены в текущем виде. Git-репозитория в исходной папке нет: история, ветки и bundle отсутствуют.

Исторические скрипты `scripts/prepare-products.cjs`, `optimize-section-media.cjs`, `split-system-layers.cjs`, `qa-marble.mjs` содержат привязки к инструментам/файлам прежнего ПК. Prompts и QA-заметки также сохраняют пути происхождения. Они оставлены без правок для сохранения исходников и не запускаются командами установки, dev, build или preview. Уже подготовленные рабочие assets находятся внутри проекта; для запуска и сборки внешние файлы старого ПК не нужны. Повторный запуск этих отдельных старых утилит потребует настройки их инструментов и входных файлов.

В ZIP намеренно не включены зависимости, сборка, кеши, логи, временные QA-скриншоты и приватные конфигурации. Список и результаты проверки — `PROJECT_TRANSFER_MANIFEST.txt`; контрольные суммы файлов — `PROJECT_TRANSFER_CHECKSUMS.sha256` (кроме самого файла сумм).
