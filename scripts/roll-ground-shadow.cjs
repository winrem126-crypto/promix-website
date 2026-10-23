const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

const clamp = value => Math.max(0, Math.min(1, value));
const smoothstep = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function inputBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') return fs.readFile(input);
  throw new TypeError('productAlpha must be an RGBA image Buffer or a file path.');
}

function measureRoll(alpha, width, height, supplied = {}) {
  let left = width, right = -1, top = height, bottom = -1;
  const lower = new Int32Array(width).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    lower[x] = y;
  }
  if (right < left) throw new Error('The roll has no physical silhouette at alpha >= 128.');
  const widths = [], centers = [];
  for (const fraction of [.55, .6, .65, .7, .75]) {
    const y = Math.round(top + (bottom - top) * fraction);
    let first = width, last = -1;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] >= 128) {
      first = Math.min(first, x); last = x;
    }
    if (last >= first) { widths.push(last - first + 1); centers.push((first + last + 1) / 2); }
  }
  const bodyWidth = supplied.bodyWidth ?? median(widths);
  const bodyCenter = supplied.bodyCenter ?? median(centers);
  const base = supplied.base ?? bottom + 1;
  if (![bodyWidth, bodyCenter, base].every(Number.isFinite) || bodyWidth <= 0 || base <= 0 || base > height) {
    throw new Error('Invalid roll body geometry.');
  }
  if ((bottom - top + 1) / bodyWidth < 2.5) throw new Error('The supplied silhouette is not a standing roll.');
  for (let x = 0; x < width; x++) if (lower[x] < top + (bottom - top) * .85) lower[x] = -1;
  return { bounds: [left, top, right - left + 1, bottom - top + 1], bodyWidth, bodyCenter, base, lower };
}

function edgeAt(lower, x) {
  const first = Math.floor(x), last = Math.ceil(x);
  if (first < 0 || last >= lower.length || lower[first] < 0 || lower[last] < 0) return -1;
  return lower[first] + (lower[last] - lower[first]) * (x - first);
}

function metrics(field, width, height) {
  let left = width, right = -1, top = height, bottom = -1, maximum = 0, integratedAlpha = 0, pixels = 0;
  for (let i = 0; i < field.length; i++) {
    const value = Math.round(clamp(field[i]) * 255) / 255;
    maximum = Math.max(maximum, value); integratedAlpha += value;
    if (!value) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y); pixels++;
  }
  return { maximum, integratedAlpha, pixels, supportBounds: pixels ? [left, top, right - left + 1, bottom - top + 1] : null };
}

