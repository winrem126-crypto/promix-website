const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

const clamp = value => Math.max(0, Math.min(1, value));
const smoothstep = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function readPackage(input) {
  const bytes = Buffer.isBuffer(input) ? input : typeof input === 'string' ? await fs.readFile(input) : null;
  if (!bytes) throw new TypeError('productAlpha must be an RGBA image Buffer or file path.');
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 1600 || info.height !== 1200) throw new Error('Oval shadows require the catalog 1600 x 1200 derivative.');
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: info.width, height: info.height };
}

function measurePackage({ alpha, width, height }, supplied = {}) {
  const lower = new Int32Array(width).fill(-1);
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y); lower[x] = y;
  }
  if (right < left) throw new Error('The oval package has no physical alpha128 silhouette.');
  const widths = [], centers = [];
  for (const fraction of [.61, .63, .65, .67, .69]) {
    const y = Math.round(top + (bottom - top) * fraction);
    let first = width, last = -1;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] >= 128) { first = Math.min(first, x); last = x; }
    if (last >= first) { widths.push(last - first + 1); centers.push((first + last + 1) / 2); }
  }
  if (!widths.length) throw new Error('Cannot measure the oval package mid-body silhouette.');
  const bodyWidth = supplied.bodyWidth ?? median(widths);
  const bodyCenter = supplied.bodyCenter ?? median(centers);
  const base = supplied.base ?? bottom + 1;
  if (![bodyWidth, bodyCenter, base].every(Number.isFinite) || bodyWidth <= 0 || base < 1 || base > height) throw new Error('Invalid oval package geometry.');
  return { lower, bodyWidth, bodyCenter, base, bounds: [left, top, right - left + 1, bottom - top + 1] };
}

