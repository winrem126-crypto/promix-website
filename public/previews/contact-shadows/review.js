// One review card only. Both ground layers sit behind the unchanged PNG.
(() => {
  if (!document.body.classList.contains('ground-shadow-review')) return;
  const card = document.querySelector('.ground-review-result .product-card');
  const stage = card.querySelector('.product-card-visual');
  const image = stage.querySelector('img');
  image.dataset.groundSource = '';
  // Visible lid/body excludes handles and transparent padding. Source: 2048².
  const body = { center: 1024.5, width: 1567, base: 1770, sourceWidth: 2048, sourceHeight: 2048 };
  const diffuse = document.createElement('div');
  diffuse.className = 'ground-shadow-layer ground-shadow-diffuse';
  diffuse.setAttribute('aria-hidden', 'true');
  const contact = document.createElement('div');
  contact.className = 'ground-shadow-layer ground-shadow-contact';
  contact.setAttribute('aria-hidden', 'true');
  stage.prepend(diffuse, contact);
  function measure() {
    const rect = image.getBoundingClientRect(), area = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = rect.width / body.sourceWidth, sy = rect.height / body.sourceHeight;
    stage.style.setProperty('--visible-body-center', `${rect.left - area.left + body.center * sx}px`);
    stage.style.setProperty('--visible-body-width', `${body.width * sx}px`);
    stage.style.setProperty('--visible-body-base', `${rect.top - area.top + body.base * sy}px`);
    stage.dataset.groundReady = '';
    document.querySelector('.ground-review-card-window').style.height = `${card.getBoundingClientRect().height}px`;
  }
  const observer = new ResizeObserver(measure);
  observer.observe(stage);
  image.addEventListener('load', measure);
  document.fonts.ready.then(measure);
  measure();
  function followHover() {
    const end = performance.now() + 700;
    const update = now => { measure(); if (now < end) requestAnimationFrame(update); };
    requestAnimationFrame(update);
  }
  card.addEventListener('pointerenter', followHover);
  card.addEventListener('pointerleave', followHover);
})();