async function alphaSvg(field, width, height) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < field.length; i++) rgba[i * 4 + 3] = Math.round(clamp(field[i]) * 255);
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`;
}

/**
 * Build a standing cylinder's own floor footprint from its measured lower arc.
 * The contact residual touches the first floor pixel; no silhouette dilation or
 * bucket-width reduction is used. The cast component sweeps the round footprint
 * into a long, narrow, tapering trail to the right and back across the floor.
 * Returned white-alpha masks are coloured by the existing warm ground CSS.
 * This helper reads package alpha only and never changes or writes its image.
 * @param {{productAlpha:Buffer|string, geometry?:{bodyWidth?:number,bodyCenter?:number,base?:number}}} options
 */
async function createRollGroundShadow({ productAlpha, geometry: suppliedGeometry } = {}) {
  const { data, info } = await sharp(await inputBytes(productAlpha)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width !== 1600 || height !== 1200) throw new Error('Roll shadows require the catalog 1600 x 1200 derivative.');
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const measured = measureRoll(alpha, width, height, suppliedGeometry);
  const { bodyWidth: w, bodyCenter: cx, base, lower } = measured;
  const contact = new Float32Array(alpha.length);
  const ambient = new Float32Array(alpha.length);
  const ground = new Float32Array(alpha.length);
  // No extra one-pixel exclusion band: the receiving floor starts immediately
  // outside alpha128. Partial-alpha rim pixels receive a proportional fade.
  for (let i = 0; i < alpha.length; i++) ground[i] = alpha[i] >= 128 ? 0 : 1 - alpha[i] / 255;

  // The reference shows a cylinder's elongated cast shadow, not a blurred
  // ellipse at its centre. Anchor the trail to the measured circular base;
  // its long axis follows the light while its cross-section narrows and fades.
  const footprintEdges = [];
  for (let j = 0; j <= 12; j++) {
    const edge = edgeAt(lower, cx + (-.3 + .6 * j / 12) * w);
    if (edge >= 0) footprintEdges.push(edge);
  }
  if (!footprintEdges.length) throw new Error('The roll has no continuous lower arc.');
  const castStartX = cx - .12 * w;
  const castOriginY = median(footprintEdges) - .105 * w;
  const castLength = 4.2 * w;
  // In the approved framing the stage horizon (63.1%) is about source y790.
  // Keep this field well on the receiving plane, even at its soft upper edge.
  const floorHorizon = base - measured.bounds[3] * .31;
  const maximumBackReach = Math.min(230, base - floorHorizon - .18 * w);
  const castBackReach = Math.min(1.08 * w, maximumBackReach - .28 * w);
  const castSlope = castBackReach / castLength;
  const perpendicularScale = Math.sqrt(1 + castSlope * castSlope);
  const contactDepth = .055 * w;
  const xStart = Math.max(0, Math.floor(cx - .65 * w));
  const xEnd = Math.min(width - 1, Math.ceil(castStartX + castLength * 1.05));
  const yStart = Math.max(0, Math.ceil(base - maximumBackReach));
  const yEnd = Math.min(height - 1, Math.ceil(base + .6 * w));
  for (let x = xStart; x <= xEnd; x++) {
    const edge = lower[x];
    const nx = Math.abs((x + .5 - cx) / (w / 2));
    const contactAcross = 1 - smoothstep((nx - .52) / .48);
    const progress = (x + .5 - castStartX) / castLength;
    const along = clamp(progress);
    const castAxisY = castOriginY - castBackReach * along;
    const castDepth = .155 * w * (1 - .32 * smoothstep(along));
    const startFade = smoothstep((progress + .09) / .09);
    const tipFade = 1 - smoothstep((progress - .7) / .35);
    const castDensity = .38 * Math.exp(-1.15 * along) * startFade * tipFade;
    for (let y = yStart; y <= yEnd; y++) {
      const i = y * width + x;
      if (!ground[i]) continue;
      if (edge >= 0 && y > edge && contactAcross > 0) {
        const distance = y - edge - 1;
        contact[i] = .205 * contactAcross * Math.exp(-.5 * (distance / contactDepth) ** 2);
      }
      const acrossCast = (y + .5 - castAxisY) / perpendicularScale;
      // A terminal fade keeps finite PNG-canvas boundaries invisible. At the
      // normal roll placement it acts only in the remote bottom penumbra.
      const canvasFade = smoothstep((height - 1 - y) / (.15 * w))
        * smoothstep((width - 1 - x) / (.15 * w)) * smoothstep(x / (.15 * w));
      ambient[i] = Math.min(.34, castDensity * Math.exp(-.5 * (acrossCast / castDepth) ** 2) * canvasFade);
    }
  }

  let overlappingOpaquePixels = 0, firstFloorColumns = 0, contactingFirstFloorColumns = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] >= 128 && (contact[i] || ambient[i])) overlappingOpaquePixels++;
  for (let x = 0; x < width; x++) {
    const edge = lower[x];
    if (edge < 0 || Math.abs((x + .5 - cx) / (w / 2)) > .75 || edge + 1 >= height) continue;
    firstFloorColumns++;
    if (contact[(edge + 1) * width + x] > 1 / 255) contactingFirstFloorColumns++;
  }
  const contactMetrics = metrics(contact, width, height);
  const ambientMetrics = metrics(ambient, width, height);
  const geometry = { source: [width, height], bodyWidth: w, bodyCenter: cx, base, family: 'roll' };
  const [contactSvg, ambientSvg, groundSvg] = await Promise.all([
    alphaSvg(contact, width, height), alphaSvg(ambient, width, height), alphaSvg(ground, width, height),
  ]);
  return { contactSvg, ambientSvg, groundSvg, geometry, metrics: {
    method: 'Roll-native lower-alpha-arc contact and a long, narrow, tapering cylinder cast shadow to the right/back.',
    identity: false, family: 'roll', packageBounds: measured.bounds,
    alphaThresholds: { physicalBounds: 128, shadowKnockout: 128, knockoutDilationSourcePixels: 0 },
    contact: contactMetrics, ambient: ambientMetrics,
    footprintWidthInBodies: ambientMetrics.supportBounds[2] / w,
    rightExtensionBeyondBodyInBodies: (ambientMetrics.supportBounds[0] + ambientMetrics.supportBounds[2] - (cx + w / 2)) / w,
    castTrail: {
      start: [castStartX, castOriginY], horizontalLengthInBodies: castLength / w,
      backReachSourcePixels: castBackReach, maximumBackReachSourcePixels: maximumBackReach,
      sourceFloorHorizon: floorHorizon,
      topClearanceFromHorizonSourcePixels: ambientMetrics.supportBounds[1] - floorHorizon,
      originDepthSourcePixels: .155 * w, terminalDepthSourcePixels: .155 * w * .68,
      originDensity: .38, maximumAmbientAlpha: .34,
    },
    contactDepthSourcePixels: contactDepth,
    lightDirection: 'Upper-left; the long cast trail projects right and back on the floor.',
    sourceRgbUnchanged: true, overlappingOpaquePixels,
    contactFirstFloorColumns: { expected: firstFloorColumns, touching: contactingFirstFloorColumns },
    encoding: 'Lossless white alpha PNG in source-coordinate SVG; existing warm RGB69/58/44 floor layers provide colour.',
  } };
}

module.exports = { createRollGroundShadow };
