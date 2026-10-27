import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { LOCALES } from '../scripts/i18n/config.mjs';
import { loadDictionary } from '../scripts/i18n/html.mjs';
import { createStaticSiteFixture, distRoot, listFiles, resolvePublicFile } from './support/static-site-fixture.mjs';

const targets = LOCALES.filter((locale) => locale.code !== 'ru');
const evidenceRoot = process.env.PROMIX_I18N_QA_DIR ?? fileURLToPath(new URL('../../PROMIX_I18N_QA_2026-10-27/', import.meta.url));
const evidence = {
  environment: { source: 'production dist', browser: 'Playwright with installed Google Chrome', browserFallback: 'Browser plugin not available', viewports: ['1440x900', '1101x900', '390x844', '320x844'] },
  metadata: [], products: [], flows: [], responsive: [], keyboard: [], errors: [], screenshots: [], apiRequests: 0,
};
const htmlCache = new Map();
const dictionaries = new Map();
let browser;
let fixture;
let context;
let page;
let russianRoutes;

const localizedPath = (locale, route) => locale === 'ru' ? route : `/${locale}${route}`;
const decode = (value = '') => value.replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_match, hex, decimal) => String.fromCodePoint(parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_match, name) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name]);
const text = (value = '') => decode(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attributes = (tag = '') => Object.fromEntries([...tag.replace(/^<\/?[\w-]+/, '').matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
  .map((match) => [match[1], decode(match[2] ?? match[3] ?? match[4] ?? '')]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => attributes(match[0]));
const metadata = (html) => {
  const meta = tags(html, 'meta');
  const links = tags(html, 'link');
  return {
    lang: attributes(html.match(/<html\b[^>]*>/i)?.[0]).lang,
    title: text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    description: meta.find((item) => item.name === 'description')?.content,
    canonical: links.find((item) => item.rel === 'canonical')?.href,
    ogLocale: meta.find((item) => item.property === 'og:locale')?.content,
    ogUrl: meta.find((item) => item.property === 'og:url')?.content,
    alternates: links.filter((item) => item.rel === 'alternate' && item.hreflang),
    robots: meta.find((item) => item.name === 'robots')?.content,
  };
};
const productSchema = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => attributes('<script' + match[1] + '>').type === 'application/ld+json')
  .map((match) => JSON.parse(match[2])).find((entry) => entry['@type'] === 'Product');
const numbers = (value) => (text(value).match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(',', '.'));
const specNumbers = (html) => [...html.matchAll(/<dl\b[^>]*class="[^"]*\bpd-specs\b[^"]*"[^>]*>([\s\S]*?)<\/dl>/gi)]
  .flatMap((group) => [...group[1].matchAll(/<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)].map((match) => numbers(match[1]).sort()));
const translated = (locale, source) => {
  const result = dictionaries.get(locale)?.[source];
  assert.ok(typeof result === 'string' && result.trim(), `${locale}: missing translation for ${source}`);
  return result;
};
const readHtml = async (route) => {
  if (!htmlCache.has(route)) htmlCache.set(route, await fs.readFile(resolvePublicFile(route), 'utf8'));
  return htmlCache.get(route);
};

function monitor(target) {
  target.on('pageerror', (error) => evidence.errors.push({ url: target.url(), message: error.message }));
  target.on('console', (message) => {
    if (message.type() === 'error') evidence.errors.push({ url: target.url(), message: message.text() });
  });
  target.on('response', (response) => {
    if (response.status() >= 400) evidence.errors.push({ url: response.url(), status: response.status() });
  });
}
async function visit(route) {
  const response = await page.goto(fixture.origin + route, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, route);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0);
  return response;
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(evidenceRoot, name + '.png') });
  evidence.screenshots.push(name + '.png');
}

before(async () => {
  assert.equal(LOCALES.length, 11);
  assert.equal(targets.length, 10);
  await fs.mkdir(evidenceRoot, { recursive: true });
  const files = await listFiles(distRoot);
  russianRoutes = files.filter((file) => file.endsWith('.html')).map((file) => {
    const relative = path.relative(distRoot, file).split(path.sep).join('/');
    return relative === 'index.html' ? '/' : '/' + relative.replace(/index\.html$/, '');
  }).filter((route) => !targets.some((locale) => route.startsWith(`/${locale.code}/`))).sort();
  assert.equal(russianRoutes.length, 37);
  assert.equal(files.filter((file) => file.endsWith('.html')).length, 37 * 11);
  for (const locale of targets) {
    dictionaries.set(locale.code, await loadDictionary(locale.code));
  }
  fixture = await createStaticSiteFixture();
  evidence.environment.origin = fixture.origin;
  browser = await chromium.launch({ headless: true, ...(process.env.PROMIX_CHROME_PATH ? { executablePath: process.env.PROMIX_CHROME_PATH } : { channel: 'chrome' }) });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      evidence.apiRequests += 1;
      return route.abort();
    }
    return url.origin === fixture.origin ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(7000);
  monitor(page);
});

