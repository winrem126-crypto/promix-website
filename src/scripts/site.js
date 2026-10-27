import { t } from '../i18n/runtime';

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
  menuButton.setAttribute('aria-label', open ? t("Закрыть меню") : t("Открыть меню"));
  cancelClosing(mobileMenu);
  mobileMenu.hidden = !open;
  mobileMenu.inert = !open;
  if (open) {
    document.body.toggleAttribute('data-menu-fullscreen', mobileMenu.offsetTop + mobileMenu.offsetHeight >= window.innerHeight - 1);
    mobileMenu.querySelector('a')?.focus({ preventScroll: true });
  } else {
    document.body.removeAttribute('data-menu-fullscreen');
    if (mobileMenu.contains(document.activeElement)) menuButton.focus({ preventScroll: true });
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

// This navigation is non-modal: leaving it keeps the natural focus order and
// removes the overlay before a control in the page can remain hidden beneath it.
document.addEventListener('focusin', (event) => {
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
const consentDenialKey = 'promix-cookie-denial-v1';
const consentVersion = 1;
let currentConsent = null;
let consentPersisted = false;
const analyticsToggle = document.querySelector('[data-analytics-toggle]');

const parseConsent = (stored) => {
  const value = JSON.parse(stored || 'null');
  return value?.version === consentVersion && value.necessary === true && typeof value.analytics === 'boolean'
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? value : null;
};

const readConsent = () => {
  consentPersisted = false;
  try {
    const denial = parseConsent(sessionStorage.getItem(consentDenialKey));
    if (denial && !denial.analytics) {
      try {
        const stored = JSON.stringify(denial);
        localStorage.setItem(consentKey, stored);
        consentPersisted = localStorage.getItem(consentKey) === stored;
      } catch {}
      return denial;
    }
  } catch {}
  try {
    const stored = localStorage.getItem(consentKey);
    const value = parseConsent(stored);
    if (!value) return null;
    localStorage.setItem(consentKey, stored);
    consentPersisted = localStorage.getItem(consentKey) === stored;
    return consentPersisted ? value : null;
  } catch { return null; }
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
  currentConsent = detail ? Object.freeze({ ...detail }) : null;
  window.dispatchEvent(new CustomEvent('promix:consent', { detail: currentConsent ? { ...currentConsent } : { necessary: true, analytics: false } }));
  if (currentConsent?.analytics) activateDeferredAnalytics();
};

const saveConsent = (analytics) => {
  const detail = { version: consentVersion, necessary: true, analytics: analytics === true, updatedAt: new Date().toISOString() };
  const stored = JSON.stringify(detail);
  consentPersisted = false;
  try {
    localStorage.setItem(consentKey, stored);
    consentPersisted = localStorage.getItem(consentKey) === stored;
  } catch {}
  if (!consentPersisted) {
    try { localStorage.removeItem(consentKey); } catch {}
  }
  if (!detail.analytics || !consentPersisted) {
    const denial = JSON.stringify({ ...detail, analytics: false });
    try { sessionStorage.setItem(consentDenialKey, denial); } catch {}
  } else {
    try {
      sessionStorage.removeItem(consentDenialKey);
      consentPersisted = sessionStorage.getItem(consentDenialKey) === null;
    } catch { consentPersisted = false; }
  }
  document.querySelectorAll('[data-cookie-status]').forEach((status) => {
    status.textContent = consentPersisted ? '' : t("Выбор действует на этой странице. Браузер не позволяет сохранить настройки; при следующем открытии потребуется новый выбор.");
    status.hidden = consentPersisted;
  });
  if (cookieBanner && !cookieBanner.hidden) {
    cookieBanner.inert = true;
    hideSurface(cookieBanner, () => { cookieBanner.hidden = true; });
  }
  closeDialog(cookieModal);
  publishConsent(detail);
};

const openCookieSettings = (opener) => {
  if (analyticsToggle) analyticsToggle.checked = currentConsent?.analytics === true;
  openDialog(cookieModal, opener);
};

window.promixConsent = {
  get: () => currentConsent ? { ...currentConsent, persisted: consentPersisted } : null,
  has: (category) => category === 'necessary' || category === 'analytics' && currentConsent?.analytics === true,
  openSettings: () => openCookieSettings(document.activeElement),
};

const initialConsent = readConsent();
if (!initialConsent && cookieBanner) showSurface(cookieBanner);
publishConsent(initialConsent);

window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  const restoredConsent = readConsent();
  publishConsent(restoredConsent);
  if (!restoredConsent && cookieBanner) showSurface(cookieBanner);
});

document.querySelectorAll('[data-cookie-accept], [data-cookie-accept-all]').forEach((button) => button.addEventListener('click', () => saveConsent(true)));
document.querySelectorAll('[data-cookie-reject], [data-cookie-necessary]').forEach((button) => button.addEventListener('click', () => saveConsent(false)));
document.querySelectorAll('[data-cookie-settings]').forEach((button) => button.addEventListener('click', (event) => openCookieSettings(event.currentTarget)));
document.querySelector('[data-cookie-save]')?.addEventListener('click', () => saveConsent(Boolean(analyticsToggle?.checked)));

const setConsultationValue = (name, value = '') => {
  const input = consultationForm?.elements.namedItem(name);
  if (input) input.value = value;
};

const consultationFields = ['name', 'phone', 'city', 'message', 'consent'];
const consultationFieldMessages = {
  name: t("Укажите имя: не более 120 символов, без переносов строк."),
  phone: t("Укажите телефон: от 7 до 15 цифр. Допустимы +, скобки, пробелы, точка и дефис; не более 40 символов."),
  city: t("Укажите город: не более 120 символов, без переносов строк."),
  message: t("Сократите комментарий до 3000 символов."),
  consent: t("Необходимо согласие на обработку персональных данных."),
};
const normalizeConsultationText = (value) => value.replace(/\0/g, '').trim();
const getConsultationFieldError = (field) => {
  if (field.name === 'consent') return field.checked ? '' : consultationFieldMessages.consent;
  const value = normalizeConsultationText(field.value);
  const length = [...value].length;
  if (field.name === 'name') {
    if (!value) return t("Введите имя.");
    if (length > 120 || /[\r\n]/.test(value)) return consultationFieldMessages.name;
  } else if (field.name === 'phone') {
    const digits = value.replace(/[^0-9]/g, '');
    // Match LeadValidator: 7–15 digits, a maximum of 40 characters and the same allowed punctuation.
    if (length > 40 || digits.length < 7 || digits.length > 15 || /[\r\n]/.test(value) || !/^[0-9+() \t\f\v.-]+$/.test(value)) return consultationFieldMessages.phone;
  } else if (field.name === 'city') {
    // Keep the existing required city field; the backend also limits its length and line breaks.
    if (!value) return t("Введите город.");
    if (length > 120 || /[\r\n]/.test(value)) return consultationFieldMessages.city;
  } else if (field.name === 'message' && length > 3000) return consultationFieldMessages.message;
  return '';
};
const setConsultationFieldError = (form, name, message = '') => {
  const field = form.elements.namedItem(name);
  const error = form.querySelector(`[data-field-error="${name}"]`);
  if (!field || !error) return;
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  error.textContent = message;
  error.hidden = !message;
};
const clearConsultationErrors = (form) => {
  consultationFields.forEach((name) => setConsultationFieldError(form, name));
};
const showConsultationValidation = (form, names) => {
  const status = form.querySelector('.form-status');
  status.textContent = t("Проверьте отмеченные поля.");
  status.dataset.state = 'validation';
  status.hidden = false;
  // Use document order even if the server returns its field names in a different order.
  const first = consultationFields.find((name) => names.includes(name));
  form.elements.namedItem(first)?.focus();
};
if (consultationForm) {
  // Native required validation remains available without JavaScript. With JS, errors are inline and linked to each field.
  consultationForm.noValidate = true;
  const refreshFieldError = (event) => {
    const field = event.target;
    if (!consultationFields.includes(field.name)) return;
    if (consultationSubmit?.textContent === t("Проверить отправку") && !consultationSubmit.disabled) consultationSubmit.innerHTML = consultationSubmitIdleHtml;
    if (field.getAttribute('aria-invalid') !== 'true') return;
    setConsultationFieldError(consultationForm, field.name, getConsultationFieldError(field));
    if (!consultationForm.querySelector('[aria-invalid="true"]')) {
      const status = consultationForm.querySelector('.form-status');
      if (status.dataset.state === 'validation') {
        status.hidden = true;
        status.textContent = '';
        delete status.dataset.state;
      }
    }
  };
  consultationForm.addEventListener('input', refreshFieldError);
  consultationForm.addEventListener('change', refreshFieldError);
}

const prepareConsultation = (button) => {
  const context = button.dataset.formContext || 'general';
  const product = button.dataset.productName || '';
  const productSlug = button.dataset.productSlug || '';
  const sourcePage = location.pathname;
  const source = context === 'partnership' ? 'partnership' : context === 'header' ? 'header' : context === 'catalog-empty' ? 'catalog' : sourcePage;
  const copy = {
    partnership: [t("Для B2B"), t("Стать партнёром PROMIX")],
    'product-consultation': [t("Консультация по продукту"), product ? t("Консультация по {product}", { product }) : t("Консультация по продукции")],
    'product-support': [t("Применение материала"), product ? t("Обсудить применение {product}", { product }) : t("Обсудить применение материала")],
    header: [t("Консультация"), t("Расскажите о проекте")],
    'catalog-empty': [t("Подбор материала"), t("Поможем подобрать материал")],
    general: [t("Консультация"), t("Расскажите о проекте")],
  }[context] || [t("Консультация"), t("Расскажите о проекте")];

  if (consultationLabel) consultationLabel.textContent = copy[0];
  if (consultationTitle) consultationTitle.textContent = button.dataset.formTitle || copy[1];
  if (button.dataset.formMessage) setConsultationValue('message', button.dataset.formMessage);
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
      if (form) clearConsultationErrors(form);
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

// Latest tagged entry in this tab, for 30 minutes. Attribution requires analytics consent.
const attributionKey = 'promix-lead-attribution-v1';
const attributionLifetime = 30 * 60 * 1000;
const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
let attribution = null;
let attributionHydrated = false;
let attributionTimer;
const safeUtm = (value) => {
  const text = normalizeConsultationText(typeof value === 'string' ? value : '');
  // Campaign labels only: reject control characters, URLs, emails and phone-shaped values.
  return [...text].length <= 255 && !/[\x00-\x1f\x7f@]|https?:\/\/|(?:\+?\d[\s().-]*){7}/i.test(text) ? text : '';
};
const applyAttribution = (capture = false) => {
  clearTimeout(attributionTimer);
  attributionTimer = undefined;
  if (!currentConsent?.analytics) {
    attribution = null;
    attributionHydrated = true;
  } else {
    if (!attributionHydrated) {
      try { attribution = JSON.parse(sessionStorage.getItem(attributionKey) || 'null'); } catch {}
      attributionHydrated = true;
    }
    if (!attribution || attribution.consentUpdatedAt !== currentConsent.updatedAt || !Number.isFinite(attribution.expiresAt)
      || attribution.expiresAt <= Date.now() || attribution.expiresAt > Date.now() + attributionLifetime) attribution = null;
    const params = new URLSearchParams(location.search);
    if (capture && utmKeys.some((key) => params.has(key))) {
      attribution = { expiresAt: Date.now() + attributionLifetime, consentUpdatedAt: currentConsent.updatedAt, values: Object.fromEntries(utmKeys.map((key) => [key, safeUtm(params.get(key))])) };
      try { sessionStorage.setItem(attributionKey, JSON.stringify(attribution)); } catch {}
    }
  }
  if (!attribution) {
    try { sessionStorage.removeItem(attributionKey); } catch {}
  } else {
    attributionTimer = window.setTimeout(() => applyAttribution(false), Math.max(0, attribution.expiresAt - Date.now()));
  }
  utmKeys.forEach((key) => setConsultationValue(key, currentConsent?.analytics ? safeUtm(attribution?.values?.[key]) : ''));
};
applyAttribution(performance.getEntriesByType('navigation')[0]?.type !== 'back_forward');
window.addEventListener('promix:consent', () => applyAttribution(true));
window.addEventListener('pageshow', () => applyAttribution(false));
window.addEventListener('pagehide', () => { clearTimeout(attributionTimer); attributionTimer = undefined; });

import { advanceSubmissionState, createSubmissionHistory } from './lead-submissions';

const { identifySubmission, refreshSubmissionAttempts, saveSubmissionAttempts } = createSubmissionHistory();

consultationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('.form-status');
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  clearConsultationErrors(form);
  const invalidFields = consultationFields.filter((name) => {
    const message = getConsultationFieldError(form.elements.namedItem(name));
    setConsultationFieldError(form, name, message);
    return Boolean(message);
  });
  if (invalidFields.length) {
    showConsultationValidation(form, invalidFields);
    return;
  }

  applyAttribution(false);
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  ['name', 'phone', 'city', 'message'].forEach((name) => { payload[name] = normalizeConsultationText(payload[name]); });
  payload.consent = formData.get('consent') === 'true';

  submit.disabled = true;
  submit.textContent = t("Отправляем…");
  status.hidden = true;
  status.textContent = '';
  delete status.dataset.state;

  const controller = new AbortController();
  formRequest = controller;
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  let attempt;
  let previousState;
  let responseStatus;
  let requestStarted = false;
  let outcomeHandled = false;

  try {
    attempt = await identifySubmission(payload, controller.signal);
    if (formRequest !== controller) return;
    if (!attempt || controller.signal.aborted) throw new Error('Lead preparation cancelled');
    payload.submissionId = attempt.id;
    previousState = attempt.state;
    attempt.state = 'pending';
    if (!saveSubmissionAttempts()) {
      attempt.state = previousState;
      throw new Error('submission-persistence-unavailable');
    }
    requestStarted = true;
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    responseStatus = response.status;
    const result = await response.json().catch(() => null);
    if (formRequest !== controller) return;
    const outcome = result?.state === 'accepted' && response.ok && result?.ok === true && result?.submissionId === payload.submissionId ? 'accepted'
      : ['pending', 'unknown', 'rejected'].includes(result?.state) ? result.state
      : response.status === 422 || response.status === 429 ? 'rejected' : 'unknown';
    attempt.state = advanceSubmissionState(previousState, outcome);
    outcomeHandled = true;
    saveSubmissionAttempts();
    // The existing PHP 422 contract returns field names, not a map of error messages.
    if (response.status === 422 && result?.ok === false && Array.isArray(result.fields)) {
      const fields = consultationFields.filter((name) => result.fields.includes(name));
      if (fields.length) {
        fields.forEach((name) => setConsultationFieldError(form, name, getConsultationFieldError(form.elements.namedItem(name)) || consultationFieldMessages[name]));
        showConsultationValidation(form, fields);
        submit.disabled = false;
        submit.innerHTML = consultationSubmitIdleHtml;
        return;
      }
    }
    if (!response.ok || result?.ok !== true || result?.state !== 'accepted' || result?.submissionId !== payload.submissionId) throw new Error('Lead request was not accepted');

    status.textContent = t("Спасибо. Заявка отправлена. Мы свяжемся с вами.");
    submit.textContent = t("Запрос отправлен");
    status.dataset.state = 'success';
    status.hidden = false;
    form.querySelectorAll('input:not([type="hidden"]), textarea').forEach((field) => { field.disabled = true; });
    refreshSubmissionAttempts();
    const publishSuccess = !attempt.eventSent;
    attempt.eventSent = true;
    const eventRecorded = saveSubmissionAttempts();
    if (publishSuccess && eventRecorded) window.dispatchEvent(new CustomEvent('promix:lead-success', {
      detail: {
        leadType: payload.leadType,
        product: payload.product,
        productSlug: payload.productSlug,
        sourcePage: payload.sourcePage,
        submissionId: result.submissionId,
      },
    }));
    if (!eventRecorded) attempt.eventSent = false;
  } catch (error) {
    if (attempt && requestStarted && !outcomeHandled) {
      attempt.state = advanceSubmissionState(previousState, 'unknown');
      saveSubmissionAttempts();
    }
    if (formRequest !== controller) return;
    status.textContent = error?.message === 'submission-persistence-unavailable'
      ? t("В этом браузере не удалось подготовить заявку. Отправка не начата. Позвоните нам или попробуйте другой браузер.")
      : responseStatus === 429
        ? t("Слишком много обращений. Подождите немного и повторите отправку или позвоните нам.")
      : attempt?.state === 'accepted'
        ? t("Эта заявка уже была подтверждена ранее. Повторную проверку выполнить не удалось. При необходимости свяжитесь с нами по телефону.")
      : attempt?.state === 'pending'
        ? t("Заявка ещё обрабатывается. Проверьте отправку чуть позже. Повтор без изменения полей не создаст новую заявку.")
      : controller.signal.aborted
        ? t("Сервер не ответил вовремя. Повторите отправку без изменения полей, чтобы проверить ту же заявку, или измените данные для нового запроса.")
      : attempt?.state === 'unknown'
        ? t("Не удалось подтвердить отправку. Повтор без изменения полей проверит ту же заявку. Вы также можете изменить данные для нового запроса или позвонить нам.")
        : t("Заявка не принята. Проверьте поля, попробуйте позже или свяжитесь с нами по телефону.");
    status.dataset.state = 'error';
    status.hidden = false;
    submit.disabled = false;
    submit.innerHTML = consultationSubmitIdleHtml;
    if (['pending', 'unknown'].includes(attempt?.state)) submit.textContent = t("Проверить отправку");
  } finally {
    window.clearTimeout(timeout);
    if (formRequest === controller) formRequest = undefined;
  }
});

const revealTargets = [...document.querySelectorAll('[data-motion-reveal], .reveal')];
const desktopReveal = window.matchMedia('(min-width: 1101px) and (hover: hover) and (pointer: fine)');
if ('IntersectionObserver' in window && !reducedMotion.matches && desktopReveal.matches) {
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
    // Late script execution must never hide a heading already on screen.
    if (node.getBoundingClientRect().top < window.innerHeight) {
      node.classList.add('is-visible');
      return;
    }
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
