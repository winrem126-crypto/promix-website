// Prepare a single review asset. No package pixels are retouched or generated.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');
const { reconstructReferenceShadow } = require('./reconstruct-reference-shadow.cjs');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);

async function main() {
  const [sourceDirectory, referenceFile] = process.argv.slice(2);
  if (!sourceDirectory || !referenceFile) throw new Error('Pass the source directory and reference image path.');
  const filename = '01_H_02_bordovaya_transparent_4344x3258.png';
  const original = await fs.readFile(path.join(sourceDirectory, filename));
  const digest = hash(original);
  const output = path.join(root, 'public/images/products/reference-trial');
  const originals = path.join(root, 'assets/product-sources/reference-trial');
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(originals, { recursive: true });
  await fs.writeFile(path.join(originals, `promix-h-02-${digest}.png`), original);
  const sources = [];
  for (const width of [640, 960, 1600]) {
    const name = `promix-h-02-${digest}-${width}.webp`;
    // Lossless WebP preserves alpha and avoids compression damage to lettering.
    await sharp(original).resize({ width, withoutEnlargement: true }).webp({ lossless: true, effort: 6 }).toFile(path.join(output, name));
    sources.push({ width, url: `/images/products/reference-trial/${name}` });
  }
  const image = sources.at(-1).url;
  const { data, info } = await sharp(path.join(root, 'public', image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 128) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // Measure the corpus at mid-body, below the handles. Canvas margins never enter shadow sizing.
  const bodyY = Math.round(y0 + (y1 - y0) * .65);
  let bodyLeft = info.width, bodyRight = -1;
  for (let x = 0; x < info.width; x++) if (data[(bodyY * info.width + x) * 4 + 3] >= 128) {
    bodyLeft = Math.min(bodyLeft, x); bodyRight = Math.max(bodyRight, x);
  }
  // The visible density field is measured from the reference photograph.
  // Neither the package pixels nor the established framing are modified.
  const center = (bodyLeft + bodyRight + 1) / 2;
  const bodyWidth = bodyRight - bodyLeft + 1;
  const base = y1 + 1;
  const frame = { source: [info.width, info.height], bounds: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], opticalScale: 1, builtInShadow: false };
  const referenceFrame = { source: [963, 769], bounds: [72, 31, 778, 680] };
  const reference = await fs.readFile(referenceFile);
  const { contactSvg, ambientSvg } = await reconstructReferenceShadow({
    reference, original, sourceWidth: info.width, sourceHeight: info.height, frame, referenceFrame,
  });
  const contactName = `promix-h-02-${digest}-contact-${hash(Buffer.from(contactSvg))}.svg`;
  await fs.writeFile(path.join(output, contactName), contactSvg);
  const ambientName = `promix-h-02-${digest}-ambient-${hash(Buffer.from(ambientSvg))}.svg`;
  await fs.writeFile(path.join(output, ambientName), ambientSvg);

  // Cut the package silhouette out of the SHADOW group, never out of the PNG.
  // This prevents dark ground layers bleeding through its antialiased rim.
  const left = [], right = [];
  for (let y = 0; y < info.height; y++) {
    let first = info.width, last = -1;
    for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] >= 64) {
      first = Math.min(first, x); last = x;
    }
    if (last >= 0) { left.push([first, y]); right.push([last, y]); }
  }
  const outline = [...left, ...right.reverse()].map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' ') + 'Z';
  const groundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${info.width} ${info.height}"><defs><mask id="floor" maskUnits="userSpaceOnUse" x="0" y="0" width="${info.width}" height="${info.height}"><rect width="100%" height="100%" fill="white"/><path d="${outline}" fill="black" stroke="black" stroke-width="1.5"/></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#floor)"/></svg>\n`;
  const groundName = `promix-h-02-${digest}-ground-${hash(Buffer.from(groundSvg))}.svg`;
  await fs.writeFile(path.join(output, groundName), groundSvg);
  const referenceName = `shadow-reference-${hash(reference)}.png`;
  const previewDir = path.join(root, 'public/previews/h-shadow-reference');
  await fs.mkdir(previewDir, { recursive: true });
  await fs.writeFile(path.join(previewDir, referenceName), reference);
  const trial = {
    slug: 'promix-h-02', originalFilename: filename, sourceHash: digest, image, sources,
    referenceFrame, frame,
    geometry: { source: [info.width, info.height], bodyWidth, bodyCenter: center, base, contactMask: `/images/products/reference-trial/${contactName}`, ambientMask: `/images/products/reference-trial/${ambientName}`, groundMask: `/images/products/reference-trial/${groundName}`, family: 'bucket', profile: 'reference-mineral' },
    reference: `/previews/h-shadow-reference/${referenceName}`,
  };
  await fs.writeFile(path.join(root, 'src/data/product-image-trial.json'), JSON.stringify(trial, null, 2) + '\n');
  console.log(JSON.stringify(trial, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
