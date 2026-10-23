# PROMIX — performance-аудит до оптимизации

Дата: 20 октября 2026, Europe/Astrakhan. Этот документ фиксирует неизменённую текущую production-сборку до performance-правок. Deploy, изменение сервера и реальные отправки форм не выполнялись. Исходная сборка сохранена в `artifacts/performance/before-dist/`; SHA-256 исходников, product data, изображений и документов — в `source-checksums-before.json` и `protected-source-checksums-before.json`.

## 1. Фактическая архитектура

| Параметр | Проверенное состояние |
|---|---|
| Framework | Astro 5.18.2 (package.json: ^5.13.5), TypeScript 5.9.3 |
| Build tool | Vite 6.4.3, встроенный в Astro |
| Package manager / Node | pnpm 11.25.0; Node v24.19.0; pnpm-lock.yaml lockfileVersion9 |
| Команда production build | `pnpm run build` → `astro check && astro build` |
| Режим | Статическая генерация Astro: нет SSR adapter/output:server; HTML отдаётся напрямую |
| Integrations | Только @astrojs/sitemap 3.7.3 |
| Клиент | Vanilla JS; React/Vue/других hydrated islands нет, client:* отсутствует |
| Основные scripts | public/site.js — меню, cookie consent, модальные окна, формы, motion; public/catalog.js — только каталог; public/metrika.js — отложенная аналитика; небольшие Astro modules для layout/shadows/finishing |
| Product data | src/data/products.ts, catalog-product-assets.json, product-images.json, product-image-layout.ts, product-shadow-geometry.json; brochure/document mappings в src/data |
| Изображения | public/images/; текущие производные catalog-2026-10, оригиналы public/images/products и assets/product-sources/catalog-2026-10 |
| Формы/API | Относительный POST /api/lead.php; backend/public/api/lead.php + backend/src; PHP8.1+/Composer; SMTP только на сервере; dev Vite proxy /api →127.0.0.1:8080 |
| Аналитика/внешние запросы | Яндекс.Метрика, loader public/metrika.js; tag.js загружается async только на production hosts pro-mix.ru/www.pro-mix.ru и при analytics consent; внешних шрифтов/CDN/framework SDK не обнаружено |
| Страницы | 49 HTML в baseline output, включая previews; 30 product routes, 26 видимых товаров каталога; производство/партнёрам/контакты — секции главной #production/#partners/#contacts |

Проверены реальные package.json, pnpm-lock.yaml, astro.config.mjs, layouts/components/scripts, backend/README.md и структура output. PHP/SMTP не запускаются Astro preview и не подменяются клиентским секретом. Конфигурация SMTP и адресаты не изменялись.

## 2. Production build и output

| Метрика | До |
|---|---:|
| Полная pnpm run build (проверка типов + сборка) | 71.092s |
| Exit code | 0 |
| Output | 239,103,567B (228.03MiB), 665файлов |
| HTML | 49 |
| Все внешние .js в output | 54,808B (53.5KiB), 8файла |
| Все внешние .css в output | 267,654B (261.4KiB), 11файлов |
| Public | 235,989,235B, 550файлов |
| Файлы previews внутри baseline production | 66 |

Внешние JS/CSS размеры выше — размеры файлов без транспортного сжатия, включая dev preview assets. Inline JS/CSS входят в HTML и учитываются отдельно в coverage/сетевых ресурсах. Их нельзя напрямую сравнивать с compressed transfer. Полный build log: `artifacts/performance/build-before.log`; краткий результат: `build-before.json`. Astro сообщил 49 страниц и собственный build stage22.08s; полная команда с check заняла71.092s. Проверка Astro: 0 errors, 0 warnings, 0 hints. Полные диагностические сообщения сохранены в build log.

### Крупнейшие JS chunks

| Путь в baseline dist | Bytes |
|---|---:|
| site.js | 24,161 |
| catalog.js | 10,798 |
| metrika.js | 5,796 |
| previews/wide-surface-shadow/review.js | 3,533 |
| hero-concepts.js | 3,468 |
| previews/shadow-concepts/review.js | 2,703 |
| previews/catalog-shadows/shadows.js | 2,287 |
| previews/contact-shadows/review.js | 2,062 |

### Крупнейшие CSS chunks

| Путь в baseline dist | Bytes |
|---|---:|
| _astro/cookies.CJJyW9Fk.css | 127,142 |
| _astro/index.ThhvTCGB.css | 27,823 |
| _astro/index.77yJNAnD.css | 27,093 |
| _astro/_variant_.DgKOhuN-.css | 16,152 |
| _astro/task-compact.byZCiO0G.css | 15,314 |
| _astro/_variant_.CgrvzW7E.css | 14,799 |
| previews/home-refinement/lower-sections.css | 11,255 |
| _astro/_slug_.CUVzHDMN.css | 10,818 |

