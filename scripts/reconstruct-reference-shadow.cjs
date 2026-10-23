const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('astro/package.json'))('sharp');

// This is a reconstruction of one fixed reference photograph, not a general
// shadow generator. Clean floor and shadow colour are inferred from that frame;
// a single photograph cannot determine their physical alpha unambiguously.
const measurementSourceBounds = [566, 179, 3216, 2805];
const referenceSize = [963, 769];
const shadowRGB = [69, 58, 44];
// Robust RGB fit of this preview's existing, empty mineral floor at 963×769.
// Basis: [1, x/963, (y-486)/283, x/963*(y-486)/283]. This compensates density
// for the lighter receiving surface without modifying its background pixels.
const sceneFloorCoefficients = [
  [244.40149463, -24.25729848, -1.11598950, -.58399324],
  [238.96269443, -26.32671674, -.80702452, -.96394985],
  [232.48878540, -27.57100956, -.68621543, -1.18947379],
];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function solve(matrix, values) {
  const a = matrix.map((row, i) => [...row, values[i]]);
  for (let i = 0; i < values.length; i++) {
    let pivot = i;
    for (let j = i + 1; j < values.length; j++) {
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    }
    [a[i], a[pivot]] = [a[pivot], a[i]];
    if (Math.abs(a[i][i]) < 1e-10) throw new Error('Degenerate clean-floor baseline samples.');
    const divisor = a[i][i];
    for (let c = i; c <= values.length; c++) a[i][c] /= divisor;
    for (let j = 0; j < values.length; j++) {
      if (j === i) continue;
      const factor = a[j][i];
      for (let c = i; c <= values.length; c++) a[j][c] -= factor * a[i][c];
    }
  }
  return a.map(row => row[values.length]);
}

function fitBaseline(samples, channel) {
  let coefficients = [0, 0, 0, 0];
  for (let iteration = 0; iteration < 6; iteration++) {
    const matrix = Array.from({ length: 4 }, () => Array(4).fill(0));
    const values = Array(4).fill(0);
    for (const sample of samples) {
      const predicted = coefficients.reduce((sum, value, i) => sum + value * sample.f[i], 0);
      const error = sample.rgb[channel] - predicted;
      const weight = iteration ? Math.min(1, 3 / Math.max(Math.abs(error), 1e-10)) : 1;
      for (let i = 0; i < 4; i++) {
        values[i] += weight * sample.f[i] * sample.rgb[channel];
        for (let j = 0; j < 4; j++) matrix[i][j] += weight * sample.f[i] * sample.f[j];
      }
    }
    coefficients = solve(matrix, values);
  }
  return coefficients;
}

// Keep convolution in floating point. Opaque product pixels have zero weight,
// so neither the white bucket nor a zero-filled object hole dilutes the contact.
function gaussian(field, width, height, sigma) {
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const horizontal = new Float32Array(field.length);
  const result = new Float32Array(field.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = 0;
    for (let k = -radius; k <= radius; k++) value += field[y * width + clamp(x + k, 0, width - 1)] * kernel[k + radius];
    horizontal[y * width + x] = value;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = 0;
    for (let k = -radius; k <= radius; k++) value += horizontal[clamp(y + k, 0, height - 1) * width + x] * kernel[k + radius];
    result[y * width + x] = value;
  }
  return result;
}

function normalizedConvolution(field, validity, width, height, sigma) {
  const numerator = gaussian(field, width, height, sigma);
  const denominator = gaussian(validity, width, height, sigma);
  for (let i = 0; i < numerator.length; i++) numerator[i] = denominator[i] > .008 ? numerator[i] / denominator[i] : 0;
  return numerator;
}

