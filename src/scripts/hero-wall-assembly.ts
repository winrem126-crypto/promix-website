// Motion study. Only imported by the development-only preview route.
const root = document.querySelector<HTMLElement>('[data-assembly]');
if (root) {
  const layers = [...root.querySelectorAll<HTMLImageElement>('[data-layer]')];
  const scene = root.querySelector<HTMLElement>('[data-scene]')!;
  const slider = root.querySelector<HTMLInputElement>('[data-scrubber]')!;
  const progressLabel = root.querySelector<HTMLOutputElement>('[data-progress]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const sceneStatus = root.querySelector<HTMLElement>('[data-scene-status]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-toggle]')!;
  const replay = root.querySelector<HTMLButtonElement>('[data-replay]')!;
  const modeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-mode-button]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let progress = 0;
  let playing = false;
  let frame = 0;
  let mode: 'auto' | 'scroll' = 'auto';
  let disposed = false;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const ease = (n: number) => n * n * (3 - 2 * n);
  const aborter = new AbortController();
  const options = { signal: aborter.signal };

  function render(value: number) {
    progress = clamp(value);
    const width = scene.clientWidth;
    layers.forEach((layer) => {
      const order = Number(layer.dataset.layer);
      // Start at the base; the finish face joins last. No scaling or card flips.
      const phase = ease(clamp((progress - order * .065) / .74));
      const spread = (4 - order) * width * .105;
      const assembled = width * .20 + (4 - order) * width * .004;
      layer.style.transform = `translate3d(${spread + (assembled - spread) * phase}px,0,0)`;
    });
    const percent = Math.round(progress * 100);
    slider.value = String(percent);
    slider.setAttribute('aria-valuetext', percent === 100 ? 'Стена собрана' : percent === 0 ? 'Слои разнесены' : `Стена собрана на ${percent}%`);
    progressLabel.value = `${percent}%`;
    const text = percent >= 99 ? 'Единая поверхность' : percent === 0 ? 'Слои отделки' : 'Материалы становятся стеной';
    if (status.textContent !== text) {
      status.textContent = text;
      sceneStatus.textContent = text;
    }
    toggle.textContent = playing ? 'Пауза' : progress >= .99 ? 'Разобрать' : 'Собрать стену';
    root!.dataset.progress = String(percent);
    root!.dataset.playing = String(playing);
  }

  function stop() {
    cancelAnimationFrame(frame);
    playing = false;
  }

  function selectMode(next: 'auto' | 'scroll') {
    if (next === 'scroll' && reduced.matches) { render(1); return; }
    stop();
    mode = next;
    root!.dataset.mode = next;
    modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.modeButton === next)));
    if (next === 'scroll') {
      render(0);
      updateScroll();
    } else render(progress);
  }

  function animate(to: number) {
    stop();
    if (reduced.matches) { render(to); return; }
    const from = progress;
    const duration = Math.max(800, Math.abs(to - from) * 4400);
    let started: number | undefined;
    playing = true;
    function tick(now: number) {
      if (disposed) return;
      started ??= now;
      const elapsed = clamp((now - started) / duration);
      render(from + (to - from) * elapsed);
      if (elapsed < 1) frame = requestAnimationFrame(tick);
      else { playing = false; render(to); }
    }
    frame = requestAnimationFrame(tick);
  }

  function updateScroll() {
    if (mode !== 'scroll' || reduced.matches) return;
    const box = root!.getBoundingClientRect();
    const header = document.querySelector('header')?.getBoundingClientRect().height ?? 76;
    const distance = Math.max(1, root!.offsetHeight - root!.querySelector<HTMLElement>('.assembly-pin')!.offsetHeight);
    render((header - box.top) / distance);
  }

  replay.addEventListener('click', () => { selectMode('auto'); render(0); animate(1); }, options);
  toggle.addEventListener('click', () => {
    if (playing) { stop(); render(progress); return; }
    if (mode === 'scroll') selectMode('auto');
    animate(progress >= .99 ? 0 : 1);
  }, options);
  slider.addEventListener('input', () => {
    const value = Number(slider.value) / 100;
    if (mode !== 'auto') selectMode('auto');
    stop();
    render(value);
  }, options);
  modeButtons.forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.modeButton as 'auto' | 'scroll';
    selectMode(next);
    if (next === 'auto') { render(0); animate(1); }
  }, options));
  window.addEventListener('scroll', updateScroll, { ...options, passive: true });
  const observer = new ResizeObserver(() => mode === 'scroll' ? updateScroll() : render(progress));
  observer.observe(scene);
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { stop(); render(progress); } }, options);
  function updateMotionPreference() {
    modeButtons.forEach(button => {
      if (button.dataset.modeButton === 'scroll') button.disabled = reduced.matches;
    });
  }
  reduced.addEventListener('change', () => { stop(); selectMode('auto'); render(1); updateMotionPreference(); }, options);
  updateMotionPreference();
  render(reduced.matches ? 1 : 0);
  // Decode all raster layers first; a slow image must not pop into a moving scene.
  void Promise.all(layers.map(image => image.decode().catch(() => undefined))).then(() => {
    if (disposed || reduced.matches) return;
    const introStart = performance.now();
    function introWait(now: number) {
      if (disposed || progress !== 0 || mode !== 'auto' || document.hidden) return;
      if (now - introStart < 1000) frame = requestAnimationFrame(introWait);
      else animate(1);
    }
    frame = requestAnimationFrame(introWait);
  });
  function dispose() { disposed = true; stop(); observer.disconnect(); aborter.abort(); }
  window.addEventListener('pagehide', dispose, { once: true });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