### Крупнейшие изображения на диске

| Source public path | Bytes | Pixels | Формат / alpha | Production references |
|---|---:|---|---|---|
| public/images/hero-architecture.png | 3,758,451 | 1920×1080 | png, alpha | 0 |
| public/images/products/2026-10/mix-mosaic-c196ed3116.png | 3,641,964 | 2048×2048 | png, alpha | 0 |
| public/images/wall-system.png | 3,586,565 | 1800×1100 | png, alpha | 0 |
| public/images/laboratory.png | 3,355,525 | 1800×1100 | png, alpha | 0 |
| public/images/categories/concept-1/texture-primer.png | 3,144,870 | 1254×1254 | png, opaque | 0 |
| public/images/production.png | 3,044,840 | 1920×1080 | png, alpha | 0 |
| public/images/consultation.png | 2,767,795 | 1400×1200 | png, alpha | 0 |
| public/images/system-layers-source.png | 2,660,935 | 1619×971 | png, alpha | 0 |
| public/images/products/2026-10/promix-fasad-4fa9419c39.png | 2,485,426 | 2048×2048 | png, alpha | 0 |
| public/images/hero-concepts/concept-02-surface-continuum.png | 2,480,580 | 1672×941 | png, opaque | 0 |
| public/images/products/2026-10/polymer-putty-09cd4e5959.png | 2,428,863 | 2048×2048 | png, alpha | 1 |
| public/images/products/2026-10/promix-j-71ae9842fc.png | 2,380,420 | 2048×2048 | png, alpha | 0 |

Эти крупнейшие файлы не обязательно загружаются пользователю. Полная инвентаризация каждого изображения: `artifacts/performance/inventory/assets-before.json` — путь, размер, width/height, формат, alpha, SHA-256, source/build references. Фактические display размеры, src/srcset/sizes, width/height attributes, lazy/eager, decoding, fetchpriority и complete/aboveFold сохранены в `before/*-cold.json → dom.images`.

### Крупнейшие шрифты в build

| Путь | Bytes |
|---|---:|
| _astro/inter-latin-ext-600-normal.CIVaiw4L.woff | 48,668 |
| _astro/inter-latin-ext-500-normal.BxGbmqWO.woff | 48,492 |
| _astro/inter-latin-ext-400-normal.77YHD8bZ.woff | 47,560 |
| _astro/inter-latin-ext-600-normal.D2bJ5OIk.woff2 | 36,260 |
| _astro/inter-latin-ext-500-normal.CV4jyFjo.woff2 | 36,024 |
| _astro/inter-latin-ext-400-normal.C1nco2VV.woff2 | 35,000 |
| _astro/inter-latin-500-normal.BL9OpVg8.woff | 31,284 |
| _astro/inter-latin-600-normal.CiBQ2DWP.woff | 31,260 |
| _astro/inter-latin-400-normal.CyCys3Eg.woff | 30,696 |
| _astro/playfair-display-latin-400-normal.DHYHbkg3.woff | 26,900 |

В CSS объявлены локальные Inter, homepage Manrope и исторические Playfair-селекторы. В сетевых initial samples реально загружаются Inter и Manrope; используемых Playfair glyphs не найдено. WOFF2 и font-display:swap уже есть. В preview routes импортированы дополнительные языковые subsets, из-за которых output содержит неиспользуемые на публичных страницах fonts. Эти preview-объявления не загружаются публичными страницами и не должны добавляться к ним при оптимизации. Прямых дублирующихся сетевых загрузок одного URL не найдено; duplicate @font-face не доказывает двойную передачу. Критический font preload отсутствует. Типографика зафиксирована как ограничение.

## 3. Lighthouse: 16 исходных production-прогонов

Lighthouse13.5.0, Chrome155.0.8059.85, URL `http://127.0.0.1:4322/`. Профили Lighthouse отличаются от прямого CDP/Playwright профиля ниже: mobile simulated throttling — RTT150ms, throughput1638.4Kbps, CPU4x, viewport412×823/DPR1.75; desktop RTT40ms, throughput10240Kbps, CPU1x, viewport1350×940. Cold запускается с очисткой storage, warm — `disableStorageReset:true` на том же профиле после cold. Warm отражает текущие preview headers и revalidation; Nginx headers ещё не применены.

