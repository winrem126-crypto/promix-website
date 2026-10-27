import { t, formatMaterialCount } from '../i18n/runtime';

const catalogCards = [...document.querySelectorAll('[data-catalog-card]')];
const filterButtons = [...document.querySelectorAll('[data-filter-group]')];
const searchInput = document.querySelector('[data-catalog-search]');
const countOutput = document.querySelector('[data-catalog-count]');
const categoryTitle = document.querySelector('[data-catalog-title]');
const resetButtons = [...document.querySelectorAll('[data-filter-reset]')];
const productGrid = document.querySelector('.catalog-product-grid');
const emptyState = document.querySelector('[data-catalog-empty]');
const categorySelect = document.querySelector('[data-category-select]');
const taskSummaries = [...document.querySelectorAll('[data-active-task]')];
const categories = new Set(filterButtons.map((button) => button.dataset.filterValue));
const tasks = new Set(taskSummaries.map((summary) => summary.dataset.activeTask));
const activeFilters = { category: 'all', task: 'all', query: '' };
let catalogRendered = false;
let catalogPointerId = null;
let pendingCatalogRender = false;
let catalogReleaseFrame = 0;

// A search change on blur must not move a link between pointerdown and click.
// Keep native link activation (including Ctrl/middle click), then render on the
// next frame. The navigation itself is never delayed or handled by JavaScript.
const releaseCatalogPointer = (event) => {
  if (catalogPointerId === null || (event?.pointerId !== undefined && event.pointerId !== catalogPointerId)) return;
  cancelAnimationFrame(catalogReleaseFrame);
  catalogReleaseFrame = requestAnimationFrame(() => {
    catalogReleaseFrame = 0;
    catalogPointerId = null;
    if (pendingCatalogRender) {
      pendingCatalogRender = false;
      renderCatalog();
    }
  });
};
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-catalog-card] a')) {
    cancelAnimationFrame(catalogReleaseFrame);
    catalogReleaseFrame = 0;
    catalogPointerId = event.pointerId;
  }
}, true);
window.addEventListener('click', releaseCatalogPointer, true);
window.addEventListener('auxclick', releaseCatalogPointer, true);
window.addEventListener('pointercancel', releaseCatalogPointer, true);
window.addEventListener('dragend', releaseCatalogPointer, true);
window.addEventListener('contextmenu', releaseCatalogPointer, true);
window.addEventListener('blur', releaseCatalogPointer);
window.addEventListener('pointermove', (event) => {
  if (event.buttons === 0) releaseCatalogPointer(event);
}, { capture: true, passive: true });
const animateCatalogResults = () => {
  if (catalogRendered && productGrid && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    productGrid.removeAttribute('data-motion-updated');
    void productGrid.offsetWidth;
    productGrid.setAttribute('data-motion-updated', '');
  }
  catalogRendered = true;
};
productGrid?.addEventListener('animationend', () => productGrid.removeAttribute('data-motion-updated'));

const synonymGroups = [
  ['грунт', 'грунтовка', 'грунтовочный'],
  ['шпатлевка', 'шпаклевка', 'шпатлевочный', 'шпаклевочный'],
  ['финиш', 'финишный', 'финишная'],
  ['клей', 'клеевой', 'приклеивание'],
  ['стеклохолст', 'холст', 'паутинка'],
  ['флиз', 'флизелин', 'нетканый'],
  ['краска', 'окраска', 'окрашивание'],
  ['гидроизоляция', 'влагозащита', 'влажный'],
].map((group) => [...new Set(group.flatMap((word) => [word, t(word)]))]);
const shortIndexAliases = new Map([
  ['w', 'w'], ['ц', 'w'],
  ['h', 'h'], ['р', 'h'],
  ['j', 'j'], ['о', 'j'],
  ['f', 'f'], ['а', 'f'],
]);

