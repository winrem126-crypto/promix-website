// Import the owner's current public-product packshots without retouching them.
// Usage: node scripts/prepare-catalog-assets.cjs <source-directory>
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');
const { adaptReferenceShadow } = require('./adapt-reference-shadow.cjs');
const { createCanisterGroundShadow } = require('./canister-ground-shadow.cjs');
const { createRollGroundShadow } = require('./roll-ground-shadow.cjs');
const { createOvalGroundShadow } = require('./oval-ground-shadow.cjs');

const siteRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(siteRoot, 'public/images/products/catalog-2026-10');
const originalDirectory = path.join(siteRoot, 'assets/product-sources/catalog-2026-10');
const metadataFile = path.join(siteRoot, 'src/data/catalog-product-assets.json');
const publicPrefix = '/images/products/catalog-2026-10';
const referenceFrame = { source: [963, 769], bounds: [72, 31, 778, 680] };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Import only supplied images matching confirmed public product identities.
// PROMIX_H.png depicts H 0,2: do not map it to H 0,3. Its public placeholder
// stays until an approved H 0,3 source is supplied. LATEX and Super Tack ceiling
// have no public product to replace.
const imports = [
  ['deep-primer', '01_Grunt_glubokogo_proniknoveniya_studio_transparent_4344x3258.png', 'canister'],
  ['mix-mosaic', '03_MIX_kraska_transparent_4344x3258.png', 'bucket'],
  ['glass-fiber-plus-top', '03_Steklokholst_Premium_studio_transparent_4344x3258.png', 'roll'],
  ['nonwoven-plus-top', '04_Flizelin_Plus_Top_studio_transparent_4344x3258.png', 'roll'],
  ['primer-concentrate', '05_Grunt_kontsentrat_studio_transparent_4344x3258.png', 'canister'],
  ['universal-primer', '06_Grunt_universalnyy_studio_transparent_4344x3258.png', 'canister'],
  ['promix-3in1', 'PROMIX_3_V_1.png', 'bucket'],
  ['betokontakt', 'PROMIX_Betokontakt_studio_v7_4344x3258.png', 'bucket'],
  ['promix-f', 'PROMIX_F.png', 'bucket'],
  ['promix-fasad', 'PROMIX_FASAD.png', 'bucket'],
  ['hydro', 'PROMIX_GIDROIZOLYATSIYA.png', 'bucket'],
  ['primer-paint', 'PROMIX_GRUNT_KRASKA.png', 'bucket'],
  ['promix-h-02', 'PROMIX_H_BLUE.png', 'bucket'],
  ['promix-j', 'PROMIX_J_SHOVNAYA.png', 'bucket'],
  ['tape-adhesive', 'PROMIX_KLEY_DLYA_LENT.png', 'bucket'],
  ['mittel-grund', 'PROMIX_MITTEL_GRUNT.png', 'bucket'],
  ['pro-spray-finish', 'PROMIX_PRO_SPRAY.png', 'bucket'],
  ['plus-top', 'PROMIX_Plus_Top_oval.png', 'oval'],
  ['sous-couche', 'PROMIX_SU_KUSH.png', 'bucket'],
  ['super-tack-3', 'PROMIX_Super_Tack_3.png', 'bucket'],
  ['super-tack-7', 'PROMIX_Super_Tack_7.png', 'bucket'],
  ['super-tack-facade', 'PROMIX_Super_Tack_Fasad.png', 'bucket'],
  ['super-tack-facade-silicon', 'PROMIX_Super_Tack_Fasad_Silikon.png', 'bucket'],
  ['textured-anti-vandal', 'PROMIX_TEXTURE.png', 'bucket'],
  ['promix-w', 'PROMIX_W.png', 'bucket'],
];

