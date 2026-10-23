const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

// Astro provides sharp in this project, so no additional dependency is needed.
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  sharp = createRequire(require.resolve('astro/package.json'))('sharp');
}

const siteRoot = path.resolve(__dirname, '..');
const outputDir = path.join(siteRoot, 'public/images/products/shadow-masks');
const geometryPath = path.join(siteRoot, 'src/data/product-shadow-geometry.json');
const margin = 1.5;
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const round = (value) => Math.round(value * 1000) / 1000;

function packageFamily(url) {
  const basename = path.basename(url);
  if (/^(glass-fiber-plus-top|nonwoven-plus-top)-/.test(basename)) return 'roll';
  if (/^(deep-primer|universal-primer|primer-concentrate)-/.test(basename)) return 'canister';
  return 'bucket';
}

async function main() {
  const frames = JSON.parse(await fs.readFile(path.join(siteRoot, 'src/data/product-images.json'), 'utf8'));
  await fs.mkdir(outputDir, { recursive: true });
  const geometry = {};
  const checks = [];

  for (const [url, frame] of Object.entries(frames)) {
    const sourcePath = path.join(siteRoot, 'public', url.replace(/^\//, ''));
    const sourceBytes = await fs.readFile(sourcePath);
    const sourceHash = hash(sourceBytes);
    const { data, info } = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== frame.source[0] || info.height !== frame.source[1]) {
      throw new Error(`${url}: source dimensions differ from product framing metadata`);
    }

    const [bx, by, bw, bh] = frame.bounds;
    const firstY = Math.floor(by + bh * 0.5);
    const rows = [];
    let maxOpaqueY = -1;
    let opaquePixels = 0;
    for (let y = 0; y < info.height; y++) {
      let left = info.width;
      let right = -1;
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] >= 128) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          opaquePixels++;
          maxOpaqueY = y;
        }
      }
      if (y >= firstY && right >= left) rows.push({ y, left, right: right + 1 });
    }
    if (!rows.length || maxOpaqueY > by + bh) {
      throw new Error(`${url}: unexpected physical package bounds`);
    }

    // This presentation mask removes the PNG's translucent floor shadow while
    // retaining every opaque package pixel. The PNG itself is never modified.
    // Preserve the entire upper half, then follow the measured lower contour.
    const first = rows[0];
    const commands = [`M ${first.left} ${first.y}`];
    for (const row of rows) commands.push(`L ${row.left} ${row.y}`, `L ${row.left} ${row.y + 1}`);
    const last = rows[rows.length - 1];
    commands.push(`L ${last.right} ${last.y + 1}`);
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      commands.push(`L ${row.right} ${row.y + 1}`, `L ${row.right} ${row.y}`);
    }
    commands.push('Z');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}"><rect width="${info.width}" height="${firstY + margin}" fill="white"/><path d="${commands.join(' ')}" fill="white" stroke="white" stroke-width="${margin * 2}" stroke-linejoin="round"/></svg>\n`;
    const maskPixels = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    let excludedOpaquePixels = 0;
    let removedShadowPixels = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const sourceAlpha = data[i * 4 + 3];
      const maskAlpha = maskPixels[i * 4 + 3];
      if (sourceAlpha >= 128 && maskAlpha !== 255) excludedOpaquePixels++;
      if (sourceAlpha > 0 && sourceAlpha < 128 && maskAlpha === 0) removedShadowPixels++;
    }
    if (excludedOpaquePixels) throw new Error(`${url}: mask clips ${excludedOpaquePixels} physical package pixels`);
    if (hash(await fs.readFile(sourcePath)) !== sourceHash) throw new Error(`${url}: PNG changed during generation`);

    const family = packageFamily(url);
    const standardBucket = family === 'bucket' && info.width === 2048 && info.height === 2048;
    const basename = path.basename(url, path.extname(url)) + '.svg';
    await fs.writeFile(path.join(outputDir, basename), svg, 'utf8');
    geometry[url] = {
      source: frame.source,
      // Standard buckets use the exact body measurement from the approved
      // preview, excluding handles and transparent padding. Other buckets use
      // a conservative body inset; canisters and rolls use their own bounds.
      bodyWidth: standardBucket ? 1567 : round(bw * (family === 'bucket' ? 0.946 : 1)),
      bodyCenter: standardBucket ? 1024.5 : round(bx + bw / 2),
      base: by + bh,
      mask: `/images/products/shadow-masks/${basename}`,
      family,
    };
    checks.push({ url, family, opaquePixels, excludedOpaquePixels, removedShadowPixels, sourceUnchanged: true });
  }

  await fs.writeFile(geometryPath, JSON.stringify(geometry, null, 2) + '\n', 'utf8');
  const families = checks.reduce((counts, item) => {
    counts[item.family] = (counts[item.family] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({
    generated: checks.length,
    families,
    allOpaquePixelsPreserved: checks.every((item) => item.excludedOpaquePixels === 0),
    allSourcesUnchanged: checks.every((item) => item.sourceUnchanged),
    removedTranslucentShadowPixels: checks.reduce((sum, item) => sum + item.removedShadowPixels, 0),
    geometry: path.relative(siteRoot, geometryPath),
    masks: path.relative(siteRoot, outputDir),
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