| Route | Device | Cache | Perf | A11y | Best Practices | SEO | LCP ms | CLS | FCP ms | TBT ms | Speed Index ms | Server response ms |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| / | mobile | cold | 83 | 100 | 100 | 100 | 4585.7 | 0.000000 | 1516.1 | 0.0 | 1516.1 | 2.0 |
| / | mobile | warm | 100 | 100 | 100 | 100 | 1359.4 | 0.001503 | 903.8 | 0.0 | 903.8 | 1.0 |
| / | desktop | cold | 99 | 100 | 100 | 100 | 848.6 | 0.000188 | 457.2 | 0.0 | 457.2 | 2.0 |
| / | desktop | warm | 100 | 100 | 100 | 100 | 367.9 | 0.000188 | 286.3 | 0.0 | 334.6 | 1.0 |
| /products/ | mobile | cold | 92 | 97 | 100 | 100 | 3020.1 | 0.000032 | 2116.1 | 0.0 | 2116.1 | 3.0 |
| /products/ | mobile | warm | 100 | 97 | 100 | 100 | 1358.0 | 0.000000 | 1056.4 | 0.0 | 1056.4 | 1.0 |
| /products/ | desktop | cold | 99 | 96 | 100 | 100 | 942.0 | 0.000362 | 537.6 | 0.0 | 537.6 | 3.0 |
| /products/ | desktop | warm | 100 | 96 | 100 | 100 | 453.6 | 0.000000 | 287.7 | 0.0 | 338.1 | 2.0 |
| /products/promix-h-03/ | desktop | cold | 99 | 96 | 100 | 100 | 846.5 | 0.000225 | 409.7 | 0.0 | 419.5 | 2.0 |
| /products/promix-h-03/ | desktop | warm | 100 | 96 | 100 | 100 | 370.2 | 0.000000 | 287.1 | 0.0 | 307.4 | 1.0 |
| /documents/ | mobile | cold | 99 | 96 | 100 | 100 | 1655.5 | 0.000018 | 1505.5 | 0.0 | 1505.5 | 1.0 |
| /documents/ | mobile | warm | 100 | 96 | 100 | 100 | 1053.0 | 0.000018 | 1053.0 | 0.0 | 1053.0 | 1.0 |
| /documents/ | desktop | cold | 100 | 96 | 100 | 100 | 444.9 | 0.000654 | 364.9 | 0.0 | 364.9 | 1.0 |
| /documents/ | desktop | warm | 100 | 96 | 100 | 100 | 282.6 | 0.000654 | 282.6 | 0.0 | 282.6 | 1.0 |
| /products/promix-h-03/ | mobile | cold | 82 | 96 | 100 | 100 | 4729.8 | 0.000094 | 1807.1 | 0.0 | 1807.1 | 2.0 |
| /products/promix-h-03/ | mobile | warm | 99 | 96 | 100 | 100 | 1369.7 | 0.000000 | 1067.3 | 115.0 | 1067.3 | 1.0 |

Основная проблема по Lighthouse: cold mobile LCP главной4.586s и продукта4.730s, выше цели2.5s; каталог3.020s. Best Practices100, SEO100 во всех16 прогонах; accessibility96–100 требует рассмотрения конкретных existing audit findings без редизайна. Cold/warm CLS ниже0.1. TBT в15из16прогонов0ms; product mobile warm115ms, поэтому не следует утверждать нулевую блокировку во всех условиях.

Каждый прогон имеет HTML/JSON и screenshot: `artifacts/performance/before/lighthouse/<home|catalog|product|documents>-<mobile|desktop>-<cold|warm>.report.{html,json}` и `.site.jpg`. Сводка: `before/lighthouse/summary.json`. Первый product-mobile-cold завершился transient404; файл сохранён как `product-mobile-cold.failed-attempt.report.json`, затем выполнен успешный повтор на той же исходной сборке. Неудачная попытка не использована как performance-результат и не удалена.

INP не измерен: это полевая метрика взаимодействий реальных пользователей. Стандартизованный лабораторный аналог здесь — Lighthouse TBT; browser event timing/longtasks служат дополнительными диагностическими данными. TTI/interactive из raw report не является INP. Local server response1–3ms — только localhost, не доказательство FirstVDS TTFB. Полевая RUM/CrUX статистика для текущей непубликованной сборки недоступна.

## 4. Browser matrix: 52 измерения + функциональные сценарии

