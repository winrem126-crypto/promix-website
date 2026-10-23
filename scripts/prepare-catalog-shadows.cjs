// Rebuild only native-family shadow masks from the catalog's retained WebP.
// Usage: node scripts/prepare-catalog-shadows.cjs
// This command never imports originals, rewrites images, or changes framing.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { createCanisterGroundShadow } = require('./canister-ground-shadow.cjs');
const { createRollGroundShadow } = require('./roll-ground-shadow.cjs');
const { createOvalGroundShadow } = require('./oval-ground-shadow.cjs');

const siteRoot = path.resolve(__dirname, '..');
const publicDirectory = path.join(siteRoot, 'public');
const productDirectory = path.join(publicDirectory, 'images', 'products');
const metadataFile = path.join(siteRoot, 'src', 'data', 'catalog-product-assets.json');
const nativeProducts = new Map([
  ['deep-primer', 'canister'],
  ['primer-concentrate', 'canister'],
  ['universal-primer', 'canister'],
  ['glass-fiber-plus-top', 'roll'],
  ['nonwoven-plus-top', 'roll'],
  ['plus-top', 'oval'],
]);
const helpers = { canister: createCanisterGroundShadow, roll: createRollGroundShadow, oval: createOvalGroundShadow };
const maskKinds = ['contact', 'ambient', 'ground'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function assertWithin(directory, filename) {
  const relative = path.relative(directory, filename);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the required directory: ${filename}`);
  }
}

async function validatedProductFile(url, roots) {
  if (typeof url !== 'string' || !/^\/images\/products\/[a-zA-Z0-9/_-]+\.webp$/.test(url)) {
    throw new Error(`Expected a retained product WebP URL, received ${url}`);
  }
  const filename = path.resolve(publicDirectory, url.slice(1));
  assertWithin(productDirectory, filename);
  const realFilename = await fs.realpath(filename);
  assertWithin(roots.products, realFilename);
  assertWithin(roots.public, realFilename);
  if (!(await fs.stat(realFilename)).isFile()) throw new Error(`Not a product image file: ${filename}`);
  return filename;
}

function assertGeometry(slug, before, after) {
  for (const field of ['source', 'bodyWidth', 'bodyCenter', 'base', 'family']) {
    if (!isDeepStrictEqual(before[field], after[field])) throw new Error(`${slug}: helper changed geometry.${field}.`);
  }
}

function replaceUniqueJsonString(text, previous, next) {
  const oldString = JSON.stringify(previous);
  if (typeof previous !== 'string' || text.split(oldString).length !== 2) {
    throw new Error(`Expected exactly one metadata occurrence of mask URL: ${previous}`);
  }
  return text.replace(oldString, JSON.stringify(next));
}

/** Read-only preparation. The returned plan contains no image writes. */
async function createShadowUpdatePlan() {
  const [metadataBefore, realPublic, realProducts] = await Promise.all([
    fs.readFile(metadataFile, 'utf8'), fs.realpath(publicDirectory), fs.realpath(productDirectory),
  ]);
  assertWithin(realPublic, realProducts);
  const assets = JSON.parse(metadataBefore);
  const expected = JSON.parse(metadataBefore);
  const roundSlugs = Object.keys(assets).filter(slug => !nativeProducts.has(slug));
  if (roundSlugs.length !== 20 || roundSlugs.some(slug => assets[slug].geometry?.family !== 'bucket')) {
    throw new Error('Expected the existing 20 round-bucket entries to remain untouched.');
  }
  const actualNative = Object.entries(assets).filter(([, entry]) => ['canister', 'roll', 'oval'].includes(entry.geometry?.family));
  if (actualNative.length !== nativeProducts.size) throw new Error('Expected exactly six existing native-family products.');

  let metadataAfter = metadataBefore;
  const writes = [], updates = [], imageChecks = [];
  for (const [slug, family] of nativeProducts) {
    const asset = assets[slug];
    if (!asset || asset.geometry?.family !== family) throw new Error(`${slug}: missing existing ${family} metadata.`);
    if (!isDeepStrictEqual(asset.geometry.source, [1600, 1200])) throw new Error(`${slug}: source geometry must remain 1600 x 1200.`);
    const filename = await validatedProductFile(asset.image, { public: realPublic, products: realProducts });
    const stem = path.basename(filename).replace(/-1600\.webp$/, '');
    if (stem === path.basename(filename) || !stem.startsWith(`${slug}-`)) throw new Error(`${slug}: expected its existing -1600.webp derivative.`);
    const imageBytes = await fs.readFile(filename);
    imageChecks.push({ filename, sha256: digest(imageBytes) });
    const generated = await helpers[family]({ productAlpha: imageBytes, geometry: asset.geometry });
    assertGeometry(slug, asset.geometry, generated.geometry);
    const maskUrls = {};
    for (const kind of maskKinds) {
      const svg = generated[`${kind}Svg`];
      if (typeof svg !== 'string' || !/^<svg\b[^>]*\bwidth="1600"[^>]*\bheight="1200"/.test(svg)) {
        throw new Error(`${slug}: invalid source-coordinate ${kind} SVG.`);
      }
      const bytes = Buffer.from(svg);
      const name = `${stem}-${kind}-${digest(bytes).slice(0, 12)}.svg`;
      const destination = path.join(path.dirname(filename), name);
      assertWithin(productDirectory, destination);
      const realParent = await fs.realpath(path.dirname(destination));
      assertWithin(realProducts, path.join(realParent, name));
      const existingReal = await fs.realpath(destination).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (existingReal) assertWithin(realProducts, existingReal);
      const url = `${path.posix.dirname(asset.image)}/${name}`;
      maskUrls[`${kind}Mask`] = url;
      metadataAfter = replaceUniqueJsonString(metadataAfter, asset.geometry[`${kind}Mask`], url);
      expected[slug].geometry[`${kind}Mask`] = url;
      writes.push({ filename: destination, bytes });
    }
    updates.push({ slug, family, image: asset.image, geometry: generated.geometry, maskUrls, metrics: generated.metrics });
  }
  // Only the three mask strings per native product may differ. The original
  // JSON bytes and formatting outside these strings are retained verbatim.
  if (!isDeepStrictEqual(JSON.parse(metadataAfter), expected)) throw new Error('Unexpected metadata mutation outside native mask URLs.');
  for (const slug of roundSlugs) if (!isDeepStrictEqual(assets[slug], expected[slug])) throw new Error(`${slug}: round-bucket metadata changed.`);
  return { metadataBefore, metadataAfter, writes, updates, imageChecks, roundProductsUnchanged: roundSlugs.length };
}

async function assertInputsUnchanged(plan) {
  if (await fs.readFile(metadataFile, 'utf8') !== plan.metadataBefore) throw new Error('Catalog metadata changed during preparation; rerun against its current state.');
  for (const { filename, sha256 } of plan.imageChecks) {
    if (digest(await fs.readFile(filename)) !== sha256) throw new Error(`Retained WebP changed during preparation: ${filename}`);
  }
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/prepare-catalog-shadows.cjs');
  const plan = await createShadowUpdatePlan();
  await assertInputsUnchanged(plan);
  for (const { filename, bytes } of plan.writes) {
    // Content-addressed outputs are never allowed to replace different bytes.
    try { await fs.writeFile(filename, bytes, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await fs.readFile(filename)).equals(bytes)) throw new Error(`Existing SVG has unexpected content: ${filename}`);
    }
  }
  await assertInputsUnchanged(plan);
  if (plan.metadataAfter !== plan.metadataBefore) {
    const temporary = path.join(path.dirname(metadataFile), `.catalog-product-assets.${crypto.randomUUID()}.tmp`);
    assertWithin(path.dirname(metadataFile), temporary);
    try {
      await fs.writeFile(temporary, plan.metadataAfter, { flag: 'wx' });
      await assertInputsUnchanged(plan);
      await fs.rename(temporary, metadataFile);
    } finally {
      await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  console.log(JSON.stringify({
    updatedNativeProducts: plan.updates.length,
    roundProductsUnchanged: plan.roundProductsUnchanged,
    imageWrites: 0, frameOrScaleChanges: 0,
    updates: plan.updates,
  }, null, 2));
}

module.exports = { createShadowUpdatePlan };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
