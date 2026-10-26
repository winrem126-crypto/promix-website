import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { createStaticSiteFixture, distRoot, listFiles, resolvePublicFile } from './support/static-site-fixture.mjs';

const evidenceRoot = process.env.PROMIX_QA_DIR ?? fileURLToPath(new URL('../../PROMIX_FIX_QA_2026-10-26/', import.meta.url));
const evidence = { routes: [], responsive: [], interactions: [], errors: [], screenshots: [] };
const documentCache = new Map();
let browser;
let fixture;
let context;
let page;
let routes;
let catalogProducts;

function monitor(target) {
  target.on('pageerror', (error) => evidence.errors.push({ url: target.url(), message: error.message }));
  target.on('console', (message) => {
    const intended404 = new URL(target.url()).pathname === '/not-a-page-regression/';
    if (message.type() === 'error' && !(intended404 && message.text().includes('404 (Not Found)'))) evidence.errors.push({ url: target.url(), message: message.text() });
  });
  target.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.request().isNavigationRequest() && new URL(response.url()).pathname === '/not-a-page-regression/' && response.status() === 404) return;
    evidence.errors.push({ url: response.url(), status: response.status() });
  });
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(evidenceRoot, name + '.png') });
  evidence.screenshots.push(name + '.png');
}

async function visit(route) {
  const response = await page.goto(fixture.origin + route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return response;
}

before(async () => {
  await fs.mkdir(evidenceRoot, { recursive: true });
  const files = await listFiles(distRoot);
  routes = files.filter((file) => file.endsWith('.html')).map((file) => {
    const relative = path.relative(distRoot, file).split(path.sep).join('/');
    return relative === 'index.html' ? '/' : '/' + relative.replace(/index\.html$/, '');
  }).sort();
  fixture = await createStaticSiteFixture();
  browser = await chromium.launch({ headless: true, ...(process.env.PROMIX_CHROME_PATH ? { executablePath: process.env.PROMIX_CHROME_PATH } : { channel: 'chrome' }) });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  monitor(page);
  await visit('/products/');
  catalogProducts = await page.locator('[data-catalog-card]').evaluateAll((cards) => cards.map((card) => ({
    href: card.querySelector('a[href^="/products/"]').getAttribute('href'), category: card.dataset.category,
  })));
});

after(async () => {
  await fs.writeFile(path.join(evidenceRoot, 'site-browser-results.json'), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await fixture?.close();
});

test('all production pages retain semantic content, metadata, valid media and product document requests', async (suite) => {
  assert.equal(routes.length, 36);
  assert.equal(catalogProducts.length, 25);
  assert.ok(!catalogProducts.some((product) => product.href.includes('promix-h-03')));
  assert.ok(catalogProducts.some((product) => product.href === '/products/promix-h-02/'));
  for (const route of routes) {
    await suite.test(route, async () => {
      const response = await visit(route);
      assert.equal(response.status(), 200);
      const state = await page.evaluate(() => ({
        title: document.title, lang: document.documentElement.lang,
        headings: [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent.trim() })),
        description: document.querySelector('meta[name="description"]')?.content,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        robots: document.querySelector('meta[name="robots"]')?.content,
        ids: [...document.querySelectorAll('[id]')].map((element) => element.id),
        missingAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
        schemas: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent)),
        text: document.querySelector('main')?.textContent.trim(),
      }));
      assert.equal(state.lang, 'ru');
      assert.equal(state.headings.filter((heading) => heading.level === 1).length, 1);
      assert.ok(state.text.length > 100);
      assert.ok(state.title.length > 5 && state.description.length > 20);
      assert.equal(new URL(state.canonical).hostname, 'pro-mix.ru');
      assert.equal(new Set(state.ids).size, state.ids.length);
      assert.equal(state.missingAlt, 0);
      for (let index = 1; index < state.headings.length; index += 1) assert.ok(state.headings[index].level <= state.headings[index - 1].level + 1, route + ' skips heading level');
      if (route.startsWith('/products/') && route !== '/products/') {
        const schema = state.schemas.find((entry) => entry['@type'] === 'Product');
        assert.equal(schema.name, state.headings.find((heading) => heading.level === 1).text);
        assert.equal(schema.description, state.description);
        assert.ok(state.description.length >= 100 && state.description.length <= 180);
        assert.equal(new URL(state.canonical).pathname, route);
        assert.equal(await page.locator('#documents [data-open-form]').count(), 1);
        await page.locator('.pd-image').scrollIntoViewIfNeeded();
        const photo = page.locator('.pd-image img');
        if (await photo.count()) assert.ok(await photo.evaluate(async (image) => { await image.decode(); return image.naturalWidth > 0; }));
        else assert.equal(route, '/products/promix-h-03/');
      }
      documentCache.set(route, { ids: new Set(state.ids), html: await page.content() });
      evidence.routes.push({ route, status: response.status(), title: state.title, description: state.description, product: route.startsWith('/products/') && route !== '/products/' });
    });
  }
  assert.equal(new Set(evidence.routes.map((entry) => entry.title)).size, evidence.routes.length);
});