13 реальных маршрутов × desktop/mobile × cold/warm. Desktop1440×900, DPR1; mobile390×844, DPR1.75, CDP Fast4G4Mbps down/1Mbps up/150ms network latency, CPU4x. Для каждого route новый context →cold, затем reload в том же context →warm. Ожидание load+1800ms, timeout90s. Некоторые lazy image requests продолжаются после load; рядом указано количество завершённых запросов. Эти снимки являются initial viewport waterfall, а не загрузкой всех ресурсов длинной страницы. Coverage-инструментирование может влиять на CPU и делает прямые browser timings несопоставимыми с Lighthouse score.

| Device | Route | Cache | HTTP | LCP ms | CLS | FCP ms | Requests / complete | Transfer KiB | Images KiB | JS KiB | CSS KiB |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| desktop | / | cold | 200 | 1096.0 | 0.000000 | 332.0 | 30/30 | 4923.7 | 4753.4 | 9.0 | 36.0 |
| desktop | / | warm | 200 | 856.0 | 0.000000 | 92.0 | 26/26 | 3.6 | 1.8 | 0.2 | 0.0 |
| desktop | /products/ | cold | 200 | 628.0 | 0.000000 | 624.0 | 110/110 | 3167.9 | 2983.1 | 12.7 | 32.3 |
| desktop | /products/ | warm | 200 | 240.0 | 0.000000 | 240.0 | 106/106 | 17.5 | 15.5 | 0.4 | 0.0 |
| desktop | /products/?category=primers | cold | 200 | 460.0 | 0.002316 | 416.0 | 114/114 | 3673.9 | 3489.1 | 12.7 | 32.3 |
| desktop | /products/?category=primers | warm | 200 | 324.0 | 0.002316 | 280.0 | 110/110 | 18.0 | 16.0 | 0.4 | 0.0 |
| desktop | /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | cold | 200 | 440.0 | 0.002316 | 392.0 | 114/114 | 3673.9 | 3489.1 | 12.7 | 32.3 |
| desktop | /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | warm | 200 | 308.0 | 0.002316 | 268.0 | 118/118 | 17.6 | 15.9 | 0.4 | 1.0 |
| desktop | /products/promix-h-03/ | cold | 200 | 268.0 | 0.000000 | 212.0 | 20/20 | 373.7 | 248.0 | 9.0 | 31.9 |
| desktop | /products/promix-h-03/ | warm | 200 | 596.0 | 0.000000 | 76.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| desktop | /products/deep-primer/ | cold | 200 | 184.0 | 0.000224 | 148.0 | 23/23 | 688.3 | 563.8 | 9.0 | 31.9 |
| desktop | /products/deep-primer/ | warm | 200 | 88.0 | 0.000000 | 72.0 | 19/19 | 2.8 | 1.3 | 0.2 | 0.0 |
| desktop | /products/super-tack-3/ | cold | 200 | 192.0 | 0.000203 | 164.0 | 20/20 | 347.6 | 222.0 | 9.0 | 31.9 |
| desktop | /products/super-tack-3/ | warm | 200 | 612.0 | 0.000000 | 104.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| desktop | /products/hydro/ | cold | 200 | 176.0 | 0.000000 | 164.0 | 19/19 | 353.3 | 236.9 | 9.0 | 31.9 |
| desktop | /products/hydro/ | warm | 200 | 580.0 | 0.000000 | 60.0 | 23/23 | 2.3 | 0.6 | 0.2 | 1.0 |
| desktop | /products/glass-fiber-plus-top/ | cold | 200 | 208.0 | 0.000000 | 160.0 | 20/20 | 229.1 | 104.4 | 9.0 | 31.9 |
| desktop | /products/glass-fiber-plus-top/ | warm | 200 | 592.0 | 0.000000 | 80.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| desktop | /products/nonwoven-plus-top/ | cold | 200 | 224.0 | 0.000000 | 208.0 | 21/21 | 261.3 | 136.8 | 9.0 | 31.9 |
| desktop | /products/nonwoven-plus-top/ | warm | 200 | 588.0 | 0.000000 | 80.0 | 17/17 | 2.5 | 1.0 | 0.2 | 0.0 |
| desktop | /products/promix-f/ | cold | 200 | 192.0 | 0.000198 | 172.0 | 20/20 | 351.4 | 225.8 | 9.0 | 31.9 |
| desktop | /products/promix-f/ | warm | 200 | 600.0 | 0.000000 | 88.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| desktop | /performance-audit-missing-page/ | cold | 404 | 56.0 | 0.000000 | 56.0 | 2/2 | 5.2 | 0.0 | 0.0 | 0.0 |
| desktop | /performance-audit-missing-page/ | warm | 404 | 32.0 | 0.000000 | 32.0 | 2/2 | 2.0 | 0.0 | 0.0 | 0.0 |
| mobile | /products/ | cold | 200 | 1672.0 | 0.000000 | 1484.0 | 102/98 | 1510.5 | 1325.7 | 12.7 | 32.3 |
| mobile | /products/ | warm | 200 | 1640.0 | 0.000000 | 1440.0 | 106/106 | 16.0 | 14.3 | 0.4 | 1.0 |
| mobile | /products/?category=primers | cold | 200 | 2068.0 | 0.000000 | 1476.0 | 105/96 | 1506.4 | 1325.7 | 12.7 | 32.3 |
| mobile | /products/?category=primers | warm | 200 | 1876.0 | 0.000000 | 1376.0 | 111/110 | 423.8 | 418.9 | 0.4 | 1.0 |
| mobile | /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | cold | 200 | 1964.0 | 0.000000 | 1388.0 | 104/96 | 1506.4 | 1325.7 | 12.7 | 32.3 |
| mobile | /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | warm | 200 | 1840.0 | 0.000000 | 1348.0 | 110/109 | 430.8 | 425.9 | 0.4 | 1.0 |
| mobile | /products/promix-h-03/ | cold | 200 | 1544.0 | 0.000000 | 1028.0 | 20/20 | 551.2 | 425.5 | 9.0 | 31.9 |
| mobile | /products/promix-h-03/ | warm | 200 | 844.0 | 0.000000 | 624.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| mobile | /products/deep-primer/ | cold | 200 | 1268.0 | 0.000000 | 864.0 | 21/21 | 730.9 | 606.5 | 9.0 | 31.9 |
| mobile | /products/deep-primer/ | warm | 200 | 744.0 | 0.000000 | 600.0 | 17/17 | 2.5 | 1.0 | 0.2 | 0.0 |
| mobile | /products/super-tack-3/ | cold | 200 | 1452.0 | 0.000000 | 952.0 | 20/20 | 490.6 | 365.0 | 9.0 | 31.9 |
| mobile | /products/super-tack-3/ | warm | 200 | 792.0 | 0.000000 | 616.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| mobile | /products/hydro/ | cold | 200 | 1452.0 | 0.000000 | 824.0 | 19/19 | 505.9 | 389.5 | 9.0 | 31.9 |
| mobile | /products/hydro/ | warm | 200 | 752.0 | 0.000000 | 556.0 | 15/15 | 2.2 | 0.9 | 0.2 | 0.0 |
| mobile | /products/glass-fiber-plus-top/ | cold | 200 | 1108.0 | 0.000000 | 892.0 | 20/20 | 261.1 | 136.5 | 9.0 | 31.9 |
| mobile | /products/glass-fiber-plus-top/ | warm | 200 | 716.0 | 0.000000 | 556.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| mobile | /products/nonwoven-plus-top/ | cold | 200 | 1044.0 | 0.000000 | 828.0 | 20/20 | 256.5 | 132.1 | 9.0 | 31.9 |
| mobile | /products/nonwoven-plus-top/ | warm | 200 | 676.0 | 0.000000 | 536.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| mobile | /products/promix-f/ | cold | 200 | 1464.0 | 0.000000 | 936.0 | 20/20 | 501.7 | 376.2 | 9.0 | 31.9 |
| mobile | /products/promix-f/ | warm | 200 | 792.0 | 0.000000 | 612.0 | 16/16 | 2.4 | 0.9 | 0.2 | 0.0 |
| mobile | /documents/ | cold | 200 | 668.0 | 0.000000 | 668.0 | 11/11 | 107.6 | 0.0 | 9.0 | 25.8 |
| mobile | /documents/ | warm | 200 | 468.0 | 0.000000 | 468.0 | 13/13 | 1.1 | 0.0 | 0.2 | 0.5 |
| mobile | /performance-audit-missing-page/ | cold | 404 | 276.0 | 0.000000 | 276.0 | 2/2 | 5.2 | 0.0 | 0.0 | 0.0 |
| mobile | /performance-audit-missing-page/ | warm | 404 | 220.0 | 0.000000 | 220.0 | 2/2 | 2.0 | 0.0 | 0.0 | 0.0 |
| desktop | /documents/ | cold | 200 | 328.0 | 0.000000 | 328.0 | 11/11 | 107.6 | 0.0 | 9.0 | 25.8 |
| desktop | /documents/ | warm | 200 | 44.0 | 0.000000 | 44.0 | 13/13 | 1.1 | 0.0 | 0.2 | 0.5 |
| mobile | / | cold | 200 | 1568.0 | 0.000000 | 1020.0 | 28/28 | 4175.9 | 4004.5 | 9.0 | 36.0 |
| mobile | / | warm | 200 | 1104.0 | 0.000000 | 792.0 | 23/23 | 73.9 | 1.5 | 0.2 | 0.0 |