async function alphaSvg(field, width, height) {
  const rgba = Buffer.alloc(field.length * 4, 255);
  for (let i = 0; i < field.length; i++) rgba[i * 4 + 3] = Math.round(clamp(field[i]) * 255);
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`;
}

function fieldMetrics(field, width, height) {
  let maximum = 0, integratedAlpha = 0, pixels = 0, left = width, right = -1, top = height, bottom = -1;
  const boundaryMaximum = { left: 0, right: 0, top: 0, bottom: 0 };
  for (let i = 0; i < field.length; i++) {
    const value = Math.round(clamp(field[i]) * 255) / 255;
    const x = i % width, y = Math.floor(i / width);
    maximum = Math.max(maximum, value); integratedAlpha += value;
    if (x === 0) boundaryMaximum.left = Math.max(boundaryMaximum.left, value);
    if (x === width - 1) boundaryMaximum.right = Math.max(boundaryMaximum.right, value);
    if (y === 0) boundaryMaximum.top = Math.max(boundaryMaximum.top, value);
    if (y === height - 1) boundaryMaximum.bottom = Math.max(boundaryMaximum.bottom, value);
    if (!value) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels++;
  }
  return { maximum, integratedAlpha, pixels, supportBounds: pixels ? [left, top, right - left + 1, bottom - top + 1] : null, boundaryMaximum };
}

/**
 * Build the oval package's own receiving-floor shadow from its lower alpha arc.
 * This does not read, rescale or adapt the approved round-bucket shadow.
 * The two white-alpha source-space fields are coloured by the existing warm
 * ground layers; package RGB, alpha, framing and optical scale are untouched.
 */
async function createOvalGroundShadow({ productAlpha, geometry: suppliedGeometry } = {}) {
  const image = await readPackage(productAlpha);
  const { alpha, width, height } = image;
  const measured = measurePackage(image, suppliedGeometry);
  const { bodyWidth: w, bodyCenter: cx, base, lower } = measured;
  const contact = new Float32Array(alpha.length);
  const ambient = new Float32Array(alpha.length);
  const ground = new Float32Array(alpha.length);
  // The receiving floor starts at the real edge. A proportional alpha fade
  // protects antialias pixels without a dilated white exclusion band.
  for (let i = 0; i < alpha.length; i++) ground[i] = alpha[i] >= 128 ? 0 : 1 - alpha[i] / 255;

  const maximumArcRise = w * .105;
  let supportLeft = width, supportRight = -1;
  for (let x = 0; x < width; x++) if (lower[x] >= base - 1 - maximumArcRise) {
    supportLeft = Math.min(supportLeft, x); supportRight = x;
  }
  if (supportRight - supportLeft < w * .65) throw new Error('Oval package has no broad continuous lower support.');
  const span = supportRight - supportLeft + 1;
  const endFade = span * .09;
  const unit = w / 1160;

  // A shallow, flat oval footprint is projected slightly right/back. Most of
  // its core is naturally occluded by the package; only the compact right wing
  // and the soft recovery below the lower arc are visible on the floor.
  const footprint = {
    centerX: cx + w * .085,
    centerY: base - w * .135,
    radiusX: w * .545,
    radiusY: w * .122,
    featherX: w * .035,
    featherY: w * .023,
  };
  const edgeFade = { horizontal: w * .065, bottom: w * .055 };
  let firstFloorColumns = 0, touchingFirstFloorColumns = 0, overlappingOpaquePixels = 0;
  for (let x = 0; x < width; x++) {
    const edge = lower[x];
    const inSupport = x >= supportLeft && x <= supportRight && edge >= base - 1 - maximumArcRise;
    const across = inSupport
      ? smoothstep((x - supportLeft + .5) / endFade) * smoothstep((supportRight - x + .5) / endFade)
      : 0;
    const centerDensity = .86 + .14 * Math.exp(-.5 * ((x - cx) / (w * .30)) ** 2);
    for (let y = Math.max(0, Math.floor(base - w * .44)); y < height; y++) {
      const i = y * width + x;
      if (!ground[i]) continue;
      if (inSupport && y > edge) {
        const d = (y - edge - 1) / unit;
        // Defined first-row contact with a short, soft recovery. Its own alpha
        // contour supplies the lower arc, so no horizontal stripe is drawn.
        if (d < 31) contact[i] = across * centerDensity * (d <= 2 ? .57 - .045 * d : .48 * Math.exp(-(((d - 2) / 7.2) ** 1.5)));
      }
      const dx = x + .5 - footprint.centerX, dy = y + .5 - footprint.centerY;
      const ellipseRadius = Math.hypot(dx / footprint.radiusX, dy / footprint.radiusY);
      const direction = Math.atan2(dy / footprint.radiusY, dx / footprint.radiusX);
      const feather = Math.hypot(Math.cos(direction) * footprint.featherX / footprint.radiusX, Math.sin(direction) * footprint.featherY / footprint.radiusY);
      const penumbraDistance = (ellipseRadius - 1) / feather;
      const shape = 1 / (1 + Math.exp(penumbraDistance * 1.35));
      // Continuous terminal tapers reach zero before every finite source edge.
      // No solid cut-off can appear where the right/back penumbra meets it.
      const canvasFade = smoothstep(x / edgeFade.horizontal)
        * smoothstep((width - 1 - x) / edgeFade.horizontal)
        * smoothstep((height - 1 - y) / edgeFade.bottom);
      const frontWeight = .90 + .10 * clamp((dy / footprint.radiusY + 1) / 2);
      ambient[i] = .27 * shape * frontWeight * canvasFade;
    }
    if (inSupport && across > .8 && edge + 1 < height) {
      firstFloorColumns++;
      if (contact[(edge + 1) * width + x] > 1 / 255) touchingFirstFloorColumns++;
    }
  }
  for (let i = 0; i < alpha.length; i++) if (alpha[i] >= 128 && (contact[i] || ambient[i])) overlappingOpaquePixels++;
  const geometry = { source: [width, height], bodyWidth: w, bodyCenter: cx, base, family: 'oval' };
  const [contactSvg, ambientSvg, groundSvg] = await Promise.all([
    alphaSvg(contact, width, height), alphaSvg(ambient, width, height), alphaSvg(ground, width, height),
  ]);
  return { contactSvg, ambientSvg, groundSvg, geometry, metrics: {
    method: 'Oval-native lower-alpha-arc contact and a compact shallow oval floor projection shifted right/back; no round-bucket field used.',
    family: 'oval', packageBounds: measured.bounds,
    support: { left: supportLeft, right: supportRight, width: span, maximumArcRiseSourcePixels: maximumArcRise, endFadeSourcePixels: endFade },
    contactProfile: { coreSourcePixels: 2 * unit, softRecoverySourcePixels: 7.2 * unit },
    footprint, canvasFadeSourcePixels: edgeFade,
    alphaThresholds: { physicalBounds: 128, shadowKnockout: 128, knockoutDilationSourcePixels: 0 },
    contactFirstFloorColumns: { expected: firstFloorColumns, touching: touchingFirstFloorColumns },
    overlappingOpaquePixels, sourceRgbUnchanged: true,
    contact: fieldMetrics(contact, width, height), ambient: fieldMetrics(ambient, width, height),
    encoding: 'Lossless white alpha PNG in source-coordinate SVG; existing RGB69/58/44 floor layers provide colour.',
  } };
}

module.exports = { createOvalGroundShadow };
