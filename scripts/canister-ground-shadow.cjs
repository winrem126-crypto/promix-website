const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smoothstep = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function readPackage(input) {
  const bytes = Buffer.isBuffer(input) ? input : typeof input === 'string' ? await fs.readFile(input) : null;
  if (!bytes) throw new TypeError('productAlpha must be an RGBA image Buffer or file path.');
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: info.width, height: info.height };
}

function measurePackage(image, supplied = {}) {
  const { alpha, width, height } = image;
  let left = width, right = -1, top = height, bottom = -1;
  const lower = new Int32Array(width).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    lower[x] = y;
  }
  if (right < left || bottom < top) throw new Error('Canister has no alpha128 physical silhouette.');
  const widths = [], centers = [];
  for (const fraction of [.61, .63, .65, .67, .69]) {
    const y = Math.round(top + (bottom - top) * fraction);
    let first = width, last = -1;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] >= 128) { first = Math.min(first, x); last = x; }
    if (last >= first) { widths.push(last - first + 1); centers.push((first + last + 1) / 2); }
  }
  const bodyWidth = supplied.bodyWidth ?? median(widths);
  const bodyCenter = supplied.bodyCenter ?? median(centers);
  const base = supplied.base ?? bottom + 1;
  if (![bodyWidth, bodyCenter, base].every(Number.isFinite) || bodyWidth <= 0 || base < 1 || base > height) throw new Error('Invalid canister geometry.');
  return { bodyWidth, bodyCenter, base, bounds: [left, top, right - left + 1, bottom - top + 1], lower, bottom };
}

