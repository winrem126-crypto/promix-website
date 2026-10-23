// Integrate the four existing SUPER TACK catalog products after local retouching.
// Usage (from promix-site): node scripts/integrate-super-tack-white.cjs
// The ceiling PNG remains a corrected project source: it has no public product.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

const siteRoot = path.resolve(__dirname, '..');
const correctionRoot = path.resolve(siteRoot, '..', 'super-tack-white');
const inputDirectory = path.join(correctionRoot, 'corrected');
const qaDirectory = path.join(correctionRoot, 'qa');
const snapshotPath = path.join(qaDirectory, 'catalog-integration-before.json');
const reportPath = path.join(qaDirectory, 'catalog-integration-report.json');
const metadataPath = path.join(siteRoot, 'src/data/catalog-product-assets.json');
const sourceDirectory = path.join(siteRoot, 'assets/product-sources/catalog-2026-10');
const publicDirectory = path.join(siteRoot, 'public/images/products/catalog-2026-10');
const publicPrefix = '/images/products/catalog-2026-10';
const products = [
  ['super-tack-3', 'PROMIX_Super_Tack_3.png'],
  ['super-tack-7', 'PROMIX_Super_Tack_7.png'],
  ['super-tack-facade', 'PROMIX_Super_Tack_Fasad.png'],
  ['super-tack-facade-silicon', 'PROMIX_Super_Tack_Fasad_Silikon.png'],
];
const targetSlugs = products.map(([slug]) => slug);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const publicFile = url => path.join(siteRoot, 'public', url.replace(/^\//, ''));

async function compareAlpha(original, corrected, slug) {
  const decode = bytes => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const oldImage = await decode(original);
  const newImage = await decode(corrected);
  assert.equal(newImage.info.width, oldImage.info.width, slug + ': source width changed.');
  assert.equal(newImage.info.height, oldImage.info.height, slug + ': source height changed.');
  assert.equal(newImage.info.channels, 4, slug + ': expected RGBA source.');
  assert.equal(oldImage.info.channels, 4, slug + ': expected RGBA reference.');
  let changedRgbPixels = 0;
  for (let offset = 0; offset < oldImage.data.length; offset += 4) {
    if (newImage.data[offset + 3] !== oldImage.data[offset + 3]) throw new Error(slug + ': alpha changed at pixel ' + offset / 4 + '.');
    if (newImage.data[offset] !== oldImage.data[offset]
      || newImage.data[offset + 1] !== oldImage.data[offset + 1]
      || newImage.data[offset + 2] !== oldImage.data[offset + 2]) changedRgbPixels++;
  }
  assert.ok(changedRgbPixels > 0, slug + ': corrected source has no RGB changes.');
  return { width: newImage.info.width, height: newImage.info.height, alphaUnchanged: true, changedRgbPixels };
}

function validateMetadata(before, after) {
  assert.deepEqual(Object.keys(after), Object.keys(before), 'Catalog product keys changed.');
  const changedSlugs = Object.keys(before).filter(slug => JSON.stringify(before[slug]) !== JSON.stringify(after[slug]));
  assert.deepEqual(changedSlugs, targetSlugs, 'Expected exactly the four SUPER TACK catalog entries to change.');
  for (const slug of targetSlugs) {
    const { image: oldImage, sources: oldSources, sourceHash: oldHash, ...protectedBefore } = before[slug];
    const { image: newImage, sources: newSources, sourceHash: newHash, ...protectedAfter } = after[slug];
    assert.deepEqual(protectedAfter, protectedBefore, slug + ': frame, geometry or other protected metadata changed.');
    assert.notEqual(newImage, oldImage, slug + ': catalog image was not refreshed.');
    assert.notEqual(newHash, oldHash, slug + ': source hash was not refreshed.');
    assert.deepEqual(newSources.map(source => source.width), oldSources.map(source => source.width), slug + ': derivative resolutions changed.');
  }
  return changedSlugs;
}

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/integrate-super-tack-white.cjs');
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  assert.equal(snapshot.schemaVersion, 1, 'Unsupported snapshot version.');
  assert.deepEqual(snapshot.targetSlugs, targetSlugs, 'Snapshot targets do not match the integration scope.');
  const beforeText = await fs.readFile(metadataPath, 'utf8');
  const beforeSha256 = sha256(Buffer.from(beforeText));
  const before = JSON.parse(beforeText);
  const originalSnapshot = JSON.parse(snapshot.metadataText);
  for (const slug of targetSlugs) {
    assert.deepEqual(before[slug], originalSnapshot[slug], slug + ': targeted catalog entry changed since the preparation snapshot.');
  }
  // Other products may have been updated by parallel work. Retain the complete
  // latest baseline and preserve every non-target entry from this exact version.
  const baselinePath = path.join(qaDirectory, 'catalog-integration-baseline-at-integration-' + beforeSha256.slice(0, 12) + '.json');
  const baseline = {
    schemaVersion: 1, capturedAt: new Date().toISOString(), metadataPath,
    metadataSha256: beforeSha256, metadataText: beforeText,
    originalSnapshot: snapshotPath, targetSlugs,
  };
  try {
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.equal(JSON.parse(await fs.readFile(baselinePath, 'utf8')).metadataText, beforeText, 'Existing integration baseline differs.');
  }
  const after = structuredClone(before);
  const protectedAssets = new Map();
  const prepared = [];

  // Complete all source and alpha checks before writing any product asset.
  for (const [slug, originalFilename] of products) {
    const entry = before[slug];
    assert.ok(entry, slug + ': catalog entry is missing.');
    assert.equal(entry.originalFilename, originalFilename, slug + ': product-to-file mapping changed.');
    const original = await fs.readFile(path.join(sourceDirectory, slug + '-' + entry.sourceHash + '.png'));
    assert.equal(sha256(original).slice(0, 12), entry.sourceHash, slug + ': retained original hash mismatch.');
    const corrected = await fs.readFile(path.join(inputDirectory, originalFilename));
    const sourceSha256 = sha256(corrected);
    const sourceHash = sourceSha256.slice(0, 12);
    assert.notEqual(sourceHash, entry.sourceHash, slug + ': expected a newly corrected PNG.');
    const sourceCheck = await compareAlpha(original, corrected, slug);
    for (const key of ['contactMask', 'ambientMask', 'groundMask']) {
      const url = entry.geometry[key];
      assert.ok(url, slug + ': ' + key + ' is missing.');
      protectedAssets.set(url, sha256(await fs.readFile(publicFile(url))));
    }
    prepared.push({ slug, originalFilename, corrected, sourceSha256, sourceHash, sourceCheck });
  }

  await fs.mkdir(sourceDirectory, { recursive: true });
  await fs.mkdir(publicDirectory, { recursive: true });
  const checks = [];
  for (const item of prepared) {
    const { slug, originalFilename, corrected, sourceSha256, sourceHash, sourceCheck } = item;
    const stem = slug + '-' + sourceHash;
    const retainedSource = path.join(sourceDirectory, stem + '.png');
    await fs.writeFile(retainedSource, corrected);
    assert.equal(sha256(await fs.readFile(retainedSource)), sourceSha256, slug + ': corrected source copy differs.');
    const sources = [];
    const derivatives = [];
    for (const width of [640, 960, 1600]) {
      const filename = stem + '-' + width + '.webp';
      const bytes = await sharp(corrected).resize({ width, withoutEnlargement: true }).webp({ lossless: true, effort: 6 }).toBuffer();
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, width, slug + ': derivative width mismatch.');
      assert.equal(metadata.height, width * .75, slug + ': derivative height mismatch.');
      assert.ok(metadata.hasAlpha, slug + ': derivative lost transparency.');
      const outputPath = path.join(publicDirectory, filename);
      await fs.writeFile(outputPath, bytes);
      assert.equal(sha256(await fs.readFile(outputPath)), sha256(bytes), slug + ': derivative copy differs.');
      sources.push({ width, url: publicPrefix + '/' + filename });
      derivatives.push({ width, height: metadata.height, sha256: sha256(bytes), file: outputPath });
    }
    after[slug] = { ...before[slug], image: sources.at(-1).url, sources, sourceHash };
    checks.push({ slug, originalFilename, sourceSha256, source: retainedSource, sourceRetainedByteForByte: true, ...sourceCheck, derivatives });
    console.log('Prepared ' + slug + ': corrected PNG and three lossless WebP derivatives.');
  }

  const changedSlugs = validateMetadata(before, after);
  for (const [url, checksum] of protectedAssets) {
    assert.equal(sha256(await fs.readFile(publicFile(url))), checksum, 'Protected shadow file changed: ' + url);
  }
  // Match the existing JSON indentation and line endings to keep unrelated rows intact.
  const newline = beforeText.includes('\r\n') ? '\r\n' : '\n';
  const afterText = JSON.stringify(after, null, 2).replace(/\n/g, newline) + newline;
  const temporaryMetadata = metadataPath + '.super-tack-white.tmp';
  await fs.writeFile(temporaryMetadata, afterText);
  validateMetadata(before, JSON.parse(await fs.readFile(temporaryMetadata, 'utf8')));
  // Detect concurrent metadata changes before committing the four replacements.
  assert.equal(await fs.readFile(metadataPath, 'utf8'), beforeText, 'Catalog metadata changed while preparing derivatives.');
  await fs.rename(temporaryMetadata, metadataPath);
  const saved = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  validateMetadata(before, saved);
  const report = {
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    snapshot: snapshotPath,
    baselineAtIntegration: baselinePath,
    baselineMetadataSha256: beforeSha256,
    sourceDirectory: inputDirectory,
    metadataPath,
    metadataSha256: sha256(Buffer.from(afterText)),
    changedSlugs,
    onlyFourCatalogEntriesChanged: true,
    frameAndGeometryUnchanged: true,
    shadowPathsAndBytesUnchanged: true,
    protectedShadows: Object.fromEntries(protectedAssets),
    ceilingProduct: { integrated: false, reason: 'No existing public catalog product or slug.' },
    checks,
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('Integrated exactly four catalog products. QA: ' + reportPath);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