after(async () => {
  await fs.mkdir(evidenceRoot, { recursive: true });
  await fs.writeFile(path.join(evidenceRoot, 'i18n-browser-results.json'), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await fixture?.close();
});

test('all eleven language versions retain complete routes, matching canonicals and alternate links', async () => {
  for (const route of russianRoutes) {
    const russian = metadata(await readHtml(route));
    for (const locale of LOCALES) {
      const target = localizedPath(locale.code, route);
      const html = await readHtml(target);
      const state = metadata(html);
      assert.equal(state.lang, locale.code, target);
      assert.equal(state.canonical, 'https://pro-mix.ru' + target, target);
      assert.equal(state.ogUrl, state.canonical, target);
      assert.equal(state.ogLocale, locale.ogLocale, target);
      assert.ok(state.title && state.description?.length > 20, target);
      if (locale.code !== 'ru') {
        assert.notEqual(state.title, russian.title, `${target}: translated title`);
        assert.notEqual(state.description, russian.description, `${target}: translated SEO description`);
        if (route === '/' || route === '/products/') {
          assert.equal(state.title.trim(), translated(locale.code, russian.title).trim(), `${target}: current translated title`);
          assert.equal(state.description.trim(), translated(locale.code, russian.description).trim(), `${target}: current translated SEO description`);
        }
      }
      if (route === '/404.html') assert.match(state.robots, /noindex/);
      const languageOptions = tags(html, 'a').filter((link) => 'data-language-option' in link);
      assert.deepEqual(languageOptions.map((link) => ({ locale: link['data-locale'], href: link.href })), LOCALES.map((item) => ({ locale: item.code, href: localizedPath(item.code, route) })), `${target}: language links target real matching pages`);
      assert.deepEqual(languageOptions.filter((link) => link['aria-current'] === 'true').map((link) => link['data-locale']), [locale.code], `${target}: current language`);
      if (route !== '/404.html' || state.alternates.length) {
        assert.equal(state.alternates.length, 12, target);
        for (const other of LOCALES) {
          assert.equal(state.alternates.filter((link) => link.hreflang === other.code).length, 1, target);
          assert.equal(state.alternates.find((link) => link.hreflang === other.code).href, 'https://pro-mix.ru' + localizedPath(other.code, route), target);
        }
        assert.equal(state.alternates.find((link) => link.hreflang === 'x-default')?.href, 'https://pro-mix.ru' + route, target);
      }
      evidence.metadata.push({ route: target, lang: state.lang, title: state.title, description: state.description, canonical: state.canonical, alternates: state.alternates.length });
    }
  }
});

test('all thirty products have localized names and unchanged numerical technical specifications in every translation', async () => {
  const productRoutes = russianRoutes.filter((route) => route.startsWith('/products/') && route !== '/products/');
  assert.equal(productRoutes.length, 30);
  for (const route of productRoutes) {
    const original = await readHtml(route);
    const source = productSchema(original);
    assert.ok(source, route);
    const originalNumbers = specNumbers(original);
    const originalMain = original.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
    assert.ok(numbers(originalMain).length, route);
    for (const locale of targets) {
      const target = localizedPath(locale.code, route);
      const html = await readHtml(target);
      const schema = productSchema(html);
      assert.ok(schema, target);
      assert.equal(schema.name, dictionaries.get(locale.code)[source.name] ?? source.name, target);
      assert.equal(text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]), schema.name, target);
      assert.equal(schema.description, metadata(html).description, target);
      assert.equal(schema.image, source.image, `${target}: approved product artwork`);
      assert.deepEqual(specNumbers(html), originalNumbers, `${target}: numeric specifications changed`);
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
      assert.deepEqual(numbers(main).sort(), numbers(originalMain).sort(), `${target}: numerical product content changed`);
      const forms = tags(html, 'form').filter((form) => 'data-consult-form' in form);
      assert.equal(forms[0]?.action, '/api/lead.php', target);
      evidence.products.push({ route: target, name: schema.name, specificationRows: originalNumbers.length, numbersPreserved: true });
    }
  }
});