Все 26 каталоговых карточек присутствуют. Категория primers даёт7 товаров, поиск «грунт» —8. Product routes проверены: promix-h-03 (ведро), deep-primer (канистра), super-tack-3, hydro, glass-fiber-plus-top, nonwoven-plus-top, promix-f (длинный продукт/документы). Дополнительно /documents/, deliberate404; производство, партнёрам и контакты проверены как реальные секции главной. Консультационная форма — modal, отдельного consultation URL в проекте нет.

Сырые измерения каждого route: `before/<device>-<name>-<cache>.json`. Там сохранены console/httpErrors, Network timing/priority/cache/headers, LCP HTML/URL, CLS sources, paint/navigation/resources, fonts/images, preload/prefetch и initial coverage. Сводка: `before/summary.json`, CSV: `before/browser-summary.csv`. HAR52page/1991entries: `before/network-waterfall.har` (bodies omitted; absolute timestamps реконструированы приблизительно, точные CDPtimings сохранены).

## 5. Waterfall, LCP и ранние ресурсы

| Route | Device | Реальный LCP element | LCP URL |
|---|---|---|---|
| / | desktop | img.home-hero__image | /images/hero-surface-promix-h.webp |
| /products/ | desktop | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-640.webp |
| /products/?category=primers | desktop | img | /images/products/catalog-2026-10/betokontakt-613d6fe67c64-640.webp |
| /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | desktop | img | /images/products/catalog-2026-10/deep-primer-7d7b6b2b1613-640.webp |
| /products/promix-h-03/ | desktop | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-640.webp |
| /products/deep-primer/ | desktop | img | /images/products/catalog-2026-10/deep-primer-7d7b6b2b1613-640.webp |
| /products/super-tack-3/ | desktop | img | /images/products/catalog-2026-10/super-tack-3-952003b7c139-640.webp |
| /products/hydro/ | desktop | img | /images/products/catalog-2026-10/hydro-be230cdd86df-640.webp |
| /products/glass-fiber-plus-top/ | desktop | img | /images/products/catalog-2026-10/glass-fiber-plus-top-409cb287f83a-640.webp |
| /products/nonwoven-plus-top/ | desktop | img | /images/products/catalog-2026-10/nonwoven-plus-top-ea94d8292c93-640.webp |
| /products/promix-f/ | desktop | img | /images/products/catalog-2026-10/promix-f-e29eb8da3aed-640.webp |
| /performance-audit-missing-page/ | desktop | h1 | text |
| /products/ | mobile | div.product-scene-wall | /images/catalog/mineral-studio.webp |
| /products/?category=primers | mobile | div.product-scene-wall | /images/catalog/mineral-studio.webp |
| /products/?q=%D0%B3%D1%80%D1%83%D0%BD%D1%82 | mobile | div.product-scene-wall | /images/catalog/mineral-studio.webp |
| /products/promix-h-03/ | mobile | img | /images/products/catalog-2026-10/promix-h-03-685e4fb7db0e-960.webp |
| /products/deep-primer/ | mobile | img | /images/products/catalog-2026-10/deep-primer-7d7b6b2b1613-960.webp |
| /products/super-tack-3/ | mobile | img | /images/products/catalog-2026-10/super-tack-3-952003b7c139-960.webp |
| /products/hydro/ | mobile | img | /images/products/catalog-2026-10/hydro-be230cdd86df-960.webp |
| /products/glass-fiber-plus-top/ | mobile | img | /images/products/catalog-2026-10/glass-fiber-plus-top-409cb287f83a-960.webp |
| /products/nonwoven-plus-top/ | mobile | img | /images/products/catalog-2026-10/nonwoven-plus-top-ea94d8292c93-960.webp |
| /products/promix-f/ | mobile | img | /images/products/catalog-2026-10/promix-f-e29eb8da3aed-960.webp |
| /documents/ | mobile | p | text |
| /performance-audit-missing-page/ | mobile | h1 | text |
| /documents/ | desktop | h1 | text |
| / | mobile | img.home-hero__image | /images/hero-surface-promix-h.webp |

