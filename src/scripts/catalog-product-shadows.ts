export {};

type ShadowGeometry = {
  source: number[];
  bodyWidth: number;
  bodyCenter: number;
  base: number;
};

// Reference width measured on the approved PROMIX H 0,2 preview at 1440px.
const referenceBodyWidth = 195.81522369384766;
const pending = new Set<HTMLElement>();
const measurements = new WeakMap<Element, () => void>();
let frameRequest = 0;

function schedule(stage: HTMLElement) {
  pending.add(stage);
  if (frameRequest) return;
  frameRequest = requestAnimationFrame(() => {
    frameRequest = 0;
    pending.forEach(element => measurements.get(element)?.());
    pending.clear();
  });
}

const observer = new ResizeObserver(entries => {
  entries.forEach(({ target }) => measurements.get(target)?.());
});

document.querySelectorAll<HTMLElement>('.product-card-visual[data-product-shadow], .product-studio-stage[data-product-shadow]').forEach(stage => {
  if (stage.hasAttribute('data-shadow-initialized')) return;
  const image = stage.querySelector<HTMLImageElement>('img');
  const card = stage.closest<HTMLElement>('.product-card');
  if (!image) return;
  const geometry = JSON.parse(stage.dataset.productShadow!) as ShadowGeometry;
  const synchronized = stage.dataset.shadowProfile === 'reference-mineral';
  stage.dataset.shadowInitialized = '';

  function measure() {
    const area = stage.getBoundingClientRect();
    let imageRect = image!.getBoundingClientRect();
    if (synchronized) {
      // Measure layout, not the animated paint rectangle. The PNG and its
      // source-coordinate masks share the same compositor transform in CSS.
      const canvas = image!.closest<HTMLElement>('.product-image-reference-canvas');
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const layout = getComputedStyle(image!);
        imageRect = new DOMRect(
          canvasRect.left + parseFloat(layout.left),
          canvasRect.top + parseFloat(layout.top),
          parseFloat(layout.width), parseFloat(layout.height),
        );
      }
    }
    // Hidden filtered cards are recalculated by ResizeObserver when revealed.
    if (!imageRect.width || !imageRect.height) return;
    const sx = imageRect.width / geometry.source[0];
    const sy = imageRect.height / geometry.source[1];
    const width = geometry.bodyWidth * sx;
    stage.style.setProperty('--product-image-left', `${imageRect.left - area.left}px`);
    stage.style.setProperty('--product-image-top', `${imageRect.top - area.top}px`);
    stage.style.setProperty('--product-image-width', `${imageRect.width}px`);
    stage.style.setProperty('--product-image-height', `${imageRect.height}px`);
    stage.style.setProperty('--product-body-width', `${width}px`);
    stage.style.setProperty('--product-body-center', `${imageRect.left - area.left + geometry.bodyCenter * sx}px`);
    stage.style.setProperty('--product-base', `${imageRect.top - area.top + geometry.base * sy}px`);
    stage.style.setProperty('--product-shadow-scale', String(width / referenceBodyWidth));
    stage.dataset.shadowReady = '';
  }

  measurements.set(stage, measure);
  measurements.set(image, measure);
  observer.observe(stage);
  observer.observe(image);
  image.addEventListener('load', () => schedule(stage));
  document.fonts.ready.then(() => schedule(stage));
  measure();

  let hoverFrame = 0;
  function followHover() {
    cancelAnimationFrame(hoverFrame);
    const end = performance.now() + 700;
    const update = (now: number) => {
      measure();
      hoverFrame = now < end ? requestAnimationFrame(update) : 0;
    };
    hoverFrame = requestAnimationFrame(update);
  }
  if (!synchronized) {
    card?.addEventListener('pointerenter', followHover);
    card?.addEventListener('pointerleave', followHover);
  }
});
