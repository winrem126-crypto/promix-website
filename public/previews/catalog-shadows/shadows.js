// Preview-only floor shadows follow the existing image geometry, including hover.
(() => {
  const metadata = document.querySelector('#shadow-preview-frames');
  if (!metadata || !document.body.classList.contains('shadow-preview')) return;
  const frames = JSON.parse(metadata.textContent);
  const stages = [...document.querySelectorAll('.catalog-product-grid .product-card-visual')];
  function measure(stage) {
    const image = stage.querySelector('img');
    const frame = frames[image?.getAttribute('src')];
    if (!frame) return;
    const rect = image.getBoundingClientRect(), area = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const [x, y, width, height] = frame.bounds;
    const sx = rect.width / frame.source[0], sy = rect.height / frame.source[1];
    stage.style.setProperty('--package-center', `${rect.left - area.left + (x + width / 2) * sx}px`);
    stage.style.setProperty('--package-base', `${rect.top - area.top + (y + height) * sy - .35}px`);
    stage.style.setProperty('--package-width', `${width * sx}px`);
    stage.dataset.shadowReady = '';
  }
  const observer = new ResizeObserver(entries => entries.forEach(({target}) => measure(target)));
  stages.forEach(stage => {
    const image = stage.querySelector('img');
    const contact = document.createElement('i');
    contact.className = 'shadow-preview-contact';
    contact.setAttribute('aria-hidden', 'true');
    stage.append(contact);
    const filename = image.getAttribute('src').split('/').pop().replace(/\.png$/i, '.svg');
    image.style.setProperty('--preview-package-mask', `url("/previews/catalog-shadows/masks/${filename}")`);
    image.addEventListener('load', () => measure(stage));
    observer.observe(stage);
    measure(stage);
    // Existing zoom stays intact; shadows remain attached to the actual base.
    function followHover() {
      const end = performance.now() + 700;
      function update(now) { measure(stage); if (now < end) requestAnimationFrame(update); }
      requestAnimationFrame(update);
    }
    stage.closest('.product-card').addEventListener('pointerenter', followHover);
    stage.closest('.product-card').addEventListener('pointerleave', followHover);
  });
  document.fonts.ready.then(() => stages.forEach(measure));
})();
