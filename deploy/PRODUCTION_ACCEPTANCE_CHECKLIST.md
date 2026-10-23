# PROMIX — приёмка реального размещения

Дата подготовки: 23.10.2026 (Europe/Astrakhan). Версия-кандидат: `promix-2026.10.23-rc1`; точный commit/SHA — в релизном манифесте. Production не посещался в рамках этой приёмки и не изменялся. Статусы ниже относятся только к FirstVDS, а не к ранее пройденным локальным тестам.

Допустимые статусы: **PASS** — выполнено на указанной реальной среде с доказательством; **FAIL** — получен воспроизводимый неверный результат; **NOT TESTED** — проверка не выполнялась или нет данных. После проверки записать UTC-время, домен/IP, commit, проверявшего и безопасный артефакт; не сохранять пароли, MIME письма с контактами, HAR с данными заявки и реальные контакты в репозитории.

| Проверка на FirstVDS | Ожидаемый результат / метод | Статус | Доказательство |
|---|---|---|---|
| Версия и public root | Commit/манифест совпадают; webroot только `current/dist`; backend соседний, private config/state вне webroot | NOT TESTED | — |
| HTTPS | Доверенная цепочка, действующий сертификат для apex и www; TLS1.2/1.3; никаких mixed content | NOT TESTED | — |
| Основной домен | HTTP и HTTPS www дают 301 на `https://pro-mix.ru` с path/query; без циклов | NOT TESTED | — |
| ACME/продление | Выбранная реальная процедура renewal успешно прошла dry-run, HTTPS после reload работает | NOT TESTED | — |
| Все маршруты | 35 обычных маршрутов из release + текущий sitemap: 200, корректные title/canonical, один H1 | NOT TESTED | — |
| Каталог и поиск | Поиск, категории, очистка/пустой результат, быстрый выбор, Back/Forward работают | NOT TESTED | — |
| Документы | Все опубликованные PDF дают 200, application/pdf и действительно открываются в браузере | NOT TESTED | — |
| Изображения | Нет 404/decode errors; корректные srcset; оригинальная композиция на desktop/mobile | NOT TESTED | — |
| Кеш/сжатие | Только существующие fingerprint assets immutable; HTML revalidate; API no-store; gzip текстовых ресурсов | NOT TESTED | — |
| API без отправки | GET `/api/lead.php` — 405 JSON + Allow: POST, без письма; произвольный PHP/API недоступен | NOT TESTED | — |
| Приватность и права | `.env`, `.git`, backend/config/vendor/state, копии и архивы недоступны; PHP не может менять source/dist | NOT TESTED | — |
| Доверенный proxy | Реальный client IP используется верно; произвольный XFF не меняет ключ лимита; без proxy trust пуст | NOT TESTED | — |
| Форма с рабочей почтой | Только после отдельного разрешения: одна помеченная синтетическая заявка из браузера → accepted с тем же ID | NOT TESTED | — |
| Доставка в `simkraski@mail.ru` | Ответственный нашёл тестовое письмо во «Входящих»/«Спаме», подтвердил timestamp/Submission ID, HTML/text и кодировку | NOT TESTED | — |
| Заголовки почты | Разрешённый From; Reply-To соответствует политике (текущая форма email не собирает, Reply-To не задаётся); Return-Path/provider проверен по письму | NOT TESTED | — |
| Контекст письма | Тип заявки, товар+slug, source/sourcePage, пять UTM только с consent, время+Submission ID совпали с синтетическим сценарием | NOT TESTED | — |
| SPF/DKIM/DMARC | Проверены для фактического From/Return-Path/signing domain; Authentication-Results показывает ожидаемую alignment/policy | NOT TESTED | — |
| Повторная отправка | После разрешённого теста повтор **того же** ID/содержимого не создаёт второго письма; accepted replay, не новый ID | NOT TESTED | — |
| Лимиты/спам | Политика утверждена; 429/Retry-After и validation проверены изолированно, без массовой отправки рабочей почты | NOT TESTED | — |
| Ошибки формы | На отдельной безопасной тестовой среде при transport failure нет ложного успеха; ввод сохранён; unknown не пересылается автоматически | NOT TESTED | — |
| Логи | Нет тела формы, телефонов, имён, SMTP password/debug; доступ и retention настроены; error log/query риск отдельно принят | NOT TESTED | — |
| Консоль и сеть | Нет критических JS ошибок, отсутствующих assets и mixed content в обычных сценариях | NOT TESTED | — |
| 404 | Неизвестный URL и удалённая latex-paint: настоящий 404 с русской страницей; не soft404/200 | NOT TESTED | — |
| Точные 301/410 | Утверждённая карта URL: ожидаемый статус и цель, query preserved, без циклов; 52 предложения применяются только после утверждения | NOT TESTED | — |
| Служебные пути | `/preview`, `/preview/`, `/previews`, `/previews/`, служебные отчёты/ZIP отсутствуют в public release | NOT TESTED | — |
| Мобильная версия | На реальных iPhone/Safari и Android/Chrome: первый экран, меню, каталог, PDP, PDF, форма; затем desktop и zoom 200/400% | NOT TESTED | — |
| Откат | Проверена доступность предыдущей версии и config backup; репетиция symlink rollback на изолированной среде; config/secret/state сохранены | NOT TESTED | — |

Существующий локальный QA остаётся отдельным доказательством: [FINAL_REPORT.md](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/FINAL_REPORT.md), [TEST_COVERAGE.md](../../PROMIX_FINAL_QA_2026-10-22_20-58-49/TEST_COVERAGE.md). Там пройдены локальные PHP/SMTP 18/18, browser→API→контролируемый SMTP 11/11 и Nginx 76/76 redirect + 9/9 404. Это **не подтверждает** сервер, внешнюю аутентификацию SMTP, DNS почты или попадание письма в рабочий mailbox.

Новый release Nginx template прошёл отдельный [локальный smoke](../../PROMIX_RELEASE_PREP_2026-10-23_11-16-07/results/nginx-release-check.json): syntax,228 одношаговых301,7canonical redirects,6retained200,15negative404,ACME,cache/gzip и GET API route через FastCGI stub. TLS и настоящий PHP-FPM заменены адаптером; почта/production не вызывались. Это локальные PASS и не меняет ни одного production статуса выше.
