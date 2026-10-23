const path = require('node:path');
const sharp = require('C:/Users/winre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const root = path.resolve(__dirname, '..');
const wideImages = [
  ['production-realistic-source.png', 'production-realistic'],
  ['laboratory-realistic-source.png', 'laboratory-realistic'],
  ['hero-architecture-no-product.png', 'hero-architecture-no-product'],
];

async function optimize() {
  for (const [sourceName, outputName] of wideImages) {
    const source = path.join(root, 'assets', 'generated-sources', sourceName);

    for (const width of [960, 1600]) {
      await sharp(source)
        .resize(width, Math.round(width * 9 / 16), { fit: 'cover', position: 'centre' })
        .webp({ quality: 84, effort: 5, smartSubsample: true })
        .toFile(path.join(root, 'public', 'images', `${outputName}-${width}.webp`));
    }
  }

  const productEnvironments = [
    ['product-showcase-environment.png', 'product-showcase-environment'],
    ['product-showcase-light-environment.png', 'product-showcase-light-environment'],
  ];
  for (const [sourceName, outputName] of productEnvironments) {
    const productEnvironment = path.join(root, 'assets', 'generated-sources', sourceName);
    for (const width of [768, 1120]) {
      await sharp(productEnvironment)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 84, effort: 5, smartSubsample: true })
        .toFile(path.join(root, 'public', 'images', `${outputName}-${width}.webp`));
    }
  }
}

optimize().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