test('internal links, responsive media, CSS resources, sitemap and robots resolve without public development files', async () => {
  let hrefs = 0;
  let sources = 0;
  let srcsets = 0;
  for (const [route, document] of documentCache) {
    const references = await page.evaluate(({ html }) => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      return {
        href: [...parsed.querySelectorAll('[href]')].map((element) => element.getAttribute('href')),
        src: [...parsed.querySelectorAll('[src]')].map((element) => element.getAttribute('src')),
        srcset: [...parsed.querySelectorAll('[srcset]')].flatMap((element) => element.getAttribute('srcset').split(',').map((source) => source.trim().split(/\s+/)[0])),
      };
    }, { html: document.html });
    for (const [kind, values] of Object.entries(references)) {
      for (const value of values) {
        if (!value || /^(?:mailto:|tel:|data:|javascript:)/.test(value)) continue;
        const target = new URL(value, fixture.origin + route);
        if (![new URL(fixture.origin).hostname, 'pro-mix.ru'].includes(target.hostname)) continue;
        const file = resolvePublicFile(target.pathname);
        await fs.access(file);
        if (kind === 'href') hrefs += 1;
        if (kind === 'src') sources += 1;
        if (kind === 'srcset') srcsets += 1;
        if (target.hash && file.endsWith('.html')) {
          const key = target.pathname;
          const parsed = documentCache.get(key);
          assert.ok(parsed?.ids.has(decodeURIComponent(target.hash.slice(1))), route + ' -> ' + value);
        }
      }
    }
  }
  const files = await listFiles(distRoot);
  let cssReferences = 0;
  for (const file of files.filter((entry) => entry.endsWith('.css'))) {
    const css = await fs.readFile(file, 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      if (/^(?:data:|https?:)/.test(match[1])) continue;
      await fs.access(match[1].startsWith('/') ? resolvePublicFile(match[1]) : path.resolve(path.dirname(file), decodeURIComponent(match[1])));
      cssReferences += 1;
    }
  }
  const sitemap = await fs.readFile(path.join(distRoot, 'sitemap-0.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
  assert.equal(locations.length, 35);
  assert.ok(locations.every((url) => !/preview|404/.test(url.pathname)));
  for (const url of locations) await fs.access(resolvePublicFile(url.pathname));
  const robots = await fs.readFile(path.join(distRoot, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap:\s*https:\/\/pro-mix\.ru\//);
  assert.ok(!/Disallow:\s*\/\s*(?:\r?\n|$)/.test(robots));
  assert.equal(files.filter((file) => /\.(?:php|md|zip|log|sql|bak)$/i.test(file) || path.basename(file).startsWith('.env')).length, 0);
  evidence.interactions.push({ name: 'static references', hrefs, sources, srcsets, cssReferences, sitemap: locations.length, missing: 0 });
});

test('catalog search, filtering, reset, history and reload keep visible results consistent', async () => {
  await visit('/products/');
  const search = page.locator('[data-catalog-search]');
  await search.fill('грунт');
  await page.waitForTimeout(250);
  assert.ok(await page.locator('[data-catalog-card]:visible').count() > 0);
  await screenshot('after-catalog-search-1440');
  await search.fill('no-such-product-regression');
  await page.waitForTimeout(250);
  assert.ok(await page.locator('[data-catalog-empty]').isVisible());
  await page.locator('[data-search-reset]').click();
  assert.equal(await page.locator('[data-catalog-card]:visible').count(), catalogProducts.length);
  const button = page.locator('[data-filter-group][data-filter-value="putties"]');
  await button.click();
  const expected = catalogProducts.filter((product) => product.category === 'putties').length;
  assert.equal(expected, 8);
  assert.equal(await page.locator('[data-catalog-card]:visible').count(), expected);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-catalog-card]:visible').count(), expected);
  assert.equal(new URL(page.url()).searchParams.get('category'), 'putties');
  await page.locator('[data-filter-group][data-filter-value="primers"]').click();
  await page.goBack({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-catalog-card]:visible').count(), expected);
  evidence.interactions.push({ name: 'catalog', products: catalogProducts.length, putties: expected, restored: true });
});

test('first-layer cookie choices and primary controls remain accessible at every requested width', async (suite) => {
  for (const width of [320, 360, 375, 390, 768, 1024, 1440]) {
    await suite.test(String(width), async () => {
      const session = await browser.newContext({ viewport: { width, height: width >= 1024 ? 1000 : 844 }, reducedMotion: 'reduce' });
      await session.route('**/*', (route) => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
      const previousPage = page;
      page = await session.newPage();
      monitor(page);
      try {
        await visit('/');
        const banner = page.locator('[data-cookie-banner]');
        const box = await banner.boundingBox();
        assert.ok(box.height <= 150, 'cookie banner should be compact');
        for (const selector of ['[data-cookie-accept]', '[data-cookie-reject]', '[data-cookie-settings]']) {
          const control = banner.locator(selector);
          assert.ok(await control.isVisible());
          const bounds = await control.boundingBox();
          assert.ok(bounds.height >= 43 && bounds.width >= 43);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        const contrast = await banner.evaluate((element) => {
          const channels = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
          const luminance = (values) => values.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const background = channels(getComputedStyle(element).backgroundColor);
          return [...element.querySelectorAll('.cookie-choice')].map((button) => {
            const style = getComputedStyle(button);
            const foreground = luminance(channels(style.color));
            const behind = luminance(style.backgroundColor === 'rgba(0, 0, 0, 0)' ? background : channels(style.backgroundColor));
            return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05);
          });
        });
        assert.ok(contrast.every((ratio) => ratio >= 4.5), 'cookie button text contrast');
        await screenshot('after-cookie-' + width);
        if (width === 1440) {
          const reject = banner.locator('[data-cookie-reject]');
          const original = await reject.evaluate((element) => getComputedStyle(element).backgroundColor);
          await reject.hover();
          await page.waitForTimeout(220);
          assert.notEqual(await reject.evaluate((element) => getComputedStyle(element).backgroundColor), original);
          await reject.focus();
          assert.ok(await reject.evaluate((element) => getComputedStyle(element).outlineStyle !== 'none'));
          await page.mouse.move(0, 0);
        }
        await visit('/products/promix-h-02/');
        const primary = page.locator('.pd-actions [data-open-form]');
        await primary.focus();
        await page.waitForTimeout(50);
        const primaryBounds = await primary.boundingBox();
        const bannerBounds = await banner.boundingBox();
        assert.ok(primaryBounds.y + primaryBounds.height <= bannerBounds.y - 10, 'focused primary action must clear the cookie banner');
        if (width === 390) await screenshot('after-cookie-focus-390');
        await banner.locator('[data-cookie-reject]').click();
        await page.waitForTimeout(100);
        assert.ok(!await banner.isVisible());
        for (const route of ['/', '/products/', '/products/promix-h-02/', '/documents/']) {
          await visit(route);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' overflows at ' + width);
        }
        if (await page.locator('.menu-toggle').isVisible()) {
          await visit('/');
          await page.locator('.menu-toggle').click();
          assert.ok(await page.locator('#mobile-menu').isVisible());
          await page.locator('#mobile-menu a[href="/products/"]').click();
          assert.equal(new URL(page.url()).pathname, '/products/');
        }
        await visit('/products/');
        assert.equal(new URL(page.url()).pathname, '/products/');
        await screenshot('after-catalog-' + width);
        evidence.responsive.push({ width, bannerHeight: box.height, overflow: false, choices: 3, minimumButtonContrast: Math.min(...contrast) });
      } finally { await session.close(); page = previousPage; }
    });
  }
});

test('skip navigation focuses main and consultation traps focus without obscured controls', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ['/', '/products/', '/products/promix-h-02/', '/documents/', '/privacy/', '/personal-data/', '/cookies/', '/404.html']) {
    await visit(route);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('href'), '#main-content');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'main-content');
  }
  await visit('/products/promix-h-02/');
  await page.locator('.pd-actions [data-open-form]').click();
  assert.ok(await page.locator('[data-consultation-modal]').evaluate((dialog) => dialog.open));
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest('[data-consultation-modal]'))));
  }
  await page.keyboard.press('Escape');
  assert.ok(!await page.locator('[data-consultation-modal]').evaluate((dialog) => dialog.open));
});

