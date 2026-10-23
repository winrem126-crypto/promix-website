// Targeted, lossless derivatives of the three measured heavy packshots.
// Originals, framing metadata, labels and shadow assets are never overwritten.
// Usage: node scripts/prepare-catalog-performance.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');
const root = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  const assets = JSON.parse(await fs.readFile(path.join(root, 'src/data/catalog-product-assets.json'), 'utf8'));
  const directory = path.join(root, 'public/images/products/performance-2026-10');
  await fs.mkdir(directory, { recursive: true });
  const variants = {};
  for (const slug of ['promix-h-02', 'promix-j', 'promix-f']) {
    const asset = assets[slug];
    const source = path.join(root, 'assets/product-sources/catalog-2026-10', `${slug}-${asset.sourceHash}.png`);
    const original = await fs.readFile(source);
    if (!digest(original).startsWith(asset.sourceHash)) throw new Error(`${slug}: approved source hash mismatch.`);
    const generated = [];
    for (const width of [480, 800, 1200]) {
      const resized = await sharp(original).resize({ width, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const bytes = await sharp(resized.data, { raw: { width: resized.info.width, height: resized.info.height, channels: 4 } }).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
      const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
      // RGB under alpha=0 is not painted and WebP may canonicalize it. Verify
      // every alpha value and every RGB value that contributes to the image.
      let alphaMismatch = 0, visibleRgbMismatch = 0;
      for (let offset = 0; offset < decoded.length; offset += 4) {
        if (decoded[offset + 3] !== resized.data[offset + 3]) alphaMismatch++;
        if (resized.data[offset + 3] > 0) for (let channel = 0; channel < 3; channel++) {
          if (decoded[offset + channel] !== resized.data[offset + channel]) visibleRgbMismatch++;
        }
      }
      if (alphaMismatch || visibleRgbMismatch) throw new Error(`${slug}/${width}: lossless pixel/alpha verification failed (${alphaMismatch} alpha, ${visibleRgbMismatch} visible RGB).`);
      const name = `${slug}-${digest(bytes).slice(0, 12)}-${width}.webp`;
      const target = path.join(directory, name);
      try { if (!(await fs.readFile(target)).equals(bytes)) throw new Error(`${name}: existing derivative differs.`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await fs.writeFile(target, bytes, { flag: 'wx' }); }
      generated.push({ width, url: `/images/products/performance-2026-10/${name}` });
      console.log(JSON.stringify({ slug, width, bytes: bytes.length, sha256: digest(bytes), visiblePixelsAndAlphaUnchanged: true }));
    }
    const sources = [...asset.sources, ...generated].sort((a, b) => a.width - b.width);
    variants[asset.image] = { src: asset.image, width: 1600, height: 1200, sources };
  }
  await fs.writeFile(path.join(root, 'src/performance/catalog-image-variants.json'), JSON.stringify(variants, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