function publicFile(url) {
  return path.join(siteRoot, 'public', url.replace(/^\//, ''));
}

function physicalBounds(data, info) {
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('No physical package silhouette at alpha >= 128.');
  return [left, top, right - left + 1, bottom - top + 1];
}

async function main() {
  const [sourceArgument, ...extraArguments] = process.argv.slice(2);
  if (!sourceArgument || extraArguments.length) {
    throw new Error('Usage: node scripts/prepare-catalog-assets.cjs <source-directory>');
  }
  const sourceDirectory = path.resolve(sourceArgument);
  if (!(await fs.stat(sourceDirectory)).isDirectory()) throw new Error('The source path must be a directory.');
  console.warn('Skipping H 0,3: approved photograph of that SKU is required; PROMIX_H.png must not be substituted.');
  // Check the entire input set before creating any output.
  await Promise.all(imports.map(async ([slug, filename]) => {
    if (!(await fs.stat(path.join(sourceDirectory, filename))).isFile()) throw new Error(`${slug}: missing source ${filename}`);
  }));

  const trial = JSON.parse(await fs.readFile(path.join(siteRoot, 'src/data/product-image-trial.json'), 'utf8'));
  const reference = {
    productAlpha: await fs.readFile(publicFile(trial.image)),
    contactSvg: await fs.readFile(publicFile(trial.geometry.contactMask)),
    ambientSvg: await fs.readFile(publicFile(trial.geometry.ambientMask)),
    groundSvg: await fs.readFile(publicFile(trial.geometry.groundMask)),
    geometry: trial.geometry,
  };
  await Promise.all([
    fs.mkdir(outputDirectory, { recursive: true }),
    fs.mkdir(originalDirectory, { recursive: true }),
  ]);

  const imported = new Array(imports.length);
  let next = 0;
  async function worker() {
    while (next < imports.length) {
      const index = next++;
      const [slug, originalFilename, family] = imports[index];
      const original = await fs.readFile(path.join(sourceDirectory, originalFilename));
      const sourceSha256 = digest(original);
      const sourceHash = sourceSha256.slice(0, 12);
      const stem = `${slug}-${sourceHash}`;
      const retainedOriginal = path.join(originalDirectory, `${stem}.png`);
      await fs.writeFile(retainedOriginal, original);
      if (digest(await fs.readFile(retainedOriginal)) !== sourceSha256) throw new Error(`${slug}: original copy hash mismatch.`);

      // One proportional resize from the original for every resolution. Lossless
      // WebP preserves lettering and alpha without painting or relighting RGB.
      const sources = [];
      let derivative;
      for (const width of [640, 960, 1600]) {
        const name = `${stem}-${width}.webp`;
        const bytes = await sharp(original).resize({ width, withoutEnlargement: true }).webp({ lossless: true, effort: 6 }).toBuffer();
        const dimensions = await sharp(bytes).metadata();
        if (dimensions.width !== width || dimensions.height !== width * .75) throw new Error(`${slug}: expected proportional 4:3 derivative at ${width}px.`);
        await fs.writeFile(path.join(outputDirectory, name), bytes);
        sources.push({ width, url: `${publicPrefix}/${name}` });
        if (width === 1600) derivative = bytes;
      }
      const { data, info } = await sharp(derivative).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const bounds = physicalBounds(data, info);
      const frame = {
        source: [info.width, info.height], bounds, opticalScale: 1,
        normalizeDetail: true, builtInShadow: false, reference: referenceFrame,
      };
      const adapted = family === 'canister'
        ? await createCanisterGroundShadow({ productAlpha: derivative })
        : family === 'roll'
          ? await createRollGroundShadow({ productAlpha: derivative })
          : family === 'oval'
            ? await createOvalGroundShadow({ productAlpha: derivative })
            : await adaptReferenceShadow({ productAlpha: derivative, family, reference });
      const maskUrls = {};
      for (const [kind, svg] of [['contact', adapted.contactSvg], ['ambient', adapted.ambientSvg], ['ground', adapted.groundSvg]]) {
        const bytes = Buffer.from(svg);
        const name = `${stem}-${kind}-${digest(bytes).slice(0, 12)}.svg`;
        await fs.writeFile(path.join(outputDirectory, name), bytes);
        maskUrls[`${kind}Mask`] = `${publicPrefix}/${name}`;
      }
      const metadata = {
        image: sources.at(-1).url, sources, frame,
        ...(family === 'oval' ? { catalogScale: 1.06 } : {}),
        geometry: { ...adapted.geometry, ...maskUrls, family, profile: 'reference-mineral' },
        sourceHash, originalFilename,
      };
      imported[index] = { slug, metadata, check: {
        slug, family, originalFilename, sourceSha256,
        originalRetainedByteForByte: true, originalBytes: original.length,
        derivativeSha256: digest(derivative), frame, geometry: adapted.geometry,
        shadowMetrics: adapted.metrics,
      } };
      console.log(`Prepared ${slug} (${family}; approved shadow ${adapted.metrics.identity ? 'identity' : 'adapted'}).`);
    }
  }
  await Promise.all([worker(), worker()]);
  const metadata = Object.fromEntries(imported.map(item => [item.slug, item.metadata]));
  await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify({
    imported: imported.length,
    families: imported.reduce((counts, item) => { const family = item.metadata.geometry.family; counts[family] = (counts[family] ?? 0) + 1; return counts; }, {}),
    originalsPreserved: imported.every(item => item.check.originalRetainedByteForByte),
    metadata: path.relative(siteRoot, metadataFile),
    checks: imported.map(item => item.check),
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
