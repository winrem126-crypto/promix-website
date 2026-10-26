import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { advanceSubmissionState, createSubmissionHistory } from '../src/scripts/lead-submissions.js';

const payload = {
  name: 'Test Customer', phone: '+79000000000', city: 'Test City', message: 'Test request',
  product: 'PROMIX F', productSlug: 'promix-f', source: '/products/promix-f/',
  sourcePage: '/products/promix-f/', leadType: 'product-consultation', consent: true,
  startedAt: '1000',
};

function fixture(overrides = {}) {
  const values = new Map();
  const browserHistory = {
    state: null,
    replaceState(value) { this.state = structuredClone(value); },
  };
  const sessionStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  let timestamp = 1800000000000;
  const options = {
    crypto: webcrypto, storage: () => sessionStorage, history: () => browserHistory,
    now: () => timestamp, ...overrides,
  };
  return {
    values, browserHistory, options, api: createSubmissionHistory(options),
    advanceTime(milliseconds) { timestamp += milliseconds; },
  };
}

const identify = (api, data = payload) => api.identifySubmission(data, new AbortController().signal);

for (const state of ['pending', 'unknown', 'rejected']) {
  test(`a changed request is allowed after ${state} and receives a different ID`, async () => {
    const { api } = fixture();
    const first = await identify(api);
    first.state = state;
    api.saveSubmissionAttempts();
    const changed = await identify(api, { ...payload, message: 'A different project' });
    assert.notEqual(changed.id, first.id);
    assert.equal(changed.state, 'new');
    assert.equal((await identify(api)).id, first.id);
  });
}

test('an ambiguous retry preserves its ID across page reloads', async () => {
  const { api, options } = fixture();
  const first = await identify(api);
  first.state = 'unknown';
  api.saveSubmissionAttempts();
  const reloaded = createSubmissionHistory(options);
  const retry = await identify(reloaded, { ...payload, startedAt: '2000', submissionId: 'ignored' });
  assert.equal(retry.id, first.id);
  assert.equal(retry.state, 'unknown');
});

test('changing product context does not inherit another request lock', async () => {
  const { api } = fixture();
  const first = await identify(api);
  first.state = 'unknown';
  api.saveSubmissionAttempts();
  const changed = await identify(api, { ...payload, product: 'PROMIX W', productSlug: 'promix-w', sourcePage: '/products/promix-w/' });
  assert.notEqual(changed.id, first.id);
});

test('accepted identity and conversion marker survive an older pending snapshot', async () => {
  const { api, options, browserHistory } = fixture();
  const first = await identify(api);
  first.state = 'pending';
  api.saveSubmissionAttempts();
  const oldState = structuredClone(browserHistory.state);
  first.state = 'accepted';
  first.eventSent = true;
  api.saveSubmissionAttempts();
  browserHistory.state = oldState;
  const retry = await identify(createSubmissionHistory(options));
  assert.equal(retry.id, first.id);
  assert.equal(retry.state, 'accepted');
  assert.equal(retry.eventSent, true);
});

test('blocked session storage falls back to browser history', async () => {
  const { api, options } = fixture({ storage() { throw new Error('Storage blocked'); } });
  const first = await identify(api);
  first.state = 'unknown';
  api.saveSubmissionAttempts();
  const retry = await identify(createSubmissionHistory(options));
  assert.equal(retry.id, first.id);
});

test('blocked history falls back to session storage', async () => {
  const { api, options } = fixture({ history() { throw new Error('History blocked'); } });
  const first = await identify(api);
  first.state = 'unknown';
  api.saveSubmissionAttempts();
  assert.equal((await identify(createSubmissionHistory(options))).id, first.id);
});

test('both unavailable stores reject preparation before a request can be sent', async () => {
  const { api } = fixture({
    storage() { throw new Error('Storage blocked'); },
    history() { throw new Error('History blocked'); },
  });
  await assert.rejects(identify(api), /submission-persistence-unavailable/);
});

test('cancelled preparation does not create a pending identity', async () => {
  const { api, values, browserHistory } = fixture();
  const controller = new AbortController();
  controller.abort();
  assert.equal(await api.identifySubmission(payload, controller.signal), null);
  assert.equal(values.size, 0);
  assert.equal(browserHistory.state, null);
});

test('persistent state contains no lead values or phone number', async () => {
  const { api, values, browserHistory } = fixture();
  await identify(api);
  const serialized = JSON.stringify([...values.values()]) + JSON.stringify(browserHistory.state);
  for (const value of [payload.name, payload.phone, payload.city, payload.message, payload.product]) {
    assert.equal(serialized.includes(value), false);
  }
});

test('identities expire after 24 hours', async () => {
  const { api, advanceTime } = fixture();
  const first = await identify(api);
  advanceTime(24 * 60 * 60 * 1000 + 1);
  assert.notEqual((await identify(api)).id, first.id);
});

test('accepted outcome is monotonic and a rejection cannot erase prior uncertainty', () => {
  assert.equal(advanceSubmissionState('accepted', 'unknown'), 'accepted');
  assert.equal(advanceSubmissionState('unknown', 'accepted'), 'accepted');
  assert.equal(advanceSubmissionState('pending', 'rejected'), 'unknown');
  assert.equal(advanceSubmissionState('unknown', 'rejected'), 'unknown');
  assert.equal(advanceSubmissionState('new', 'rejected'), 'rejected');
});