test('all ten languages support localized catalog search, filters, validation and language navigation', async (suite) => {
  for (const locale of targets) {
    await suite.test(locale.code, async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await visit(localizedPath(locale.code, '/'));
      assert.equal(await page.locator('html').getAttribute('lang'), locale.code);
      assert.ok((await page.locator('main h1').textContent()).trim().length > 3);
      assert.equal((await page.locator('[data-language-current]').textContent()).trim(), locale.code.toUpperCase());
      assert.ok((await page.locator('[data-language-trigger]').getAttribute('aria-label')).includes(locale.native));
      assert.deepEqual(await page.locator('[data-language-option]').evaluateAll((options) => options.map((option) => ({ code: option.dataset.locale, name: option.querySelector('[data-i18n-skip]').textContent.trim() }))), LOCALES.map((item) => ({ code: item.code, name: item.native })));
      const reject = page.locator('[data-cookie-reject]');
      if (await reject.isVisible()) {
        assert.equal((await reject.textContent()).trim(), translated(locale.code, 'Отклонить'));
        await reject.click();
      }
      for (const width of [1440, 1101, 390, 320]) {
        await page.setViewportSize({ width, height: width > 760 ? 900 : 844 });
        const home = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(home.scrollWidth <= width, `${locale.code}: homepage overflows at ${width}`);
        if (locale.code === 'ka' && width <= 390) {
          const lines = await page.locator('#hero-title').evaluate((heading) => [...heading.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
            .map((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
              const tops = rects.map((rect) => rect.top);
              return { text: node.textContent, verticalSpread: Math.max(...tops) - Math.min(...tops), fontSize: parseFloat(getComputedStyle(heading).fontSize) };
            }));
          assert.ok(lines.every((line) => line.verticalSpread < line.fontSize * .6), `ka: a manual hero line splits into an extra visual line at ${width}: ${JSON.stringify(lines)}`);
        }
        evidence.responsive.push({ locale: locale.code, surface: 'homepage', ...home });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('.desktop-nav .nav-product').click();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(new URL(page.url()).pathname, localizedPath(locale.code, '/products/'));
      const search = page.locator('[data-catalog-search]');
      const hardName = translated(locale.code, 'PROMIX H 0,2 — Жёсткая');
      const hardCatalogName = translated(locale.code, 'H 0,2 — жёсткая');
      await search.fill(hardName);
      await search.press('Tab');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-catalog-card]')].filter((card) => !card.hidden).length === 1).catch(async (error) => {
        const state = await page.evaluate(() => ({
          query: document.querySelector('[data-catalog-search]').value,
          url: location.href,
          visible: [...document.querySelectorAll('[data-catalog-card]')].filter((card) => !card.hidden).map((card) => card.querySelector('h2').textContent),
        }));
        throw new Error(`${locale.code}: localized search did not settle: ${JSON.stringify(state)}`, { cause: error });
      });
      const result = page.locator('[data-catalog-card]:visible');
      assert.equal((await result.locator('h2').textContent()).trim(), hardCatalogName);
      await result.locator('a').first().click();
      assert.equal(new URL(page.url()).pathname, localizedPath(locale.code, '/products/promix-h-02-hard/'));
      assert.equal((await page.locator('h1').textContent()).trim(), hardName);
      await visit(localizedPath(locale.code, '/products/'));
      await page.locator('[data-filter-group][data-filter-value="putties"]').click();
      assert.equal(await page.locator('[data-catalog-card]:visible').count(), 9);
      await search.fill('PROMIX H');
      await search.press('Tab');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-catalog-card]')].filter((card) => !card.hidden).length === 2);
      await page.evaluate(() => history.replaceState(history.state, '', location.pathname + location.search + '#catalog-results'));
      const originalUrl = new URL(page.url());
      const nextLocale = locale.code === 'en' ? 'uz' : 'en';
      await page.locator('[data-language-trigger]').click();
      await page.locator(`[data-language-option][data-locale="${nextLocale}"]`).click();
      const switched = new URL(page.url());
      assert.equal(switched.pathname, localizedPath(nextLocale, '/products/'));
      assert.equal(switched.search, originalUrl.search);
      assert.equal(switched.hash, '#catalog-results');
      await visit(localizedPath(locale.code, '/products/'));
      await page.locator('.header-consult').click();
      const dialog = page.locator('[data-consultation-modal]');
      await dialog.locator('button[type="submit"]').click();
      for (const [field, source] of [
        ['name', 'Введите имя.'], ['city', 'Введите город.'],
        ['consent', 'Необходимо согласие на обработку персональных данных.'],
      ]) {
        const error = dialog.locator(`[data-field-error="${field}"]`);
        assert.ok(await error.isVisible());
        assert.equal((await error.textContent()).trim(), translated(locale.code, source));
      }
      await page.keyboard.press('Escape');
      assert.ok(!await dialog.isVisible());
      evidence.flows.push({ locale: locale.code, search: hardName, putties: 9, validation: true, queryAndHashPreserved: true });
      if (['en', 'hy', 'ka'].includes(locale.code)) await screenshot(`catalog-${locale.code}-1440`);
      for (const width of [1101, 390, 320]) {
        await page.setViewportSize({ width, height: width > 760 ? 900 : 844 });
        await page.evaluate(() => scrollTo(0, 0));
        const bounds = await page.evaluate(() => {
          const box = (selector) => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          };
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, logo: box('.header-brand'), nav: box('.desktop-nav'), actions: box('.site-header-actions'), trigger: box('[data-language-trigger]') };
        });
        assert.ok(bounds.scrollWidth <= width, `${locale.code}: page overflows at ${width}`);
        assert.ok(bounds.trigger.left >= bounds.logo.right && bounds.trigger.right <= width, `${locale.code}: language placement at ${width}`);
        if (width === 1101) assert.ok(bounds.nav.right <= bounds.actions.left, `${locale.code}: navigation overlaps actions at 1101`);
        await page.locator('[data-language-trigger]').click();
        const panel = await page.locator('.language-switcher-panel').boundingBox();
        assert.ok(panel.x >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= (width > 760 ? 900 : 844), `${locale.code}: language panel fits ${width}`);
        assert.equal(await page.locator('[data-language-option]:visible').count(), 11);
        await page.keyboard.press('Escape');
        if (locale.code === 'hy' && width === 1101) {
          assert.ok(await page.locator('.menu-toggle').isVisible());
          await page.locator('.menu-toggle').click();
          assert.ok(await page.locator('#mobile-menu').isVisible());
          await page.locator('#mobile-menu a[href="/hy/products/"]').click();
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => document.fonts.ready);
          assert.equal(new URL(page.url()).pathname, '/hy/products/');
          assert.ok(!await page.locator('#mobile-menu').isVisible());
          evidence.keyboard.push({ locale: 'hy', width: 1101, tabletMenuNavigation: true });
          await screenshot('catalog-hy-1101-tablet');
        }
        evidence.responsive.push({ locale: locale.code, ...bounds, panel });
        if (width === 390 && ['en', 'hy', 'ka'].includes(locale.code)) await screenshot(`catalog-${locale.code}-390`);
      }
    });
  }
});

