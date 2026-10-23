# PROMIX — performance-аудит после оптимизации

**СТАТУС: PROVISIONAL — проверенный snapshot, текущий проект ещё не принят.** Пользователь подтвердил параллельную работу над проектом в другом чате. После фиксации исходников обнаружены сторонние изменения. Результаты ниже относятся к сохранённой оптимизированной production-сборке, а не автоматически к последнему состоянию общего каталога. Финальная приёмка актуального проекта требует завершения параллельных изменений, новой чистой production-сборки и повторения полного QA.

Дата отчёта: 20.10.2026, 19:25:47 Europe/Astrakhan. Freeze исходников: 20.10.2026, 18:49:09 Europe/Astrakhan. Проверка расхождения: 20.10.2026, 19:22:35 Europe/Astrakhan; изменённые после freeze файлы: `src/components/FramedProductImage.astro`, `src/components/ProductCard.astro`, `src/components/ProductStageScene.astro`, `src/styles/product-shadow.css`. Их изменения не приписываются performance-pass и не перезаписывались.

Сравниваются [исходная production-сборка](artifacts/performance/before-dist/) и [замороженная оптимизированная сборка](artifacts/performance/optimized-dist/). Последняя обслуживается изолированным Astro preview на127.0.0.1:4323; baseline при visual QA — отдельным snapshot server4324. Deploy не выполнялся, сервер FirstVDS не изменялся, реальные заявки не отправлялись.

Главный результат snapshot: mobile cold Performance **Главная 86; Каталог 93; PROMIX H 0,2 92; Документы 99**; desktop cold и все warm запуски —100. При этом цель LCP≤2,5s не достигнута на Главная (4,057s), Каталог (3,019s), PROMIX H 0,2 (3,305s); Главная остаётся ниже90. Эти результаты не заменены более удачным профилем или диагностикой reduced-motion.

Отдельная Browser Fast4G серия выявила ухудшение наблюдаемого mobile cold LCP: Каталог 1,672→3,964s; Категория грунтовок 2,068→5,340s; Поиск «грунт» 1,964→4,500s. В этих runs изменился LCP-кандидат background→packshot; окно load+1,8s также зависит от момента load и eager/lazy. Это не позволяет объявлять все страницы причинно медленнее без новой контролируемой серии, но наблюдаемое ухудшение и преждевременные запросы скрытых товаров остаются реальными нерешёнными ограничениями. Общий PASS всем performance/functional критериям не заявляется.

## 1. Метод и границы измерений

Архитектура, точные зависимости и исходные проблемы описаны в [PERFORMANCE_AUDIT_BEFORE.md](PERFORMANCE_AUDIT_BEFORE.md). Проверялась существующая команда `pnpm run build` → `astro check && astro build`, Node v24.19.0, pnpm 11.25.0, Astro5.18.2/Vite6.4.3. Статические страницы не переведены на SSR, framework hydration не добавлена.

Lighthouse 13.5.0: четыре реальные страницы × mobile/desktop × cold/warm =16 runs до и после. Mobile — simulated Slow4G: RTT150ms, throughput1638,4Kbps, CPU×4,412×823,DPR1,75. Desktop — штатный desktop preset. Browser/CDP —13маршрутов ×2устройства ×2состояния кеша =52/52: mobile390×844,DPR1,75,CPU×4,latency150ms,download500000B/s(~4Mbps),upload125000B/s; desktop1440×900. Эти профили различаются, их абсолютные LCP нельзя смешивать. Warm — повторная загрузка в том же контексте с сохранённым кешем.

Все performance-значения получены из production build. Нормальные согласованные анимации сохранялись. Read-only visual QA использует native reduced-motion, fonts.ready и принудительное декодирование изображений только для стабильного сравнения пикселей; это не performance-тест и не изменение сайта. Field INP и75-й процентиль реальных пользователей не измерены: TBT/короткие interaction-проверки не являются INP. Локальный TTFB не описывает задержку FirstVDS.

## 2. Что изменено

1. Добавлены 47 выбранных lossless WebP derivatives с content hash, srcset и размерами canvas; адаптированы явные PNG в блоке «Всё для отделки» и исторические product images. Исходники, прозрачность и approved композиции сохранены. Hero129774B сохранён без ухудшения и получил fingerprint; более тяжёлые resized варианты не использованы. Производство/лаборатория используют существующие960/1600WebP.
2. Одинаковые approved SVG-маски используют канонические URL: 78→15; 63 потенциальных повторных URL устранены. Маски проверены побайтово, старые файлы не удалены. Это не обещание именно63сэкономленных запросов в каждом viewport.
3. JS включён в стандартную Vite/Astro production-обработку: минификация, модули и fingerprinted chunks; общий shell, каталог и небольшие page scripts загружаются по реальным зависимостям страницы. Формы, URL state, ranking/search, cookie consent, menu и motion сохранены.
4. Для каталога приоритет назначается фактически первому видимому изображению после восстановления category/search из URL, с eager/high для реального LCP; размеры учитывают canvas и обновляются ограниченным resize/RAF. Нельзя делать все26 товаров high priority. Resize/pagehide cleanup сохранён.
5. Из CSS исключено541полное правило явно устаревших семейств, проверенных по всем исходным public/preview HTML и динамическим классовым изменениям.22смешанных правила сохранены целиком; актуальные product-card/catalog/pd/home, shared variables, modal/cookie/menu/form/legal и keyframes сохранены.
6. Сохранены реально используемые Inter/PROMIX Product/Manrope faces, WOFF2 и font-display:swap; убраны WOFF fallback/output неиспользуемых preview/subsets, а не изменена типографика. Один реально используемый основной font preload на страницу; hero image preload только на главной.
7. Preview Astro pages сохранены в src/pages/_previews и подключаются только в dev; production output не содержит preview assets/QA screenshots и preview URLs в sitemap. Оригиналы public assets остаются в проекте.
8. Подготовлены [Nginx example](deploy/nginx-promix-performance.conf.example) и [инструкция FirstVDS](deploy/FIRSTVDS_PERFORMANCE.md); эти настройки не применялись.

## 3. Before / After

