const heightProperties = [
  '--catalog-title-height',
  '--catalog-description-height',
  '--catalog-purpose-height',
  '--catalog-packaging-height',
] as const;

type CardMeasurement = {
  card: HTMLElement;
  top: number;
  heights: number[];
};

function alignCatalogRows(grid: HTMLElement) {
  const mobile = window.matchMedia('(max-width: 760px)');
  let pendingFrame = 0;
  let observedWidth = -1;

  const schedule = () => {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(measureRows);
  };

  function measureRows() {
    pendingFrame = 0;
    const cards = [...grid.querySelectorAll<HTMLElement>(':scope > .product-card')];

    // Remove the previous row's constraints before measuring a new filtered row.
    // CSS resets these fields' min-height while data-measuring is present.
    cards.forEach(card => heightProperties.forEach(property => card.style.removeProperty(property)));
    if (mobile.matches) {
      grid.removeAttribute('data-measuring');
      return;
    }

    grid.setAttribute('data-measuring', '');
    const measurements: CardMeasurement[] = cards
      .filter(card => !card.hidden && card.getClientRects().length > 0)
      .map(card => {
        const specs = card.querySelectorAll<HTMLElement>('.product-card-specs > div');
        const fields = [
          card.querySelector<HTMLElement>('.product-card-copy > h2'),
          card.querySelector<HTMLElement>('.product-card-copy > p'),
          specs[0],
          specs[1],
        ];
        return {
          card,
          top: card.offsetTop,
          heights: fields.map(field => field?.getBoundingClientRect().height ?? 0),
        };
      });

    // All reads precede writes, so no partially aligned card affects its peers.
    grid.removeAttribute('data-measuring');
    const rows: CardMeasurement[][] = [];
    measurements.forEach(measurement => {
      const row = rows.find(items => Math.abs(items[0].top - measurement.top) <= 1);
      if (row) row.push(measurement);
      else rows.push([measurement]);
    });
    rows.forEach(row => {
      const maxima = heightProperties.map((_, index) => Math.ceil(Math.max(...row.map(item => item.heights[index]))));
      row.forEach(({ card }) => heightProperties.forEach((property, index) => {
        card.style.setProperty(property, `${maxima[index]}px`);
      }));
    });
  }

  new ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width;
    // Equalization changes grid height. Only width changes require another pass.
    if (width !== undefined && Math.abs(width - observedWidth) > .25) {
      observedWidth = width;
      schedule();
    }
  }).observe(grid);

  new MutationObserver(schedule).observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });

  mobile.addEventListener('change', schedule);
  document.fonts.ready.then(schedule);
  window.addEventListener('pageshow', schedule);
  schedule();
}

document.querySelectorAll<HTMLElement>('.catalog-page .catalog-product-grid').forEach(alignCatalogRows);

export {};