Ключевые находки:

- Главная: реальный LCP — `.home-hero__image`, WebP1207×1303/129774B; уже задан eager через отсутствие lazy, fetchpriority=high, dimensions и один image preload. Сам hero сравнительно небольшой.
- Главная mobile до LCP начинает загружать лишние крупные category packshots: plus-top PNG≈830KiB, hydro≈769KiB, promix-f≈752KiB, super-tack1600WebP≈653KiB, universal-primer1600WebP≈592KiB. Они конкурируют с критическими ресурсами; total initial image transfer4.10MB. Первые3фона категорий eager, cutouts без srcset. Следует сохранить точные утверждённые PNG artwork и использовать производные, а не заменять их другим изображением упаковки.
- Каталог: все shadow mask CSS resources начинают грузиться независимо от lazy img. На mobile100из102запросов стартуют до LCP; это включает множество масок. На desktop110запросов/3.24MB. В inventory есть SHA-identical shadow files под разными names, потенциально безопасная canonical URL mapping без изменения pixels/теней.
- Все ключевые страницы блокируют рендер common CSS: cookies.CJJyW9Fk.css≈127KiB + cookies.DlQUbs6h.css; дополнительно route CSS. У home4blocking CSS resources, у docs2. Полные renderBlockingStatus есть в rawdom.resources.
- В ключевых измеренных страницах точных повторных сетевых запросов одного URL и redirect chains не обнаружено. Разные URLs с одинаковым SHA — отдельная проблема build/cache, перечисленная в duplicate inventory.
- Aggressive product page prefetch не обнаружен. Home имеет один соответствующий LCP preload, docs/catalog/product preload отсутствует; всех карточек preload нет.
- Product hero имеет responsive catalog derivatives, но sizes использует широкий прозрачный canvas (110vw на mobile); оценивать надо весь actual img box/DPR, а не только видимую этикетку. Оригиналы каталога2048² и generated640/960/1600 lossless WebP сохранены.
- Production photos имеют existing960/1600WebP; в HomeProduction пока выбран1600безsrcset.
- Все actual request timings/priorities/initiators и подробный разбор находятся в `before/browser-findings.md` и HAR.

