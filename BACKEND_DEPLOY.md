# PROMIX: серверная конфигурация, ещё требующая приёмки

Фактический endpoint — **POST /api/lead.php**, существующие PHP и PHPMailer. В этой задаче сервер, DNS, хостинг и реальная почта не менялись; указанные ниже действия — оставшиеся проверки администратора, а не выполненный деплой.

1. Проверить PHP 8.1+ с OpenSSL/JSON/mbstring и Composer 2; установить существующий backend/composer.lock без смены пакетов. Composer требует PHP ZIP либо архивный utility.
2. Разместить config/, src/, vendor/ и state вне публичного webroot. Разрешить исполнение только нужного entrypoint, связанного с /api/lead.php. Статическая Astro-сборка PHP не запускает.
3. Создать приватный backend/config/config.php из example. Файл читает process env через getenv(); корневой .env сам не работает. Имена, ограничения и политика — в [backend/README.md](backend/README.md) и [.env.example](.env.example).
4. Получить у SMTP-администратора действительные host, port, TLS, account/password и разрешённый From. LEADS_TO_EMAIL контролируется сервером. MAIL_FROM / MAIL_TO не читаются. Mail.ru defaults — совместимость прежнего example, не настройка FirstVDS.
5. Задать случайный LEADS_STORAGE_SECRET не менее 32 байт и приватный LEADS_STORAGE_PATH с локальным flock/atomic rename, общим для PHP workers. Сохранять state и секрет при рестарте; утрата истории или её TTL снимает защиту прежних ID от повторов. Для нескольких серверов текущая файловая реализация недостаточна без общего transactional store.
6. Проверить лимиты (по умолчанию 5/client и 100/global за 900s), срок ID не менее клиентских 24h и необходимую физическую очистку при простое. Counter/log не должен содержать телефоны, тексты или raw IP.
7. По умолчанию используются REMOTE_ADDR и игнорируется XFF. Если есть trusted proxy, настроить его точный IP и overwrite X-Forwarded-For ровно одним проверенным IP; цепочки не поддерживаются.
8. Сверить timeout PHP-FPM/Nginx со SMTP per-command timeout (8s по умолчанию, DATA time limit удваивается) и клиентскими 12s. Не трактовать browser abort как отмену уже начатой доставки.
9. С разрешения владельца выполнить реальную synthetic приёмку, отдельно записав HTTP accepted, SMTP acceptance и фактическое получение на simkraski@mail.ru (включая папку спама). Локальные fixture не заменяют её.
10. Проверить отрицательные сценарии: 422, 429/Retry-After, 409 content mismatch, pending/unknown, отсутствующая конфигурация, SMTP/хранилище, рестарт. Ни один неподтверждённый исход не должен показывать успех. Полный API-контракт: backend/README.md.
11. Отдельно проверить согласие и разрешённую рабочую аналитику после приёмки владельцем. promix:lead-success допускается только для подтверждённого accepted ID, без имени/телефона/текста, без дублей. Тесты должны перехватывать внешние счётчики.
