import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { freshState } from '../model.js';
import { STORAGE_KEY } from '../storage.js';
import { AI_TEST_MESSAGE } from '../ai-api.js';

// Only temporary browser profiles and artificial records are used. There is no
// real credential, account, journal, or persistent user browser in this test.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = resolve('.');
const output = resolve(root, 'tests/ui-previews/ai-test');
const engine = process.env.UI_ENGINE || 'chromium';
const phase = process.env.AI_BROWSER_PHASE || 'all';
const fakeKey = 'clearly-invalid-browser-test-credential';
const model = 'synthetic-model';
const date = '2026-10-14';
const officialKey = 'jizhi-meals-v1';
const formalSentinel = JSON.stringify({ syntheticFormalRecord: 'never overwrite this fixture' });
const malicious = '<img src=x onerror="globalThis.aiExecuted=true">';
const fixture = freshState();
fixture.inventory = [{ id: 'fixture-rice', name: '测试库存米饭', quantity: 12, perMeal: 1, unit: '份', category: '碳水', note: '人工库存标记', expires: '' }];
fixture.meals = [{ id: 'fixture-meal', date, slot: 'breakfast', name: '人工餐食标记', type: '自制便当', protein: '', note: '人工餐食私密标记', resources: [], completed: true, completedAt: '2026-10-14T00:00:00.000Z' }];
fixture.diaries = [{ date, mood: '测试', text: '人工日记私密标记', joy: '', updatedAt: '2026-10-14T01:00:00.000Z' }];
const report = { engine, phase, generatedAt: new Date().toISOString(), scope: 'Temporary browser, mobile viewports, synthetic data, mock API; no real credential or real phone.', checks: [], skipped: [], failures: [], layouts: [], pageErrors: [], liveAPI: 'Not tested by this mocked UI regression.' };
const redact = value => String(value).split(fakeKey).join('[redacted synthetic credential]');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (!pathname.startsWith('/ai-test/')) { response.writeHead(404).end(); return; }
  if (pathname === '/ai-test/__fixture.html') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Synthetic cache setup</title>'); return; }
  const file = resolve(root, '.' + pathname.replace(/^\/ai-test/, '').replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = `${origin}/ai-test/`;
let browser;
let page;
let responseMode = 'success';
let pendingRoute;
const requests = [];
const loadedModules = [];
const endpoint = 'https://www.jiemomo.com/v1/chat/completions';

async function check(name, run) {
  try { await run(); report.checks.push(name); console.log(`PASS ${name}`); }
  catch (error) { const message = redact(error.message); report.failures.push({ name, message }); console.error(`FAIL ${name}: ${message}`); }
}
const nav = target => page.locator(`.bottom-nav [data-page="${target}"]`).click();
const result = state => page.waitForFunction(wanted => document.querySelector('[data-ai-result]')?.dataset.status === wanted, state);
const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const inputKey = () => page.locator('#ai-api-key');
const submit = () => page.locator('[data-ai-test]').click();
async function openLab() {
  await nav('settings');
  const details = page.locator('#ai-lab-slot details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await page.locator('#ai-base-url').waitFor();
}
async function credential() {
  await inputKey().fill(fakeKey); await page.locator('#ai-model-id').fill(model);
}
async function cleanStorage() {
  const values = await page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
  assert.ok(!values.includes(fakeKey), 'The credential must never enter browser storage');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), officialKey), formalSentinel);
}
async function cancelPending() {
  if (pendingRoute) { const route = pendingRoute; pendingRoute = null; await route.abort().catch(() => {}); }
}
try {
  const options = { headless: true };
  if (process.env.CHROMIUM_PATH && engine === 'chromium') options.executablePath = process.env.CHROMIUM_PATH;
  browser = await playwright[engine].launch(options);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', acceptDownloads: true, serviceWorkers: 'block' });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push(redact(error.message)));
  page.on('request', request => { if (/\/ai-(?:lab|api)\.js$/.test(request.url())) loadedModules.push(request.url()); });
  await page.clock.setFixedTime(new Date('2026-10-14T04:00:00.000Z'));
  await page.addInitScript(({ storageKey, book, formalKey, formal }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(book));
    if (localStorage.getItem(formalKey) === null) localStorage.setItem(formalKey, formal);
  }, { storageKey: STORAGE_KEY, book: fixture, formalKey: officialKey, formal: formalSentinel });
  await context.route('https://**/*', async route => {
    const request = route.request();
    if (request.url() !== endpoint) { await route.abort(); return; }
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST' } }); return; }
    requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON() });
    if (responseMode === 'pending') { pendingRoute = route; return; }
    if (responseMode === 'network') { await route.abort('failed'); return; }
    const status = responseMode === 'auth' ? 401 : responseMode === 'model' ? 404 : 200;
    const body = status === 200 ? { choices: [{ message: { content: `草莓邮局连接成功\n${malicious}\n${fakeKey}` } }] } : { error: { message: `Unsafe upstream message ${fakeKey}` } };
    await route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': origin }, body: JSON.stringify(body) });
  });
  await page.goto(base); await page.locator('.calendar-page').waitFor();

  if (phase !== 'sw') {
  await check('Default collapsed lab is lazy, no API request before explicit test', async () => {
    await nav('settings');
    assert.equal(await page.locator('#ai-lab-slot details').getAttribute('open'), null);
    assert.equal(loadedModules.length, 0); assert.equal(requests.length, 0);
    assert.equal(await page.title(), '机智定食-ai测试版本');
    assert.match(await page.locator('.settings-page').textContent(), /AI 测试版/);
    await openLab();
    assert.equal(await page.locator('#ai-base-url').inputValue(), 'https://www.jiemomo.com/v1');
    assert.equal(await inputKey().getAttribute('type'), 'password');
    assert.equal(requests.length, 0);
  });
  await check('Show/hide is explicit; HTTPS is mandatory and causes no invalid request', async () => {
    await credential();
    await page.locator('[data-ai-action="show-key"]').click(); assert.equal(await inputKey().getAttribute('type'), 'text');
    await page.locator('[data-ai-action="show-key"]').click(); assert.equal(await inputKey().getAttribute('type'), 'password');
    await page.locator('#ai-base-url').fill('http://www.jiemomo.com/v1'); await submit(); await result('error');
    assert.match(await page.locator('[data-ai-message]').textContent(), /HTTPS/); assert.equal(requests.length, 0);
    await page.locator('#ai-base-url').fill('https://www.jiemomo.com/v1/');
  });
  await check('Successful fixed Chat Completions payload excludes all life records; reply renders as text', async () => {
    responseMode = 'success'; await submit(); await result('success');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { url: endpoint, method: 'POST', body: { model, messages: [{ role: 'user', content: AI_TEST_MESSAGE }], stream: false } });
    const text = await page.locator('[data-ai-reply]').textContent();
    assert.ok(text.includes(malicious)); assert.ok(text.includes('【密钥已隐藏】')); assert.ok(!text.includes(fakeKey));
    assert.equal(await page.evaluate(() => Boolean(globalThis.aiExecuted)), false);
    assert.equal(await page.locator('[data-ai-result] img,[data-ai-result] script').count(), 0);
    assert.match(await page.locator('[data-ai-message]').textContent(), /HTTP 200/);
    await cleanStorage();
  });
  await check('HTTP auth/model errors are understandable and upstream error bodies are not shown', async () => {
    responseMode = 'auth'; await submit(); await result('error');
    assert.match(await page.locator('[data-ai-message]').textContent(), /鉴权.*HTTP 401/);
    assert.ok(!(await page.locator('[data-ai-result]').textContent()).includes('Unsafe upstream'));
    responseMode = 'model'; await submit(); await result('error');
    assert.match(await page.locator('[data-ai-message]').textContent(), /接口或模型.*HTTP 404/);
    await cleanStorage();
  });
  await check('Browser network failure honestly includes CORS/TLS/network ambiguity', async () => {
    responseMode = 'network'; await submit(); await result('error');
    assert.match(await page.locator('[data-ai-message]').textContent(), /CORS.*网络.*TLS.*无法准确区分/);
  });
  await check('Request cancellation stops loading and clears busy controls', async () => {
    responseMode = 'pending'; await submit(); await result('loading');
    assert.equal(await page.locator('[data-ai-test]').isDisabled(), true);
    assert.equal(await page.locator('[data-ai-action="cancel"]').isVisible(), true);
    await page.locator('[data-ai-action="cancel"]').click(); await result('cancelled');
    assert.equal(await page.locator('[data-ai-test]').isDisabled(), false); await cancelPending();
  });
  await check('30-second timeout recovers without touching hand journal', async () => {
    responseMode = 'pending'; await submit(); await result('loading');
    await page.clock.fastForward(31000); await result('error');
    assert.match(await page.locator('[data-ai-message]').textContent(), /请求超时/);
    assert.equal(await page.locator('[data-ai-test]').isDisabled(), false); await cancelPending(); await cleanStorage();
  });
  await check('Clear erases credential and reply and cancels pending request', async () => {
    responseMode = 'pending'; await submit(); await result('loading');
    await page.locator('[data-ai-action="clear-key"]').click(); await result('idle');
    assert.equal(await inputKey().inputValue(), ''); assert.equal(await page.locator('[data-ai-reply]').textContent(), '');
    assert.equal(await inputKey().getAttribute('type'), 'password'); await cancelPending(); await cleanStorage();
  });
  await check('JSON export excludes API configuration and credential while it is in memory', async () => {
    await credential();
    const downloadPending = page.waitForEvent('download'); await page.locator('[data-action="export"]').click(); const download = await downloadPending;
    const stream = await download.createReadStream(); let bytes = ''; for await (const chunk of stream) bytes += chunk;
    assert.ok(!bytes.includes(fakeKey)); assert.ok(!bytes.includes('jiemomo')); assert.ok(!bytes.includes(model));
    const exported = JSON.parse(bytes); assert.equal(exported.diaries[0].text, '人工日记私密标记');
    await cleanStorage();
  });
  await check('Across host navigation AI stays isolated and core meal/inventory/diary/study/exercise saves still work', async () => {
    await nav('calendar'); await page.locator('[data-add="lunch"]').click();
    await page.locator('#meal-form [name="name"]').fill('新建人工午餐'); await page.locator('#meal-form [type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.ok((await stored()).meals.some(meal => meal.name === '新建人工午餐'));
    await page.locator('[data-action="edit-diary"]').click(); await page.locator('#diary-form [name="text"]').fill('人工更新日记');
    await page.locator('#diary-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.equal((await stored()).diaries.find(row => row.date === date).text, '人工更新日记');
    for (const kind of ['study', 'exercise']) {
      await page.locator(`[data-activity-category][data-kind="${kind}"]`).first().click();
      assert.equal((await stored()).dayRecords.find(row => row.date === date)[kind].checked, true);
    }
    await nav('inventory'); await page.locator('[data-action="add-ingredient"]').first().click();
    await page.locator('#ingredient-form [name="name"]').fill('新建人工水果'); await page.locator('#ingredient-form [name="quantity"]').fill('5');
    await page.locator('#ingredient-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.ok((await stored()).inventory.some(item => item.name === '新建人工水果' && item.quantity === 5));
    await openLab(); assert.equal(await inputKey().inputValue(), fakeKey); await cleanStorage();
  });
  await check('Reload requires entering the key again', async () => {
    await page.reload(); await openLab(); assert.equal(await inputKey().inputValue(), ''); await cleanStorage();
  });
  await check('Mobile 320/390/430 layouts have no overflow and readable touch inputs; screenshots have no key', async () => {
    await page.locator('[data-ai-action="clear-key"]').click(); assert.equal(await inputKey().inputValue(), '');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 }); await page.locator('[data-ai-lab]').scrollIntoViewIfNeeded();
      const metrics = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, inputSizes: [...document.querySelectorAll('[data-ai-field]')].map(input => parseFloat(getComputedStyle(input).fontSize)), actionSizes: [...document.querySelectorAll('[data-ai-lab] button')].filter(button => button.getClientRects().length).map(button => ({ text: button.textContent.trim(), height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })) }));
      report.layouts.push(metrics); assert.ok(metrics.overflow <= 1, `Horizontal overflow at ${width}px`); assert.ok(metrics.inputSizes.every(size => size >= 16)); assert.ok(metrics.actionSizes.every(size => size.height >= 40));
      await page.screenshot({ path: resolve(output, `ai-lab-${engine}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-ai-lab]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `ai-lab-${engine}-390-viewport.png`), fullPage: false });
  });
  await check('No uncaught JavaScript errors during API and core operations', async () => assert.deepEqual(report.pageErrors, []));
  }
  await context.close();

  if (engine === 'chromium') await check('Service Worker owns only AI scope/cache and core pages work offline', async () => {
    const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'allow' });
    const offlinePage = await offline.newPage();
    await offlinePage.goto(base + '__fixture.html');
    await offlinePage.evaluate(async () => {
      await caches.open('jizhi-shell-formal-sentinel');
      await caches.open('jizhi-ai-test-shell-stale');
      await caches.open('unrelated-sentinel');
    });
    await offlinePage.goto(base); await offlinePage.locator('.calendar-page').waitFor();
    await offlinePage.evaluate(async () => {
      // Wait inside evaluate: a Promise itself is truthy in waitForFunction.
      await Promise.race([
        (async () => {
          const registration = await navigator.serviceWorker.ready;
          if (registration.active.state !== 'activated') await new Promise(done => registration.active.addEventListener('statechange', function changed() { if (this.state === 'activated') { this.removeEventListener('statechange', changed); done(); } }));
          if (!navigator.serviceWorker.controller) await new Promise(done => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }));
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker activation timed out')), 20000))
      ]);
    });
    const state = await offlinePage.evaluate(async () => ({ caches: await caches.keys(), scopes: (await navigator.serviceWorker.getRegistrations()).map(registration => registration.scope) }));
    assert.ok(state.caches.includes('jizhi-shell-formal-sentinel')); assert.ok(state.caches.includes('unrelated-sentinel')); assert.ok(!state.caches.includes('jizhi-ai-test-shell-stale'));
    assert.equal(state.scopes.length, 1); assert.equal(state.scopes[0], base);
    const formalCache = await offlinePage.evaluate(async () => { const cache = await caches.open('jizhi-shell-formal-sentinel'); return (await cache.keys()).length; }); assert.equal(formalCache, 0);
    await offline.setOffline(true); await offlinePage.reload(); await offlinePage.locator('.calendar-page').waitFor();
    for (const target of ['inventory', 'settings', 'calendar']) await offlinePage.locator(`.bottom-nav [data-page="${target}"]`).click();
    await offlinePage.locator('[data-add="lunch"]').click(); await offlinePage.locator('#meal-form [name="name"]').fill('离线人工午餐'); await offlinePage.locator('#meal-form [type="submit"]').click();
    await offlinePage.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.ok((await offlinePage.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)).meals.some(meal => meal.name === '离线人工午餐'));
    await offline.close();
  });
  else report.skipped.push('Service Worker browser runtime: requires Chromium; WebKit has no Playwright service worker control.');
} finally {
  await cancelPending(); await browser?.close(); await new Promise(done => server.close(done));
  // Never dump request headers, credentials, or arbitrary server error bodies.
  await writeFile(resolve(output, `ai-lab-${engine}-${phase}-report.json`), redact(JSON.stringify(report, null, 2)));
}
console.log(JSON.stringify({ engine, phase, passed: report.checks.length, failures: report.failures.length, report: resolve(output, `ai-lab-${engine}-${phase}-report.json`) }));
if (report.failures.length) process.exitCode = 1;
