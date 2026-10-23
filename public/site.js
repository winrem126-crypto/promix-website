const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('#mobile-menu');
const cookieBanner = document.querySelector('[data-cookie-banner]');
const cookieModal = document.querySelector('[data-cookie-modal]');
const consultationModal = document.querySelector('[data-consultation-modal]');
const consultationForm = document.querySelector('[data-consult-form]');
const consultationLabel = consultationForm?.querySelector('[data-form-label]');
const consultationTitle = consultationForm?.querySelector('[data-form-title]');
const consultationSubmit = consultationForm?.querySelector('button[type="submit"]');
const consultationSubmitIdleHtml = consultationSubmit?.innerHTML || '';
let formRequest;
const dialogOpeners = new WeakMap();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');
const closingTransitions = new Map();

// Touch browsers do not consistently expose :active while a finger is down.
// This is press feedback only: never intercept a tap, drag or navigation.
const pressedControls = new Map();
const releasePress = (event) => {
  pressedControls.get(event.pointerId)?.removeAttribute('data-pressed');
  pressedControls.delete(event.pointerId);
};
const releaseAllPresses = () => {
  pressedControls.forEach((control) => control.removeAttribute('data-pressed'));
  pressedControls.clear();
};
document.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) return;
  const control = event.target.closest?.('.button, .header-consult, .home-hero__cta, .home-partners__cta, .mobile-menu button');
  if (!control || control.matches(':disabled')) return;
  control.setAttribute('data-pressed', '');
  pressedControls.set(event.pointerId, control);
}, { passive: true });
document.addEventListener('pointerup', releasePress, { passive: true });
document.addEventListener('pointercancel', releasePress, { passive: true });
window.addEventListener('blur', releaseAllPresses);
window.addEventListener('pagehide', releaseAllPresses);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllPresses(); });

const cancelClosing = (element) => closingTransitions.get(element)?.cancel();
const showSurface = (element) => {
  cancelClosing(element);
  element.hidden = false;
  element.inert = false;
  // Establish the starting style once, without a frame loop or interaction delay.
  if (!reducedMotion.matches) void element.offsetWidth;
  element.dataset.motionState = 'open';
};
const hideSurface = (element, finish) => {
  if (closingTransitions.has(element)) return;
  element.dataset.motionState = 'closing';
  if (reducedMotion.matches) { finish(); return; }
  let timer;
  const cancel = () => {
    clearTimeout(timer);
    element.removeEventListener('transitionend', onEnd);
    closingTransitions.delete(element);
  };
  const complete = () => { cancel(); finish(); };
  const onEnd = (event) => {
    if (event.target === element && event.propertyName === 'opacity' && !event.pseudoElement) complete();
  };
  const duration = Math.max(...getComputedStyle(element).transitionDuration.split(',').map((value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000)));
  closingTransitions.set(element, { cancel, complete });
  element.addEventListener('transitionend', onEnd);
  // Also completes when CSS transitions are cancelled or the tab is backgrounded.
  timer = window.setTimeout(complete, duration + 50);
};
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) [...closingTransitions.values()].forEach(({ complete }) => complete());
});

const setMobileMenu = (open) => {
  if (!menuButton || !mobileMenu) return;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  if (open) {
    showSurface(mobileMenu);
    document.body.toggleAttribute('data-menu-fullscreen', mobileMenu.offsetTop + mobileMenu.offsetHeight >= window.innerHeight - 1);
    mobileMenu.querySelector('a')?.focus({ preventScroll: true });
  } else {
    document.body.removeAttribute('data-menu-fullscreen');
    if (mobileMenu.contains(document.activeElement)) menuButton.focus({ preventScroll: true });
    mobileMenu.inert = true;
    if (!mobileMenu.hidden) hideSurface(mobileMenu, () => { mobileMenu.hidden = true; });
  }
};