| Metric | Before | After | Difference | Comment |
|---|---|---|---|---|
| Lighthouse Performance: Главная, mobile cold | 83 | 86 | +3 | Цель90+ не достигнута. |
| LCP: Главная, mobile cold | 4 586 ms | 4 057 ms | -528 ms | Цель≤2500ms не достигнута. |
| Lighthouse Performance: Каталог, mobile cold | 92 | 93 | +1 | Цель90+ достигнута. |
| LCP: Каталог, mobile cold | 3 020 ms | 3 019 ms | -1 ms | Цель≤2500ms не достигнута. |
| Lighthouse Performance: PROMIX H 0,2, mobile cold | 82 | 92 | +10 | Цель90+ достигнута. |
| LCP: PROMIX H 0,2, mobile cold | 4 730 ms | 3 305 ms | -1 425 ms | Цель≤2500ms не достигнута. |
| Lighthouse Performance: Документы, mobile cold | 99 | 99 | 0 | Цель90+ достигнута. |
| LCP: Документы, mobile cold | 1 655 ms | 1 655 ms | -1 ms | Цель≤2500ms достигнута. |
| CLS max, все16 Lighthouse | 0,001503 | 0,000188 | -0,001315 | Цель≤0,1; это лабораторные загрузки, не field percentile. |
| TBT max, все16 Lighthouse | 115 ms | 0 ms | -115 ms | TBT — lab analogue responsiveness, не INP. |
| FCP: Главная, mobile cold | 1 516 ms | 1 661 ms | +145 ms | Зафиксирован один сопоставимый запуск каждой конфигурации; не медиана серии. |
| FCP: PROMIX H 0,2, mobile cold | 1 807 ms | 1 658 ms | -149 ms | Зафиксирован один сопоставимый запуск каждой конфигурации; не медиана серии. |
| Image transfer: Главная, mobile cold | 4 100 637 B (4 004,5 KiB) | 976 490 B (953,6 KiB) | -3 124 147 B | Browser Fast4G; encoded CDP bytes, включая накладные расходы ответа. |
| HTTP requests: Главная, mobile cold | 28 | 26 | -2 | Окно load+1,8s; lazy ниже страницы и scroll отдельно. |
| Image transfer: Каталог, desktop cold | 3 054 730 B (2 983,1 KiB) | 1 957 081 B (1 911,2 KiB) | -1 097 649 B | Browser Fast4G; encoded CDP bytes, включая накладные расходы ответа. |
| HTTP requests: Каталог, desktop cold | 110 | 46 | -64 | Окно load+1,8s; lazy ниже страницы и scroll отдельно. |
| Полная production-команда | 71,092 s | 16,670 s | -54,422 s | Не считать всю разницу эффектом кода: после нескольких сборок файловые/инструментальные кеши прогреты. |
| Все файлы dist | 239 103 567 B (233 499,6 KiB) | 239 788 057 B (234 168,0 KiB) | +684 490 B (+0,3%) | Оригиналы сохранены; deployment слегка вырос, first-load transfer измеряется отдельно. |
| Количество файлов | 665 | 599 | -66 | Dev output исключён; derivatives добавлены. |
| HTML в output | 49 | 36 | -13 | 49→36: убраны 13 preview routes; все 36 публичных маршрутов сохранены. |
| Все внешние JS output | 54 808 B (53,5 KiB) | 20 844 B (20,4 KiB) | -33 964 B (-62,0%) | Raw bytes всех файлов; не initial JS одной страницы и не compressed transfer. |
| Все внешние CSS output | 267 654 B (261,4 KiB) | 177 916 B (173,7 KiB) | -89 738 B (-33,5%) | Включает удаление preview CSS и вручную проверенных устаревших правил. |
| Все font files output | 937 600 B (915,6 KiB) | 199 296 B (194,6 KiB) | -738 304 B (-78,7%) | WOFF2; WOFF и ненужные preview/subset-копии отсутствуют. Это размер output, не экономия каждого посещения. |

Ускорение полной сборки наблюдалось на этой машине, но серия оптимизационных rebuild прогрела filesystem/tool caches. Нельзя причинно приписывать всё71,092→16,670s только коду. Raw output JS/CSS/font totals включают весь релиз; они не равны initial transfer одной страницы. Inline styles/scripts находятся внутри HTML и не включены в отдельные .js/.css totals.

| Крупнейшие chunks/fonts в замороженном After | Raw bytes | Gzip bytes |
|---|---|---|
| _astro/LegalLayout.astro_astro_type_script_index_0_lang.BA74HE74.js | 14 361 | 5 001 |
| _astro/index.astro_astro_type_script_index_1_lang.xgmWIRj5.js | 6 195 | 2 636 |
| _astro/index.astro_astro_type_script_index_0_lang.CjfYYq3U.js | 72 | 87 |
| _astro/cookies.OjJtPXGl.css | 80 719 | 15 743 |
| _astro/index.BmTEnC-1.css | 54 915 | 8 970 |
| _astro/index.DgKOhuN-.css | 16 152 | 3 341 |
| _astro/_slug_.Cs4MzurT.css | 15 312 | 2 794 |
| _astro/_slug_.CUVzHDMN.css | 10 818 | 2 897 |
| fonts/manrope/manrope-latin-variable.woff2 | 24 836 | не сжимать повторно |
| _astro/inter-latin-600-normal.LgqL8muc.woff2 | 24 452 | не сжимать повторно |
| _astro/inter-latin-700-normal.Yt3aPRUw.woff2 | 24 356 | не сжимать повторно |

Полный [inventory каждого output-файла](artifacts/performance/after/build-files.json) и [сводка](artifacts/performance/after/build-inventory.json) сохраняют largest images/fonts, duplicates, source maps и preview checks. Большие исходные PNG остаются в output по требованию сохранения оригиналов; их наличие не равно загрузке браузером.

## 4. Lighthouse: все сопоставимые runs