function visibleSupport(field, width, height) {
  const labels = new Int32Array(field.length);
  const queue = new Int32Array(field.length);
  const components = [];
  let label = 0;
  for (let i = 0; i < field.length; i++) {
    if (labels[i] || field[i] < 7 / 255) continue;
    label++;
    let start = 0, end = 1, target = 0;
    let left = width, right = 0, top = height, bottom = 0;
    labels[i] = label;
    queue[0] = i;
    while (start < end) {
      const p = queue[start++], x = p % width, y = Math.floor(p / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      // These corridors only select the measured connected floor component;
      // they do not prescribe a footprint or create pixels inside that field.
      if ((x > 785 && y > 550 && y < 680) || (x > 300 && x < 650 && y > 695 && y < 730)) target++;
      for (const neighbor of [p - 1, p + 1, p - width, p + width]) {
        if (neighbor < 0 || neighbor >= field.length || labels[neighbor] || field[neighbor] < 7 / 255) continue;
        if (Math.abs(neighbor % width - x) > 1) continue;
        labels[neighbor] = label;
        queue[end++] = neighbor;
      }
    }
    components.push({ label, pixels: end, target, bounds: [left, top, right - left + 1, bottom - top + 1] });
  }
  const selected = new Set(components.filter(component => component.target > 5 && component.pixels > 1000).map(component => component.label));
  if (!selected.size) throw new Error('The measured reference floor shadow component was not found.');
  const distance = new Uint8Array(field.length).fill(255);
  let start = 0, end = 0;
  for (let i = 0; i < field.length; i++) if (selected.has(labels[i])) {
    distance[i] = 0;
    queue[end++] = i;
  }
  while (start < end) {
    const p = queue[start++], x = p % width;
    if (distance[p] >= 28) continue;
    for (const neighbor of [p - 1, p + 1, p - width, p + width]) {
      if (neighbor < 0 || neighbor >= field.length || distance[neighbor] <= distance[p] + 1) continue;
      if (Math.abs(neighbor % width - x) > 1) continue;
      distance[neighbor] = distance[p] + 1;
      queue[end++] = neighbor;
    }
  }
  return { mask: Uint8Array.from(distance, value => value <= 28 ? 1 : 0), components: components.filter(component => selected.has(component.label)) };
}

async function densityMask(field, width, height, sourceWidth, sourceHeight, inverse) {
  // Store the measured matrix as one lossless alpha plane. Separate adjacent
  // SVG scan runs lose density through edge antialiasing at catalog scale.
  // This encodes only the floor mask; no product or reference RGB is included.
  const rgba = Buffer.alloc(field.length * 4, 255);
  for (let i = 0; i < field.length; i++) rgba[i * 4 + 3] = Math.round(clamp(field[i]) * 255);
  const alpha = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const n = value => Number(value.toFixed(12));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}" viewBox="0 0 ${sourceWidth} ${sourceHeight}"><g transform="matrix(${n(inverse.scale)} 0 0 ${n(inverse.scale)} ${n(inverse.left)} ${n(inverse.top)})"><image width="${width}" height="${height}" href="data:image/png;base64,${alpha.toString('base64')}"/></g></svg>\n`;
}

const median = values => {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};