## 6. Ошибки, CLS, CSS/JS и memory

- Нулевые genuine pageerror сайта на проверенных маршрутах. Нет asset404 на функциональных страницах; единственный ожидаемый404 — `/performance-audit-missing-page/`. Default Astro404 имеет корректный HTTP404, отдельного custom404route нет.
- Ошибка audit-инструмента при сериализации CLS Text node была исправлена guard по tagName; affected desktop-documents/mobile-home пересняты cold/warm. Исправленные файлы включены в таблицы; эта ошибка не относится к исходному приложению.
- CLS: значения малы, ниже0.1 на всей матрице и Lighthouse. Основные изображения уже имеют width/height и reserved layout; cookies fixed overlay, dialogs top-layer. Все layout-shift sources есть в rawJSON.
- Фильтры используют кешированные карточки и нормализованный индекс, debounce180ms, обновляют существующий DOM и history state; обработчики не создаются на каждую фильтрацию. Крупный search refactor не обоснован.
- После25циклов фильтрации и forced GC event listeners стабильны106→106 наdesktop/mobile; nodes+14/+12, JSheap≈+60KiB. Утечка не подтверждена; короткий тест не доказывает её отсутствие в бесконечной сессии.
- Один shared ResizeObserver/WeakMap в shadows, grouped layout reads/writes, passive scroll+rAF; нет обнаруженных unbounded intervals. Полная навигация обычная, SPA swaps отсутствуют.
- Motion преимущественно transform/opacity; approved hover filter/тени не удалять из-за теоретической стоимости. prefers-reduced-motion присутствует и runtime-проверен.

### Initial precise coverage

| Route | JS delivered source KiB | JS initial unused KiB | CSS source KiB | CSS initial unused KiB |
|---|---:|---:|---:|---:|
| / | 31.4 | 22.3 | 184.5 | 151.3 |
| /products/ | 43.0 | 25.8 | 161.2 | 119.5 |
| /products/promix-f/ | 31.1 | 21.8 | 157.8 | 123.7 |
| /documents/ | 29.3 | 21.6 | 133.9 | 120.1 |

Источник: `before/initial-coverage-precise.json`, V8 narrowest-range accounting, initial load+600ms, без инъекции audit observer. Per-page convenience JS coverage может завышать использованный объём из-за вложенных V8 ranges; для quantitative JS use применяется только precise supplemental file. Неиспользованный при старте JS часто нужен для меню/форм/consent. Dynamic CSS classes/hover/dialog states не удаляются по одному scanner result. Global/premium содержит legacy/page-specific rules и fullpreviewfonts; осторожное разделение по страницам и bundling безопаснее массового удаления.

## 7. Third-party, PDF, формы, accessibility и SEO