| Страница / профиль / кеш | Perf Before→After | A11y Before→After | Best Practices Before→After | SEO Before→After | LCP Before→After,ms | Отчёты |
|---|---|---|---|---|---|---|
| Главная /mobile/cold | 83→86 | 100→100 | 100→100 | 100→100 | 4 586→4 057 | [до](artifacts/performance/before/lighthouse/home-mobile-cold.report.html) / [после](artifacts/performance/after/lighthouse/home-mobile-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/home-mobile-cold.site.jpg) |
| Главная /mobile/warm | 100→100 | 100→100 | 100→100 | 100→100 | 1 359→1 207 | [до](artifacts/performance/before/lighthouse/home-mobile-warm.report.html) / [после](artifacts/performance/after/lighthouse/home-mobile-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/home-mobile-warm.site.jpg) |
| Главная /desktop/cold | 99→100 | 100→100 | 100→100 | 100→100 | 849→768 | [до](artifacts/performance/before/lighthouse/home-desktop-cold.report.html) / [после](artifacts/performance/after/lighthouse/home-desktop-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/home-desktop-cold.site.jpg) |
| Главная /desktop/warm | 100→100 | 100→100 | 100→100 | 100→100 | 368→328 | [до](artifacts/performance/before/lighthouse/home-desktop-warm.report.html) / [после](artifacts/performance/after/lighthouse/home-desktop-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/home-desktop-warm.site.jpg) |
| Каталог /mobile/cold | 92→93 | 97→97 | 100→100 | 100→100 | 3 020→3 019 | [до](artifacts/performance/before/lighthouse/catalog-mobile-cold.report.html) / [после](artifacts/performance/after/lighthouse/catalog-mobile-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/catalog-mobile-cold.site.jpg) |
| Каталог /mobile/warm | 100→100 | 97→97 | 100→100 | 100→100 | 1 358→1 359 | [до](artifacts/performance/before/lighthouse/catalog-mobile-warm.report.html) / [после](artifacts/performance/after/lighthouse/catalog-mobile-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/catalog-mobile-warm.site.jpg) |
| Каталог /desktop/cold | 99→100 | 96→96 | 100→100 | 100→100 | 942→640 | [до](artifacts/performance/before/lighthouse/catalog-desktop-cold.report.html) / [после](artifacts/performance/after/lighthouse/catalog-desktop-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/catalog-desktop-cold.site.jpg) |
| Каталог /desktop/warm | 100→100 | 96→96 | 100→100 | 100→100 | 454→373 | [до](artifacts/performance/before/lighthouse/catalog-desktop-warm.report.html) / [после](artifacts/performance/after/lighthouse/catalog-desktop-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/catalog-desktop-warm.site.jpg) |
| PROMIX H 0,2 /mobile/cold | 82→92 | 96→96 | 100→100 | 100→100 | 4 730→3 305 | [до](artifacts/performance/before/lighthouse/product-mobile-cold.report.html) / [после](artifacts/performance/after/lighthouse/product-mobile-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/product-mobile-cold.site.jpg) |
| PROMIX H 0,2 /mobile/warm | 99→100 | 96→96 | 100→100 | 100→100 | 1 370→1 218 | [до](artifacts/performance/before/lighthouse/product-mobile-warm.report.html) / [после](artifacts/performance/after/lighthouse/product-mobile-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/product-mobile-warm.site.jpg) |
| PROMIX H 0,2 /desktop/cold | 99→100 | 96→96 | 100→100 | 100→100 | 846→808 | [до](artifacts/performance/before/lighthouse/product-desktop-cold.report.html) / [после](artifacts/performance/after/lighthouse/product-desktop-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/product-desktop-cold.site.jpg) |
| PROMIX H 0,2 /desktop/warm | 100→100 | 96→96 | 100→100 | 100→100 | 370→329 | [до](artifacts/performance/before/lighthouse/product-desktop-warm.report.html) / [после](artifacts/performance/after/lighthouse/product-desktop-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/product-desktop-warm.site.jpg) |
| Документы /mobile/cold | 99→99 | 96→96 | 100→100 | 100→100 | 1 655→1 655 | [до](artifacts/performance/before/lighthouse/documents-mobile-cold.report.html) / [после](artifacts/performance/after/lighthouse/documents-mobile-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/documents-mobile-cold.site.jpg) |
| Документы /mobile/warm | 100→100 | 96→96 | 100→100 | 100→100 | 1 053→1 128 | [до](artifacts/performance/before/lighthouse/documents-mobile-warm.report.html) / [после](artifacts/performance/after/lighthouse/documents-mobile-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/documents-mobile-warm.site.jpg) |
| Документы /desktop/cold | 100→100 | 96→96 | 100→100 | 100→100 | 445→364 | [до](artifacts/performance/before/lighthouse/documents-desktop-cold.report.html) / [после](artifacts/performance/after/lighthouse/documents-desktop-cold.report.html) / [screenshot](artifacts/performance/after/lighthouse/documents-desktop-cold.site.jpg) |
| Документы /desktop/warm | 100→100 | 96→96 | 100→100 | 100→100 | 283→285 | [до](artifacts/performance/before/lighthouse/documents-desktop-warm.report.html) / [после](artifacts/performance/after/lighthouse/documents-desktop-warm.report.html) / [screenshot](artifacts/performance/after/lighthouse/documents-desktop-warm.site.jpg) |

| Страница / профиль / кеш | FCP ms | TBT ms | CLS | Speed Index ms | TTFB ms |
|---|---|---|---|---|---|
| Главная /mobile/cold | 1 661 | 0 | 0,000000 | 1 661 | 2 |
| Главная /mobile/warm | 1 055 | 0 | 0,000000 | 1 055 | 2 |
| Главная /desktop/cold | 391 | 0 | 0,000188 | 392 | 2 |
| Главная /desktop/warm | 326 | 0 | 0,000188 | 353 | 1 |
| Каталог /mobile/cold | 1 967 | 0 | 0,000000 | 1 967 | 4 |
| Каталог /mobile/warm | 1 056 | 0 | 0,000000 | 1 056 | 2 |
| Каталог /desktop/cold | 432 | 0 | 0,000000 | 432 | 4 |
| Каталог /desktop/warm | 288 | 0 | 0,000000 | 295 | 2 |
| PROMIX H 0,2 /mobile/cold | 1 658 | 0 | 0,000000 | 1 658 | 2 |
| PROMIX H 0,2 /mobile/warm | 1 055 | 0 | 0,000000 | 1 055 | 2 |
| PROMIX H 0,2 /desktop/cold | 372 | 0 | 0,000000 | 479 | 2 |
| PROMIX H 0,2 /desktop/warm | 284 | 0 | 0,000000 | 284 | 1 |
| Документы /mobile/cold | 1 430 | 0 | 0,000000 | 1 430 | 2 |
| Документы /mobile/warm | 1 128 | 0 | 0,000000 | 1 128 | 2 |
| Документы /desktop/cold | 344 | 0 | 0,000022 | 344 | 2 |
| Документы /desktop/warm | 282 | 0 | 0,000022 | 282 | 1 |

Полные numerical Before доступны в [baseline summary](artifacts/performance/before/lighthouse/summary.json), After — [after summary](artifacts/performance/after/lighthouse/summary.json); JSON/HTML сохранены для каждого из16runs. Best Practices100 относится к этим проверенным страницам/запускам. Accessibility96–100 сохранена: остаются замечания исходного дизайна, которые не исправлялись визуальным редизайном.

Снимки верхней части самих Lighthouse reports: [Главная](artifacts/performance/after/lighthouse/home-mobile-cold.report-top.png) / [Каталог](artifacts/performance/after/lighthouse/catalog-mobile-cold.report-top.png) / [PROMIX H 0,2](artifacts/performance/after/lighthouse/product-mobile-cold.report-top.png) / [Документы](artifacts/performance/after/lighthouse/documents-mobile-cold.report-top.png). Site screenshots в строках выше показывают страницу, report-top — оценки отчёта.

Failure-node sets всех16пар Accessibility совпадают. Сохранились baseline footer contrast4,07:1 при требовании4,5:1 и aria-label/content-name mismatches с весом0 в Lighthouse score; они не объявляются устранёнными. Первичный unused-JS opportunity0B на четырёх cold страницах; unused common CSS порядка10,5–13,2KiB transfer относится к первому viewport и не разрешает удалять правила форм, меню, cookie modal, фильтров или motion. [Разбор оставшихся Lighthouse findings](artifacts/performance/after/remaining-limitations.md).

Отдельная reduced-motion диагностика не заменяет стандартные показатели. Первоначальный Chrome CLI flag не активировал media query (matches=false); такой прогон не является доказательством влияния анимаций.

После проверки media query выполнен отдельный диагностический запуск с **reducedMotionVerified=true**: Главная mobile/cold, Performance86, LCP4 057 ms, FCP1 811 ms, CLS0,000000, TBT0 ms. LCP практически совпал со стандартными4057,29ms, поэтому гипотеза «вся задержка вызвана opacity animation» этим тестом не подтверждается. [Диагностический отчёт](artifacts/performance/after/lighthouse-reduced-motion-diagnostic/home-mobile-cold.report.html); он не включён в официальную Before/After таблицу.

## 5. Browser network, реальные страницы и кеш