function roundedRectangleDistance(x, y, cx, cy, halfWidth, halfDepth, radius) {
  const qx = Math.abs(x - cx) - halfWidth + radius;
  const qy = Math.abs(y - cy) - halfDepth + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

async function alphaSvg(field, width, height) {
  const rgba = Buffer.alloc(field.length * 4, 255);
  for (let i = 0; i < field.length; i++) rgba[i * 4 + 3] = Math.round(clamp(field[i]) * 255);
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`;
}

function metricsFor(field, width, height) {
  let count = 0, maximum = 0, total = 0, left = width, right = -1, top = height, bottom = -1;
  for (let i = 0; i < field.length; i++) {
    maximum = Math.max(maximum, field[i]); total += field[i];
    if (field[i] < 1 / 255) continue;
    const x = i % width, y = Math.floor(i / width);
    count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { pixels: count, maximum, integratedAlpha: total, supportBounds: count ? [left, top, right - left + 1, bottom - top + 1] : null };
}

/** Native canister floor projection. It never reads a bucket shadow/reference. */
async function createCanisterGroundShadow({ productAlpha, geometry: suppliedGeometry } = {}) {
  const image = await readPackage(productAlpha);
  const { alpha, width, height } = image;
  const measured = measurePackage(image, suppliedGeometry);
  const { bodyWidth, bodyCenter, base, lower } = measured;
  const unit = bodyWidth / 719;
  const contact = new Float32Array(alpha.length);
  const ambient = new Float32Array(alpha.length);
  const ground = new Float32Array(alpha.length).fill(1);

  // Only the real lower support is eligible. Higher side walls/handle pixels
  // cannot create a spurious shadow outline along the canister's vertical body.
  const maximumCornerRise = bodyWidth * .08;
  const support = [];
  for (let x = 0; x < width; x++) if (lower[x] >= base - 1 - maximumCornerRise) support.push(x);
  if (support.length < bodyWidth * .5) throw new Error('Canister lower support is too narrow for a flat rounded base.');
  const supportLeft = support[0], supportRight = support[support.length - 1];
  const supportSpan = supportRight - supportLeft + 1;
  const endFade = supportSpan * .07;

  // Project the actual broad, rounded rectangular support along the reference
  // light direction. The farther floor cross-sections move to the right while
  // retaining the base's flat transverse span. No bucket mask/ellipse is used.
  const depth = bodyWidth * .22;
  const shiftRight = bodyWidth * .35;
  const front = base + bodyWidth * .018;
  const back = base - depth;
  const footprint = {
    cx: (supportLeft + supportRight) / 2,
    cy: (front + back) / 2,
    halfWidth: supportSpan / 2,
    halfDepth: (front - back) / 2,
    radius: Math.min((front - back) * .17, supportSpan * .06),
    feather: bodyWidth * .014,
    direction: [shiftRight, -depth],
  };
  let opaqueOverlap = 0, touchColumns = 0;
  const touchSamples = [];
  for (let x = 0; x < width; x++) {
    const hasSupport = x >= supportLeft && x <= supportRight && lower[x] >= base - 1 - maximumCornerRise;
    const edge = hasSupport ? lower[x] : -1;
    const horizontalFade = hasSupport ? smoothstep((x - supportLeft + .5) / endFade) * smoothstep((supportRight - x + .5) / endFade) : 0;
    // Slightly variable density across the broad flat support prevents a
    // uniformly dark line while retaining contact under almost the full base.
    const centerWeight = .84 + .16 * Math.exp(-(((x - bodyCenter) / (bodyWidth * .42)) ** 2));
    let firstFloor = -1, firstDensity = 0;
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      if (alpha[i] >= 64) { ground[i] = 0; continue; }
      if (hasSupport && y > edge) {
        const d = (y - edge - 1) / unit;
        if (d < 24) {
          // Touch the first external row: a defined two-source-pixel core,
          // followed by a short soft recovery over the next8–12source pixels.
          const core = d <= 2 ? .58 - d * .055 : .47 * Math.exp(-(((d - 2) / 4.8) ** 1.35));
          contact[i] = core * horizontalFade * centerWeight;
          if (firstFloor < 0) { firstFloor = y; firstDensity = contact[i]; }
        }
      }
      const projectionDepth = (base - y) / depth;
      const projectedX = x - shiftRight * clamp(projectionDepth, 0, 1.3);
      const distance = roundedRectangleDistance(projectedX, y, footprint.cx, footprint.cy, footprint.halfWidth, footprint.halfDepth, footprint.radius);
      if (distance < footprint.feather * 3.3) {
        // Density is greatest immediately beside the receiving support and
        // decays along the right/back projection. Its far edge remains narrow
        // and soft, rather than becoming an equally dense rectangular plate.
        const shape = 1 / (1 + Math.exp(distance / footprint.feather));
        const away = Math.max(0, projectionDepth);
        const farFade = smoothstep((1.2 - away) / .3);
        const density = .48 * Math.exp(-away * 1.35) * farFade;
        ambient[i] = shape * density;
      }
      if (alpha[i] >= 64 && (contact[i] || ambient[i])) opaqueOverlap++;
    }
    if (hasSupport && horizontalFade > .8) {
      touchColumns++;
      if (touchSamples.length < 12 && x % Math.max(1, Math.floor(bodyWidth / 10)) === 0) touchSamples.push({ x, edge, firstFloor, density: firstDensity });
    }
  }
  const geometry = { source: [width, height], bodyWidth, bodyCenter, base, family: 'canister' };
  const [contactSvg, ambientSvg, groundSvg] = await Promise.all([alphaSvg(contact, width, height), alphaSvg(ambient, width, height), alphaSvg(ground, width, height)]);
  return {
    contactSvg, ambientSvg, groundSvg, geometry,
    metrics: {
      method: 'Native alpha-derived canister support projected right/back as a rounded rectangle with distance-decaying density; no bucket/template field used.',
      packageBounds: measured.bounds,
      support: { left: supportLeft, right: supportRight, width: supportSpan, maximumCornerRiseSourcePixels: maximumCornerRise, touchingColumns: touchColumns },
      contactProfile: { firstSourcePixels: 2 * unit, softRecoverySourcePixels: [8 * unit, 12 * unit], endFadeSourcePixels: endFade, samples: touchSamples },
      ambientFootprint: footprint,
      alphaThresholds: { physicalEdge: 128, knockout: 64, knockoutDilation: 0 },
      opaqueOverlap,
      contact: metricsFor(contact, width, height), ambient: metricsFor(ambient, width, height),
      encoding: 'Lossless white alpha PNG inside source-coordinate SVG; package RGB and alpha are unchanged.',
    },
  };
}

module.exports = { createCanisterGroundShadow };
