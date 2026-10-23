export function initFinishingSystems() {
  document.querySelectorAll<HTMLElement>('[data-finishing-system]').forEach((section) => {
    if (section.hasAttribute('data-enhanced')) return;

    const steps = [...section.querySelectorAll<HTMLElement>('[data-finishing-step]')];
    const articles = steps.map((step) => step.querySelector<HTMLElement>('article')!);
    const panels = [...section.querySelectorAll<HTMLElement>('[data-finishing-panel]')];
    const links = [...section.querySelectorAll<HTMLAnchorElement>('[data-stage-nav]')];
    const exitLabels = [...section.querySelectorAll<HTMLElement>('[data-stage-exit-label]')];
    const header = document.querySelector<HTMLElement>('[data-header]');
    // Match the component CSS: low or narrow windows use normal document flow.
    const desktop = window.matchMedia('(min-width: 1101px) and (min-height: 720px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = 0;
    let frame = 0;

    const readingLine = () => {
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      return headerBottom + (window.innerHeight - headerBottom) * (desktop.matches ? .3 : .25);
    };

    const activate = (index: number) => {
      active = index;
      exitLabels.forEach((label) => {
        label.textContent = index === steps.length - 1 ? 'Далее — производство' : 'Пропустить этапы';
      });
      steps.forEach((step, i) => { step.dataset.active = String(i === index); });
      panels.forEach((panel, i) => {
        panel.dataset.active = String(i === index);
        panel.setAttribute('aria-hidden', String(i !== index));
      });
      links.forEach((link, i) => {
        if (i === index) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
      });
    };

    const update = () => {
      frame = 0;
      const markerLine = readingLine();
      const markers = articles.map((article) => {
        const heading = article.querySelector<HTMLElement>('.finishing-system__step-heading')!;
        const rect = heading.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      let next = active;
      // A 32px dead band prevents boundary flicker in either scroll direction.
      while (next < markers.length - 1 && markerLine > (markers[next] + markers[next + 1]) / 2 + 16) next++;
      while (next > 0 && markerLine < (markers[next - 1] + markers[next]) / 2 - 16) next--;
      if (next !== active) activate(next);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    // Real anchors support no-JS/modified clicks. Wheel and touch stay native.
    section.querySelectorAll<HTMLAnchorElement>('[data-stage-jump]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = document.getElementById(link.hash.slice(1));
        if (!target) return;
        event.preventDefault();
        const heading = target.querySelector<HTMLElement>('.finishing-system__step-heading');
        const headingRect = heading?.getBoundingClientRect();
        // Align the clicked heading with the same marker used for activation.
        // Compact rows can otherwise advance the active panel to the next step.
        const top = headingRect
          ? window.scrollY + headingRect.top + headingRect.height / 2 - readingLine()
          : window.scrollY + target.getBoundingClientRect().top - (header?.getBoundingClientRect().height ?? 76) - 40;
        history.pushState(null, '', link.hash);
        // Focus follows the destination so Tab continues from that stage.
        const temporaryTabIndex = !target.hasAttribute('tabindex');
        if (temporaryTabIndex) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (temporaryTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
        window.scrollTo({ top, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
        scheduleUpdate();
      });
    });

    section.setAttribute('data-enhanced', '');
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('pageshow', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
    desktop.addEventListener('change', scheduleUpdate);
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(section);
    if (header) observer.observe(header);
    document.fonts.ready.then(scheduleUpdate);
    update();
  });
}