| Страница / профиль | Requests Before→After | Image transfer Before→After | Total transfer Before→After | CLS After | LCP Before→After,ms |
|---|---|---|---|---|---|
| Главная/desktop: / | 30→28 | 4 753,4→932,0 KiB | 4 923,7→1 089,5 KiB | 0,000000 | 1 096→1 092 |
| Каталог/desktop: /products/ | 110→46 | 2 983,1→1 911,2 KiB | 3 167,9→2 083,0 KiB | 0,000000 | 628→1 096 |
| Категория грунтовок/desktop: /products/?category=primers | 114→50 | 3 489,1→2 417,1 KiB | 3 673,9→2 588,9 KiB | 0,002105 | 460→704 |
| Поиск «грунт»/desktop: /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | 114→50 | 3 489,1→2 417,1 KiB | 3 673,9→2 588,9 KiB | 0,002105 | 440→644 |
| PROMIX H 0,2/desktop: /products/promix-h-03/ | 20→19 | 248,0→248,0 KiB | 373,7→361,8 KiB | 0,000000 | 268→724 |
| Канистра: глубокий грунт/desktop: /products/deep-primer/ | 23→25 | 563,8→617,3 KiB | 688,3→729,9 KiB | 0,000000 | 184→640 |
| SUPER TACK 3/desktop: /products/super-tack-3/ | 20→19 | 222,0→222,0 KiB | 347,6→335,7 KiB | 0,000000 | 192→656 |
| Гидроизоляция HYDRO/desktop: /products/hydro/ | 19→18 | 236,9→236,9 KiB | 353,3→341,2 KiB | 0,000000 | 176→628 |
| Стеклохолст/desktop: /products/glass-fiber-plus-top/ | 20→22 | 104,4→136,6 KiB | 229,1→249,3 KiB | 0,000000 | 208→644 |
| Флизелин/desktop: /products/nonwoven-plus-top/ | 21→23 | 136,8→167,4 KiB | 261,3→279,9 KiB | 0,000000 | 224→636 |
| PROMIX F, длинная страница/PDF/desktop: /products/promix-f/ | 20→19 | 225,8→225,8 KiB | 351,4→339,5 KiB | 0,000000 | 192→672 |
| Документы/desktop: /documents/ | 11→10 | 0,0→0,0 KiB | 107,6→95,5 KiB | 0,000000 | 328→64 |
| Отсутствующий URL/desktop: /performance-audit-missing-page/ | 2→2 | 0,0→0,0 KiB | 5,2→5,2 KiB | 0,000000 | 56→52 |
| Главная/mobile: / | 28→26 | 4 004,5→953,6 KiB | 4 175,9→1 111,1 KiB | 0,000000 | 1 568→1 668 |
| Каталог/mobile: /products/ | 102→38 | 1 325,7→1 429,9 KiB | 1 510,5→1 601,7 KiB | 0,000000 | 1 672→3 964 |
| Категория грунтовок/mobile: /products/?category=primers | 105→42 | 1 325,7→2 469,1 KiB | 1 506,4→2 640,9 KiB | 0,000000 | 2 068→5 340 |
| Поиск «грунт»/mobile: /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | 104→41 | 1 325,7→2 182,8 KiB | 1 506,4→2 354,6 KiB | 0,000000 | 1 964→4 500 |
| PROMIX H 0,2/mobile: /products/promix-h-03/ | 20→19 | 425,5→248,0 KiB | 551,2→361,8 KiB | 0,000000 | 1 544→1 216 |
| Канистра: глубокий грунт/mobile: /products/deep-primer/ | 21→23 | 606,5→539,8 KiB | 730,9→652,3 KiB | 0,000000 | 1 268→1 156 |
| SUPER TACK 3/mobile: /products/super-tack-3/ | 20→19 | 365,0→222,0 KiB | 490,6→335,7 KiB | 0,000000 | 1 452→1 092 |
| Гидроизоляция HYDRO/mobile: /products/hydro/ | 19→18 | 389,5→236,9 KiB | 505,9→341,2 KiB | 0,000000 | 1 452→896 |
| Стеклохолст/mobile: /products/glass-fiber-plus-top/ | 20→22 | 136,5→136,6 KiB | 261,1→249,3 KiB | 0,000000 | 1 108→1 064 |
| Флизелин/mobile: /products/nonwoven-plus-top/ | 20→22 | 132,1→132,3 KiB | 256,5→244,9 KiB | 0,000000 | 1 044→1 044 |
| PROMIX F, длинная страница/PDF/mobile: /products/promix-f/ | 20→19 | 376,2→225,8 KiB | 501,7→339,5 KiB | 0,000000 | 1 464→1 220 |
| Документы/mobile: /documents/ | 11→10 | 0,0→0,0 KiB | 107,6→95,5 KiB | 0,000000 | 668→596 |
| Отсутствующий URL/mobile: /performance-audit-missing-page/ | 2→2 | 0,0→0,0 KiB | 5,2→5,2 KiB | 0,000000 | 276→300 |

Окно network snapshot —load+1,8s без искусственного scroll. Encoded CDP bytes могут включать заголовки; незавершённые lazy resources помечены в raw records. Поздние lazy images могут не успеть завершиться в cold snapshot и затем впервые передаваться при warm reload; warm transfer поэтому не равен чистому cache-hit для всех assets и иногда включает новые bytes. Полная [таблица52cold/warm](artifacts/performance/after/summary.json) и [CSV](artifacts/performance/after/browser-summary.csv). Cold и warm не усреднялись.

| Страница / профиль | Warm requests | Warm image transfer | Warm total transfer |
|---|---|---|---|
| Главная/desktop | 26 | 1 830 B (1,8 KiB) | 3 822 B (3,7 KiB) |
| Каталог/desktop | 43 | 4 590 B (4,5 KiB) | 6 761 B (6,6 KiB) |
| PROMIX H 0,2/desktop | 16 | 918 B (0,9 KiB) | 2 552 B (2,5 KiB) |
| Документы/desktop | 11 | 0 B (0,0 KiB) | 1 172 B (1,1 KiB) |
| Главная/mobile | 24 | 1 576 B (1,5 KiB) | 3 568 B (3,5 KiB) |
| Каталог/mobile | 35 | 3 574 B (3,5 KiB) | 5 745 B (5,6 KiB) |
| PROMIX H 0,2/mobile | 16 | 918 B (0,9 KiB) | 2 552 B (2,5 KiB) |
| Документы/mobile | 11 | 0 B (0,0 KiB) | 1 172 B (1,1 KiB) |

Производство, партнёрам, контакты и consultation — не выдуманные отдельные страницы: это реальные /#production, /#partners, /#contacts и общий modal. Их переходы, CTA и keyboard behavior проверяются в functional-regression отчётах. Проверены стандартное ведро, канистра, SUPER TACK, HYDRO, стеклохолст, флизелин, длинный PROMIX F с PDF, documents и настоящая404.

В filtered/category/search загрузках обнаружены реальные завершённые запросы упаковок, которые к моменту DOM snapshot уже скрыты фильтром (renderedWidth=0). Это не только late-pending артефакт и не исчезает от наличия loading=lazy: первичный parser/native-lazy discovery может начаться до окончательного URL restore.

| Cold run | Скрытых img requests | Выбранная ширина | Encoded transfer | Initial priority | Initiator |
|---|---|---|---|---|---|
| desktop/Категория грунтовок | 9 | 640 | 1 292 192 B (1 261,9 KiB) | Low | parser |
| desktop/Поиск «грунт» | 8 | 640 | 1 159 028 B (1 131,9 KiB) | Low | parser |
| mobile/Категория грунтовок | 4 | 960 | 1 204 376 B (1 176,1 KiB) | Low | parser |
| mobile/Поиск «грунт» | 3 | 960 | 923 796 B (902,1 KiB) | Low | parser |

