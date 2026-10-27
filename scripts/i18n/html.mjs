import { parse, parseFragment, serialize } from 'parse5';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, localeFromPath, localizedPath, russianPath } from './config.mjs';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourcePattern = /[А-Яа-яЁё]/u;
const textAttributes = new Set(['alt', 'title', 'placeholder', 'aria-label', 'aria-description', 'aria-valuetext', 'data-form-title', 'data-form-message', 'data-product-name', 'data-search-name', 'data-search-category', 'data-search-purpose', 'data-search-keywords', 'data-search-series', 'data-search-short']);
export const normalizeSource = value => value.replace(/\s+/gu, ' ').trim();
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasAttr = (node, name) => Boolean(node.attrs?.some(item => item.name === name));
const setAttr = (node, name, value) => {
  const found = node.attrs?.find(item => item.name === name);
  if (found) found.value = value;
  else (node.attrs ??= []).push({ name, value });
};
const removeAttr = (node, name) => { node.attrs = node.attrs?.filter(item => item.name !== name); };
function walk(node, callback, skipped = false) {
  const skip = skipped || hasAttr(node, 'data-i18n-skip');
  callback(node, skip);
  if (!['script', 'style', 'noscript'].includes(node.tagName) && !hasAttr(node, 'data-i18n-lines')) for (const child of node.childNodes ?? []) walk(child, callback, skip);
}
function mapJson(value, mapText, mapUrl) {
  if (Array.isArray(value)) return value.map(item => mapJson(item, mapText, mapUrl));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['url', '@id'].includes(key) && typeof item === 'string' ? mapUrl(item) : mapJson(item, mapText, mapUrl)]));
  return typeof value === 'string' && sourcePattern.test(value) ? mapText(value) : value;
}
export function collectSources(html) {
  const sources = new Set();
  const add = value => { if (sourcePattern.test(value)) sources.add(normalizeSource(value)); return value; };
  walk(parse(html), (node, skipped) => {
    if (skipped) return;
    if (hasAttr(node, 'data-i18n-lines')) add(attr(node, 'data-i18n-lines'));
    if (node.nodeName === '#text') add(node.value);
    for (const item of node.attrs ?? []) if (textAttributes.has(item.name) || (node.tagName === 'meta' && item.name === 'content')) add(item.value);
    if (node.tagName === 'script' && attr(node, 'type') === 'application/ld+json') mapJson(JSON.parse(node.childNodes?.[0]?.value || '{}'), add, value => value);
  });
  return sources;
}
export async function loadDictionary(locale) {
  if (locale === 'ru') return {};
  const generated = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/i18n/translations', `${locale}.json`), 'utf8'));
  let reviewed = {};
  try { reviewed = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/i18n/overrides.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { ...generated, ...reviewed[locale] };
}
export async function runtimeSources() {
  return JSON.parse(await fs.readFile(path.join(projectRoot, 'src/i18n/runtime-sources.json'), 'utf8'));
}
export function localizeHtml(html, { locale, basePath, dictionary, routes, runtimeKeys = [], origin = 'https://pro-mix.ru' }) {
  const tree = parse(html);
  const language = LOCALES.find(item => item.code === locale);
  if (!language) throw new Error(`Unsupported locale: ${locale}`);
  const translate = value => {
    const key = normalizeSource(value);
    if (locale === 'ru' || !sourcePattern.test(key)) return value;
    const translated = dictionary[key];
    if (typeof translated !== 'string' || !translated.trim()) throw new Error(`Missing ${locale} translation: ${key}`);
    return (value.match(/^\s*/u)?.[0] ?? '') + translated + (value.match(/\s*$/u)?.[0] ?? '');
  };
  const rewriteUrl = value => {
    if (!value || value.startsWith('#') || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) return value;
    const url = new URL(value, origin + basePath);
    if (url.origin !== origin || !routes.has(russianPath(url.pathname))) return value;
    url.pathname = localizedPath(url.pathname, locale);
    return /^https?:/i.test(value) ? url.href : url.pathname + url.search + url.hash;
  };
  let head;
  walk(tree, (node, skipped) => {
    if (node.tagName === 'html') setAttr(node, 'lang', locale);
    if (node.tagName === 'head') head = node;
    if (!skipped && node.nodeName === '#text') node.value = translate(node.value);
    if (!skipped && locale !== 'ru' && hasAttr(node, 'data-i18n-lines')) {
      const lines = translate(attr(node, 'data-i18n-lines')).split('\n').filter(Boolean);
      const period = node.childNodes?.find(child => (attr(child, 'class') ?? '').includes('home-hero__period'));
      node.childNodes = [];
      lines.forEach((line, index) => {
        node.childNodes.push({ nodeName: '#text', value: line, parentNode: node });
        if (index < lines.length - 1) node.childNodes.push({ nodeName: 'br', tagName: 'br', namespaceURI: 'http://www.w3.org/1999/xhtml', attrs: [], childNodes: [], parentNode: node });
      });
      if (period) { period.parentNode = node; node.childNodes.push(period); }
    }
    for (const item of node.attrs ?? []) {
      if (!skipped && (textAttributes.has(item.name) || (node.tagName === 'meta' && item.name === 'content'))) {
        const original = item.value;
        item.value = translate(original);
        // Product identifiers stay shared; both the visitor's language and the
        // original terminology remain searchable without shipping two catalogs.
        if (locale !== 'ru' && item.name.startsWith('data-search-') && original !== item.value) item.value += ` ${original}`;
      }
      if ((item.name === 'href' && !hasAttr(node, 'data-language-option') && attr(node, 'rel') !== 'alternate') || item.name === 'data-product-href') item.value = rewriteUrl(item.value);
    }
    if (node.tagName === 'script' && attr(node, 'type') === 'application/ld+json') {
      const json = JSON.parse(node.childNodes?.[0]?.value || '{}');
      node.childNodes[0].value = JSON.stringify(mapJson(json, translate, rewriteUrl)).replace(/</g, '\\u003c');
    }
    if (node.tagName === 'link' && attr(node, 'rel') === 'canonical') setAttr(node, 'href', origin + localizedPath(basePath, locale));
    if (node.tagName === 'meta' && attr(node, 'property') === 'og:url') setAttr(node, 'content', origin + localizedPath(basePath, locale));
    if (node.tagName === 'meta' && attr(node, 'property') === 'og:locale') setAttr(node, 'content', language.ogLocale);
    if (hasAttr(node, 'data-language-current')) node.childNodes = [{ nodeName: '#text', value: locale.toUpperCase(), parentNode: node }];
    if (hasAttr(node, 'data-language-trigger')) {
      const key = 'Выбрать язык: {language}';
      setAttr(node, 'aria-label', (locale === 'ru' ? key : dictionary[key]).replace('{language}', language.native));
    }
    if (hasAttr(node, 'data-language-option')) {
      const optionLocale = attr(node, 'data-locale');
      if (!LOCALES.some(item => item.code === optionLocale)) throw new Error(`Unsupported language link: ${optionLocale}`);
      setAttr(node, 'href', localizedPath(basePath, optionLocale));
      const selected = optionLocale === locale;
      if (selected) setAttr(node, 'aria-current', 'true'); else removeAttr(node, 'aria-current');
      const check = node.childNodes?.find(child => hasAttr(child, 'data-language-check'));
      if (check) { if (selected) removeAttr(check, 'hidden'); else setAttr(check, 'hidden', ''); }
    }
    if (node.tagName === 'a' && attr(node, 'href')?.endsWith('.pdf')) setAttr(node, 'hreflang', 'ru');
    const productNavigation = (node.parentNode?.tagName === 'nav' && (attr(node.parentNode, 'class') ?? '').includes('desktop-nav')) || attr(node.parentNode ?? {}, 'id') === 'mobile-menu';
    if (node.tagName === 'a' && productNavigation && basePath.startsWith('/products') && russianPath(new URL(attr(node, 'href'), origin).pathname) === '/products/') setAttr(node, 'aria-current', 'page');
  });
  if (locale !== 'ru') walk(tree, node => {
    if ((attr(node, 'class') ?? '').split(/\s+/).includes('document-format')) {
      node.childNodes.push({ nodeName: '#text', value: ' · ' + translate('Оригинал документа на русском языке'), parentNode: node });
    }
  });
  const fragments = LOCALES.map(item => `<link rel="alternate" hreflang="${item.code}" href="${origin}${localizedPath(basePath, item.code)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${origin}${basePath}">`;
  const messages = locale === 'ru' ? {} : Object.fromEntries(runtimeKeys.map(key => {
    if (!dictionary[key]) throw new Error(`Missing ${locale} runtime translation: ${key}`);
    return [key, dictionary[key]];
  }));
  const runtime = `<script id="site-i18n-json" type="application/json">${JSON.stringify({ locale, messages }).replace(/</g, '\\u003c')}</script>`;
  for (const child of parseFragment(fragments + runtime).childNodes) { child.parentNode = head; head.childNodes.push(child); }
  return serialize(tree);
}
export const basePathFromFile = relative => relative === 'index.html' ? '/' : relative === '404.html' ? '/404.html' : '/' + relative.replace(/index\.html$/, '');
export const localeForFile = relative => localeFromPath('/' + relative);