- Начальный third-party transfer во всех52browser-samples:0запросов/0B. Это ожидаемо: localhost не production allowlist; remote Metrika tag не запускается без consent. Это НЕ утверждение, что production аналитика весит0B.
- Метрика имеет consent guard, production host check, async tag и deduplicated loader promise. Cookie decline/persistence проверен; соответствующий analytics consent сохраняется в localStorage. Внешний production counter не запускался и аналитика не удалялась.
- /documents/ содержит ссылку на официальный `/documents/promix-sgr-shpatlevki-2026.pdf`4640389B. PDF iframe/embed/object отсутствует; автоматических PDFrequests0; документ не изменялся. MIME/cache headers на FirstVDS проверяются отдельно после ручной установки Nginx.
- Client forms не используют тяжёлых SDK. В mock/local-only проверены success, HTTP500error, retry, timeout12000ms/AbortController, disabled button, двойной requestSubmit→ровно1POST. Перехвачены4mockPOSTнаprofile, realPOST0. SMTPcredentials не выводились/не читались для отправки.
- Keyboard modal focus trap, Escape, восстановление фокуса, cookie settings, мобильное меню и navigation проверены; labels/required/consent сохранены. Screenshot evidence в before/desktop|mobile-*.png и lighthouse/*.site.jpg.
- Title, description, canonical, viewport присутствуют; canonical использует https://pro-mix.ru. Sitemap integration и robots.txt присутствуют; robots разрешает обход. Preview routes присутствуют в baseline output/sitemap selective noindex недостаточен: их следует исключить из публичного production packaging, сохранив исходники. Marketing copy не переписывать.

## 8. Неиспользуемые assets и чистота output

- Public550files/235989235B. По reference graph344files/186421146B не имеют прямых production references. Это кандидаты, а не разрешение удалить: computed URLs, исторические product pages и внешние backlinks требуют осторожности.
- SHA256 duplicate44группы/9768489теоретически redundantbytes. Ни один source asset не удалён. Подробности и рекомендации: `UNUSED_ASSETS_REPORT.md`, `inventory/assets-before.json`, `duplicates-before.json`.
- Baseline dist содержит66previewfiles и большие source/history images, которые Astro public-copy переносит даже без ссылок. QA screenshots/artifacts/docs вне public и сами по себе в build не попадают.
- В baseline output нет *.map и .env файлов по filename scan. Frontend bundle не включает backend/config/config.php; production release должен копировать только проверенную dist + server-side backend отдельно. Не публиковать workspace целиком.
- Неиспользуемые исходники необходимо сохранить; допускается исключение preview/private artifacts из production package без удаления оригиналов. Секреты/SMTP здесь не модифицировались; это performance-аудит, не формальная security certification.

## 9. Приоритет безопасных изменений

1. Сократить раннюю загрузку category images, добавить exact-source lossless/responsive производные и sizes, lazy/async для below-fold; приоритет реального LCP оставить.
2. Устранить byte-identical shadow URL transfer через canonical mapping; approved shadow pixels/positions не менять.
3. Снизить общий CSS по реальной page reachability, исключить preview rules/fonts из публичной сборки; сохранить dynamic states и typography.
4. Bundle/minify/fingerprint vanilla scripts, page-specific catalog JS только на /products/; без изменения поиска/URL state/форм.
5. Подготовить FirstVDS Nginx gzip/Brotli-ifavailable, cache-policy split, staticHTML напрямую, API черезPHP-FPM, правильный404/PDFMIME. Применение вручную, server/deploy не выполняются.
6. Повторить эту же матрицу и Lighthouse profiles, сравнить визуально ключевые страницы и source data checksums; не объявлять успех при регрессиях.

## 10. Ограничения исходных измерений

- Все показатели получены на production build, не devserver. Прогоны выполнены последовательно без concurrent Lighthouse/browser нагрузок. Это одиночные воспроизводимые лабораторные samples, не median нескольких аппаратных прогонов.
- Два lab профиля: browser direct Fast4G и Lighthouse simulated slow4G. Их цифры не смешиваются; before/after сравниваются только внутри одинакового harness/settings.
- Нет доступа к FirstVDS production server, TLS/HTTP2/Brotli/PHP-FPM/realnetworkTTFB пока не измерены. Preview отдаёт свои gzip/cacheheaders; они не заменяют Nginx рекомендации.
- Field INP и реальный third-party-afterconsent transfer не измерены; claims о достижении их целей пока невозможны. Непубликованная сборка не имеет CrUX-полевых данных.
- Dev previews подлежат исключению из public build, но публичные URL/products/documents и30productroutes сохраняются.
- Состояние baseline зафиксировано перед началом правок. Автоматическая публикация, реальные формы и внешние платные сервисы не использовались.