test('all five finishing stages and production skip retain their real scenes', async () => {
  await visit('/');
  await page.locator('#selection-title').scrollIntoViewIfNeeded();
  for (let index = 0; index < 5; index += 1) {
    await page.locator('[data-stage-nav]').nth(index).click();
    const panel = page.locator('[data-finishing-panel][data-active="true"]');
    await panel.locator('img').evaluate(async (image) => image.decode());
    assert.equal(await panel.getAttribute('aria-hidden'), 'false');
    assert.ok(await panel.locator('img').evaluate((image) => image.naturalWidth > 0));
  }
  await screenshot('after-finishing-1440');
  await page.locator('[data-stage-jump][href="#production"]:visible').click();
  assert.equal(new URL(page.url()).hash, '#production');
});

test('existing PDF downloads exactly the approved file bytes and 404 remains a real 404', async () => {
  await visit('/documents/');
  const link = page.locator('a[download][href$=".pdf"]').first();
  const relative = await link.getAttribute('href');
  const downloading = page.waitForEvent('download');
  await link.click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const received = Buffer.concat(chunks);
  assert.equal(received.subarray(0, 5).toString(), '%PDF-');
  const expected = await fs.readFile(resolvePublicFile(relative));
  assert.equal(createHash('sha256').update(received).digest('hex'), createHash('sha256').update(expected).digest('hex'));
  await screenshot('after-documents-1440');
  const response = await visit('/not-a-page-regression/');
  assert.equal(response.status(), 404);
  assert.match(await page.locator('h1').textContent(), /Страница не найдена/);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  await screenshot('after-404-1440');
  assert.deepEqual(evidence.errors, []);
});
