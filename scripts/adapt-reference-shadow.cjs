const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

// Reuse the approved, measured H density fields. This module never constructs
// an ellipse/Bezier, alters package RGB, or writes output files. Its caller owns
// naming and persistence of the returned source-coordinate masks.
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smoothstep = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
const median = values => {
  const copy = [...values].sort((a, b) => a - b);
  return copy[Math.floor(copy.length / 2)];
};

async function inputBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string' && input.trimStart().startsWith('<svg')) return Buffer.from(input);
  if (typeof input === 'string') return fs.readFile(input);
  throw new TypeError('Provide an image/SVG Buffer or a file path. SVG XML strings are also accepted.');
}

async function readPackage(input) {
  const { data, info } = await sharp(await inputBytes(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error('Package decoding did not produce RGBA pixels.');
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: info.width, height: info.height };
}

function measurePackage(image, supplied = {}) {
  const { alpha, width, height } = image;
  let left = width, right = -1, top = height, bottom = -1, opaquePixels = 0;
  const lowerEdge = new Float32Array(width).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    lowerEdge[x] = y;
    opaquePixels++;
  }
  if (right < left || bottom < top) throw new Error('The package has no physical alpha silhouette at threshold128.');

  // Measure below handles; median several nearby rows instead of allowing one
  // transparent letter or a single alpha speck to determine the corpus width.
  const widths = [], centers = [];
  for (const fraction of [.61, .63, .65, .67, .69]) {
    const y = Math.round(top + (bottom - top) * fraction);
    let first = width, last = -1;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] >= 128) {
      first = Math.min(first, x); last = x;
    }
    if (last >= first) { widths.push(last - first + 1); centers.push((first + last + 1) / 2); }
  }
  if (!widths.length) throw new Error('Cannot measure a continuous mid-body silhouette.');
  const bodyWidth = supplied.bodyWidth ?? median(widths);
  const bodyCenter = supplied.bodyCenter ?? median(centers);
  const base = supplied.base ?? bottom + 1;
  if (![bodyWidth, bodyCenter, base].every(Number.isFinite) || bodyWidth <= 0 || base <= 0 || base > height + 1) {
    throw new Error('Invalid supplied or measured physical package geometry.');
  }

  // Refine the lower alpha crossing within one source pixel. Far-side handles
  // are excluded from the contact contour by the measured lower-body corridor.
  const minimumContactY = top + (bottom - top) * .8;
  for (let x = 0; x < width; x++) {
    const y = lowerEdge[x];
    if (y < minimumContactY) { lowerEdge[x] = -1; continue; }
    const inside = alpha[y * width + x];
    const outside = y + 1 < height ? alpha[(y + 1) * width + x] : 0;
    lowerEdge[x] = y + clamp((inside - 128) / Math.max(inside - outside, 1));
  }
  return { width, height, bounds: [left, top, right - left + 1, bottom - top + 1], bodyWidth, bodyCenter, base, lowerEdge, opaquePixels };
}