const openDialog = (dialog, opener) => {
  if (!dialog) return;
  if (dialog.open) { showSurface(dialog); return; }
  dialogOpeners.set(dialog, opener);
  dialog.showModal();
  showSurface(dialog);
};

const closeDialog = (dialog) => {
  if (dialog?.open) hideSurface(dialog, () => dialog.close());
};

window.addEventListener('scroll', () => header?.classList.toggle('is-scrolled', window.scrollY > 24), { passive: true });

menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  setMobileMenu(!expanded);
});

mobileMenu?.querySelectorAll('a, button').forEach((link) => link.addEventListener('click', () => {
  setMobileMenu(false);
}));

document.addEventListener('pointerdown', (event) => {
  if (menuButton?.getAttribute('aria-expanded') === 'true' && !mobileMenu?.contains(event.target) && !menuButton.contains(event.target)) setMobileMenu(false);
});

document.addEventListener('keydown', (event) => {
  const openModal = document.querySelector('dialog[open]');
  if (event.key === 'Escape' && openModal) {
    event.preventDefault();
    closeDialog(openModal);
    return;
  }
  if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
    setMobileMenu(false);
    menuButton.focus();
  }
});

window.matchMedia('(min-width: 1101px)').addEventListener('change', (event) => {
  if (event.matches) setMobileMenu(false);
});
window.addEventListener('resize', () => {
  if (menuButton?.getAttribute('aria-expanded') === 'true') {
    document.body.toggleAttribute('data-menu-fullscreen', mobileMenu.offsetTop + mobileMenu.offsetHeight >= window.innerHeight - 1);
  }
}, { passive: true });

const consentKey = 'promix-cookie-consent';
const consentVersion = 1;
const analyticsToggle = document.querySelector('[data-analytics-toggle]');

const readConsent = () => {
  try {
    const value = JSON.parse(localStorage.getItem(consentKey) || 'null');
    return value?.version === consentVersion ? value : null;
  } catch {
    return null;
  }
};

const activateDeferredAnalytics = () => {
  document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]:not([data-activated])').forEach((source) => {
    const script = document.createElement('script');
    [...source.attributes].forEach((attribute) => {
      if (!['type', 'data-consent', 'data-activated'].includes(attribute.name)) script.setAttribute(attribute.name, attribute.value);
    });
    script.textContent = source.textContent;
    source.dataset.activated = 'true';
    source.after(script);
  });
};

const publishConsent = (detail) => {
  window.dispatchEvent(new CustomEvent('promix:consent', { detail }));
  if (detail.analytics) activateDeferredAnalytics();
};

const saveConsent = (analytics) => {
  const detail = { version: consentVersion, necessary: true, analytics, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(consentKey, JSON.stringify(detail)); } catch { /* Consent remains valid for this page. */ }
  if (cookieBanner && !cookieBanner.hidden) {
    cookieBanner.inert = true;
    hideSurface(cookieBanner, () => { cookieBanner.hidden = true; });
  }
  closeDialog(cookieModal);
  publishConsent(detail);
};

const openCookieSettings = (opener) => {
  const consent = readConsent();
  if (analyticsToggle) analyticsToggle.checked = Boolean(consent?.analytics);
  openDialog(cookieModal, opener);
};

const initialConsent = readConsent();
if (!initialConsent && cookieBanner) showSurface(cookieBanner);
if (initialConsent) publishConsent(initialConsent);

window.promixConsent = {
  get: readConsent,
  has: (category) => category === 'necessary' || Boolean(readConsent()?.[category]),
  openSettings: () => openCookieSettings(document.activeElement),
};

document.querySelectorAll('[data-cookie-accept], [data-cookie-accept-all]').forEach((button) => button.addEventListener('click', () => saveConsent(true)));
document.querySelector('[data-cookie-necessary]')?.addEventListener('click', () => saveConsent(false));
document.querySelectorAll('[data-cookie-settings]').forEach((button) => button.addEventListener('click', (event) => openCookieSettings(event.currentTarget)));
document.querySelector('[data-cookie-save]')?.addEventListener('click', () => saveConsent(Boolean(analyticsToggle?.checked)));

