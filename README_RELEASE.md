# PROMIX — кандидат размещения promix-2026.10.23-rc1

Подготовлено 23.10.2026. Production не изменялся, сайт не публиковался, реальные заявки и письма не отправлялись. Данные FirstVDS и почтового провайдера пока не предоставлены.

Эта инструкция и папка deploy описывают текущую подготовку. Старые README_TRANSFER, PROJECT_TRANSFER_MANIFEST и CHECKSUMS — исторические материалы; их версии и контрольные суммы не являются манифестом этого релиза.

- [Версия](RELEASE_VERSION.json). Точный финальный commit и SHA архивов находятся во внешнем RELEASE_MANIFEST.json рядом с архивами. Git tag: promix-2026.10.23-rc1; checkpoint после QA: 0a1b466f45a685c86eec5abcc2d4e1650f2a87a4.
- [План FirstVDS, установка, backup и откат](deploy/FIRSTVDS_DEPLOY_PLAN.md).
- [Проверки реального production](deploy/PRODUCTION_ACCEPTANCE_CHECKLIST.md) — пока NOT TESTED.
- [SMTP, заголовки, DNS и доставка](deploy/SMTP_PRODUCTION_CHECKLIST.md).
- [Открытые риски, включая DEP-01](deploy/RELEASE_RISK_REGISTER.md).
- [Недостающие документы товаров](deploy/MISSING_PRODUCT_DOCUMENTS.md).
- [52 предложения по старым URL](deploy/OLD_URL_DECISIONS_PROPOSED.md) и [машиночитаемая карта](deploy/OLD_URL_DECISIONS_PROPOSED.json): 32×301, 17×410, 3×404, все PROPOSED и не включены в конфигурацию.
- [Сводка завершённого QA](deploy/QA_BASELINE_SUMMARY.md), включая SHA четырёх исходных отчётов. Полные внешние QA-артефакты в исходный ZIP не включены.

Исходный ZIP — резервная копия отслеживаемых файлов из точного Git commit, включая документацию и исходники dev previews. Он не предназначен для размещения целиком в webroot. В нём нет .git, node_modules, backend/vendor, реального config.php/.env, состояния заявок, логов и браузерных профилей.

Runtime ZIP содержит dist, код backend с composer.lock и sample config, RELEASE_VERSION.json. Backend/vendor устанавливается Composer по lock в новой версии на сервере. Документы, исходные previews, тестовые страницы и служебные отчёты не включаются в публичную сборку. Единственный public root — current/dist; backend/config/state находятся вне него.

Новый Nginx пример использует отдельный абсолютный include с теми же 42 утверждёнными соответствиями (76 точных вариантов), чтобы HTTP/www вели сразу на конечный canonical URL. Старый проверенный относительный include сохранён. Не подключать оба варианта одновременно.

Восстановление исходников: распаковать source ZIP в отдельную папку, проверить SHA архива по внешнему манифесту, установить доверенные Node/pnpm и зависимости командой `pnpm install --frozen-lockfile`, затем `pnpm run build`. Версии Node/pnpm записаны в RELEASE_VERSION.json. Этот способ не восстанавливает секреты и состояние заявок — администратор хранит их отдельной защищённой копией. Команды сервера, Composer, права, согласованное переключение и откат описаны в плане FirstVDS.

Перед размещением нужны параметры сервера, подтверждённая SMTP-учётная запись/From/DNS, решение по предложенным URL и открытым рискам, затем отдельное согласование production-работ и одной тестовой заявки. Локальный SMTP QA не подтверждает доставку на FirstVDS.
