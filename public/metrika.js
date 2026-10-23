(() => {
  const COUNTER_ID = 111350754;
  const PRODUCTION_HOSTS = new Set(['pro-mix.ru', 'www.pro-mix.ru']);
  const METRIKA_SCRIPT = 'https://mc.yandex.ru/metrika/tag.js';
  const isProduction = PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase());
  const isDebug = !isProduction;
  let initialized = false;
  let debugPageviewSent = false;
  let scriptPromise;
  let initializationPromise;

  const hasAnalyticsConsent = () => Boolean(window.promixConsent?.has?.('analytics'));
  const normalizeContext = (context = {}) => ({
    ...(context.productName ? { productName: context.productName } : {}),
    ...(context.productSlug ? { productSlug: context.productSlug } : {}),
    sourcePage: context.sourcePage || `${window.location.pathname}${window.location.search}`,
  });

  const debugLog = (eventName, context = {}) => {
    if (isDebug) console.info(`[Metrika debug] ${eventName}`, JSON.stringify(context));
  };

  const loadScript = () => {
    if (!isProduction) return Promise.resolve(false);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${METRIKA_SCRIPT}"]`);
      if (existing) {
        if (typeof window.ym === 'function') resolve(true);
        else {
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', reject, { once: true });
        }
        return;
      }

      window.ym = window.ym || function (...args) { (window.ym.a = window.ym.a || []).push(args); };
      window.ym.l = Date.now();
      const script = document.createElement('script');
      script.async = true;
      script.src = METRIKA_SCRIPT;
      script.dataset.promixMetrika = String(COUNTER_ID);
      script.addEventListener('load', () => resolve(true), { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.append(script);
    });
    return scriptPromise;
  };

  const initialize = async () => {
    if (!hasAnalyticsConsent()) return false;
    if (!isProduction) {
      if (!debugPageviewSent) {
        debugLog('pageview', { sourcePage: `${location.pathname}${location.search}` });
        debugPageviewSent = true;
      }
      return false;
    }
    if (initialized) return true;
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      try {
        await loadScript();
        // Consent may have been withdrawn while the network request was pending.
        if (!hasAnalyticsConsent()) return false;
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
        initializationPromise = undefined;
      }
    })();
    return initializationPromise;
  };

  const disable = () => {
    if (isProduction && initialized && typeof window.ym === 'function') {
      window.ym(COUNTER_ID, 'destruct');
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
    if (!isProduction) {
      debugLog(eventName, payload);
      return true;
    }

    if (!initialized || typeof window.ym !== 'function') {
      initialize().then((ready) => {
        if (ready && hasAnalyticsConsent()) window.ym(COUNTER_ID, 'reachGoal', eventName, payload);
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
      scriptLoaded: Boolean(document.querySelector(`script[src="${METRIKA_SCRIPT}"]`)),
    }),
  };

  window.addEventListener('promix:consent', (event) => {
    if (event.detail?.analytics) initialize();
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