const setConsultationValue = (name, value = '') => {
  const input = consultationForm?.elements.namedItem(name);
  if (input) input.value = value;
};

const prepareConsultation = (button) => {
  const context = button.dataset.formContext || 'general';
  const product = button.dataset.productName || '';
  const productSlug = button.dataset.productSlug || '';
  const sourcePage = location.pathname;
  const source = context === 'partnership' ? 'partnership' : context === 'header' ? 'header' : context === 'catalog-empty' ? 'catalog' : sourcePage;
  const copy = {
    partnership: ['Для B2B', 'Стать партнёром PROMIX'],
    'product-consultation': ['Консультация по продукту', product ? `Консультация по ${product}` : 'Консультация по продукции'],
    'product-support': ['Применение материала', product ? `Обсудить применение ${product}` : 'Обсудить применение материала'],
    header: ['Консультация', 'Расскажите о проекте'],
    'catalog-empty': ['Подбор материала', 'Поможем подобрать материал'],
    general: ['Консультация', 'Расскажите о проекте'],
  }[context] || ['Консультация', 'Расскажите о проекте'];

  if (consultationLabel) consultationLabel.textContent = copy[0];
  if (consultationTitle) consultationTitle.textContent = copy[1];
  setConsultationValue('product', product);
  setConsultationValue('productSlug', productSlug);
  setConsultationValue('source', source);
  setConsultationValue('sourcePage', sourcePage);
  setConsultationValue('leadType', context);
  setConsultationValue('startedAt', String(Date.now()));
};

document.querySelectorAll('[data-open-form]').forEach((button) => button.addEventListener('click', () => {
  prepareConsultation(button);
  openDialog(consultationModal, button);
}));

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[hidden], [inert]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  dialog.querySelectorAll('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => closeDialog(dialog)));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.hasAttribute?.('data-dialog-overlay')) closeDialog(dialog);
  });
  dialog.addEventListener('close', () => {
    // Native close events are queued. A reduced-motion close/reopen can finish
    // in the same task; an old event must not reset the newly opened dialog.
    if (dialog.open) return;
    cancelClosing(dialog);
    delete dialog.dataset.motionState;
    if (dialog === consultationModal) {
      formRequest?.abort();
      formRequest = undefined;
      const form = dialog.querySelector('[data-consult-form]');
      const submit = form?.querySelector('button[type="submit"]');
      const status = form?.querySelector('.form-status');
      form?.reset();
      form?.querySelectorAll('input, textarea').forEach((field) => { field.disabled = false; });
      if (submit) {
        submit.disabled = false;
        submit.innerHTML = consultationSubmitIdleHtml;
      }
      if (status) {
        status.hidden = true;
        status.textContent = '';
        delete status.dataset.state;
      }
    }
    const opener = dialogOpeners.get(dialog);
    if (opener?.closest?.('#mobile-menu') && menuButton?.getAttribute('aria-expanded') !== 'true') menuButton?.focus({ preventScroll: true });
    else if (opener?.getClientRects().length && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    else if (cookieBanner?.contains(opener)) document.querySelector('footer [data-cookie-settings]')?.focus({ preventScroll: true });
    dialogOpeners.delete(dialog);
  });
});