test('language selection supports keyboard controls, outside closing and native links without JavaScript', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit('/en/products/?category=putties&q=PROMIX%20H#catalog-results');
  const trigger = page.locator('[data-language-trigger]');
  const control = page.locator('[data-language-switcher]');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await control.getAttribute('open'), '');
  assert.equal(await page.locator(':focus').getAttribute('data-locale'), 'ru');
  await page.keyboard.press('End');
  assert.equal(await page.locator(':focus').getAttribute('data-locale'), 'tk');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator(':focus').getAttribute('data-locale'), 'en');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator(':focus').getAttribute('data-locale'), 'uz');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/uz/products/'),
    page.keyboard.press('Enter'),
  ]);
  assert.equal(new URL(page.url()).pathname, '/uz/products/');
  assert.equal(new URL(page.url()).searchParams.get('q'), 'PROMIX H');
  assert.equal(new URL(page.url()).hash, '#catalog-results');
  await trigger.click();
  await page.locator('main h1').click();
  assert.equal(await control.getAttribute('open'), null);
  await trigger.click();
  await page.keyboard.press('Escape');
  assert.equal(await control.getAttribute('open'), null);
  assert.notEqual(await page.locator(':focus').getAttribute('data-language-trigger'), null);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  const fallback = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await fallback.route('**/*', (route) => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  const nativePage = await fallback.newPage();
  try {
    await nativePage.goto(fixture.origin + '/en/products/', { waitUntil: 'networkidle' });
    await nativePage.locator('[data-language-trigger]').click();
    assert.ok(await nativePage.locator('.language-switcher-panel').isVisible());
    await nativePage.locator('[data-language-option][data-locale="ka"]').click();
    assert.equal(new URL(nativePage.url()).pathname, '/ka/products/');
    assert.equal(await nativePage.locator('html').getAttribute('lang'), 'ka');
  } finally { await fallback.close(); }
  evidence.keyboard.push({ arrows: true, homeEnd: true, enterNavigation: true, escapeReturnsFocus: true, outsideCloses: true, noJavaScriptNavigation: true });
  assert.equal(evidence.apiRequests, 0, 'invalid test forms must not send any request');
  assert.deepEqual(evidence.errors, []);
});
