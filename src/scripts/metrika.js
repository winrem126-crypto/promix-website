(() => {
  if (window.promixMetrika) return;
  const COUNTER_ID = 111350754;
  const PRODUCTION_HOSTS = new Set(['pro-mix.ru', 'www.pro-mix.ru']);
  const METRIKA_SCRIPT = 'https://mc.yandex.ru/metrika/tag.js';
  const isProduction = PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase());
  const isDebug = !isProduction;
  let initialized = false;
  let debugPageviewSent = false;
  let scriptLoaded = false;
  let consentGeneration = 0;
  let scriptPromise;
  let cancelScriptLoad;
  let initializationPromise;

  const hasAnalyticsConsent = () => {
    try { return window.promixConsent?.has?.('analytics') === true; } catch { return false; }
  };
  const normalizeContext = (context = {}) => ({
    ...(context.productName ? { productName: context.productName } : {}),
    ...(context.productSlug ? { productSlug: context.productSlug } : {}),
    sourcePage: context.sourcePage || `${window.location.pathname}${window.location.search}`,
  });

  const debugLog = (eventName, context = {}) => {
    if (isDebug) console.info(`[Metrika debug] ${eventName}`, JSON.stringify(context));
  };

  const loadScript = () => {
    if (!isProduction || !hasAnalyticsConsent()) return Promise.resolve(false);
    if (scriptLoaded) return Promise.resolve(true);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${METRIKA_SCRIPT}"]`);
      const script = existing || document.createElement('script');
      const cleanup = () => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
        if (cancelScriptLoad === cancel) cancelScriptLoad = undefined;
      };
      const onLoad = () => {
        scriptLoaded = true;
        script.dataset.promixMetrikaLoaded = 'true';
        cleanup();
        resolve(true);
      };
      const onError = (error) => {
        cleanup();
        script.remove();
        scriptPromise = undefined;
        reject(error);
      };
      const cancel = () => {
        cleanup();
        script.remove();
        scriptPromise = undefined;
        resolve(false);
      };
      cancelScriptLoad = cancel;
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (existing) {
        if (script.dataset.promixMetrikaLoaded === 'true') onLoad();
      } else {
        window.ym = window.ym || function (...args) { (window.ym.a = window.ym.a || []).push(args); };
        window.ym.l = Date.now();
        script.async = true;
        script.src = METRIKA_SCRIPT;
        script.dataset.promixMetrika = String(COUNTER_ID);
        document.head.append(script);
      }
    });
    return scriptPromise;
  };

  const initialize = () => {
    if (!hasAnalyticsConsent()) return Promise.resolve(false);
    if (!isProduction) {
      if (!debugPageviewSent) {
        debugLog('pageview', { sourcePage: `${location.pathname}${location.search}` });
        debugPageviewSent = true;
      }
      return Promise.resolve(false);
    }
    if (initialized) return Promise.resolve(true);
    if (initializationPromise) return initializationPromise;

    const generation = consentGeneration;
    const pending = (async () => {
      try {
        const ready = await loadScript();
        if (!ready || generation !== consentGeneration || !hasAnalyticsConsent() || typeof window.ym !== 'function') return false;
        window.ym(COUNTER_ID, 'init', {
          clickmap: true,
          trackLinks: true,
          accurateTrackBounce: true,
          webvisor: true,
        });
        initialized = true;
        return true;
      } catch (error) {
        console.error('[Metrika] Не удалось загрузить счётчик', error);
        return false;
      } finally {
        if (initializationPromise === pending) initializationPromise = undefined;
      }
    })();
    initializationPromise = pending;
    return pending;
  };

  const disable = () => {
    consentGeneration += 1;
    cancelScriptLoad?.();
    initializationPromise = undefined;
    if (isProduction && initialized && typeof window.ym === 'function') {
      try { window.ym(COUNTER_ID, 'destruct'); } catch {}
    }
    initialized = false;
    debugPageviewSent = false;
    if (isDebug) console.info('[Metrika debug] analytics_disabled');
  };

  const track = (eventName, context = {}) => {
    if (!hasAnalyticsConsent()) {
      if (isDebug) console.info(`[Metrika debug] blocked_without_consent: ${eventName}`);
      return false;
    }

    const payload = normalizeContext(context);
    const generation = consentGeneration;
    if (!isProduction) {
      debugLog(eventName, payload);
      return true;
    }

    if (!initialized || typeof window.ym !== 'function') {
      initialize().then((ready) => {
        if (ready && generation === consentGeneration && initialized && hasAnalyticsConsent() && typeof window.ym === 'function') window.ym(COUNTER_ID, 'reachGoal', eventName, payload);
      });
      return true;
    }
    window.ym(COUNTER_ID, 'reachGoal', eventName, payload);
    return true;
  };

  const events = {
    consultationSubmit: (context) => track('consultation_submit', context),
    partnerSubmit: (context) => track('partner_submit', context),
    whereToBuySubmit: (context) => track('where_to_buy_submit', context),
    phoneClick: (context) => track('phone_click', context),
    emailClick: (context) => track('email_click', context),
  };

  window.promixMetrika = {
    counterId: COUNTER_ID,
    initialize,
    track,
    events,
    getState: () => ({
      counterId: COUNTER_ID,
      hostname: window.location.hostname,
      production: isProduction,
      consent: hasAnalyticsConsent(),
      initialized,
      scriptLoaded,
    }),
  };

  window.addEventListener('promix:consent', () => {
    if (hasAnalyticsConsent()) initialize();
    else disable();
  });

  // Conversion events are accepted only from a confirmed-success signal emitted by the form transport.
  window.addEventListener('promix:lead-success', (event) => {
    const detail = event.detail || {};
    const context = {
      productName: detail.productName || detail.product || '',
      productSlug: detail.productSlug || '',
      sourcePage: detail.sourcePage || detail.source || '',
    };
    if (detail.leadType === 'partnership') events.partnerSubmit(context);
    else if (detail.leadType === 'where-to-buy') events.whereToBuySubmit(context);
    else events.consultationSubmit(context);
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    if (link.href.startsWith('tel:')) events.phoneClick();
    if (link.href.startsWith('mailto:')) events.emailClick();
  });

  if (hasAnalyticsConsent()) initialize();
})();