Метод сопоставляет currentSrc изображений с нулевой шириной в конечном DOM с реальными Image entries CDP waterfall. Дополнительное предотвращение этих запросов требует отдельной реализации/проверки после стабилизации текущего проекта; такой исправленный вариант в этом snapshot не заявляется.

## 6. Waterfall и LCP

| Страница / профиль | Фактический LCP element | LCP asset | loading / priority / width |
|---|---|---|---|
| Главная/desktop | img.home-hero__image | /images/performance/hero-surface-promix-h-5b9e33336aef-1207.webp | auto / high / 703,7px |
| Каталог/desktop | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-640.webp | eager / high / 364,0px |
| Категория грунтовок/desktop | img | /images/products/catalog-2026-10/betokontakt-613d6fe67c64-640.webp | eager / high / 364,0px |
| Поиск «грунт»/desktop | img | /images/products/catalog-2026-10/deep-primer-7d7b6b2b1613-640.webp | eager / high / 371,4px |
| PROMIX H 0,2/desktop | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-640.webp | eager / high / 539,6px |
| Документы/desktop | h1 | текстовый элемент / см.raw | не img / см.raw |
| Главная/mobile | img.home-hero__image | /images/performance/hero-surface-promix-h-5b9e33336aef-1207.webp | auto / high / 346,0px |
| Каталог/mobile | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-960.webp | eager / high / 375,2px |
| Категория грунтовок/mobile | img | /images/products/catalog-2026-10/betokontakt-613d6fe67c64-960.webp | eager / high / 375,2px |
| Поиск «грунт»/mobile | img | /images/products/catalog-2026-10/deep-primer-7d7b6b2b1613-960.webp | eager / high / 382,9px |
| PROMIX H 0,2/mobile | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-640.webp | eager / high / 319,6px |
| Документы/mobile | p | текстовый элемент / см.raw | не img / см.raw |

Сопоставимый waterfall: [Before HAR](artifacts/performance/before/network-waterfall.har) и [After HAR](artifacts/performance/after/network-waterfall.har). В HAR bodies не сохранены, временная дата начала восстановлена приблизительно из времени записи; точные CDP timings находятся в _rawCdpTiming.

Основной CSS остаётся render-blocking как необходимый для утверждённого первого рендера. Его размер уменьшен без переноса критичных styles в позднюю загрузку. JS теперь module/defer по production pipeline; каталог не подключается к документам/обычным страницам. На каталоге выбор eager/high выполняется после URL restore: SSR-выбор первого товара был бы неверен для категории/поиска. Shadow aliases сокращают разные URL одинаковых данных. Ненужный preload всех товаров/prefetch всех product pages не добавлялся. Полные preload/image lists и initiators находятся в каждом raw browser JSON.

На Slow4G main cold LCP остаётся выше цели. Текст/шрифт, critical CSS, изображение, scheduling/render-delay и согласованная motion последовательность могут влиять совместно; без корректного отдельно контролируемого эксперимента нельзя объявлять одну причину доказанной. Изменения дизайна/анимаций для сокрытия LCP не применялись. Реальные FirstVDS RTT/compression/HTTP2 требуют отдельной проверки после ручного размещения.

| Lighthouse mobile cold insight | Load delay trace,ms | Image load trace,ms | Element render delay trace,ms | Render-blocking estimate | Image-delivery estimate |
|---|---|---|---|---|---|
| Главная | 8,6 | 9,7 | 925,4 | Est savings of 860 ms | Est savings of 1,650 KiB |
| Каталог | 90,8 | 11,8 | 455,7 | Est savings of 910 ms | Est savings of 1,406 KiB |
| PROMIX H 0,2 | 7,4 | 14,4 | 982,6 | Est savings of 900 ms | Est savings of 117 KiB |

Breakdown — реальные trace timings локального gather; их сумма не должна равняться Slow4G simulated LCP. Render-blocking и image-delivery savings — оценки Lighthouse, не достигнутая экономия; складывать их нельзя. В critical chain остаются общий CSS80 719B raw (~16KB transfer), homepage CSS54 915B raw (~9,3KB transfer) и CSS→локальные fonts. Каталог также запрашивает CSS текущих карточек/теней; готовый высокий fetchpriority в DOM не гарантирует high при самом первом discovery: Lighthouse отдельно отмечает priorityHinted=false для каталога.

Image-delivery insight главной включает большие lower-section preparation/leveling WebP около404/364KB и рекомендации по прозрачным product canvas. Их наличие в рекомендациях не означает, что все они являются LCP или блокируют hero. Сохранённый hero129774B уже меньше проверенных lossless resized variants; продуктовый LCP640WebP159236B и каталог960WebP340942B сохраняют этикетки. Часть автоматических «compression savings» требует lossy изменения, которое не применялось. Дополнительные lossless derivatives lower sections и более точное scheduling можно рассмотреть после стабилизации актуального проекта и нового baseline.

## 7. Регрессии, формы, аналитика, документы

Исходные функциональные результаты: 27/29 PASS. Baseline содержит27checks; After содержит29, поскольку добавлена отдельная image-priority проверка каждого профиля. Исходные FAIL не удаляются и не превращаются автоматически в PASS; дополнительные диагностические объяснения следует читать вместе с ними. [Desktop checks](artifacts/performance/after/regression-desktop.json) и [Mobile checks](artifacts/performance/after/regression-mobile.json).

| Профиль | Проверка | Результат | Ошибка исходного check |
|---|---|---|---|
| desktop | catalog 26 cards; meaningful page; no overlay | PASS | — |
| desktop | cookie settings deny analytics; persistence | PASS | — |
| desktop | category/filter URL and history back/forward | PASS | — |
| desktop | catalog search, empty state and reset | PASS | — |
| desktop | catalog image priority follows visible URL state/history/resize | PASS | — |
| desktop | repeated filters DOM/listener/heap stability | FAIL | Listeners grew 94->107 |
| desktop | catalog card hover retains geometry | PASS | — |
| desktop | production partners contacts sections and CTA | PASS | — |
| desktop | consultation keyboard focus trap and restore | PASS | — |
| desktop | mock success, disabled submit and double-submit guard | PASS | — |
| desktop | mock server error, retry succeeds | PASS | — |
| desktop | mock timeout abort, error state and retry availability | PASS | — |
| desktop | PDF links load only on demand; no iframe | PASS | — |
| desktop | reduced motion control preserved | PASS | — |
| mobile | catalog 26 cards; meaningful page; no overlay | PASS | — |
| mobile | cookie settings deny analytics; persistence | PASS | — |
| mobile | category/filter URL and history back/forward | PASS | — |
| mobile | catalog search, empty state and reset | PASS | — |
| mobile | catalog image priority follows visible URL state/history/resize | PASS | — |
| mobile | repeated filters DOM/listener/heap stability | FAIL | Listeners grew 94->107 |
| mobile | catalog card hover retains geometry | PASS | — |
| mobile | production partners contacts sections and CTA | PASS | — |
| mobile | mobile menu keyboard and navigation | PASS | — |
| mobile | consultation keyboard focus trap and restore | PASS | — |
| mobile | mock success, disabled submit and double-submit guard | PASS | — |
| mobile | mock server error, retry succeeds | PASS | — |
| mobile | mock timeout abort, error state and retry availability | PASS | — |
| mobile | PDF links load only on demand; no iframe | PASS | — |
| mobile | reduced motion control preserved | PASS | — |

