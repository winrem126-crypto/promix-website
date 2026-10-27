import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');
const origin = 'https://pro-mix.ru';
const consentKey = 'promix-cookie-consent';
const attributionKey = 'promix-lead-attribution-v1';
const grant = { version: 1, necessary: true, analytics: true, updatedAt: '2026-10-26T10:00:00.000Z' };
const sourceRoot = new URL('../src/scripts/', import.meta.url);
let browser;
let runtimeModule;

before(async () => {
  runtimeModule = transpileModule(await readFile(new URL('../src/i18n/runtime.ts', import.meta.url), 'utf8'), {
    fileName: 'runtime.ts',
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

after(async () => { await browser?.close(); });

const fixture = (order, storageMode) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Consent regression</title><script>window.testStorageMode = ${JSON.stringify(storageMode)};</script><style>[hidden]{display:none!important}dialog{transition:none}</style></head><body>
  <div data-cookie-banner hidden><button data-cookie-accept>Разрешить</button><button data-cookie-reject>Отклонить</button><button data-cookie-settings>Настроить</button></div>
  <dialog data-cookie-modal><input type="checkbox" data-analytics-toggle><button type="button" data-cookie-save>Сохранить</button><p data-cookie-status hidden></p></dialog>
  <p data-cookie-status hidden></p><button data-cookie-settings id="settings">Настройки cookie</button>
  <a href="tel:+78422229042" id="phone">Телефон</a>
  <form data-consult-form action="/api/lead.php"><input name="name"><input name="phone"><input name="city"><textarea name="message"></textarea><input type="checkbox" name="consent"><input type="hidden" name="utm_source"><input type="hidden" name="utm_medium"><input type="hidden" name="utm_campaign"><input type="hidden" name="utm_content"><input type="hidden" name="utm_term"><button type="submit">Отправить</button><p class="form-status" hidden></p></form>
  <script type="module">try { ${order.map((name) => `await import('/scripts/${name}.js');`).join('')}window.testScriptsReady = true; } catch (error) { window.testBootstrapError = error.stack; }</script>
</body></html>`;

const mockMetrika = `window.testMetrikaCommands = window.testMetrikaCommands || []; window.ym = (...args) => { window.testMetrikaCommands.push(args); if (args[1] === 'init' || args[1] === 'reachGoal') fetch('https://mc.yandex.ru/watch/mock', { method: 'POST', body: args[1] }); };`;

const openSession = async (scope, { storedConsent, storageMode = 'normal', order = ['metrika', 'site'], path = '/', delayTag = false, seedAttribution } = {}) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    storageState: { cookies: [], origins: [{ origin, localStorage: storedConsent === undefined ? [] : [{ name: consentKey, value: JSON.stringify(storedConsent) }] }] },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const optionalRequests = [];
  const errors = [];
  let releaseTag;
  const tagGate = new Promise((resolve) => { releaseTag = resolve; });
  page.on('pageerror', (error) => errors.push(error.message));
  await context.addInitScript(({ mode, attribution, key }) => {
    const local = window.localStorage;
    const session = window.sessionStorage;
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    window.testStorageMode = mode;
    window.testRawConsent = () => getItem.call(local, 'promix-cookie-consent');
    if (attribution && !getItem.call(session, 'test-attribution-seeded')) {
      setItem.call(session, key, JSON.stringify(attribution));
      setItem.call(session, 'test-attribution-seeded', '1');
    }
    for (const [name, storage] of [['localStorage', local], ['sessionStorage', session]]) {
      Object.defineProperty(window, name, { configurable: true, get() {
        if (window.testStorageMode === 'getters') throw new DOMException('Storage is blocked', 'SecurityError');
        return storage;
      } });
    }
    Storage.prototype.getItem = function (...args) {
      if (window.testStorageMode === 'all') throw new DOMException('Storage is blocked', 'SecurityError');
      return getItem.apply(this, args);
    };
    Storage.prototype.setItem = function (...args) {
      if (['all', 'writes', 'set-only'].includes(window.testStorageMode) || this === local && window.testStorageMode === 'local-writes') throw new DOMException('Storage is blocked', 'QuotaExceededError');
      return setItem.apply(this, args);
    };
    Storage.prototype.removeItem = function (...args) {
      if (['all', 'writes'].includes(window.testStorageMode) || this === local && window.testStorageMode === 'local-writes') throw new DOMException('Storage is blocked', 'SecurityError');
      return removeItem.apply(this, args);
    };
  }, { mode: storageMode, attribution: seedAttribution, key: attributionKey });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ['/i18n/runtime', '/i18n/runtime.js', '/i18n/runtime.ts'].includes(url.pathname)) {
      await route.fulfill({ contentType: 'text/javascript', body: runtimeModule });
    } else if (url.origin === origin && url.pathname.startsWith('/scripts/')) {
      const name = url.pathname.split('/').at(-1);
      await route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(name.endsWith('.js') ? name : `${name}.js`, sourceRoot), 'utf8') });
    } else if (url.origin === origin) {
      await route.fulfill({ contentType: 'text/html', body: fixture(order, storageMode) });
    } else if (url.href === 'https://mc.yandex.ru/metrika/tag.js') {
      optionalRequests.push(url.href);
      if (delayTag) await tagGate;
      try { await route.fulfill({ contentType: 'text/javascript', body: mockMetrika }); } catch {}
    } else if (url.origin === 'https://mc.yandex.ru' && url.pathname === '/watch/mock') {
      optionalRequests.push(url.href);
      await route.fulfill({ status: 204 });
    } else {
      optionalRequests.push(url.href);
      await route.abort();
    }
  });
  scope.after(async () => {
    releaseTag();
    await context.close();
    assert.deepEqual(errors, []);
  });
  const ready = async () => {
    await page.waitForFunction(() => window.testScriptsReady === true || window.testBootstrapError, undefined, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.testBootstrapError), undefined);
  };
  const navigate = async (destination) => { await page.goto(origin + destination); await ready(); };
  await navigate(path);
  const setStorageMode = async (mode) => {
    storageMode = mode;
    await page.evaluate((value) => { window.testStorageMode = value; }, mode);
  };
  return { page, optionalRequests, navigate, ready, releaseTag, setStorageMode };
};

const state = (page) => page.evaluate(() => ({
  consent: window.promixConsent.get(),
  allowed: window.promixConsent.has('analytics'),
  metrika: window.promixMetrika.getState(),
  commands: window.testMetrikaCommands || [],
  utmSource: document.querySelector('[name="utm_source"]').value,
}));

const commandCount = (snapshot, command) => snapshot.commands.filter((entry) => entry[1] === command).length;
const waitInitialized = (page) => page.waitForFunction(() => window.promixMetrika.getState().initialized);
const saveChoice = async (page, analytics) => {
  await page.locator('#settings').click();
  await page.locator('[data-analytics-toggle]').setChecked(analytics);
  await page.locator('[data-cookie-save]').click();
};

for (const order of [['metrika', 'site'], ['site', 'metrika']]) {
  test(`first visit, rejection, reload and navigation: ${order.join(' → ')}`, async (scope) => {
    const session = await openSession(scope, { order, path: '/?utm_source=campaign' });
    assert.equal((await state(session.page)).allowed, false);
    assert.deepEqual(session.optionalRequests, []);
    await session.page.locator('[data-cookie-reject]').click();
    assert.equal((await state(session.page)).consent.analytics, false);
    assert.equal((await state(session.page)).utmSource, '');
    await session.page.reload();
    await session.ready();
    await session.navigate('/products/');
    assert.equal((await state(session.page)).allowed, false);
    assert.deepEqual(session.optionalRequests, []);
  });

  test(`returning grant initializes once automatically: ${order.join(' → ')}`, async (scope) => {
    const session = await openSession(scope, { order, storedConsent: grant });
    await waitInitialized(session.page);
    await session.page.evaluate(async () => {
      await Promise.all(Array.from({ length: 8 }, () => window.promixMetrika.initialize()));
      await import('/scripts/metrika.js?duplicate=1');
    });
    assert.equal(commandCount(await state(session.page), 'init'), 1);
    await session.page.reload();
    await session.ready();
    await waitInitialized(session.page);
    assert.equal(commandCount(await state(session.page), 'init'), 1);
    await session.navigate('/products/');
    await waitInitialized(session.page);
    assert.equal(commandCount(await state(session.page), 'init'), 1);
    assert.equal(session.optionalRequests.filter((url) => url.endsWith('/tag.js')).length, 3);
  });
}

test('grant, withdrawal and regrant stop goals and clear attribution', async (scope) => {
  const session = await openSession(scope, { path: '/?utm_source=campaign' });
  assert.deepEqual(session.optionalRequests, []);
  await session.page.locator('[data-cookie-accept]').click();
  await waitInitialized(session.page);
  assert.equal((await state(session.page)).utmSource, 'campaign');
  await saveChoice(session.page, false);
  const withdrawn = await state(session.page);
  assert.equal(withdrawn.allowed, false);
  assert.equal(withdrawn.metrika.initialized, false);
  assert.equal(withdrawn.utmSource, '');
  assert.equal(commandCount(withdrawn, 'destruct'), 1);
  assert.equal(await session.page.evaluate(() => sessionStorage.getItem('promix-lead-attribution-v1')), null);
  const requestsAfterWithdrawal = session.optionalRequests.length;
  assert.equal(await session.page.evaluate(() => window.promixMetrika.track('after_withdrawal')), false);
  assert.equal(session.optionalRequests.length, requestsAfterWithdrawal);
  await session.page.evaluate(() => history.replaceState(null, '', '/'));
  await saveChoice(session.page, true);
  await waitInitialized(session.page);
  assert.equal(commandCount(await state(session.page), 'init'), 2);
  assert.equal((await state(session.page)).utmSource, '');
  assert.equal(session.optionalRequests.filter((url) => url.endsWith('/tag.js')).length, 1);
});

for (const storageMode of ['getters', 'all', 'writes', 'set-only', 'local-writes']) {
  test(`unwritable stale grant fails closed across documents: ${storageMode}`, async (scope) => {
    const session = await openSession(scope, { storedConsent: grant, storageMode, path: '/?utm_source=campaign' });
    assert.equal((await state(session.page)).allowed, false);
    assert.deepEqual(session.optionalRequests, []);
    await session.page.locator('[data-cookie-reject]').click();
    assert.equal((await state(session.page)).allowed, false);
    await session.page.reload();
    await session.ready();
    await session.navigate('/products/');
    assert.equal((await state(session.page)).allowed, false);
    assert.equal((await state(session.page)).utmSource, '');
    assert.deepEqual(session.optionalRequests, []);
  });
}

for (const storageMode of ['getters', 'all', 'writes', 'set-only']) {
  test(`page-only grant is honest and not restored with blocked storage: ${storageMode}`, async (scope) => {
    const session = await openSession(scope, { storageMode });
    await session.page.locator('[data-cookie-accept]').click();
    await waitInitialized(session.page);
    assert.equal((await state(session.page)).consent.persisted, false);
    assert.equal(await session.page.locator('body > [data-cookie-status]').isVisible(), true);
    await session.page.reload();
    await session.ready();
    assert.equal((await state(session.page)).allowed, false);
    assert.equal((await state(session.page)).metrika.initialized, false);
    assert.equal(session.optionalRequests.filter((url) => url.endsWith('/tag.js')).length, 1);
  });
}

for (const storageMode of ['getters', 'all', 'writes', 'set-only', 'local-writes']) {
  test(`withdrawal remains authoritative after storage breaks: ${storageMode}`, async (scope) => {
    const session = await openSession(scope, { storedConsent: grant, path: '/?utm_source=campaign' });
    await waitInitialized(session.page);
    await session.setStorageMode(storageMode);
    await saveChoice(session.page, false);
    const snapshot = await state(session.page);
    assert.equal(snapshot.allowed, false);
    assert.equal(snapshot.utmSource, '');
    assert.equal(snapshot.metrika.initialized, false);
    assert.equal(await session.page.evaluate(() => window.promixMetrika.track('stale_grant')), false);
    await session.page.locator('#settings').click();
    assert.equal(await session.page.locator('[data-analytics-toggle]').isChecked(), false);
    await session.page.locator('[data-cookie-save]').click();
    await session.page.reload();
    await session.ready();
    await session.navigate('/products/');
    assert.equal((await state(session.page)).allowed, false);
    assert.equal((await state(session.page)).metrika.initialized, false);
    assert.equal((await state(session.page)).utmSource, '');
    if (storageMode === 'local-writes') {
      await session.setStorageMode('normal');
      await session.navigate('/recovered/');
      assert.equal((await state(session.page)).allowed, false);
      assert.equal(JSON.parse(await session.page.evaluate(() => window.testRawConsent())).analytics, false);
    }
  });
}

test('pending initialization and old conversion cannot cross a withdrawal', async (scope) => {
  const session = await openSession(scope, { delayTag: true });
  await session.page.locator('[data-cookie-accept]').click();
  await session.page.waitForFunction(() => document.querySelector('script[data-promix-metrika]'));
  await session.page.evaluate(() => window.promixMetrika.track('old_goal'));
  await saveChoice(session.page, false);
  assert.equal((await state(session.page)).metrika.initialized, false);
  session.releaseTag();
  await saveChoice(session.page, true);
  await waitInitialized(session.page);
  const snapshot = await state(session.page);
  assert.equal(commandCount(snapshot, 'init'), 1);
  assert.equal(snapshot.commands.some((entry) => entry[1] === 'reachGoal' && entry[2] === 'old_goal'), false);
});

test('attribution expires automatically and withdrawal cancels its timer', async (scope) => {
  const session = await openSession(scope, { path: '/?utm_source=campaign' });
  await session.page.clock.install();
  await session.page.locator('[data-cookie-accept]').click();
  await waitInitialized(session.page);
  assert.equal((await state(session.page)).utmSource, 'campaign');
  await session.page.clock.fastForward(30 * 60 * 1000 + 1);
  assert.equal((await state(session.page)).utmSource, '');
  assert.equal(await session.page.evaluate(() => sessionStorage.getItem('promix-lead-attribution-v1')), null);
  await saveChoice(session.page, false);
  const requestsAfterWithdrawal = session.optionalRequests.length;
  await session.page.clock.fastForward(30 * 60 * 1000 + 1);
  assert.equal((await state(session.page)).utmSource, '');
  assert.equal(session.optionalRequests.length, requestsAfterWithdrawal);
});

test('consent getters throwing cannot authorize analytics', async (scope) => {
  const session = await openSession(scope);
  await session.page.evaluate(() => {
    Object.defineProperty(window, 'promixConsent', { configurable: true, get() { throw new DOMException('Unavailable', 'SecurityError'); } });
    window.dispatchEvent(new CustomEvent('promix:consent', { detail: { analytics: true } }));
  });
  assert.equal(await session.page.evaluate(() => window.promixMetrika.getState().consent), false);
  assert.equal(await session.page.evaluate(() => window.promixMetrika.track('blocked')), false);
  assert.deepEqual(session.optionalRequests, []);
});

test('malformed stored analytics consent and forged events fail closed', async (scope) => {
  const session = await openSession(scope, { storedConsent: { ...grant, analytics: 'true' } });
  await session.page.evaluate(() => window.dispatchEvent(new CustomEvent('promix:consent', { detail: { analytics: true } })));
  assert.equal((await state(session.page)).allowed, false);
  assert.deepEqual(session.optionalRequests, []);
});

test('restored documents recheck consent and callers cannot mutate its snapshot', async (scope) => {
  const session = await openSession(scope, { storedConsent: grant, path: '/?utm_source=campaign' });
  await waitInitialized(session.page);
  await session.page.evaluate(() => { window.promixConsent.get().analytics = false; });
  assert.equal((await state(session.page)).allowed, true);
  await session.page.evaluate((key) => {
    const refusal = { version: 1, necessary: true, analytics: false, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(refusal));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }, consentKey);
  const snapshot = await state(session.page);
  assert.equal(snapshot.allowed, false);
  assert.equal(snapshot.metrika.initialized, false);
  assert.equal(snapshot.utmSource, '');
  assert.equal(commandCount(snapshot, 'destruct'), 1);
});

test('a previous grant cannot restore withdrawn attribution', async (scope) => {
  const session = await openSession(scope, {
    storedConsent: grant,
    seedAttribution: { expiresAt: Date.now() + 30 * 60 * 1000, consentUpdatedAt: '2026-10-25T10:00:00.000Z', values: { utm_source: 'previous-grant' } },
  });
  await waitInitialized(session.page);
  assert.equal((await state(session.page)).utmSource, '');
  assert.equal(await session.page.evaluate(() => sessionStorage.getItem('promix-lead-attribution-v1')), null);
});
