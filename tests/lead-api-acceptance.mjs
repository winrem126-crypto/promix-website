import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createLeadApiFixture } from './support/lead-api-fixture.mjs';

const lead = (patch = {}) => ({
  submissionId: randomUUID(), name: 'Fixture Customer', phone: '+70000000000', city: 'Fixture City',
  message: 'Local acceptance test only', product: '', productSlug: '', source: 'header',
  sourcePage: '/', leadType: 'header', consent: true, website: '', startedAt: String(Date.now() - 3000),
  utm_source: 'fixture', utm_medium: 'test', utm_campaign: 'local-acceptance', utm_content: '', utm_term: '',
  ...patch,
});

test('real PHP API and PHPMailer deliver only to a loopback SMTP sink', { timeout: 90000 }, async (suite) => {
  const fixture = await createLeadApiFixture();
  suite.after(() => fixture.close());
  const post = async (payload) => {
    const response = await fetch(fixture.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  };

  await suite.test('mandatory fields, phone, consent and honeypot reject before SMTP', async () => {
    for (const patch of [{ name: '' }, { phone: '' }, { phone: 'invalid' }, { city: '' }, { city: undefined }, { city: '   ' }, { consent: false }, { website: 'bot.invalid' }, { startedAt: String(Date.now() + 1000) }]) {
      const result = await post(lead(patch));
      assert.equal(result.status, 422);
      assert.equal(result.body.state, 'rejected');
    }
    assert.equal(fixture.smtp.transactions, 0);
  });

  await suite.test('success, accepted replay and conflicting ID do not duplicate mail', async () => {
    const payload = lead();
    const first = await post(payload);
    assert.equal(first.status, 201);
    assert.equal(first.body.submissionId, payload.submissionId);
    assert.equal(fixture.smtp.messages.length, 1);
    const replay = await post(payload);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.state, 'accepted');
    assert.equal(fixture.smtp.messages.length, 1);
    const conflict = await post({ ...payload, message: 'Changed under the same ID' });
    assert.equal(conflict.status, 409);
    assert.equal(fixture.smtp.messages.length, 1);
  });

  await suite.test('SMTP refusal is uncertain and replay never resends it', async () => {
    fixture.smtp.mode = 'reject';
    const payload = lead();
    const result = await post(payload);
    assert.equal(result.status, 503);
    assert.equal(result.body.state, 'unknown');
    const transactions = fixture.smtp.transactions;
    assert.equal((await post(payload)).body.state, 'unknown');
    assert.equal(fixture.smtp.transactions, transactions);
    fixture.smtp.mode = 'accept';
    assert.equal((await post(lead({ message: 'A changed request after refusal' }))).status, 201);
  });

  await suite.test('lost SMTP acknowledgement and same-ID replay capture only one message', async () => {
    fixture.smtp.mode = 'drop-after-data';
    const payload = lead();
    const before = fixture.smtp.messages.length;
    assert.equal((await post(payload)).body.state, 'unknown');
    assert.equal(fixture.smtp.messages.length, before + 1);
    fixture.smtp.mode = 'accept';
    assert.equal((await post(payload)).body.state, 'unknown');
    assert.equal(fixture.smtp.messages.length, before + 1);
  });

  await suite.test('missing private configuration fails closed without SMTP', async () => {
    const saved = await fs.readFile(fixture.configPath);
    await fs.unlink(fixture.configPath);
    const before = fixture.smtp.transactions;
    try {
      const result = await post(lead());
      assert.equal(result.status, 503);
      assert.equal(result.body.ok, false);
      assert.equal(fixture.smtp.transactions, before);
    } finally { await fs.writeFile(fixture.configPath, saved); }
  });

  await suite.test('server enforces UTF-8 limits, field types and header-safe values', async () => {
    const before = fixture.smtp.transactions;
    for (const patch of [
      { name: 'И'.repeat(121) }, { name: ['invalid'] }, { phone: '+70000000000\r\nInjected: value' },
      { message: 'Я'.repeat(3001) }, { sourcePage: '/\r\nInjected: value' },
      { submissionId: '../invalid-path' }, { leadType: 'unsupported' },
    ]) {
      assert.equal((await post(lead(patch))).status, 422);
    }
    assert.equal(fixture.smtp.transactions, before);
    assert.equal((await post(lead({ name: 'И'.repeat(120) }))).status, 201);
    assert.equal(fixture.smtp.transactions, before + 1);
  });

  await suite.test('browser to form to real API to test SMTP, retries and changed data', { timeout: 45000 }, async () => {
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.PROMIX_PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({
      ...(process.env.PROMIX_CHROME_PATH ? { executablePath: process.env.PROMIX_CHROME_PATH } : { channel: 'chrome' }),
      headless: true,
    });
    let page;
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      page = await context.newPage();
      const errors = [];
      const clientRequests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/lead.php' && request.method() === 'POST') clientRequests.push(request.postDataJSON().submissionId);
      });
      await page.goto(fixture.baseUrl, { waitUntil: 'networkidle' });
      assert.match(await page.title(), /PROMIX/);
      await page.locator('[data-open-form]').first().click();
      const form = page.locator('[data-consult-form]');
      const status = form.locator('.form-status');
      const submit = form.locator('button[type="submit"]');
      await submit.click();
      await status.filter({ hasText: 'Проверьте отмеченные поля' }).waitFor();
      assert.equal(fixture.proxy.requests.length, 0);
      assert.equal(await form.locator('[name="name"]').getAttribute('aria-invalid'), 'true');
      await form.locator('[name="name"]').fill('Fixture Customer');
      await form.locator('[name="phone"]').fill('+70000000000');
      await form.locator('[name="city"]').fill('Fixture City');
      await form.locator('[name="message"]').fill('Browser local sink request');
      await form.locator('[name="consent"]').check();
      await page.waitForTimeout(1300);
      fixture.proxy.nextResponse = { status: 422, body: { ok: false, state: 'rejected', fields: ['phone'] } };
      await submit.click();
      await status.filter({ hasText: 'Проверьте отмеченные поля' }).waitFor();
      assert.equal(await form.locator('[name="phone"]').getAttribute('aria-invalid'), 'true');
      assert.equal(await submit.isEnabled(), true);
      await form.locator('[name="phone"]').fill('+70000000001');
      fixture.proxy.nextResponse = { status: 202, body: { ok: false, state: 'pending' } };
      await submit.click();
      await status.filter({ hasText: 'Заявка ещё обрабатывается' }).waitFor();
      assert.equal(await submit.isEnabled(), true);
      const pendingId = fixture.proxy.requests.at(-1);
      await form.locator('[name="message"]').fill('Changed after pending browser request');
      assert.match(await submit.textContent(), /Отправить запрос/);
      await page.route('**/api/lead.php', async (route) => {
        await route.fetch();
        await route.abort('failed');
        await page.unroute('**/api/lead.php');
      }, { times: 1 });
      const before = fixture.smtp.messages.length;
      await submit.click();
      await status.filter({ hasText: 'Не удалось подтвердить отправку' }).waitFor({ timeout: 5000 });
      assert.equal(await submit.isEnabled(), true);
      const firstId = fixture.proxy.requests.at(-1);
      assert.notEqual(firstId, pendingId);
      assert.equal(fixture.smtp.messages.length, before + 1);
      await submit.click();
      await status.filter({ hasText: 'Спасибо' }).waitFor();
      assert.equal(fixture.proxy.requests.at(-1), firstId);
      assert.equal(fixture.smtp.messages.length, before + 1);
      await page.locator('[data-consultation-modal] [data-dialog-close]').click();
      await page.locator('[data-open-form]').first().click();
      await form.locator('[name="name"]').fill('Fixture Customer');
      await form.locator('[name="phone"]').fill('+70000000000');
      await form.locator('[name="city"]').fill('Fixture City');
      await form.locator('[name="message"]').fill('Browser timeout request');
      await form.locator('[name="consent"]').check();
      await page.waitForTimeout(1300);
      fixture.proxy.delayNextResponse = 15000;
      await submit.click();
      await status.filter({ hasText: 'Сервер не ответил вовремя' }).waitFor({ timeout: 16000 });
      assert.equal(await submit.isEnabled(), true);
      const timedOutId = fixture.proxy.requests.at(-1);
      await form.locator('[name="message"]').fill('Changed after a real browser timeout');
      assert.match(await submit.textContent(), /Отправить запрос/);
      const requestsBeforeDoubleClick = fixture.proxy.requests.length;
      await submit.evaluate((button) => { button.click(); button.click(); });
      await status.filter({ hasText: 'Спасибо' }).waitFor();
      assert.equal(fixture.proxy.requests.length, requestsBeforeDoubleClick + 1);
      assert.notEqual(fixture.proxy.requests.at(-1), timedOutId);
      assert.equal(fixture.smtp.messages.length, before + 3);
      const acceptedId = fixture.proxy.requests.at(-1);
      await page.locator('[data-consultation-modal] [data-dialog-close]').click();
      await page.locator('[data-open-form]').first().click();
      await form.locator('[name="name"]').fill('Fixture Customer');
      await form.locator('[name="phone"]').fill('+70000000000');
      await form.locator('[name="city"]').fill('Fixture City');
      await form.locator('[name="message"]').fill('Changed after a real browser timeout');
      await form.locator('[name="consent"]').check();
      await page.waitForTimeout(1300);
      await submit.click();
      await status.filter({ hasText: 'Спасибо' }).waitFor();
      assert.equal(fixture.proxy.requests.at(-1), acceptedId);
      assert.equal(fixture.smtp.messages.length, before + 3);
      await page.locator('[data-consultation-modal] [data-dialog-close]').click();
      await page.locator('[data-open-form]').first().click();
      await form.locator('[name="name"]').fill('Fixture Customer');
      await form.locator('[name="phone"]').fill('+70000000000');
      await form.locator('[name="city"]').fill('Fixture City');
      await form.locator('[name="message"]').fill('Request closed while waiting for confirmation');
      await form.locator('[name="consent"]').check();
      await page.waitForTimeout(1300);
      fixture.proxy.delayNextResponse = 2500;
      await submit.click();
      for (let attempt = 0; attempt < 100 && fixture.smtp.messages.length < before + 4; attempt += 1) {
        await page.waitForTimeout(20);
      }
      assert.equal(fixture.smtp.messages.length, before + 4);
      await page.locator('[data-consultation-modal] [data-dialog-close]').click();
      await page.locator('[data-open-form]').first().click();
      assert.equal(await submit.isEnabled(), true);
      await form.locator('[name="name"]').fill('Fixture Customer');
      await form.locator('[name="phone"]').fill('+70000000000');
      await form.locator('[name="city"]').fill('Fixture City');
      await form.locator('[name="message"]').fill('A new request after closing an in-flight form');
      await form.locator('[name="consent"]').check();
      await page.waitForTimeout(1300);
      await submit.click();
      await status.filter({ hasText: 'Спасибо' }).waitFor();
      await page.waitForTimeout(1400);
      assert.equal(fixture.smtp.messages.length, before + 5);
      assert.match(await status.textContent(), /Спасибо/);
      assert.equal(await submit.isDisabled(), true);
      await page.locator('[data-consultation-modal] [data-dialog-close]').click();
      await page.locator('[data-open-form]').first().click();
      await form.locator('[name="name"]').fill('Fixture Customer');
      await form.locator('[name="phone"]').fill('+70000000000');
      await form.locator('[name="city"]').fill('Fixture City');
      await form.locator('[name="message"]').fill('Request retried after the browser went offline');
      await form.locator('[name="consent"]').check();
      await page.waitForTimeout(1300);
      const requestsBeforeOffline = fixture.proxy.requests.length;
      await context.setOffline(true);
      await submit.click();
      await status.filter({ hasText: 'Не удалось подтвердить отправку' }).waitFor({ timeout: 5000 });
      assert.equal(await submit.isEnabled(), true);
      assert.equal(fixture.proxy.requests.length, requestsBeforeOffline);
      assert.equal(fixture.smtp.messages.length, before + 5);
      const offlineId = clientRequests.at(-1);
      await context.setOffline(false);
      await submit.click();
      await status.filter({ hasText: 'Спасибо' }).waitFor();
      assert.equal(fixture.proxy.requests.at(-1), offlineId);
      assert.equal(fixture.smtp.messages.length, before + 6);
      assert.deepEqual(errors, []);
      if (process.env.PROMIX_QA_DIR) {
        await page.screenshot({ path: path.join(process.env.PROMIX_QA_DIR, 'lead-api-smtp-success.png') });
      }
      await context.close();
    } catch (error) {
      if (page && process.env.PROMIX_QA_DIR) {
        await fs.writeFile(path.join(process.env.PROMIX_QA_DIR, 'lead-api-browser-failure.json'), JSON.stringify({
          status: await page.locator('[data-consult-form] .form-status').textContent().catch(() => null),
          browserRequests: fixture.proxy.requests.length,
          smtpTransactions: fixture.smtp.transactions,
          capturedMessages: fixture.smtp.messages.length,
        }, null, 2));
        await page.screenshot({ path: path.join(process.env.PROMIX_QA_DIR, 'lead-api-browser-failure.png') });
      }
      throw error;
    } finally { await browser.close(); }
  });

  await suite.test('per-client rate limit rejects a new ID before SMTP', async () => {
    await fixture.writeConfig({ rate_client_limit: 1, storage_path: path.join(path.dirname(fixture.config.storage_path), 'rate-storage') });
    assert.equal((await post(lead())).status, 201);
    const before = fixture.smtp.transactions;
    assert.equal((await post(lead())).status, 429);
    assert.equal(fixture.smtp.transactions, before);
  });

  await suite.test('server logs and protection state contain no lead values', async () => {
    const saved = (await fixture.readState()).join('');
    for (const value of ['Fixture Customer', '+70000000000', 'Fixture City', 'Local acceptance test only', 'И'.repeat(120)]) {
      assert.equal(fixture.getLog().includes(value), false);
      assert.equal(saved.includes(value), false);
    }
  });
});
