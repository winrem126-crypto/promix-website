import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep development reviews available locally, outside the public release. */
export default function productionAssets() {
  return {
    name: 'promix-production-assets',
    hooks: {
      'astro:config:setup': async ({ command, config, injectRoute }) => {
        if (command !== 'dev') return;
        const root = fileURLToPath(config.root);
        const previews = path.join(root, 'src/pages/_previews');
        async function visit(directory) {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(file);
            else if (entry.name.endsWith('.astro')) {
              const route = path.relative(previews, file).replaceAll('\\', '/').replace(/\.astro$/, '').replace(/(^|\/)index$/, '');
              injectRoute({
                pattern: `/previews/${route}`,
                entrypoint: `./${path.relative(root, file).replaceAll('\\', '/')}`,
              });
            }
          }
        }
        await visit(previews);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const output = fileURLToPath(dir);
        // Only known generated development copies. Original public/ assets stay.
        const excluded = ['preview', 'previews', 'site.js', 'catalog.js', 'metrika.js', 'hero-concepts.js'];
        for (const relative of excluded) {
          const target = path.resolve(output, relative);
          if (!target.startsWith(path.resolve(output) + path.sep)) throw new Error('Output path escaped build directory');
          await fs.rm(target, { recursive: relative === 'preview' || relative === 'previews', force: true });
        }
        logger.info('Excluded development previews and replaced script copies; source assets preserved.');
      },
    },
  };
}
