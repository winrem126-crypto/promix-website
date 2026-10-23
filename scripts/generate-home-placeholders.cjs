const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

// Tiny previews are embedded in the HTML: no extra request or loading script.
const sources = [
  '/images/hero-surface-promix-h.webp',
  '/images/production-realistic-1600.webp',
  '/images/laboratory-realistic-1600.webp',
  ...['preparation', 'leveling', 'reinforcement', 'finish', 'painting'].map(
    (stage) => `/images/tasks/finishing/${stage}-v1.webp`,
  ),
];

async function main() {
  const root = path.resolve(__dirname, '..');
  const entries = await Promise.all(sources.map(async (src) => {
    const bytes = await sharp(path.join(root, 'public', src))
      .resize({ width: 24, withoutEnlargement: true })
      .blur(.6)
      .webp({ quality: 30, effort: 6 })
      .toBuffer();
    return [src, `data:image/webp;base64,${bytes.toString('base64')}`];
  }));
  await fs.writeFile(path.join(root, 'src/performance/home-image-placeholders.json'), `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
  console.log(`Generated ${entries.length} inline image previews.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
