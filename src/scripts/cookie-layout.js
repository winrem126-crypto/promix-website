export function initCookieLayout() {
  const surfaces = [...document.querySelectorAll('[data-cookie-banner], .cookie-storage-status')];
  if (!surfaces.length) return;
  let frame = 0;
  let noticeTimer;
  const update = () => {
    frame = 0;
    const visible = surfaces.filter((surface) => !surface.hidden && surface.getClientRects().length);
    const top = Math.min(innerHeight, ...visible.map((surface) => surface.getBoundingClientRect().top));
    document.documentElement.style.setProperty('--cookie-banner-offset', `${Math.max(0, Math.ceil(innerHeight - top + (visible.length ? 12 : 0)))}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  const mutations = new MutationObserver(() => {
    schedule();
    const notice = document.querySelector('.cookie-storage-status');
    if (notice && !notice.hidden) {
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { notice.hidden = true; }, 15000);
    }
  });
  surfaces.forEach((surface) => {
    observer.observe(surface);
    mutations.observe(surface, { attributes: true, attributeFilter: ['hidden', 'data-motion-state'], childList: true });
  });
  document.querySelectorAll('.cookie-modal').forEach((modal) => mutations.observe(modal, { attributes: true, attributeFilter: ['open'] }));
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('focusin', (event) => {
    if (!(event.target instanceof HTMLElement) || event.target.closest('dialog[open], [data-cookie-banner], .cookie-storage-status')) return;
    const target = event.target.getBoundingClientRect();
    const covering = surfaces.find((surface) => {
      if (surface.hidden || !surface.getClientRects().length) return false;
      const bounds = surface.getBoundingClientRect();
      return target.bottom > bounds.top && target.top < bounds.bottom && target.right > bounds.left && target.left < bounds.right;
    });
    if (covering) window.scrollBy({ top: target.bottom - covering.getBoundingClientRect().top + 12, behavior: 'instant' });
  });
  update();
}
