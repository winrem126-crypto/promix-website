import { defineMiddleware } from 'astro:middleware';
import { localeFromPath, russianPath } from './i18n/config.mjs';
import { loadDictionary, localizeHtml, runtimeSources } from '../scripts/i18n/html.mjs';

// Production serves the already translated static files. Development uses the
// same dictionaries and HTML projection for the registered localized routes.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (!import.meta.env.DEV || !response.headers.get('content-type')?.includes('text/html')) return response;
  const locale = localeFromPath(context.url.pathname);
  const basePath = russianPath(context.url.pathname);
  if (/^\/(?:previews?|_)/.test(basePath)) return response;
  const dictionary = await loadDictionary(locale);
  const routes = new Set(['/', '/products/', '/documents/', '/privacy/', '/cookies/', '/personal-data/', '/404.html']);
  // Product links share this fixed prefix and slug inventory in development.
  const html = await response.text();
  for (const match of html.matchAll(/(?:href|data-product-href)="(\/products\/[^"?#]+\/)/g)) routes.add(match[1]);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(localizeHtml(html, { locale, basePath, dictionary, routes, runtimeKeys: await runtimeSources() }), { status: response.status, headers });
});
