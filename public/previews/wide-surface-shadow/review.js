// Only the first three cards in this review route get the new shadow system.
(() => {
  if (!document.body.classList.contains('wide-surface-preview')) return;
  const frames = JSON.parse(document.querySelector('#surface-shadow-frames').textContent);
  const grid = document.querySelector('.surface-review-window .catalog-product-grid');
  const allCards = [...grid.querySelectorAll(':scope > .product-card')];
  const cards = allCards.slice(0,3);
  allCards.slice(3).forEach(card => { card.setAttribute('aria-hidden','true'); card.inert = true; });
  function fitWindow() {
    const top = grid.getBoundingClientRect().top;
    const bottom = Math.max(...cards.map(card => card.getBoundingClientRect().bottom));
    document.querySelector('.surface-review-window').style.height = `${bottom-top}px`;
  }
  cards.forEach(card => {
    const stage = card.querySelector('.product-card-visual'), image = stage.querySelector('img');
    const frame = frames[image.getAttribute('src')];
    if (!frame) return;
    image.dataset.surfaceSource = '';
    const maskName = image.getAttribute('src').split('/').pop().replace(/\.png$/i,'.svg');
    image.style.setProperty('--surface-package-mask', `url("/previews/catalog-shadows/masks/${maskName}")`);
    const plane = document.createElement('div');
    plane.className = 'surface-shadow-plane';
    plane.setAttribute('aria-hidden','true');
    const diffuse = document.createElement('div');
    diffuse.className = 'surface-shadow-diffuse';
    const contact = document.createElement('div');
    contact.className = 'surface-shadow-contact';
    plane.append(diffuse,contact);
    stage.prepend(plane);
    function measure() {
      const rect = image.getBoundingClientRect(), area = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const sx = rect.width/frame.source[0], sy = rect.height/frame.source[1];
      // This review's three buckets share a measured 1567px body in a 2048px
      // source. The body excludes the handles and transparent source padding.
      const bodyWidth = 1567/2048*frame.source[0];
      const bodyCenter = 1024.5/2048*frame.source[0];
      const base = frame.bounds[1]+frame.bounds[3];
      stage.style.setProperty('--surface-body-width', `${bodyWidth*sx}px`);
      stage.style.setProperty('--surface-body-center', `${rect.left-area.left+bodyCenter*sx}px`);
      stage.style.setProperty('--surface-body-base', `${rect.top-area.top+base*sy}px`);
      stage.dataset.surfaceReady = '';
    }
    new ResizeObserver(measure).observe(stage);
    image.addEventListener('load',measure);
    document.fonts.ready.then(measure);
    measure();
    function followHover() {
      const end = performance.now()+700;
      const update = now => { measure(); if(now<end)requestAnimationFrame(update); };
      requestAnimationFrame(update);
    }
    card.addEventListener('pointerenter',followHover);
    card.addEventListener('pointerleave',followHover);
  });
  const observer = new ResizeObserver(fitWindow);
  observer.observe(grid);
  cards.forEach(card => observer.observe(card));
  document.fonts.ready.then(fitWindow);
  fitWindow();
  const main = document.querySelector('[data-surface-mode]');
  document.querySelectorAll('[data-surface-mode-button]').forEach(button => button.addEventListener('click', () => {
    main.dataset.surfaceMode = button.dataset.surfaceModeButton;
    document.querySelectorAll('[data-surface-mode-button]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
  }));
})();
