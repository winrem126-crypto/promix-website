const fs = require('fs');
const path = require('path');
const { PNG } = require('C:/Users/winre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(__dirname, '..', 'public', 'images', 'products');
fs.mkdirSync(outDir, { recursive: true });

const products = [
  [path.join(root, '3в1.png'), 'promix-3in1.png'],
  [path.join(root, 'бетоноконтакт.png'), 'betokontakt.png'],
  [path.join(root, 'грунт глубокого проникновения.png'), 'deep-primer.png'],
  [path.join(root, 'грунт концентрат.png'), 'primer-concentrate.png'],
  [path.join(root, 'грунт краска.png'), 'primer-paint.png'],
  [path.join(root, 'грунт универсальный.png'), 'universal-primer.png'],
  [path.join(root, 'Клей для лент.png'), 'tape-adhesive.png'],
  [path.join(root, 'Латексная.png'), 'latex-paint.png'],
  [path.join(root, 'Миттель грунт.png'), 'mittel-grund.png'],
  [path.join(root, 'мозаичная.png'), 'mix-mosaic.png'],
  [path.join(root, 'Н 0.2 синяя.png'), 'promix-h.png'],
  // H 0.2 Красная.png is H 0,2. H 0,3 deliberately has no generated alias
  // until the company supplies an approved photograph of that exact SKU.
  [path.join(root, 'J шовная.png'), 'promix-j.png'],
  [path.join(root, 'W влагостойкая.png'), 'promix-w.png'],
  [path.join(root, 'Про спрей улучшенная.png'), 'pro-spray-improved.png'],
  [path.join(root, 'Про спрей финиш.png'), 'pro-spray-finish.png'],
  [path.join(root, 'супертак 3.png'), 'super-tack-3.png'],
  [path.join(root, 'супертак 7.png'), 'super-tack-7.png'],
  [path.join(root, 'Супертак фасад.png'), 'super-tack-facade.png'],
  [path.join(root, 'фасад силикон.png'), 'super-tack-facade-silicon.png'],
  [path.join(root, 'Сус куш.png'), 'sous-couche.png'],
  [path.join(root, 'Текстурная антивандальная.png'), 'textured-anti-vandal.png'],
  [path.join(root, 'шпатлевка полимерная.png'), 'polymer-putty.png'],
  [path.join(root, 'Эмаль акриловая.png'), 'acrylic-enamel.png'],
  [path.join(root, 'Fasad.png'), 'fasad.png'],
  [path.join(root, 'гидроизоляция.png'), 'hydro.png'],
  [path.join(root, 'F финишная.png'), 'promix-f.png'],
  [path.join(root, 'стеклохолст.png'), 'glass-fiber.png'],
  [path.join(root, 'флизелин.png'), 'nonwoven.png'],
];

function removeConnectedWhiteBackground(png) {
  const { width, height, data } = png;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isBackground = (index) => {
    const p = index * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    return Math.min(r, g, b) >= 235 && Math.max(r, g, b) - Math.min(r, g, b) <= 18;
  };

  const add = (index) => {
    if (!seen[index] && isBackground(index)) {
      seen[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }

  for (let index = 0; index < seen.length; index += 1) {
    if (seen[index]) data[index * 4 + 3] = 0;
  }
  return png;
}

function trimTransparent(png, padding = 18) {
  let minX = png.width;
  let minY = png.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(png.width - 1, maxX + padding);
  maxY = Math.min(png.height - 1, maxY + padding);
  const output = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
  PNG.bitblt(png, output, minX, minY, output.width, output.height, 0, 0);
  return output;
}

function removePlusTopBackground(png) {
  const { width, height, data } = png;
  removeConnectedWhiteBackground(png);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const ny = y / height;
      const nx = x / width;
      const inUpperRim = ny >= .255 && ny <= .355 && (((nx - .5) / .35) ** 2 + ((ny - .302) / .082) ** 2 <= 1);
      let sideInset = .154;
      if (ny > .31 && ny <= .7) sideInset += (ny - .31) / .39 * .016;
      if (ny > .7 && ny <= .8) sideInset = .17 + (ny - .7) / .1 * .012;
      if (ny > .8) sideInset = .182 + ((ny - .8) / .062) ** 2 * .058;
      const bottomCurve = Math.abs(nx - .5) <= .26
        ? .85 + .012 * (1 - ((nx - .5) / .26) ** 2)
        : .85;
      const inBody = ny >= .31 && ny <= bottomCurve && nx >= sideInset && nx <= 1 - sideInset;
      if (inUpperRim || inBody) data[p + 3] = 255;
    }
  }
  return png;
}

function clearPixels(png, predicate) {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (predicate(x, y, png.width, png.height)) png.data[(y * png.width + x) * 4 + 3] = 0;
    }
  }
  return png;
}

function restoreLowerBucketBody(png) {
  const startY = Math.floor(png.height * .59);
  for (let y = startY; y < png.height; y += 1) {
    let left = -1;
    for (let x = 0; x < Math.floor(png.width / 2); x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > 16) {
        left = x;
        break;
      }
    }
    if (left < 0) continue;
    const right = png.width - 1 - left;
    for (let x = left + 2; x <= right - 2; x += 1) png.data[(y * png.width + x) * 4 + 3] = 255;
  }
  return png;
}

function cleanProductArtifact(png, target) {
  if (target === 'promix-3in1.png') {
    return restoreLowerBucketBody(png);
  }
  if (target === 'deep-primer.png') {
    return clearPixels(png, (x, y, width, height) => {
      if (y >= height * .795) return true;
      if (y < height * .79) return false;
      const progress = (y / height - .79) / .01;
      const inset = width * (.075 + Math.max(0, progress) * .045);
      return x < inset || x > width - inset;
    });
  }
  if (target === 'primer-concentrate.png') {
    return clearPixels(png, (_x, y, _width, height) => y >= height * .86);
  }
  if (target === 'universal-primer.png') {
    return clearPixels(png, (x, y, width, height) => {
      const nx = x / width;
      const ny = y / height;
      if (ny < .2) return false;
      if (ny >= .93) return true;
      let left = .148;
      let right = .855;
      if (ny > .84) {
        const t = Math.min(1, (ny - .84) / .09);
        const cornerInset = .045 * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
        left += cornerInset;
        right -= cornerInset;
      }
      return nx < left || nx > right;
    });
  }
  if (target === 'glass-fiber.png') {
    return clearPixels(png, (x, y, width, height) => y >= height * .88 && x < width * .405);
  }
  return png;
}

console.warn('Skipping H 0,3: an approved photograph of that SKU is required; H 0,2 must not be substituted.');
for (const [source, target] of products) {
  const png = PNG.sync.read(fs.readFileSync(source));
  const clean = trimTransparent(cleanProductArtifact(removeConnectedWhiteBackground(png), target));
  fs.writeFileSync(path.join(outDir, target), PNG.sync.write(clean));
  process.stdout.write(`${target}: ${clean.width}x${clean.height}\n`);
}

const plusTopSource = path.join(root, 'клей Plus Top.png');
if (fs.existsSync(plusTopSource)) {
  const sourcePng = PNG.sync.read(fs.readFileSync(plusTopSource));
  const cleanPlusTop = trimTransparent(removePlusTopBackground(sourcePng));
  fs.writeFileSync(path.join(outDir, 'plus-top.png'), PNG.sync.write(cleanPlusTop));
  process.stdout.write(`plus-top.png: ${cleanPlusTop.width}x${cleanPlusTop.height}\n`);
}