Проверки включают категории/поиск/empty/reset, URL/back-forward, hover geometry, мобильное меню, cookie persistence, реальные anchors, focus trap/restore, native reduced-motion и PDF только по клику. Form success/error/retry/12s timeout, disabled submit и double-submit guard проверяются через перехват запросов и mock-ответы. Реальный SMTP не использовался. Факт успешного mock не означает проверку доставки на Mail.ru. SMTP credentials/адресаты не менялись; backend baseline checksum изначально не был сохранён, поэтому побайтовую неизменность backend независимым хеш-сравнением подтвердить нельзя.

| Профиль | Listeners Before→After | Heap Before→After | Предел проверки |
|---|---|---|---|
| desktop | —→— | —→— B | ограниченная серия повторных фильтраций, не долгосрочное доказательство отсутствия leaks |
| mobile | —→— | —→— B | ограниченная серия повторных фильтраций, не долгосрочное доказательство отсутствия leaks |

Исходные memory checks зафиксировали94→107aggregate listeners и остались FAIL. Отдельная неизменяющая приложение [warm/steady-state диагностика](artifacts/performance/after/memory-warm-diagnostic.json) проверяет0/25/50/75cycles, forcedGC и DOMDebugger handlers по типу/target. Она не перезаписывает исходные FAIL и не повышает threshold.

| Профиль / этап | Aggregate listeners | DOM nodes | JS heap afterGC,B |
|---|---|---|---|
| desktop/initial0 | 94 | 2459 | 1 050 664 |
| desktop/round25 | 107 | 2476 | 1 856 264 |
| desktop/round50 | 107 | 2488 | 1 859 828 |
| desktop/round75 | 107 | 2500 | 1 865 208 |
| desktop/settled75 | 107 | 2500 | 1 865 208 |
| mobile/initial0 | 94 | 2452 | 1 076 976 |
| mobile/round25 | 107 | 2469 | 1 887 008 |
| mobile/round50 | 107 | 2481 | 1 890 032 |
| mobile/round75 | 107 | 2493 | 1 895 412 |
| mobile/settled75 | 107 | 2493 | 1 895 412 |

Aggregate счётчик после первой серии остаётся107на следующих сериях; инспектируемые main-document/window listeners по типу и target не меняются (load26,click36,animationend1,resize2). Это свидетельствует об ограниченном прогреве/инструментальном учёте, а не подтверждает прогрессивное добавление прикладных обработчиков. Динамика DOM/heap также сохранена в JSON. Такая короткая диагностика не доказывает отсутствие всех долгосрочных утечек; для итоговой приёмки актуальной версии повторить check после корректного documented warm-up, сохранив первоначальный критерий и raw evidence.

Дополнительные direct-DOM контроли изолируют locator.fill/инструментальный ввод: input.value+dispatchEvent('input') с ожиданием190ms запускает реальный180ms debounce; отдельный change вызывает commit/filter/URL path. Приложение не подменялось и source не менялся. [Интерпретация](artifacts/performance/after/memory-final-summary.md), [input control](artifacts/performance/after/memory-evaluate-input-diagnostic.json), [500change control](artifacts/performance/after/memory-evaluate-change-diagnostic.json).

| Контроль / профиль | Циклы | DOM nodes | Listeners | JS heap afterGC,B |
|---|---|---|---|---|
| input/desktop | initial0 / round25 / round50 / round75 | 2459 / 2459 / 2459 / 2459 | 94 / 94 / 94 / 94 | 1 086 420 / 1 154 704 / 1 155 764 / 1 155 948 |
| input/mobile | initial0 / round25 / round50 / round75 | 2452 / 2452 / 2452 / 2452 | 94 / 94 / 94 / 94 | 1 112 732 / 1 169 108 / 1 169 780 / 1 169 964 |
| change/desktop | initial0 / round250 / round500 | 2459 / 2459 / 2459 | 94 / 94 / 94 | 1 086 488 / 1 153 388 / 1 160 376 |
| change/mobile | initial0 / round250 / round500 | 2452 / 2452 / 2452 | 94 / 94 / 94 | 1 112 732 / 1 168 064 / 1 174 380 |

В direct controls browser DOM/listeners постоянны: desktop2459/mobile2452nodes,94listeners; document2237nodes/994elements,26карточек. После прогрева последние25input cycles добавили184Bheap в обоих профилях. Четыре steady-state checks исходного locator.fill25→50/50→75 также 4/4 PASS без ослабления порогов; [raw assertions](artifacts/performance/after/memory-warm-regression.json). Прогрессирующая утечка обработчиков/DOM приложения в проверенных input/change сценариях не воспроизведена; первоначальный94→107счётчик связан с testing/browser-input path. Это ограниченное экспериментальное объяснение, не гарантия бесконечной сессии и не переписывание исходных27/29PASS.


Analytics consent на production hostname: 7/7 PASS, реальных внешних запросов0, реальных форм0. [Полный controlled mock](artifacts/performance/after/consent-production-mock.json). До согласия loader не вызывает tag.js; явный deny/reload сохраняет запрет; enable даёт один mock tag/init; повторная initialization не дублирует; revoke вызывает destruct; re-enable переиспользует script. В локальных performance runs third-party до согласия: 0 requests /0B. Размер/задержки реального Yandex tag после согласия не измерены: он был заменён безопасным локальным mock, а не удалён из сайта.

PDF не встроен iframe и не preload; initial PDF requests в 52 snapshots: 0. Официальный документ4 640 389B сохранён byte-for-byte; Content-Type application/pdf проверен локально. Документ не перекодировался.

На обычных browser load snapshots console/page errors: 0; HTTP≥400: 0; navigation load errors: 0. Специальный missing-page404 учитывается отдельно и не считается сломанным asset. Подробности без избирательного удаления записей — в raw JSON.

## 8. Визуальная проверка и инварианты snapshot

Frozen-only invariant check: **PASS**. Все36публичных маршрутов и нормализованные тексты совпали;30product routes;26catalog cards;479защищённых позиций совпали (13data hashes из сохранённого source freeze,465изображений+официальныйPDF из optimized-dist);3исходных public font/license копии совпали. Проверка не читает изменяемые текущие исходники. [Доказательство snapshot](artifacts/performance/frozen-snapshot-invariants.json). Историческая [проверка output/static refs](artifacts/performance/OUTPUT_CHECK.md) содержит1 638корректных локальных references, metadata/SEO и проверку сигнатур; её дата/область сохранены, она не переиздаётся как проверка текущего shared source.