const normalize = (value = '') => value
  .normalize('NFKC')
  // Neutral Unicode casing keeps printed Latin product codes searchable in
  // every locale, including Azerbaijani (where ASCII I otherwise becomes ı).
  .toLowerCase()
  .replaceAll('\u0307', '')
  .replaceAll('ı', 'i')
  .replaceAll('ё', 'е')
  .replace(/[’‘ʻʼʹ`]/g, "'")
  .replace(/[‐‑‒–—−-]+/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const synonymIndex = new Map();
synonymGroups.forEach((group) => {
  const normalized = group.map(normalize);
  normalized.forEach((word) => synonymIndex.set(word, normalized));
});

const expandToken = (token) => {
  // Short prepositions and series codes must retain their literal meaning.
  if (token.length < 3) return [token];
  const exact = synonymIndex.get(token);
  if (exact) return exact;
  const related = synonymGroups.find((group) => group.some((word) => normalize(word).startsWith(token) || token.startsWith(normalize(word))));
  // A synonym expands a query; it must never remove the word actually typed.
  return related ? [...new Set([token, ...related.map(normalize)])] : [token];
};

const preparedCards = catalogCards.map((card, order) => ({
  card,
  order,
  name: normalize(card.dataset.searchName),
  category: normalize(card.dataset.searchCategory),
  purpose: normalize(card.dataset.searchPurpose),
  // Keep the localized card title searchable alongside the full product name.
  keywords: normalize([card.dataset.searchKeywords, card.querySelector('h2, h3')?.textContent].filter(Boolean).join(' ')),
  shortName: normalize(card.dataset.searchShort),
  series: normalize(card.dataset.searchSeries),
}));

// Static HTML cannot know the query-string category/search. Prioritize only
// the real first visible image after URL state is restored, rather than eagerly
// downloading the unfiltered first product on every catalog entry URL.
let primaryCatalogImage;
let imageSizeFrame = 0;
const lazyImageSizes = new WeakMap();
const sizePrimaryImage = () => {
  imageSizeFrame = 0;
  if (primaryCatalogImage) {
    const width = primaryCatalogImage.getBoundingClientRect().width;
    if (width > 0) primaryCatalogImage.sizes = `${Math.ceil(width)}px`;
  }
};
const prioritizeCatalogImage = (visible) => {
  const image = visible[0]?.card.querySelector('.product-card-visual img');
  if (image !== primaryCatalogImage && primaryCatalogImage) {
    primaryCatalogImage.loading = 'lazy';
    primaryCatalogImage.fetchPriority = 'auto';
    primaryCatalogImage.sizes = lazyImageSizes.get(primaryCatalogImage) || '';
    primaryCatalogImage = undefined;
  }
  if (!image) return;
  const rect = image.getBoundingClientRect();
  if (rect.top >= innerHeight || rect.bottom <= 0) return;
  if (!lazyImageSizes.has(image)) lazyImageSizes.set(image, image.sizes);
  primaryCatalogImage = image;
  // Native auto sizes applies only to lazy images. Keep an eager LCP source
  // accurate with its measured canvas size, including on viewport resize.
  sizePrimaryImage();
  image.fetchPriority = 'high';
  image.loading = 'eager';
};
window.addEventListener('resize', () => {
  if (!imageSizeFrame) imageSizeFrame = requestAnimationFrame(sizePrimaryImage);
}, { passive: true });

const fieldScore = (field, token, weight) => {
  if (!field) return 0;
  if (field === token) return weight * 5;
  if (field.startsWith(token)) return weight * 4;
  if (field.split(' ').some((word) => word.startsWith(token))) return weight * 3;
  if (field.includes(token)) return weight * 2;
  return 0;
};

const scoreProduct = (product, tokens, shortQuery = '') => {
  if (shortQuery) {
    const exactIndex = product.shortName === shortQuery;
    return { total: exactIndex ? 1000 : 0, matchedTokens: exactIndex ? 1 : 0 };
  }
  // A printed PROMIX series letter is a product code, not the initial of an
  // ordinary translated word such as "high" or "finish".
  const seriesCode = tokens.includes('promix') ? tokens.find(token => ['h', 'j', 'w', 'f'].includes(token)) : undefined;
  if (seriesCode && product.shortName !== seriesCode) return { total: 0, matchedTokens: 0 };
  let total = 0;
  let matchedTokens = 0;
  tokens.forEach((token) => {
    const aliases = expandToken(token);
    let best = 0;
    aliases.forEach((alias) => {
      best = Math.max(best, fieldScore(product.shortName, alias, 30), fieldScore(product.series, alias, 20), fieldScore(product.name, alias, 12), fieldScore(product.category, alias, 7), fieldScore(product.purpose, alias, 5), fieldScore(product.keywords, alias, 4));
    });
    if (best > 0) {
      matchedTokens += 1;
      total += best;
    }
  });
  if (matchedTokens === tokens.length && tokens.length > 1) total += tokens.length * 18;
  return { total, matchedTokens };
};

const matchesActiveFilters = (card) => {
  const categoryMatch = activeFilters.category === 'all' || card.dataset.category === activeFilters.category;
  const taskMatch = activeFilters.task === 'all' || (card.dataset.tasks || '').split(' ').includes(activeFilters.task);
  return categoryMatch && taskMatch;
};

const applyCatalogFilters = () => {
  if (catalogPointerId !== null) {
    pendingCatalogRender = true;
    return;
  }
  const query = normalize(activeFilters.query);
  const tokens = query.split(' ').filter(Boolean);
  const shortQuery = query.length === 1 ? shortIndexAliases.get(query) ?? '' : '';
  const shouldSearch = query.length >= 2 || Boolean(shortQuery);
  const ranked = preparedCards.map((product) => ({ ...product, score: scoreProduct(product, tokens, shortQuery) }));

  ranked.forEach((product) => {
    const searchMatch = !shouldSearch || (shortQuery ? product.shortName === shortQuery : product.score.matchedTokens === tokens.length);
    product.card.hidden = !(matchesActiveFilters(product.card) && searchMatch);
  });

  const visible = ranked.filter((product) => !product.card.hidden);
  const sorted = shouldSearch
    ? visible.sort((a, b) => b.score.total - a.score.total || a.order - b.order)
    : visible.sort((a, b) => a.order - b.order);
  // Avoid detaching unchanged cards and disturbing their keyboard focus.
  const grid = catalogCards[0]?.parentElement;
  const ordered = [...sorted.map((product) => product.card), ...catalogCards.filter((card) => card.hidden)];
  ordered.forEach((card, index) => {
    if (grid?.children[index] !== card) grid?.insertBefore(card, grid.children[index] ?? null);
  });

  if (countOutput) countOutput.textContent = formatMaterialCount(visible.length);
  if (emptyState) emptyState.hidden = visible.length !== 0;
  const hasFilters = activeFilters.category !== 'all' || activeFilters.task !== 'all' || Boolean(activeFilters.query);
  resetButtons.forEach((button) => { button.hidden = !hasFilters; });
  animateCatalogResults();
  prioritizeCatalogImage(sorted);
};

const renderCatalog = () => {
  if (catalogPointerId !== null) {
    pendingCatalogRender = true;
    return;
  }
  filterButtons.forEach((button) => {
    const active = button.dataset.filterValue === activeFilters.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (categorySelect) categorySelect.value = activeFilters.category;
  if (categoryTitle) categoryTitle.textContent = categorySelect?.selectedOptions[0]?.textContent ?? t('Все материалы');
  productGrid?.toggleAttribute('data-category-filtered', activeFilters.category !== 'all');
  if (searchInput && searchInput.value !== activeFilters.query) searchInput.value = activeFilters.query;
  taskSummaries.forEach((summary) => {
    summary.hidden = summary.dataset.activeTask !== activeFilters.task;
  });
  applyCatalogFilters();
};

const writeCatalogUrl = (method) => {
  const url = new URL(location.href);
  const values = { category: activeFilters.category, task: activeFilters.task, q: activeFilters.query };
  Object.entries(values).forEach(([key, value]) => {
    if (!value || (key !== 'q' && value === 'all')) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  });
  if (url.href !== location.href) history[method](history.state, '', url);
};

let searchTimer;
const commitCatalog = (patch, method = 'pushState') => {
  clearTimeout(searchTimer);
  activeFilters.query = searchInput?.value ?? '';
  Object.assign(activeFilters, patch);
  writeCatalogUrl(method);
  renderCatalog();
};

const restoreCatalog = () => {
  clearTimeout(searchTimer);
  const params = new URLSearchParams(location.search);
  activeFilters.category = categories.has(params.get('category')) ? params.get('category') : 'all';
  activeFilters.task = tasks.has(params.get('task')) ? params.get('task') : 'all';
  activeFilters.query = params.get('q') ?? '';
  renderCatalog();
};

const chooseCategory = (value) => commitCatalog({ category: value, task: 'all' });
filterButtons.forEach((button) => button.addEventListener('click', () => chooseCategory(button.dataset.filterValue)));
categorySelect?.addEventListener('change', () => chooseCategory(categorySelect.value));

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  activeFilters.query = searchInput.value;
  // Keep the URL current even if a product opens before the search debounce ends.
  // Replace, rather than push, so typing does not create one history entry per letter.
  writeCatalogUrl('replaceState');
  searchTimer = setTimeout(applyCatalogFilters, 180);
});
searchInput?.addEventListener('change', () => commitCatalog({}, 'replaceState'));

document.querySelector('[data-search-reset]')?.addEventListener('click', () => {
  commitCatalog({ query: '' });
  // Clearing hides this button: return focus to the associated search field.
  searchInput?.focus({ preventScroll: true });
});
resetButtons.forEach((button) => button.addEventListener('click', () => {
  commitCatalog({ category: 'all', task: 'all', query: '' });
  // The reset control is now hidden; keep keyboard focus in the catalog.
  searchInput?.focus({ preventScroll: true });
}));
document.querySelectorAll('[data-task-remove]').forEach((button) => button.addEventListener('click', () => {
  commitCatalog({ task: 'all' });
  // Only relocate focus when the user's action removes the focused control.
  const categoryControl = categorySelect?.getClientRects().length
    ? categorySelect
    : filterButtons.find((item) => item.dataset.filterValue === activeFilters.category);
  categoryControl?.focus({ preventScroll: true });
}));

window.addEventListener('popstate', restoreCatalog);
window.addEventListener('pageshow', restoreCatalog);
window.addEventListener('pagehide', () => {
  clearTimeout(searchTimer);
  cancelAnimationFrame(imageSizeFrame);
  imageSizeFrame = 0;
  cancelAnimationFrame(catalogReleaseFrame);
  catalogReleaseFrame = 0;
  catalogPointerId = null;
  pendingCatalogRender = false;
});
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-catalog-card] a')) {
    commitCatalog({}, 'replaceState');
  }
});

restoreCatalog();