async function decodeDensity(input, width, height) {
  const bytes = await inputBytes(input);
  const { data, info } = await sharp(bytes).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error('Density decoding did not produce RGBA pixels.');
  const field = new Float32Array(width * height);
  for (let i = 0; i < field.length; i++) field[i] = data[i * 4 + 3] / 255;
  const text = bytes.toString('utf8');
  const affine = text.match(/transform="matrix\(([^)]+)\)"/);
  const raster = text.match(/<image\b[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
  let crop = [0, 0, width, height];
  if (affine && raster) {
    const matrix = affine[1].trim().split(/[\s,]+/).map(Number);
    if (matrix.length === 6 && matrix.every(Number.isFinite) && matrix[1] === 0 && matrix[2] === 0 && matrix[0] > 0 && matrix[3] > 0) {
      crop = [matrix[4], matrix[5], matrix[4] + Number(raster[1]) * matrix[0], matrix[5] + Number(raster[2]) * matrix[3]];
    }
  }
  return { field, text, crop };
}

function sample(field, width, height, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0, ty = y - y0;
  return (field[y0 * width + x0] * (1 - tx) + field[y0 * width + x1] * tx) * (1 - ty)
    + (field[y1 * width + x0] * (1 - tx) + field[y1 * width + x1] * tx) * ty;
}

function edgeAt(edges, x) {
  if (x < 0 || x > edges.length - 1) return -1;
  const lo = Math.floor(x), hi = Math.min(lo + 1, edges.length - 1);
  const a = edges[lo], b = edges[hi];
  if (a < 0 || b < 0) return -1;
  return a + (b - a) * (x - lo);
}

function sameAlpha(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.alpha.length; i++) if (a.alpha[i] !== b.alpha[i]) return false;
  return true;
}

async function alphaSvg(field, width, height) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < field.length; i++) pixels[i * 4 + 3] = Math.round(clamp(field[i]) * 255);
  const png = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`;
}

function groundKnockout(image) {
  const { alpha, width, height } = image;
  const ground = new Float32Array(alpha.length).fill(1);
  // Exclude the alpha64 silhouette, including its antialiased rim, from the
  // shadow group. The package image and its original alpha are never masked.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 64) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = x + dx, py = y + dy;
      if (px >= 0 && px < width && py >= 0 && py < height) ground[py * width + px] = 0;
    }
  }
  return ground;
}

function fieldMetrics(field, width, height) {
  let nonzero = 0, maximum = 0, sum = 0, left = width, right = -1, top = height, bottom = -1;
  for (let i = 0; i < field.length; i++) {
    maximum = Math.max(maximum, field[i]); sum += field[i];
    if (field[i] < 1 / 255) continue;
    const x = i % width, y = Math.floor(i / width);
    nonzero++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { pixels: nonzero, maximum, integratedAlpha: sum, supportBounds: nonzero ? [left, top, right - left + 1, bottom - top + 1] : null };
}

/**
 * @param {{productAlpha:Buffer|string,family?:'bucket'|'oval'|'canister'|'roll',geometry?:{bodyWidth?:number,bodyCenter?:number,base?:number},reference:{productAlpha:Buffer|string,contactSvg:Buffer|string,ambientSvg:Buffer|string,groundSvg?:Buffer|string,geometry?:{bodyWidth?:number,bodyCenter?:number,base?:number}}}} options
 * @returns {Promise<{contactSvg:string,ambientSvg:string,groundSvg:string,geometry:object,metrics:object}>}
 */
async function adaptReferenceShadow({ productAlpha, family = 'bucket', geometry: suppliedGeometry, reference } = {}) {
  if (!reference?.productAlpha || !reference?.contactSvg || !reference?.ambientSvg) {
    throw new Error('Provide the approved H package alpha plus its approved contact and ambient SVG masks.');
  }
  if (!['bucket', 'oval', 'canister', 'roll'].includes(family)) throw new Error(`Unsupported package family: ${family}`);
  const [targetImage, referenceImage] = await Promise.all([readPackage(productAlpha), readPackage(reference.productAlpha)]);
  const target = measurePackage(targetImage, suppliedGeometry);
  const source = measurePackage(referenceImage, reference.geometry);
  const [approvedContact, approvedAmbient] = await Promise.all([
    decodeDensity(reference.contactSvg, source.width, source.height),
    decodeDensity(reference.ambientSvg, source.width, source.height),
  ]);
  const ground = groundKnockout(targetImage);
  // Identical source alpha needs no coordinate warp even if a caller measured
  // the metadata width on a different mid-body row. Preserve H masks exactly.
  const identity = sameAlpha(targetImage, referenceImage);
  const widthScale = target.bodyWidth / source.bodyWidth;
  // A narrow standing roll has a small floor footprint, while the measured
  // contact penumbra remains visible. This transfers the same observed density
  // profile rather than replacing its curved front edge with a flat oval.
  const contactVerticalScale = family === 'roll' ? Math.sqrt(widthScale) : widthScale;
  const ambientVerticalScale = widthScale;
  // The photographed field continues beyond the right/bottom photo borders.
  // Their hard raster crop must not become a rectangular edge inside a smaller
  // canister/roll scene. Fade only that unobserved terminal boundary; do not
  // synthesize an extrapolated wing or change the measured contact footprint.
  const cropFadeWidth = source.bodyWidth * .2;
  const cropFadeHeight = source.bodyWidth * .04;
  const targetRightFadeWidth = target.bodyWidth * .15;
  const contact = new Float32Array(target.width * target.height);
  const ambient = new Float32Array(contact.length);
  let excludedPackagePixels = 0, contactMappedColumns = 0, maxCurveCorrection = 0;

  if (!identity) {
    for (let x = 0; x < target.width; x++) {
      const sourceX = source.bodyCenter + (x - target.bodyCenter) / widthScale;
      const sourceEdge = edgeAt(source.lowerEdge, sourceX);
      const targetEdge = target.lowerEdge[x];
      const contactColumn = sourceEdge >= 0 && targetEdge >= 0;
      if (contactColumn) contactMappedColumns++;
      // Keep the measured right/back field affine outside the footprint. Inside
      // the corpus, a tapered displacement makes its front follow the actual
      // bucket/canister/roll alpha arc. It changes coordinates, never density.
      const normalizedX = Math.abs((x - target.bodyCenter) / (target.bodyWidth / 2));
      const curveWeight = contactColumn ? 1 - smoothstep((normalizedX - .6) / .4) : 0;
      const affineEdge = target.base + (sourceEdge - source.base) * ambientVerticalScale;
      const curveCorrection = contactColumn ? (targetEdge - affineEdge) * curveWeight : 0;
      maxCurveCorrection = Math.max(maxCurveCorrection, Math.abs(curveCorrection));
      for (let y = 0; y < target.height; y++) {
        const i = y * target.width + x;
        if (!ground[i]) { if (targetImage.alpha[i] >= 64) excludedPackagePixels++; continue; }
        if (contactColumn) {
          const sourceY = sourceEdge + (y - targetEdge) / contactVerticalScale;
          contact[i] = sample(approvedContact.field, source.width, source.height, sourceX, sourceY);
        }
        const sourceY = source.base + (y - target.base - curveCorrection) / ambientVerticalScale;
        const cropFade = smoothstep((approvedAmbient.crop[2] - sourceX) / cropFadeWidth)
          * smoothstep((approvedAmbient.crop[3] - sourceY) / cropFadeHeight);
        // A wide oval may reach its own canvas edge before the reference photo
        // crop does. End that finite receiving surface softly as well, rather
        // than exposing a hard SVG border inside the rendered product stage.
        const targetCropFade = smoothstep((target.width - 1 - x) / targetRightFadeWidth);
        ambient[i] = sample(approvedAmbient.field, source.width, source.height, sourceX, sourceY) * cropFade * targetCropFade;
      }
    }
  } else {
    contact.set(approvedContact.field); ambient.set(approvedAmbient.field);
  }

  const geometry = { source: [target.width, target.height], bodyWidth: target.bodyWidth, bodyCenter: target.bodyCenter, base: target.base, family };
  const groundSvg = identity && reference.groundSvg ? (await inputBytes(reference.groundSvg)).toString('utf8') : await alphaSvg(ground, target.width, target.height);
  return {
    contactSvg: identity ? approvedContact.text : await alphaSvg(contact, target.width, target.height),
    ambientSvg: identity ? approvedAmbient.text : await alphaSvg(ambient, target.width, target.height),
    groundSvg,
    geometry,
    metrics: {
      method: 'Approved measured H alpha fields, coordinate-warped to the physical target silhouette; no package RGB changed.',
      identity, family, packageBounds: target.bounds, referencePackageBounds: source.bounds,
      alphaThresholds: { physicalBounds: 128, shadowKnockout: 64, knockoutDilationSourcePixels: 1 },
      scale: { width: widthScale, contactVertical: contactVerticalScale, ambientVertical: ambientVerticalScale },
      sourceGeometry: { source: [source.width, source.height], bodyWidth: source.bodyWidth, bodyCenter: source.bodyCenter, base: source.base },
      referenceCropTaper: identity ? null : { crop: approvedAmbient.crop, rightSourcePixels: cropFadeWidth, bottomSourcePixels: cropFadeHeight, targetRightSourcePixels: targetRightFadeWidth },
      contactMappedColumns, maximumAmbientCurveCorrectionSourcePixels: maxCurveCorrection,
      excludedPackagePixels,
      contact: fieldMetrics(contact, target.width, target.height),
      ambient: fieldMetrics(ambient, target.width, target.height),
      encoding: 'Lossless white alpha PNG in source-coordinate SVG; masks apply only to the ground group.',
    },
  };
}

module.exports = { adaptReferenceShadow };