Visual pairs в доступном отчёте: 26; [summary](artifacts/performance/visual-comparison/summary.json). Это отдельная read-only диагностика с одинаковыми viewport/DPR, fonts.ready и image decode. Current-source acceptance из неё не следует. В raw поле geometryChanges входят также computed styles, а не только размеры. Две оставшиеся записи относятся к opacity0→1 у скрытой .catalog-ground-plane[7]; их нельзя скрыть отчётом «0rawdiffs». При ручном просмотре desktop categories и mobile bucket/canister/long-product layout, typography, package geometry, labels и shadows визуально сохранились; небольшие pixel differences от responsive resampling ожидаемы.

| Профиль / вид | Raw geometry/style changes | Platform-font changes | Текст идентичен | Overflow Before/After | Парное изображение |
|---|---|---|---|---|---|
| desktop/home | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-home-pair.webp) |
| desktop/categories | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-categories-pair.webp) |
| desktop/production | 0 | 0 | да | [false,false] | см.screenshots |
| desktop/catalog | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-catalog-pair.webp) |
| desktop/primers | 1 | 0 | да | [false,false] | см.screenshots |
| desktop/bucket | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-bucket-pair.webp) |
| desktop/canister | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-canister-pair.webp) |
| desktop/long-product | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-long-product-pair.webp) |
| desktop/glass-fiber | 0 | 0 | да | [false,false] | см.screenshots |
| desktop/documents | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/desktop-documents-pair.webp) |
| mobile/home | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-home-pair.webp) |
| mobile/categories | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-categories-pair.webp) |
| mobile/production | 0 | 0 | да | [false,false] | см.screenshots |
| mobile/catalog | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-catalog-pair.webp) |
| mobile/primers | 1 | 0 | да | [false,false] | см.screenshots |
| mobile/bucket | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-bucket-pair.webp) |
| mobile/canister | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-canister-pair.webp) |
| mobile/long-product | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-long-product-pair.webp) |
| mobile/glass-fiber | 0 | 0 | да | [false,false] | см.screenshots |
| mobile/documents | 0 | 0 | да | [false,false] | [Before / After](artifacts/performance/visual-comparison/mobile-documents-pair.webp) |
| tablet/home | 0 | 0 | да | [false,false] | см.screenshots |
| tablet/catalog | 0 | 0 | да | [false,false] | см.screenshots |
| tablet/bucket | 0 | 0 | да | [false,false] | см.screenshots |
| desktop-dpr2/home | 0 | 0 | да | [false,false] | см.screenshots |
| desktop-dpr2/catalog | 0 | 0 | да | [false,false] | см.screenshots |
| desktop-dpr2/bucket | 0 | 0 | да | [false,false] | см.screenshots |

Lossless conversion не перерисовывает упаковки. Видимые RGB и все alpha значения совпадают с исходником/эталонным пропорциональным resize; RGB полностью прозрачных пикселей может нормализоваться encoder и не объявляется raw RGBA equality. [Проверка derivatives](artifacts/performance/staging/responsive-image-checks.json), [image proof1](artifacts/performance/staging/image-proof-1.png), [image proof2](artifacts/performance/staging/image-proof-2.png).

Lossless AVIF проверен на 5 representative images; тестовые AVIF оказались тяжелее WebP при требовании сохранить видимые пиксели и alpha. Они не внедрены; эксперимент находится только в [staging results](artifacts/performance/staging/avif-experiment/results.json). Lossy AVIF ради счётчика bytes не применялся.

## 9. Performance budget: оставшиеся нарушения

Бюджет зафиксирован в [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md); он не повышался задним числом. В стандартном Lighthouse mobile cold LCP>2500ms: 3; Performance<90: 1. Эти ограничения остаются открытыми. Field INP≤200ms не подтверждён.

| Budget | Порог | Snapshot result | Статус / исключение |
|---|---|---|---|
| Lighthouse mobile cold Performance | ≥90 | Главная:86; Каталог:93; PROMIX H 0,2:92; Документы:99 | FAIL: главная |
| LCP mobile cold | ≤2500ms | Главная:4 057ms; Каталог:3 019ms; PROMIX H 0,2:3 305ms; Документы:1 655ms | FAIL: 3 из4 |
| Lighthouse desktop cold / warm | ≥90 | все100 | PASS для измеренной матрицы |
| CLS всех16 Lighthouse | ≤0,1 | 0,000188 | PASS лабораторной выборки |
| TBT всех16 Lighthouse | ≤200ms | 0 ms | PASS; не field INP |
| Field INP75-й percentile | ≤200ms | полевых данных нет | НЕ ПРОВЕРЕНО |
| Внешний initial runtime JS | ≤25KiB raw /9KiB gzip | 20 844B raw /7 985B gzip для всех6chunks вместе | PASS верхней границы внешних JS; inline metadata не runtime |
| Внешний initial CSS / | 140KiB raw /30KiB gzip | 135 634B raw /24 713B gzip | PASS |
| Внешний initial CSS /products/ | 120KiB raw /25KiB gzip | 112 183B raw /21 878B gzip | PASS |
| Внешний initial CSS /products/promix-h-03/ | 120KiB raw /25KiB gzip | 106 849B raw /21 434B gzip | PASS |
| Внешний initial CSS /documents/ | 90KiB raw /18KiB gzip | 80 719B raw /15 743B gzip | PASS |
| LCP hero главной | ≤150KiB | 129774B | PASS |
| Product H0,2 LCP mobile, проверенный sample | ≤220KiB | 159236B (640WebP) | PASS sample; не декларация для всех30товаров |
| First-load главной | ≤1,5MiB | desktop:1,06MiB; mobile:1,09MiB | PASS |
| First-load catalog/category/search | ≤1,5MiB | 6cold runs выше лимита; таблица ниже | FAIL |
| First-party initial fonts | ≤150KiB | 122 122 B (119,3 KiB) | PASS |
| Third-party до согласия | 0 requests /0B | 0 requests /0B | PASS для лабораторных runs и controlled consent mock |
| Размер dist | ≤240MiB | 228,68MiB | PASS snapshot |
| FirstVDS cache/HTTP2/Brotli | применить и проверить | пример конфигурации подготовлен | НЕ ПРИМЕНЕНО |
| Explicit preloads | ≤2/страницу | 2 | PASS |
| High-priority images | ≤1/страницу | 1 | PASS snapshot; initial-discovery caveat каталога сохранён |
| Initial PDF | 0 requests | 0 | PASS |
| Cold request count: главная | ≤35 | 28 | PASS |
| Cold request count: каталог/category/search | ≤55 | 50 | PASS |
| Cold request count: продукты | ≤25 | 25 | PASS |
| Cold request count: документы | ≤16 | 10 | PASS |

Бюджеты — целевые ограничения и контрольные ориентиры; они не означают, что весь набор уже принят. PASS относится к указанной выборке, FAIL/непроверенные пункты остаются открытыми. CSS/JS верхние границы выше измерены по внешним файлам; encoded network bytes и inline HTML учитываются отдельно в network snapshots.

