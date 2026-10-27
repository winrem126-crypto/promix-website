import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'parse5';
import { collectSources, localizeHtml } from '../scripts/i18n/html.mjs';

const routes = new Set(['/', '/products/', '/products/promix-h-02-hard/']);
const dictionary = {
  'Материалы': 'Materials', 'Белый': 'White', 'Поиск': 'Search',
  'Открыть каталог': 'Open catalog', 'Выбрать язык: {language}': 'Choose language: {language}',
};
const options = { locale: 'en', basePath: '/products/', dictionary, routes };
const source = '<!doctype html><html lang="ru"><head><title>Материалы</title><link rel="canonical" href="https://pro-mix.ru/products/"><meta property="og:locale" content="ru_RU"></head><body><a href="/products/?category=putties#catalog-results">Открыть каталог</a><a href="/images/file.pdf">PDF</a><form action="/api/lead.php"><input placeholder="Поиск" name="name"></form><article data-category="putties" data-search-purpose="Белый"><p>Белый</p></article><script>const text="Материалы";</script></body></html>';
const project = (html = source, extra = {}) => localizeHtml(html, { ...options, ...extra });
const nodes = (tree, predicate) => [ ...(predicate(tree) ? [tree] : []), ...(tree.childNodes ?? []).flatMap(child => nodes(child, predicate)) ];
const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;

test('localization changes user copy and page links, retaining asset and API contracts', () => {
  const result = project();
  assert.match(result, /<html lang="en">/);
  assert.match(result, /<title>Materials<\/title>/);
  assert.match(result, /href="\/en\/products\/\?category=putties#catalog-results"/);
  assert.match(result, /href="\/images\/file.pdf"/);
  assert.match(result, /action="\/api\/lead.php"/);
  assert.match(result, /data-category="putties"/);
  assert.match(result, /data-search-purpose="White Белый"/);
  assert.match(result, /const text="Материалы"/);
  assert.match(result, /hreflang="x-default" href="https:\/\/pro-mix.ru\/products\/"/);
});

test('native language names and direct language links remain untouched', () => {
  const result = project(source.replace('</body>', '<span data-language-current data-i18n-skip>RU</span><a data-language-option data-locale="hy" href="/hy/products/"><span data-i18n-skip>Հայերեն</span><span data-language-check hidden>✓</span></a></body>'));
  assert.match(result, /href="\/hy\/products\/"/);
  assert.doesNotMatch(result, /\/en\/hy\//);
  assert.match(result, />Հայերեն<\/span>/);
  assert.match(result, /data-language-current[^>]*>EN<\/span>/);
});

test('error-page language links use actual .html destinations despite Astro rendering /404/', () => {
  const html = source.replace('</body>', '<a data-language-option data-locale="hy" href="/hy/404/"><span data-i18n-skip>Հայերեն</span></a></body>');
  const result = project(html, { basePath: '/404.html' });
  assert.match(result, /href="\/hy\/404\.html"/);
  assert.doesNotMatch(result, /href="\/hy\/404\/"/);
  assert.match(result, /rel="canonical" href="https:\/\/pro-mix.ru\/en\/404\.html"/);
});

test('localized development pages mark the product navigation current on desktop and mobile', () => {
  const html = source.replace('</body>', '<nav class="desktop-nav"><a href="/products/">Открыть каталог</a></nav><div id="mobile-menu"><a href="/products/">Открыть каталог</a></div></body>');
  const tree = parse(project(html));
  const current = nodes(tree, (node) => node.tagName === 'a' && attr(node, 'aria-current') === 'page');
  assert.equal(current.length, 2);
  assert.ok(current.every((node) => attr(node, 'href') === '/en/products/'));
});

test('a multiline hero translates one complete phrase while retaining the original Russian markup', () => {
  const heading = '<h1 data-i18n-lines="Основа безупречной отделки">Основа<br>безупречной<br>отделки<span class="home-hero__period">.</span></h1>';
  const html = source.replace('</body>', heading + '</body>');
  const result = project(html, { dictionary: { ...dictionary, 'Основа безупречной отделки': 'The basis\nof flawless\nfinishing' } });
  assert.match(result, /<h1 data-i18n-lines="Основа безупречной отделки">The basis<br>of flawless<br>finishing<span class="home-hero__period">\.<\/span><\/h1>/);
  assert.match(project(html, { locale: 'ru', dictionary: {} }), /<h1 data-i18n-lines="Основа безупречной отделки">Основа<br>безупречной<br>отделки<span class="home-hero__period">\.<\/span><\/h1>/);
  const keys = collectSources(heading);
  assert.deepEqual([...keys], ['Основа безупречной отделки']);
});

test('translation text and runtime JSON cannot introduce executable markup', () => {
  const dangerous = '</script><img src=x onerror=alert(1)>';
  const result = project(source, { dictionary: { ...dictionary, Белый: dangerous }, runtimeKeys: ['Белый'] });
  const tree = parse(result);
  assert.equal(nodes(tree, node => node.tagName === 'img').length, 0);
  const runtime = nodes(tree, node => attr(node, 'id') === 'site-i18n-json')[0];
  assert.equal(JSON.parse(runtime.childNodes[0].value).messages.Белый, dangerous);
  assert.match(result, /&lt;\/script&gt;&lt;img/);
});

test('incomplete dictionaries fail instead of silently shipping Russian fallback', () => {
  assert.throws(() => project(source, { dictionary: {} }), /Missing en translation/);
});

test('source extraction excludes technical scripts and explicitly protected labels', () => {
  const keys = collectSources('<html><head><title>Материалы</title></head><body><span data-i18n-skip>Русский</span><script>"Технический текст"</script><script type="application/ld+json">{"@type":"Product","name":"Белый"}</script></body></html>');
  assert.deepEqual([...keys].sort(), ['Белый', 'Материалы']);
});
