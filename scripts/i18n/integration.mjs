import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, TARGET_LOCALES, localeFromPath, localizedPath } from './config.mjs';
import { collectSources, loadDictionary, localizeHtml, runtimeSources, projectRoot, basePathFromFile } from './html.mjs';

async function htmlFiles(root, prefix = '') {
  const result = [];
  for (const item of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isDirectory() && !['_astro', 'images', 'fonts', 'icons', 'previews', 'preview'].includes(item.name)) result.push(...await htmlFiles(root, relative));
    else if (item.isFile() && item.name.endsWith('.html')) result.push(relative);
  }
  return result;
}
export default function internationalization() {
  return { name: 'promix-internationalization', hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const output = fileURLToPath(dir);
      const files = await htmlFiles(output);
      const russianFiles = files.filter(relative => localeFromPath('/' + relative) === 'ru');
      const keys = await runtimeSources();
      const sources = new Set([...keys, 'Выбрать язык: {language}', 'Оригинал документа на русском языке']);
      const originals = new Map();
      for (const relative of russianFiles) {
        const html = await fs.readFile(path.join(output, relative), 'utf8');
        originals.set(relative, html);
        for (const key of collectSources(html)) sources.add(key);
      }
      await fs.writeFile(path.join(projectRoot, 'src/i18n/source-strings.json'), JSON.stringify([...sources].sort(), null, 2) + '\n');
      if (process.env.PROMIX_I18N_EXTRACT_ONLY === '1') { logger.info(`Extracted ${sources.size} translation strings; extraction-only build.`); return; }
      const dictionaries = Object.fromEntries(await Promise.all(LOCALES.map(async language => [language.code, await loadDictionary(language.code)])));
      for (const language of TARGET_LOCALES) for (const key of sources) {
        if (!dictionaries[language.code][key]?.trim()) throw new Error(`Incomplete ${language.code} dictionary: ${key}`);
      }
      const routes = new Set(russianFiles.map(basePathFromFile));
      // Render the same approved source for every locale. Static routes are
      // registered in Astro; no online translator is needed by the built site.
      for (const language of LOCALES) for (const [relative, html] of originals) {
        const destination = language.code === 'ru' ? relative : path.posix.join(language.code, relative);
        const target = path.join(output, destination);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, localizeHtml(html, { locale: language.code, basePath: basePathFromFile(relative), dictionary: dictionaries[language.code], routes, runtimeKeys: keys }));
      }
      // Sitemap entries and reciprocal language alternatives use real static
      // pages, including direct product pages; the error page remains noindex.
      const pages = [...routes].filter(route => route !== '/404.html');
      const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' + LOCALES.flatMap(language => pages.map(route => '<url><loc>https://pro-mix.ru' + localizedPath(route, language.code) + '</loc>' + LOCALES.map(alternate => `<xhtml:link rel="alternate" hreflang="${alternate.code}" href="https://pro-mix.ru${localizedPath(route, alternate.code)}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="https://pro-mix.ru${route}"/></url>`)).join('') + '</urlset>';
      await fs.writeFile(path.join(output, 'sitemap-0.xml'), xml);
      logger.info(`Localized ${russianFiles.length} pages into ${LOCALES.length} languages; ${pages.length * LOCALES.length} sitemap URLs; ${sources.size} strings per language.`);
    },
  } };
}
