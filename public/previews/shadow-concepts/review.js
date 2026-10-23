// Only this comparison route uses these four ground-shadow concepts.
(() => {
  if (!document.body.classList.contains('shadow-concept-review')) return;
  const body = { width:1567, center:1024.5, base:1770, source:2048 };
  const concepts = [...document.querySelectorAll('[data-shadow-concept]')];
  const gaugeGrid = document.querySelector('.concept-catalog-gauge .catalog-product-grid');
  const gaugeCard = gaugeGrid.querySelector('.product-card');
  function resizeCards() {
    const cardRect = gaugeCard.getBoundingClientRect();
    const gridRect = gaugeGrid.getBoundingClientRect();
    document.body.style.setProperty('--review-card-width', `${cardRect.width}px`);
    document.body.style.setProperty('--review-card-height', `${cardRect.height}px`);
    document.body.style.setProperty('--review-grid-width', `${gridRect.width}px`);
    concepts.forEach(concept => concept._measureShadow?.());
  }
  concepts.forEach(concept => {
    const card = concept.querySelector('.catalog-product-grid > .product-card');
    const stage = card.querySelector('.product-card-visual');
    const image = stage.querySelector('img');
    image.dataset.conceptSource = '';
    const diffuse = document.createElement('div');
    diffuse.className = 'concept-shadow-layer concept-shadow-diffuse';
    diffuse.setAttribute('aria-hidden','true');
    const contact = document.createElement('div');
    contact.className = 'concept-shadow-layer concept-shadow-contact';
    contact.setAttribute('aria-hidden','true');
    stage.prepend(diffuse,contact);
    function measure() {
      const rect = image.getBoundingClientRect(), area = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const sx = rect.width/body.source, sy = rect.height/body.source;
      stage.style.setProperty('--body-center', `${rect.left-area.left+body.center*sx}px`);
      stage.style.setProperty('--body-width', `${body.width*sx}px`);
      stage.style.setProperty('--body-base', `${rect.top-area.top+body.base*sy}px`);
      stage.dataset.conceptReady = '';
    }
    concept._measureShadow = measure;
    new ResizeObserver(measure).observe(stage);
    image.addEventListener('load',measure);
    function followHover() {
      const end = performance.now()+700;
      const update = now => { measure(); if(now<end)requestAnimationFrame(update); };
      requestAnimationFrame(update);
    }
    card.addEventListener('pointerenter',followHover);
    card.addEventListener('pointerleave',followHover);
  });
  const gaugeObserver = new ResizeObserver(resizeCards);
  gaugeObserver.observe(gaugeGrid);
  gaugeObserver.observe(gaugeCard);
  document.fonts.ready.then(resizeCards);
  resizeCards();
})();