| Browser cold run | Фактический first-load transfer | Бюджет каталога | Результат |
|---|---|---|---|
| desktop/Каталог /products/ | 2 133 001 B (2 083,0 KiB) | 1,5MiB | FAIL; не скрывается изменением лимита |
| desktop/Категория грунтовок /products/?category=primers | 2 651 059 B (2 588,9 KiB) | 1,5MiB | FAIL; не скрывается изменением лимита |
| desktop/Поиск «грунт» /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | 2 651 059 B (2 588,9 KiB) | 1,5MiB | FAIL; не скрывается изменением лимита |
| mobile/Каталог /products/ | 1 640 177 B (1 601,7 KiB) | 1,5MiB | FAIL; не скрывается изменением лимита |
| mobile/Категория грунтовок /products/?category=primers | 2 704 249 B (2 640,9 KiB) | 1,5MiB | FAIL; не скрывается изменением лимита |
| mobile/Поиск «грунт» /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | 2 411 099 B (2 354,6 KiB) | 1,5MiB | FAIL; не скрывается изменением лимита |

Снижение этих загрузок требует отдельного анализа discovery/lazy/viewport и достаточного разрешения прозрачного canvas. Изображения с более высоким DPR не следует уменьшать ниже читаемости этикеток ради формального бюджета. Общий output≤240MiB соблюдён, но сохранённые большие PNG остаются кандидатами для отдельного согласованного переноса вне публичного release после проверки старых URL.

## 10. FirstVDS: подготовлено, не применено

[Nginx example](deploy/nginx-promix-performance.conf.example): HTML напрямую с диска; gzip только text/HTML/CSS/JS/JSON/SVG/XML/manifest; optional Brotli только при установленном модуле; HTTP/2/TLS с проверкой версии; корректный MIME/keep-alive; immutable только verified hashed JS/CSS/images/fonts; HTML no-cache; PDF сутки/revalidate; нехешированные assets revalidate; настоящий404; точный FastCGI endpoint/API no-store; backend/config/vendor вне webroot.

Локальный [response-headers.json](artifacts/performance/after/response-headers.json) содержит 9 GET/HEAD probes. HTML/CSS/JS/SVG/XML gzip проверялся Astro preview; binary WebP/PDF без gzip, manifest маленький412B и ниже1024B threshold. Preview Cache-Control:no-cache и HTTP/1.1 не доказывают Nginx immutable/HTTP2/Brotli. Серверные настройки ещё не действуют.

| Ресурс | Статус / MIME | Encoding | Cache-Control локального preview |
|---|---|---|---|
| / | 200 / text/html | gzip | no-cache |
| /_astro/cookies.OjJtPXGl.css | 200 / text/css | gzip | no-cache |
| /_astro/LegalLayout.astro_astro_type_script_index_0_lang.BA74HE74.js | 200 / text/javascript | gzip | no-cache |
| /images/products/catalog-2026-10/betokontakt-613d6fe67c64-ambient-e735a9a7795e.svg | 200 / image/svg+xml | gzip | no-cache |
| /sitemap-0.xml | 200 / text/xml | gzip | no-cache |
| /site.webmanifest | 200 / application/manifest+json | нет | no-cache |
| /images/performance/acrylic-enamel-67cad3d45f-5963417e16e2-1600.webp | 200 / image/webp | нет | no-cache |
| /documents/promix-sgr-shpatlevki-2026.pdf | 200 / application/pdf | нет | no-cache |
| /performance-audit-missing-page/ | 404 / — | gzip | нет |

Примеры ручной проверки после согласованного размещения (GET/HEAD, без POST):

```sh
curl -sSI https://pro-mix.ru/
curl --http2 -sS -o /dev/null -w "HTTP %{http_version}; TTFB %{time_starttransfer}s\n" https://pro-mix.ru/
curl -sS -H "Accept-Encoding: gzip" -D - -o /dev/null https://pro-mix.ru/
curl -sSI https://pro-mix.ru/documents/promix-sgr-shpatlevki-2026.pdf
curl -sS -D - -o /dev/null https://pro-mix.ru/api/lead.php
```

GET API должен вернуть405/no-store без отправки письма. Полный перечень проверок HTML/hashedCSS-JS/font/WebP/PDF/XML/manifest/404/redirect/ETag и version-compatible ручное применение: [deploy/FIRSTVDS_PERFORMANCE.md](deploy/FIRSTVDS_PERFORMANCE.md). На Windows использовать curl.exe. Нужен доступ администратора для nginx -V/-t, реального PHP-FPM socket, TLS/HTTP2, compression/cache и production TTFB.

## 11. Что не завершено и дальнейшие действия

- Приёмка текущего проекта остановлена на границе snapshot: дождаться завершения параллельных изменений и согласовать новую актуальную ревизию. Повторить существующую pnpm run build и тот же набор visual/functional/performance checks; не переносить автоматически статус этого snapshot на изменённые файлы.
- Mobile cold LCP главной/каталога/продукта остаётся выше2,5s; главная86 ниже90. Нужна отдельная проверенная декомпозиция render-delay/network и согласование любых визуально заметных мер. Диагностический reduced-motion не считается production-исправлением.
- Часть desktop category/search загрузок нарушает1,5MiB budget. Значения не скрыты; качество упаковок и текущие фильтры сохранены.
- Не выполнены deploy, изменение FirstVDS, live SMTP delivery и реальная post-consent загрузка Yandex tag. Для сервера нужны доступ/ручное применение; для реальных форм — отдельное явное разрешение. Внешние платные сервисы не добавлены.
- Field INP и Core Web Vitals75-го percentile требуют реальных данных после согласованной публикации. Лабораторные TBT/CLS не подменяют эти данные.
- Автоматическое удаление старых assets не выполнялось. [UNUSED_ASSETS_REPORT.md](UNUSED_ASSETS_REPORT.md) содержит baseline candidates и послеоптимизационные пояснения, а не новое blanket-разрешение удаления.

## 12. Артефакты и воспроизводимость

- [Список изменённых/добавленных файлов относительно зафиксированного baseline](CHANGED_FILES.md); это сохранённая инвентаризация performance snapshot, не attribution текущих параллельных правок.
- [Build Before log](artifacts/performance/build-before.log) / [Build After log](artifacts/performance/build-after.log) / [результат build](artifacts/performance/build-after.json) — exit0, Astro0errors/0warnings/0hints.
- [Lighthouse Before](artifacts/performance/before/lighthouse/summary.json) / [Lighthouse After](artifacts/performance/after/lighthouse/summary.json); HTML и site screenshots перечислены в таблице.
- [HAR Before](artifacts/performance/before/network-waterfall.har) / [HAR After](artifacts/performance/after/network-waterfall.har); [52 browser runs](artifacts/performance/after/summary.json); [Desktop functional](artifacts/performance/after/regression-desktop.json) / [Mobile functional](artifacts/performance/after/regression-mobile.json).
- [Visual comparisons](artifacts/performance/visual-comparison/summary.json); [CSS removal evidence](artifacts/performance/staging/css/removal-report.md); [mask alias proof](artifacts/performance/staging/shadow-aliases-check.json).
- [source freeze](artifacts/performance/final-source-freeze.json) / [обнаруженные внешние изменения](artifacts/performance/final-source-freeze-check.json) / [независимые frozen-only invariants](artifacts/performance/frozen-snapshot-invariants.json).

Повторная генерация этого документа из готовых сохранённых результатов: node artifacts/performance/write-after.cjs --finalize. Генератор не собирает и не изменяет проект, не пересоздаёт CHANGED_FILES и не обращается к серверу. Он оставляет статус PROVISIONAL; снять его можно только после новой согласованной приёмки актуальной ревизии.