const layerVisual = document.querySelector('[data-system-visual]');
const layerList = document.querySelector('[data-layer-list]');
const clearLayer = () => {
  document.querySelectorAll('[data-layer]').forEach((item) => item.setAttribute('aria-pressed', 'false'));
  if (layerVisual) delete layerVisual.dataset.activeLayer;
};
document.querySelectorAll('[data-layer]').forEach((button) => {
  const activateLayer = () => {
    document.querySelectorAll('[data-layer]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    if (layerVisual) layerVisual.dataset.activeLayer = button.dataset.layer;
  };
  button.addEventListener('click', activateLayer);
  button.addEventListener('mouseenter', () => { if (fineHover.matches) activateLayer(); });
  button.addEventListener('focus', activateLayer);
});
layerList?.addEventListener('mouseleave', clearLayer);
layerList?.addEventListener('focusout', (event) => {
  if (!layerList.contains(event.relatedTarget)) clearLayer();
});

const productStories = [...document.querySelectorAll('[data-product-story]')];
const productIndexes = [...document.querySelectorAll('[data-product-index]')];
let productFrame;
const updateActiveProduct = () => {
  productFrame = undefined;
  if (!productStories.length) return;
  const viewportCenter = window.innerHeight / 2;
  const activeStory = productStories.reduce((nearest, story) => {
    const rect = story.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
    return !nearest || distance < nearest.distance ? { story, distance } : nearest;
  }, null)?.story;
  const index = activeStory?.dataset.productStory;
  if (index === undefined) return;
  document.querySelectorAll('[data-product-figure]').forEach((figure) => figure.classList.toggle('active', figure.dataset.productFigure === index));
  productIndexes.forEach((item) => {
    const isActive = item.dataset.productIndex === index;
    item.classList.toggle('active', isActive);
    if (isActive) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
};
const scheduleProductUpdate = () => {
  if (productFrame) return;
  productFrame = requestAnimationFrame(updateActiveProduct);
};
const productObserver = new IntersectionObserver(scheduleProductUpdate, { threshold: [0, .25, .5, .75, 1] });
productStories.forEach((story) => productObserver.observe(story));
productIndexes.forEach((item) => item.addEventListener('click', () => {
  const story = productStories[Number(item.dataset.productIndex)];
  story?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
}));
if (productStories.length) {
  window.addEventListener('scroll', scheduleProductUpdate, { passive: true });
  window.addEventListener('resize', scheduleProductUpdate);
}
updateActiveProduct();

const taskButtons = [...document.querySelectorAll('[data-task-select]')];
const taskPanels = [...document.querySelectorAll('[data-task-panel]')];
let taskSelectionVersion = 0;
const selectTask = async (taskId) => {
  const selectionVersion = ++taskSelectionVersion;
  const target = taskPanels.find((panel) => panel.dataset.taskPanel === taskId);
  // Decode before revealing a new photograph, including a fast first click on a slow connection.
  // The version prevents an older request from winning during rapid keyboard/click navigation.
  const image = target?.closest('[data-task-transition]') ? target.querySelector('img') : null;
  if (image && !target.classList.contains('is-active')) {
    image.loading = 'eager';
    try { await image.decode(); } catch { /* Keep the accessible description if media fails. */ }
    if (selectionVersion !== taskSelectionVersion) return;
  }
  taskButtons.forEach((button) => {
    const active = button.dataset.taskSelect === taskId;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  taskPanels.forEach((panel) => {
    const active = panel.dataset.taskPanel === taskId;
    if (panel.closest('[data-task-transition]')) {
      panel.classList.toggle('is-active', active);
      panel.setAttribute('aria-hidden', String(!active));
      panel.inert = !active;
      panel.tabIndex = active ? 0 : -1;
    } else {
      panel.hidden = !active;
    }
  });
};
taskButtons.forEach((button) => button.addEventListener('click', () => selectTask(button.dataset.taskSelect)));
taskButtons.forEach((button, index) => button.addEventListener('keydown', (event) => {
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? taskButtons.length - 1 : (index + direction + taskButtons.length) % taskButtons.length;
  const next = taskButtons[nextIndex];
  selectTask(next.dataset.taskSelect);
  next.focus();
}));
if (taskButtons.length) selectTask(taskButtons[0].dataset.taskSelect);

// Warm all four local images as the section approaches, without loading them ahead of the hero.
const taskStage = document.querySelector('[data-task-transition]');
if (taskStage) {
  const taskImageObserver = new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    taskStage.querySelectorAll('img').forEach((image) => {
      image.loading = 'eager';
      image.decode().catch(() => {});
    });
    observer.disconnect();
  }, { rootMargin: '600px' });
  taskImageObserver.observe(taskStage);
}

const taskAccordionButtons = [...document.querySelectorAll('[data-task-accordion-button]')];
const taskAccordionPanels = [...document.querySelectorAll('[data-task-accordion-panel]')];
const selectAccordionTask = (taskId) => {
  taskAccordionButtons.forEach((button) => {
    const active = button.dataset.taskAccordionButton === taskId;
    button.setAttribute('aria-expanded', String(active));
  });
  taskAccordionPanels.forEach((panel) => {
    panel.hidden = panel.dataset.taskAccordionPanel !== taskId;
  });
};
taskAccordionButtons.forEach((button) => button.addEventListener('click', () => {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  selectAccordionTask(expanded ? '' : button.dataset.taskAccordionButton);
}));
if (taskAccordionButtons.length) selectAccordionTask(taskAccordionButtons[0].dataset.taskAccordionButton);

const params = new URLSearchParams(location.search);
document.querySelector('input[name="utm_source"]')?.setAttribute('value', params.get('utm_source') || '');
document.querySelector('input[name="utm_medium"]')?.setAttribute('value', params.get('utm_medium') || '');
document.querySelector('input[name="utm_campaign"]')?.setAttribute('value', params.get('utm_campaign') || '');
document.querySelector('input[name="utm_content"]')?.setAttribute('value', params.get('utm_content') || '');
document.querySelector('input[name="utm_term"]')?.setAttribute('value', params.get('utm_term') || '');

consultationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('.form-status');
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled || !form.reportValidity()) return;

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.submissionId = crypto.randomUUID();
  payload.consent = formData.get('consent') === 'true';

  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  status.hidden = true;
  status.textContent = '';
  delete status.dataset.state;

  const controller = new AbortController();
  formRequest = controller;
  const timeout = window.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (formRequest !== controller) return;
    if (!response.ok || result?.ok !== true) throw new Error('Lead request was not accepted');

    status.textContent = 'Спасибо. Заявка отправлена. Мы свяжемся с вами.';
    submit.textContent = 'Запрос отправлен';
    status.dataset.state = 'success';
    status.hidden = false;
    form.querySelectorAll('input:not([type="hidden"]), textarea').forEach((field) => { field.disabled = true; });
    window.dispatchEvent(new CustomEvent('promix:lead-success', {
      detail: {
        leadType: payload.leadType,
        product: payload.product,
        productSlug: payload.productSlug,
        sourcePage: payload.sourcePage,
        submissionId: result.submissionId,
      },
    }));
  } catch {
    if (formRequest !== controller) return;
    status.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз или свяжитесь с нами по телефону.';
    status.dataset.state = 'error';
    status.hidden = false;
    submit.disabled = false;
    submit.innerHTML = consultationSubmitIdleHtml;
  } finally {
    window.clearTimeout(timeout);
    if (formRequest === controller) formRequest = undefined;
  }
});

const revealTargets = [...document.querySelectorAll('[data-motion-reveal], .reveal')];
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const node = entry.target;
    node.classList.remove('motion-pending');
    node.classList.add('is-visible', 'motion-visible');
    node.addEventListener('animationend', () => node.classList.remove('motion-visible'), { once: true });
    observer.unobserve(node);
  }), { threshold: 0.14 });
  revealTargets.forEach((node) => {
    node.setAttribute('data-motion-reveal', node.getAttribute('data-motion-reveal') || 'section');
    node.classList.add('motion-pending');
    observer.observe(node);
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    observer.disconnect();
    revealTargets.forEach((node) => node.classList.remove('motion-pending', 'motion-visible'));
  });
}

document.addEventListener('click', (event) => {
  const card = event.target.closest?.('.product-card[data-product-href]');
  if (!card || event.target.closest('a, button, input, select, textarea')) return;
  window.location.assign(card.dataset.productHref);
});