async function reconstructReferenceShadow({ reference, original, sourceWidth, sourceHeight, frame, referenceFrame }) {
  if (![sourceWidth, sourceHeight].every(value => Number.isInteger(value) && value > 0)) throw new Error('Provide positive integer source dimensions.');
  if (!frame?.bounds || !referenceFrame?.bounds || frame.bounds.length !== 4 || referenceFrame.bounds.length !== 4) throw new Error('Source and reference frame bounds are required.');
  const [referenceImage, alphaImage] = await Promise.all([
    sharp(reference).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(original).extract({ left: measurementSourceBounds[0], top: measurementSourceBounds[1], width: measurementSourceBounds[2], height: measurementSourceBounds[3] })
      .resize(referenceFrame.bounds[2], referenceFrame.bounds[3], { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height, channels } = referenceImage.info;
  if (width !== referenceSize[0] || height !== referenceSize[1] || channels !== 3) throw new Error('This measured reconstruction requires the original 963×769 RGB reference.');
  const [refX, refY, refWidth, refHeight] = referenceFrame.bounds;
  const object = new Uint8Array(width * height);
  const lowerEdge = new Int32Array(width).fill(-1);
  for (let y = 0; y < refHeight; y++) for (let x = 0; x < refWidth; x++) {
    if (alphaImage.data[(y * refWidth + x) * 4 + 3] <= 4) continue;
    const px = x + refX, py = y + refY;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    object[py * width + px] = 1;
    lowerEdge[px] = Math.max(lowerEdge[px], py);
  }

  const smoothedRGB = await sharp(referenceImage.data, { raw: { width, height, channels: 3 } }).blur(4).raw().toBuffer();
  const basis = (x, y) => { const X = x / width, Y = (y - 486) / (height - 486); return [1, X, Y, X * Y]; };
  const samples = [];
  for (let y = 502; y < height; y += 4) for (let x = 4; x < width; x += 4) {
    const cleanFloor = x < 96 || (x > 875 && y < 522) || (y > 750 && x < 380);
    if (!cleanFloor || object[y * width + x]) continue;
    const p = (y * width + x) * 3;
    samples.push({ f: basis(x, y), rgb: [...smoothedRGB.slice(p, p + 3)] });
  }
  const baselineCoefficients = [0, 1, 2].map(channel => fitBaseline(samples, channel));
  const baseline = new Float32Array(width * height * 3);
  const validity = new Float32Array(width * height);
  const raw = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, f = basis(x, y);
    for (let c = 0; c < 3; c++) baseline[i * 3 + c] = clamp(baselineCoefficients[c].reduce((sum, coefficient, j) => sum + coefficient * f[j], 0), 0, 255);
    if (y < 490 || object[i]) continue;
    // Do not add a one-pixel safety gap: native y=711 below x=480 is the
    // strongest observed contact. Only the opaque package itself is excluded.
    if (x >= 145 && x <= 780 && lowerEdge[x] >= 490 && y <= lowerEdge[x]) continue;
    validity[i] = 1;
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) {
      const floor = baseline[i * 3 + c], vector = floor - shadowRGB[c];
      numerator += (floor - referenceImage.data[i * 3 + c]) * vector;
      denominator += vector * vector;
    }
    raw[i] = clamp(numerator / denominator, 0, .92);
  }
  const fine = normalizedConvolution(raw, validity, width, height, .7);
  const smooth = normalizedConvolution(raw, validity, width, height, 3);
  const broad = normalizedConvolution(raw, validity, width, height, 12);
  const total = new Float32Array(raw.length), contact = new Float32Array(raw.length), ambient = new Float32Array(raw.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!validity[i]) continue;
    const edge = lowerEdge[x];
    const atContact = edge >= 490 && y - edge >= 0 && y - edge < 20;
    total[i] = clamp(atContact ? fine[i] : smooth[i], 0, .92);
    ambient[i] = atContact ? Math.min(clamp(broad[i], 0, .9), total[i]) : total[i];
    contact[i] = atContact ? clamp((total[i] - ambient[i]) / (1 - ambient[i]), 0, .92) : 0;
  }
  const support = visibleSupport(total, width, height);
  let supportPixels = 0, maxCompositeError = 0, maxAlpha = 0, objectOverlapPixels = 0;
  for (let i = 0; i < total.length; i++) {
    if (!support.mask[i]) { total[i] = contact[i] = ambient[i] = 0; continue; }
    supportPixels++;
    if (total[i] > 0) {
      const f = basis(i % width, Math.floor(i / width));
      let numerator = 0, denominator = 0;
      for (let c = 0; c < 3; c++) {
        const scene = sceneFloorCoefficients[c].reduce((sum, value, j) => sum + value * f[j], 0);
        const target = baseline[i * 3 + c] * (1 - total[i]) + shadowRGB[c] * total[i];
        const vector = scene - shadowRGB[c];
        numerator += (scene - target) * vector;
        denominator += vector * vector;
      }
      // Compensation fades to zero at measured faint edges, preserving the
      // reference support instead of adding a new floor-wide grey veil.
      const t = clamp(total[i] / .12), weight = t * t * (3 - 2 * t);
      total[i] = clamp(total[i] + (clamp(numerator / denominator) - total[i]) * weight, 0, .92);
      ambient[i] = clamp(1 - (1 - total[i]) / (1 - contact[i]), 0, total[i]);
      contact[i] = clamp((total[i] - ambient[i]) / (1 - ambient[i]));
    }
    maxAlpha = Math.max(maxAlpha, total[i]);
    maxCompositeError = Math.max(maxCompositeError, Math.abs(total[i] - (ambient[i] + contact[i] - ambient[i] * contact[i])));
    if (object[i] && (contact[i] || ambient[i])) objectOverlapPixels++;
  }

  const [sourceX, sourceY, sourceBoundsWidth, sourceBoundsHeight] = frame.bounds;
  const scale = Math.min(refWidth / sourceBoundsWidth, refHeight / sourceBoundsHeight);
  const left = refX + refWidth / 2 - (sourceX + sourceBoundsWidth / 2) * scale;
  const top = refY + refHeight - (sourceY + sourceBoundsHeight) * scale;
  const inverse = { scale: 1 / scale, left: -left / scale, top: -top / scale };
  const regions = {};
  for (const [name, box] of Object.entries({ contact: [400, 711, 560, 716], contactFade: [400, 724, 560, 735], ambientRight: [805, 575, 945, 650], frontRight: [805, 710, 945, 760], cleanLeft: [0, 590, 95, 690] })) {
    const values = [], floor = [[], [], []];
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
      const i = y * width + x;
      if (!validity[i]) continue;
      values.push(total[i]);
      for (let c = 0; c < 3; c++) floor[c].push(baseline[i * 3 + c]);
    }
    regions[name] = { medianAlpha: median(values), samples: values.length, baselineRGB: floor.map(median) };
  }
  return {
    contactSvg: await densityMask(contact, width, height, sourceWidth, sourceHeight, inverse),
    ambientSvg: await densityMask(ambient, width, height, sourceWidth, sourceHeight, inverse),
    metrics: {
      method: 'Measured reference residual with inferred robust bilinear clean-floor baseline; alpha is not uniquely recoverable from one photograph.',
      nativeSize: [width, height], sourceSize: [sourceWidth, sourceHeight], measurementSourceBounds,
      alphaProxy: { referenceBounds: referenceFrame.bounds, threshold: 4, interpolation: 'Lanczos3, native original crop mapped to the reference bounds' },
      sourceToReference: { scale, left, top }, referenceToSource: inverse,
      shadowRGB, baselineCoefficients, baselineSamples: samples.length,
      receivingFloorCalibration: { coefficients: sceneFloorCoefficients, faintEdgeTaperAlpha: .12 },
      sigmaNativePixels: { contact: .7, field: 3, ambientSplit: 12 },
      contactDistanceNativePixels: 20, supportThreshold: 7 / 255, supportExpansionNativePixels: 28,
      components: support.components, supportPixels, maxAlpha, objectOverlapPixels, maxCompositeError,
      encoding: { kind: 'lossless white alpha plane inside affine SVG', levels: 256, maximumAlphaQuantizationError: 1 / 510 },
      regions,
      samples: [[400, 710], [480, 711], [560, 707], [850, 610]].map(([x, y]) => {
        const i = y * width + x;
        return { x, y, total: total[i], ambient: ambient[i], contact: contact[i] };
      }),
    },
  };
}

module.exports = { reconstructReferenceShadow };
