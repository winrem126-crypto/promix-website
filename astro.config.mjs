import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import productionAssets from './scripts/production-assets.mjs';
import internationalization from './scripts/i18n/integration.mjs';

export default defineConfig({
  site: 'https://pro-mix.ru',
  compressHTML: true,
  integrations: [
    productionAssets(),
    sitemap({ filter: (page) => !/^\/(?:previews?(?:\/|$)|404\/?$)/.test(new URL(page).pathname) }),
    internationalization(),
  ],
  server: {
    host: '127.0.0.1',
    port: 4173
  },
  vite: {
    server: {
      allowedHosts: ['localhost'],
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: false
        }
      }
    },
    preview: {
      host: '127.0.0.1',
      allowedHosts: ['localhost'],
    },
  }
});
