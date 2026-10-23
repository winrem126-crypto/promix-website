const path = require('path');
const sharp = require('C:/Users/winre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const source = path.resolve(__dirname, '..', 'public', 'images', 'system-layers-source.png');
const outDir = path.resolve(__dirname, '..', 'public', 'images', 'system-layers');

async function run() {
  const metadata = await sharp(source).metadata();
  const regions = [
    { left: 20, right: 347 },
    { left: 350, right: 657 },
    { left: 662, right: 978 },
    { left: 978, right: 1283 },
    { left: 1280, right: metadata.width },
  ];

  for (let index = 0; index < 5; index += 1) {
    const { left, right } = regions[index];
    await sharp(source)
      .extract({ left, top: 0, width: right - left, height: metadata.height })
      .png({ compressionLevel: 9 })
      .toFile(path.join(outDir, `layer-${String(index + 1).padStart(2, '0')}.png`));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
