import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// V1.5 integration tests use only artificial records in temporary contexts.
// Keep the original schema3 serialization: migration must be backed up verbatim.
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const output = resolve(process.env.V15_UI_OUTPUT || '/workspace/artifacts/jizhi-v15-ui');
const engine = process.env.UI_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const STORAGE_KEY = 'jizhi-ai-test-book-v1';
const V15_BACKUP_KEY = 'jizhi-ai-test-book-v1.5-upgrade-backup';
const today = '2026-10-13';
const malicious = '<img src=x onerror="globalThis.v15InputExecuted=1">';
const defaultCategories = {
  study: [
    { id: 'study-japanese', name: '日语', active: true },
    { id: 'study-drawing', name: '画画', active: true },
    { id: 'study-3d', name: '3D建模', active: true },
  ],
  exercise: [
    { id: 'exercise-strength', name: '力量训练', active: true },
    { id: 'exercise-hiking', name: '徒步', active: true },
    { id: 'exercise-cardio', name: '有氧训练', active: true },
  ],
};
const legacyFixture = {
  schemaVersion: 3, inventoryVersion: 1, updatedAt: '2026-10-12T04:00:00.000Z',
  inventory: [
    { id: 'protein-a', name: '牛肉丸', category: '蛋白质', quantity: 20, perMeal: 2, unit: '颗', note: '旧版每餐用量与备注原样保留。', expires: '2027-01-01' },
    { id: 'protein-b', name: '虾丸', category: '蛋白质', quantity: 12, perMeal: 3, unit: '颗', note: '', expires: '' },
    { id: 'vegetable-a', name: '青菜', category: '蔬菜', quantity: 12, perMeal: 1, unit: '份', note: '', expires: '' },
    { id: 'carb-a', name: '米饭', category: '碳水', quantity: 12, perMeal: 1, unit: '份', note: '', expires: '' },
    { id: 'breakfast-a', name: '早餐面包', category: '早餐', quantity: 6, perMeal: 1, unit: '个', note: '', expires: '' },
    ...Array.from({ length: 18 }, (_, i) => ({ id: `reserve-${i}`, name: `第${i + 1}份小储备`, category: '', quantity: 1, perMeal: 1, unit: '份', note: i === 17 ? '位于列表末尾的旧备注。' : '', expires: '' })),
  ],
  meals: [
    { id: 'legacy-breakfast', date: today, slot: 'breakfast', name: '牛奶小可颂', type: '自制便当', protein: '', note: '旧餐食纸条，不能被快捷选择改写。', resources: [], completed: true, completedAt: '2026-10-13T00:00:00.000Z' },
    { id: 'legacy-history', date: '2026-09-30', slot: 'dinner', name: '九月最后一碗面', type: '外卖', protein: '', note: '', resources: [], completed: true, completedAt: '2026-09-30T10:00:00.000Z' },
  ],
  diaries: [{ date: today, mood: '甜甜的平静 ♡', text: '旧日记第一行。\n第二行也应该完整保留。', joy: '收藏今天。', updatedAt: '2026-10-13T03:00:00.000Z' }],
  dayRecords: [{ date: today,
    study: { checked: true, items: [{ id: 'legacy-study', content: '旧版读书记录', minutes: null, note: '没有填写时长，不能变成 0。' }] },
    exercise: { checked: true, items: [{ id: 'legacy-exercise', content: '旧版散步记录', minutes: null, note: '没有填写距离与时长。' }] },
    stickerIds: ['milk'],
  }],
};
const originalRaw = JSON.stringify(legacyFixture, null, 2);
const mainOnlyFixture = {
  schemaVersion: 3, inventoryVersion: 1, updatedAt: null,
  inventory: [{ id: 'only-main', name: '只剩牛肉丸的小冰箱', category: '蛋白质', quantity: 9, perMeal: 1, unit: '份', note: '', expires: '' }],
  meals: [], diaries: [], dayRecords: [],
};
const promoteFixture = source => ({
  ...structuredClone(source), schemaVersion: 4,
  mealTemplates: [], activityCategories: structuredClone(defaultCategories), recentStickerIds: [],
  dayRecords: source.dayRecords.map(row => ({ ...structuredClone(row),
    study: { ...structuredClone(row.study), manualChecked: row.study.checked, categoryIds: [] },
    exercise: { ...structuredClone(row.exercise), manualChecked: row.exercise.checked, categoryIds: [] },
  })),
});
const report = { engine, generatedAt: new Date().toISOString(), phases: [], checks: [], layouts: [], downloads: [], errors: [], failures: [] };
await mkdir(output, { recursive: true });
let blockNetwork = false;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  if (blockNetwork) { response.writeHead(503).end('Offline test'); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const path = resolve(root, '.' + pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser, currentPage;
let mealPhaseBook, activityPhaseBook;

async function check(name, run) {
  try { await run(); report.checks.push(name); console.log(`PASS ${name}`); }
  catch (error) {
    report.failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`);
    await currentPage?.evaluate(() => { const dialog = document.querySelector('#sheet'); if (dialog?.open) dialog.close(); window.scrollTo(0, 0); }).catch(() => {});
  }
}
async function openContext(seed, { offline = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', acceptDownloads: true, serviceWorkers: offline ? 'allow' : 'block' });
  const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !blockNetwork) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.setFixedTime(new Date('2026-10-13T04:00:00.000Z'));
  await page.addInitScript(({ raw, key }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { raw: typeof seed === 'string' ? seed : JSON.stringify(seed), key: STORAGE_KEY });
  await page.goto(base); await page.locator('.calendar-page').waitFor();
  return { context, page };
}
const readRaw = page => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
const readBook = async page => JSON.parse(await readRaw(page));
const snapshot = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const nav = (page, target) => page.locator(`.bottom-nav [data-page="${target}"]`).click();
const view = (page, target) => page.locator(`[data-calendar-view="${target}"]`).click();
const closeSheet = page => page.locator('.close-button[data-close]').click();
const fillDate = async (locator, value) => { await locator.fill(value); await locator.evaluate(input => { input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); }); };
const replaceFixture = async (page, seed) => {
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw: typeof seed === 'string' ? seed : JSON.stringify(seed) });
  await page.goto(base + '#calendar'); await page.reload(); await page.locator('.calendar-page').waitFor();
};
const sameRecords = (actual, expected, keys = ['inventory', 'meals', 'diaries']) => { for (const key of keys) assert.deepEqual(actual[key], expected[key], `Unrelated ${key} records changed`); };
const savedDay = (book, date = today) => book.dayRecords.find(row => row.date === date);
async function screenshot(page, name, locator) {
  await page.setViewportSize({ width: 390, height: 844 });
  if (locator) await locator.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
}
async function readableInputs(page, name) {
  const small = await page.locator('input:not([type="checkbox"]):not([type="file"]), textarea, select').evaluateAll(elements => elements.filter(element => typeof element.checkVisibility === 'function' ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(element => ({ name: element.name || element.id, size: parseFloat(getComputedStyle(element).fontSize) })).filter(element => element.size < 16));
  assert.deepEqual(small, [], `${name}: visible inputs must use readable 16px type on iOS`);
}
async function touchTargets(page, selector, name, minimum = 40) {
  const sizes = await page.locator(selector).evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => { const bounds = element.getBoundingClientRect(); return { name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 30), width: bounds.width, height: bounds.height }; }));
  assert.ok(sizes.length, `${name}: expected controls`);
  assert.ok(sizes.every(size => size.width >= minimum - .5 && size.height >= minimum - .5), `${name}: small touch targets ${JSON.stringify(sizes)}`);
}
async function layout(page, name, { sheet = false } = {}) {
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 844 });
    for (const safeArea of [0, 34]) {
      const styles = await page.evaluate(extra => {
        const shell = document.querySelector('.app-shell'), nav = document.querySelector('.bottom-nav');
        const previous = [shell.getAttribute('style'), nav.getAttribute('style')];
        if (extra) { shell.style.paddingBottom = `${parseFloat(getComputedStyle(shell).paddingBottom) + extra}px`; nav.style.paddingBottom = `${parseFloat(getComputedStyle(nav).paddingBottom) + extra}px`; }
        window.dispatchEvent(new Event('resize')); return previous;
      }, safeArea);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (!sheet) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const metrics = await page.evaluate(isSheet => ({
        width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
        sheetOverflow: isSheet ? document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth : 0,
        clearance: document.querySelector('.bottom-nav').getBoundingClientRect().top - document.querySelector('.page').getBoundingClientRect().bottom,
      }), sheet);
      report.layouts.push({ name, safeArea, ...metrics });
      assert.ok(metrics.overflow <= 1 && metrics.sheetOverflow <= 1, `${name}: horizontal overflow ${JSON.stringify(metrics)}`);
      if (!sheet) assert.ok(metrics.clearance >= 8, `${name}: bottom navigation obscures content ${JSON.stringify(metrics)}`);
      await page.evaluate(previous => { for (const [selector, style] of [['.app-shell', previous[0]], ['.bottom-nav', previous[1]]]) { const element = document.querySelector(selector); if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); } window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0); }, styles);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function download(page, selector, filename) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click(); const file = await pending;
  const path = resolve(output, filename); await file.saveAs(path); const bytes = await readFile(path);
  report.downloads.push({ filename, suggestedFilename: file.suggestedFilename(), bytes: bytes.length });
  return { path, bytes, file };
}
async function literalInputs(page) {
  assert.equal(await page.evaluate(() => globalThis.v15InputExecuted === 1), false, 'User input was executed');
  assert.equal(await page.locator('img[src="x"], #main script, #sheet-content script').count(), 0, 'User input created executable markup');
}
async function jumpTo(page, date) {
  await nav(page, 'calendar'); await page.locator('[data-action="jump"]').click();
  await fillDate(page.locator('#jump-form [name="date"]'), date);
  await page.locator('#jump-form [type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#sheet').open);
}
async function activityDetails(page, kind) {
  const details = page.locator(`.activity-details[data-kind="${kind}"]`);
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return details;
}
async function editActivity(page, kind, id, values) {
  await activityDetails(page, kind);
  await page.locator(`[data-activity-edit="${id}"]`).click();
  const form = page.locator(`.activity-form[data-kind="${kind}"]`);
  for (const [name, value] of Object.entries(values)) {
    if (name === 'categoryId') await form.locator(`[name="${name}"]`).selectOption(value);
    else await form.locator(`[name="${name}"]`).fill(String(value));
  }
  await form.locator('[type="submit"]').click();
}
async function stats(page) {
  return page.evaluate(async key => {
    const { monthStats } = await import('./activity.js');
    return monthStats(JSON.parse(localStorage.getItem(key)), '2026-10');
  }, STORAGE_KEY);
}
const waitPreview = page => page.waitForFunction(() => {
  const image = document.querySelector('.share-preview img'), button = document.querySelector('#download-card');
  return image && !image.hidden && image.complete && image.naturalWidth > 0 && button && !button.disabled;
});

// Three independent phases isolate inventory/meal transactions, category/sticker
// transactions, and offline backup restoration. UI selectors are added only once
// the implementation's contract has been agreed with the root agent.
async function inventoryAndMealsPhase() {
  const { context, page } = await openContext(originalRaw);
  report.phases.push('inventory and meal shortcuts');
  try {
    await check('schema3 records open without persistence or inventory replay', async () => {
      assert.equal(await readRaw(page), originalRaw);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), null);
      await nav(page, 'inventory'); await nav(page, 'summary'); await nav(page, 'settings'); await nav(page, 'calendar');
      assert.equal(await readRaw(page), originalRaw);
      assert.equal(savedDay(await readBook(page)).study.items[0].minutes, null);
      assert.equal(savedDay(await readBook(page)).exercise.items[0].minutes, null);
    });
    await check('inventory add control belongs to stock toolbar; simple additions keep default settings and return position', async () => {
      await nav(page, 'inventory');
      const add = page.locator('.inventory-add-again[data-action="add-ingredient"]');
      assert.equal(await page.locator('.section-heading [data-action="add-ingredient"]').count(), 0);
      assert.equal(await page.locator('#inventory-add-zone .inventory-add-button').count(), 1);
      assert.equal(await page.evaluate(() => {
        const zone = document.querySelector('#inventory-add-zone'), runway = document.querySelector('.runway-note');
        return Boolean(runway.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING);
      }), true, 'Stock toolbar must follow the runway panel');
      await touchTargets(page, '.inventory-add-button', 'inventory addition', 44);
      const initial = await readBook(page);
      for (const [name, category, quantity, unit] of [['小布丁', '早餐', '3', '个'], ['一袋新青菜', '蔬菜', '5', '份']]) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        // Use the real visible control. Capture the position after bringing it
        // into view, rather than invoking a hidden button through JavaScript.
        await add.scrollIntoViewIfNeeded();
        const returnY = await page.evaluate(() => window.scrollY);
        await add.click();
        const form = page.locator('#ingredient-form'), advanced = form.locator('.ingredient-more-settings');
        await form.waitFor();
        assert.equal(await advanced.getAttribute('open'), null);
        for (const field of ['name', 'category', 'quantity', 'unit']) assert.equal(await form.locator(`[name="${field}"]`).isVisible(), true);
        for (const field of ['perMeal', 'expires', 'note']) assert.equal(await form.locator(`[name="${field}"]`).isVisible(), false);
        assert.equal(await form.locator('[name="perMeal"]').inputValue(), '1');
        await form.locator('[name="name"]').fill(name);
        await form.locator('[name="category"]').selectOption(category);
        await form.locator('[name="quantity"]').fill(quantity);
        await form.locator('[name="unit"]').fill(unit);
        await readableInputs(page, 'simple ingredient editor');
        if (name === '小布丁') {
          await screenshot(page, 'ingredient-basic');
          await layout(page, 'simple ingredient editor', { sheet: true });
          // Layout helpers alter scroll deliberately; restore the opening
          // position before save so only production restoration is measured.
          await page.evaluate(y => window.scrollTo(0, y), returnY);
        }
        await form.locator('[type="submit"]').click();
        await page.waitForFunction(() => !document.querySelector('#sheet').open);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const actualY = await page.evaluate(() => window.scrollY);
        assert.ok(Math.abs(actualY - returnY) <= 24, `Adding ${name} jumped from ${returnY} to ${actualY}`);
        const book = await readBook(page), added = book.inventory.find(item => item.name === name);
        assert.ok(added); assert.equal(added.quantity, Number(quantity)); assert.equal(added.unit, unit); assert.equal(added.category, category);
        assert.equal(added.perMeal, 1); assert.equal(added.note, ''); assert.equal(added.expires, '');
        assert.equal(book.schemaVersion, 4);
        sameRecords(book, initial, ['meals', 'diaries']);
        for (const item of initial.inventory) assert.deepEqual(book.inventory.find(row => row.id === item.id), item);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), originalRaw, 'First schema4 save preserves the exact schema3 original');
      }
      assert.equal((await readBook(page)).inventory.length, initial.inventory.length + 2, 'Second addition must preserve the first');
      await screenshot(page, 'inventory-additions');
      await layout(page, 'inventory additions');
    });
    await check('collapsed advanced fields preserve old defaults, note and expiry; edited row retains its viewport position', async () => {
      await nav(page, 'inventory');
      const original = (await readBook(page)).inventory.find(item => item.id === 'protein-a');
      const row = page.locator('[data-inventory-id="protein-a"]');
      if (await row.getAttribute('open') === null) await row.locator('summary').click();
      await row.locator('[data-ingredient]').scrollIntoViewIfNeeded();
      const top = await row.evaluate(element => element.getBoundingClientRect().top);
      await row.locator('[data-ingredient]').click();
      const form = page.locator('#ingredient-form'), advanced = form.locator('.ingredient-more-settings');
      assert.equal(await advanced.getAttribute('open'), null);
      assert.equal(await form.locator('[name="perMeal"]').inputValue(), String(original.perMeal));
      assert.equal(await form.locator('[name="note"]').inputValue(), original.note);
      assert.equal(await form.locator('[name="expires"]').inputValue(), original.expires);
      await form.locator('[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('#sheet').open);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual((await readBook(page)).inventory.find(item => item.id === original.id), original);
      const returnedTop = await row.evaluate(element => element.getBoundingClientRect().top);
      assert.ok(Math.abs(returnedTop - top) <= 24, `Edited row moved from ${top} to ${returnedTop}`);
      if (await row.getAttribute('open') === null) await row.locator('summary').click();
      await row.locator('[data-ingredient]').click(); await advanced.locator('summary').click();
      assert.equal(await form.locator('[name="perMeal"]').isVisible(), true);
      assert.equal(await form.locator('[name="note"]').isVisible(), true);
      assert.equal(await form.locator('[name="expires"]').isVisible(), true);
      await readableInputs(page, 'expanded ingredient settings');
      await screenshot(page, 'ingredient-advanced');
      await closeSheet(page);
      const before = await readBook(page);
      const last = page.locator('[data-inventory-id="reserve-17"]');
      if (await last.getAttribute('open') === null) await last.locator('summary').click();
      await last.locator('[data-ingredient]').scrollIntoViewIfNeeded();
      const lastTop = await last.evaluate(element => element.getBoundingClientRect().top);
      await last.locator('[data-ingredient]').click();
      assert.equal(await advanced.getAttribute('open'), null);
      await form.locator('[name="quantity"]').fill('2'); await form.locator('[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('#sheet').open);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await readBook(page);
      assert.deepEqual(after.inventory.find(item => item.id === 'reserve-17'), { ...before.inventory.find(item => item.id === 'reserve-17'), quantity: 2 });
      for (const item of before.inventory.filter(item => item.id !== 'reserve-17')) assert.deepEqual(after.inventory.find(row => row.id === item.id), item);
      assert.ok(Math.abs((await last.evaluate(element => element.getBoundingClientRect().top)) - lastTop) <= 24, 'Editing the end of a long stock list must keep the row nearby');
      await screenshot(page, 'inventory-end-edit');
    });
    await check('runway mode is a viewing preference; protein-only stock covers nine main meals while comprehensive coverage is zero', async () => {
      await nav(page, 'inventory');
      const before = await readRaw(page);
      if (await page.locator('.runway-fold').getAttribute('open') === null) await page.locator('.runway-fold > summary').click();
      for (const mode of ['main', 'comprehensive', 'main']) {
        await page.locator(`[data-runway-mode="${mode}"]`).click();
        assert.equal(await page.locator(`[data-runway-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(await readRaw(page), before, 'Changing prediction mode must not modify records or reserve inventory');
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-runway-mode')), 'main');
      await page.reload(); await page.locator('.inventory-page').waitFor();
      assert.equal(await page.locator('[data-runway-mode="main"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await readRaw(page), before);
      await replaceFixture(page, mainOnlyFixture); await nav(page, 'inventory');
      const onlyRaw = await readRaw(page), backup = await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY);
      if (await page.locator('.runway-fold').getAttribute('open') === null) await page.locator('.runway-fold > summary').click();
      await page.locator('[data-runway-mode="comprehensive"]').click();
      assert.equal(await page.locator('.runway-total strong').textContent(), '0');
      assert.match(await page.locator('.runway-coverage strong').textContent(), /尚不能覆盖/);
      await screenshot(page, 'runway-comprehensive-empty');
      await page.locator('[data-runway-mode="main"]').click();
      assert.equal(await page.locator('.runway-total strong').textContent(), '9');
      assert.match(await page.locator('.runway-coverage strong').textContent(), /2026年10月17日.*午餐/);
      const prediction = await page.evaluate(async ({ key, date }) => {
        const { predictMainCourseRunway } = await import('./runway.js');
        return predictMainCourseRunway(JSON.parse(localStorage.getItem(key)), date, 2);
      }, { key: STORAGE_KEY, date: today });
      assert.equal(prediction.covered, 9); assert.equal(prediction.proteinMeals, 9); assert.equal(prediction.readyMeals, 0);
      assert.deepEqual(prediction.last, { date: '2026-10-17', slot: 'lunch' });
      assert.equal(await readRaw(page), onlyRaw);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), backup);
      await touchTargets(page, '[data-runway-mode]', 'runway mode choices', 40);
      await screenshot(page, 'runway-main'); await layout(page, 'main-course runway');
      // P1 starts from the same complete old book; mode preferences may remain.
      await replaceFixture(page, originalRaw);
    });
    await check('five meal scenes work for any date and meal slot without creating records or reserving stock', async () => {
      await jumpTo(page, '2026-10-17');
      const before = await snapshot(page);
      for (const slot of ['breakfast', 'lunch', 'dinner', 'snack']) {
        await page.locator(slot === 'snack' ? '[data-action="add-snack"]' : `[data-add="${slot}"]`).click();
        const form = page.locator('#meal-form');
        assert.equal(await form.locator('[data-meal-scene]').count(), 5);
        for (const scene of ['自制便当', '公司食堂', '面包卡消耗', '外食', '外卖']) {
          await form.locator(`[data-meal-scene="${scene}"]`).click();
          assert.equal(await form.locator(`[data-meal-scene="${scene}"]`).getAttribute('aria-pressed'), 'true');
          assert.equal(await form.locator('[name="type"]').inputValue(), scene === '外食' ? '外出就餐' : scene);
          assert.equal(await page.locator('#resource-list .resource-row').count(), 0);
          assert.deepEqual(await form.locator('.meal-component-group').evaluateAll(groups => groups.map(group => group.dataset.component)), scene === '自制便当' ? ['蛋白质', '蔬菜', '碳水'] : ['整套食物']);
          assert.equal(await snapshot(page), before);
        }
        await closeSheet(page);
      }
    });
    await check('multi-ingredient meal shortcuts use independent defaults; saving a template changes no meal or inventory', async () => {
      await jumpTo(page, '2026-10-14');
      const before = await readBook(page);
      await page.locator('[data-add="lunch"]').click();
      const form = page.locator('#meal-form');
      await form.locator('[data-meal-scene="自制便当"]').click();
      assert.equal(await form.locator('.meal-component-group[open]').count(), 0);
      for (const [group, ids] of [['蛋白质', ['protein-a', 'protein-b']], ['蔬菜', ['vegetable-a']], ['碳水', ['carb-a']]]) {
        await form.locator(`[data-component="${group}"] summary`).click();
        for (const id of ids) await form.locator(`[data-template-ingredient="${id}"]`).check();
      }
      const selected = await form.locator('.resource-row').evaluateAll(rows => rows.map(row => ({ id: row.querySelector('select').value, amount: Number(row.querySelector('input').value) })));
      assert.deepEqual(selected, [{ id: 'protein-a', amount: 2 }, { id: 'protein-b', amount: 3 }, { id: 'vegetable-a', amount: 1 }, { id: 'carb-a', amount: 1 }]);
      await form.locator('[data-template-ingredient="protein-b"]').uncheck();
      assert.equal(await form.locator('.resource-row').count(), 3);
      await form.locator('[data-template-ingredient="protein-b"]').check();
      // Input values are selected by ingredient ID, independently of row order.
      await form.locator('.resource-row').filter({ has: page.locator('option:checked[value="protein-a"]') }).locator('input').fill('1.5');
      await form.locator('[name="name"]').fill('牛肉丸与虾丸小便当');
      await form.locator('[name="note"]').fill('小青菜陪着两种喜欢的丸子。\n备注 <b>仍然是原话</b>。');
      await form.locator('.meal-template-fold summary').click();
      await form.locator('[name="mealTemplateName"]').fill('<b>甜甜双丸组合</b>');
      await form.locator('[data-save-meal-template]').click();
      const book = await readBook(page);
      sameRecords(book, before);
      const template = book.mealTemplates.find(row => row.name === '<b>甜甜双丸组合</b>');
      assert.ok(template); assert.equal(template.resources.length, 4);
      assert.equal(template.resources.find(row => row.ingredientId === 'protein-a').amount, 1.5);
      assert.equal(await page.locator('#meal-form [name="name"]').inputValue(), '牛肉丸与虾丸小便当');
      assert.equal(await form.locator('.meal-template-name').textContent(), '<b>甜甜双丸组合</b>');
      assert.equal(await form.locator('.meal-template-name b').count(), 0);
      await literalInputs(page); await readableInputs(page, 'meal shortcut editor');
      await touchTargets(page, '[data-meal-scene]', 'meal scene slips', 40);
      await screenshot(page, 'meal-template', form.locator('.meal-template-fold'));
      await layout(page, 'meal shortcut editor', { sheet: true });
      await form.locator(`[data-manage-meal-templates="${template.id}"]`).click();
      await page.locator(`[data-template-edit="${template.id}"]`).waitFor();
      await page.locator('#shortcut-back').click();
      assert.equal(await form.locator('[name="name"]').inputValue(), template.mealName);
      assert.equal(await form.locator('[name="note"]').inputValue(), template.note);
      assert.equal(await form.locator('.resource-row').count(), 4);
      assert.equal(await readRaw(page), JSON.stringify(book), 'Opening template manager and returning must keep the unsaved meal draft read-only');
      await closeSheet(page);
    });
    await check('custom template reopen/edit/delete is independent; saving, completing and undoing the meal handles inventory exactly once', async () => {
      await nav(page, 'settings');
      await page.locator('[data-action="manage-meal-templates"]').click();
      const before = await readBook(page), template = before.mealTemplates.find(row => row.name.includes('双丸'));
      assert.ok(template);
      const managerForm = page.locator(`[data-template-edit="${template.id}"]`);
      if (await managerForm.locator('..').getAttribute('open') === null) await managerForm.locator('..').locator('summary').click();
      await managerForm.locator('[name="templateName"]').fill('我的双丸小便当');
      await managerForm.locator('[name="mealName"]').fill('这次预填的小便当');
      await managerForm.locator('[name="note"]').fill('改好的模板备注。');
      await managerForm.locator('[type="submit"]').click();
      const edited = await readBook(page);
      sameRecords(edited, before);
      assert.equal(edited.mealTemplates.find(row => row.id === template.id).name, '我的双丸小便当');
      await readableInputs(page, 'template manager'); await screenshot(page, 'meal-template-manager');
      await closeSheet(page); await jumpTo(page, '2026-10-14');
      await page.locator('[data-add="lunch"]').click();
      const form = page.locator('#meal-form');
      await form.locator('.meal-template-fold summary').click();
      await form.locator(`[data-meal-template="${template.id}"]`).click();
      assert.equal(await form.locator('[name="name"]').inputValue(), '这次预填的小便当');
      assert.equal(await form.locator('[name="note"]').inputValue(), '改好的模板备注。');
      assert.equal(await readRaw(page), JSON.stringify(edited));
      await form.locator('[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('#sheet').open);
      const planned = await readBook(page), meal = planned.meals.find(row => row.date === '2026-10-14' && row.slot === 'lunch');
      assert.ok(meal); assert.equal(meal.resources.length, 4); assert.equal(meal.completed, false);
      assert.deepEqual(planned.inventory, edited.inventory);
      const reserved = await page.evaluate(async ({ key, id }) => { const { forecast } = await import('./model.js'); const book = JSON.parse(localStorage.getItem(key)); return Object.fromEntries(book.meals.find(row => row.id === id).resources.map(resource => [resource.ingredientId, forecast(book, resource.ingredientId)])); }, { key: STORAGE_KEY, id: meal.id });
      for (const resource of meal.resources) assert.equal(reserved[resource.ingredientId], edited.inventory.find(row => row.id === resource.ingredientId).quantity - resource.amount);
      await page.locator(`[data-complete="${meal.id}"]`).click();
      const complete = await readBook(page);
      assert.equal(complete.meals.find(row => row.id === meal.id).completed, true);
      for (const resource of meal.resources) assert.equal(complete.inventory.find(row => row.id === resource.ingredientId).quantity, edited.inventory.find(row => row.id === resource.ingredientId).quantity - resource.amount);
      await page.locator(`[data-undo="${meal.id}"]`).click(); await page.locator('#confirm-yes').click();
      assert.deepEqual((await readBook(page)).inventory, edited.inventory);
      // Save a second template and delete only it, retaining one real template
      // for the extension backup round trip.
      const fold = page.locator(`[data-meal-fold="${meal.id}"]`);
      if (await fold.getAttribute('open') === null) await fold.locator('summary').click();
      await fold.locator('[data-edit-meal]').click();
      await form.locator('.meal-template-fold summary').click();
      await form.locator('[name="mealTemplateName"]').fill(malicious);
      await form.locator('[data-save-meal-template]').click(); await closeSheet(page);
      const copied = await readBook(page), copy = copied.mealTemplates.find(row => row.name === malicious);
      await nav(page, 'settings'); await page.locator('[data-action="manage-meal-templates"]').click();
      const copyForm = page.locator(`[data-template-edit="${copy.id}"]`);
      await copyForm.locator('..').locator('summary').click();
      assert.ok((await copyForm.locator('..').locator('summary').textContent()).includes(malicious));
      await literalInputs(page);
      await copyForm.locator('[data-delete-template]').click(); await page.locator('#confirm-yes').click();
      const removed = await readBook(page); sameRecords(removed, copied);
      assert.ok(!removed.mealTemplates.some(row => row.id === copy.id));
      assert.ok(removed.mealTemplates.some(row => row.id === template.id));
      await closeSheet(page);
    });
  } finally { mealPhaseBook = await readBook(page); await context.close(); }
}
async function categoriesAndStickersPhase() {
  const { context, page } = await openContext(originalRaw);
  report.phases.push('activity categories and sticker collection');
  try {
    await check('manual scene changes and clearing a resource keep the current template type and other ingredient hints', async () => {
      await jumpTo(page, '2026-10-15');await page.locator('[data-add="lunch"]').click();
      const form=page.locator('#meal-form');
      await form.locator('[data-meal-scene="外食"]').click();
      await form.locator('[name="type"]').selectOption('公司食堂');
      assert.equal(await form.locator('[data-meal-scene="公司食堂"]').getAttribute('aria-pressed'),'true');
      await form.locator('[name="name"]').fill('公司食堂的小餐');
      await form.locator('.meal-template-fold summary').click();
      await form.locator('[name="mealTemplateName"]').fill('手动切换场景的小纸条');
      await form.locator('[data-save-meal-template]').click();
      assert.equal((await readBook(page)).mealTemplates.find(t=>t.name==='手动切换场景的小纸条').scene,'公司食堂');
      await form.locator('#add-resource').click();await form.locator('#add-resource').click();
      const rows=form.locator('.resource-row');
      await rows.nth(0).locator('select').selectOption('');
      await rows.nth(1).locator('input').fill('2.5');
      assert.match(await rows.nth(1).locator('.resource-hint').textContent(),/预计剩余/);
      const before=await readBook(page);await closeSheet(page);sameRecords(await readBook(page),before);await jumpTo(page,today);
    });
    await check('legacy optional activity details stay null before any shortcut action', async () => {
      const before = await snapshot(page);
      for (const kind of ['study', 'exercise']) {
        const details = page.locator(`.activity-details[data-kind="${kind}"]`);
        if (await details.getAttribute('open') === null) await details.locator('summary').click();
        await readableInputs(page, `${kind} detail form`);
      }
      assert.equal(await snapshot(page), before);
      await screenshot(page, 'activity-legacy', page.locator('.day-checkins'));
    });
    await check('default categories use stable IDs; multiple categories remain one day and have independent optional durations', async () => {
      for (const kind of ['study', 'exercise']) assert.deepEqual(await page.locator(`[data-activity-category][data-kind="${kind}"]`).evaluateAll(buttons => buttons.map(button => button.dataset.activityCategory)), defaultCategories[kind].map(category => category.id));
      // Turn off the legacy manual study stamp, then select two actual labels.
      await page.locator('[data-checkin="study"]').click();
      for (const id of ['study-japanese', 'study-drawing']) await page.locator(`[data-activity-category="${id}"]`).click();
      let book = await readBook(page), day = savedDay(book);
      assert.equal(day.study.checked, true); assert.deepEqual(day.study.categoryIds, ['study-japanese', 'study-drawing']);
      assert.equal(day.study.items.find(row => row.id === 'legacy-study').minutes, null);
      const japanese = day.study.items.find(row => row.categoryId === 'study-japanese'), drawing = day.study.items.find(row => row.categoryId === 'study-drawing');
      assert.equal(japanese.minutes, null); assert.equal(drawing.minutes, null);
      await editActivity(page, 'study', japanese.id, { minutes: '25', note: '抄好这一页。\n纯文本 <b>批注</b>。' });
      await editActivity(page, 'study', drawing.id, { minutes: '15', note: '画了一颗小草莓。' });
      assert.equal((await stats(page)).studyMinutes, 40); assert.equal((await stats(page)).studyDays, 1);
      await view(page, 'month');
      assert.equal(await page.locator(`[data-month-date="${today}"] .month-dot[data-kind="study"]`).count(), 1);
      assert.equal(await page.locator('.month-stat[data-kind="study"] strong').textContent(), '1');
      await view(page, 'day');
      const beforeCancel = savedDay(await readBook(page)).study.items;
      await page.locator('[data-activity-category="study-japanese"]').click();
      assert.deepEqual(savedDay(await readBook(page)).study.items, beforeCancel, 'Deselecting a category must keep its detailed record');
      assert.equal((await stats(page)).studyMinutes, 15); assert.equal((await stats(page)).studyDays, 1);
      await page.locator('[data-checkin="study"]').click();
      assert.equal(savedDay(await readBook(page)).study.checked, false);
      assert.deepEqual(savedDay(await readBook(page)).study.items, beforeCancel);
      assert.equal((await stats(page)).studyDays, 0); assert.equal((await stats(page)).studyMinutes, 0);
      await page.locator('[data-checkin="study"]').click();
      assert.equal((await stats(page)).studyDays, 1); assert.equal((await stats(page)).studyMinutes, 15);
      await page.locator('[data-activity-category="exercise-hiking"]').click();
      day = savedDay(await readBook(page));
      const hiking = day.exercise.items.find(row => row.categoryId === 'exercise-hiking');
      await editActivity(page, 'exercise', hiking.id, { content: '沿着小路慢慢徒步', minutes: '35', distanceKm: '2.75', note: '晚风软软的，记录可以慢慢写。' });
      day = savedDay(await readBook(page));
      assert.equal(day.exercise.items.find(row => row.id === hiking.id).distanceKm, 2.75);
      assert.equal(day.exercise.items.find(row => row.id === 'legacy-exercise').minutes, null);
      assert.equal(Object.hasOwn(day.exercise.items.find(row => row.id === 'legacy-exercise'), 'distanceKm'), false, 'Do not manufacture distance for a legacy item');
      assert.equal((await stats(page)).exerciseDays, 1); assert.equal((await stats(page)).exerciseMinutes, 35);
      await page.locator('[data-checkin="exercise"]').click();
      assert.equal((await stats(page)).exerciseDays, 0); assert.equal((await stats(page)).exerciseMinutes, 0);
      assert.equal(savedDay(await readBook(page)).exercise.items.find(row => row.id === hiking.id).distanceKm, 2.75);
      await page.locator('[data-checkin="exercise"]').click();
      sameRecords(await readBook(page), legacyFixture);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), originalRaw);
      await activityDetails(page, 'exercise'); await readableInputs(page, 'exercise distance editor');
      assert.equal(await page.locator('.activity-form[data-kind="study"] [name="distanceKm"]').count(), 0);
      await touchTargets(page, '[data-checkin]', 'main activity check-ins', 44);
      await touchTargets(page, '[data-activity-category]', 'activity category chips', 40);
      await screenshot(page, 'activity-categories', page.locator('.day-checkins'));
      await layout(page, 'activity category records');
    });
    await check('renaming, reordering and deactivating categories preserves IDs and historical detail snapshots', async () => {
      await nav(page, 'calendar');
      const before = await readBook(page), drawing = savedDay(before).study.items.find(row => row.categoryId === 'study-drawing');
      await page.locator('[data-manage-activity-categories="study"]').click();
      await page.locator('[data-category-rename="study-drawing"]').click();
      await page.locator('#rename-category-form [name="categoryName"]').fill('草莓插画时间');
      await page.locator('#rename-category-form [type="submit"]').click();
      let book = await readBook(page);
      assert.equal(book.activityCategories.study.find(row => row.id === 'study-drawing').name, '草莓插画时间');
      assert.deepEqual(savedDay(book).study.items.find(row => row.id === drawing.id), drawing);
      await page.locator('[data-category-move="study-drawing"][data-direction="up"]').click();
      book = await readBook(page); assert.equal(book.activityCategories.study[0].id, 'study-drawing');
      await page.locator('[data-category-active="study-drawing"][data-active="false"]').click();
      book = await readBook(page);
      assert.equal(book.activityCategories.study.find(row => row.id === 'study-drawing').active, false);
      assert.deepEqual(savedDay(book), savedDay(before));
      const unsafeCategory = '<img src=x onerror=v15InputExecuted=1>';
      await page.locator('#category-form [name="categoryName"]').fill(unsafeCategory);
      await page.locator('#category-form [type="submit"]').click();
      assert.equal(await page.locator('.activity-category-name').filter({ hasText: unsafeCategory }).count(), 1);
      assert.equal(await page.locator('.activity-category-name img').count(), 0);
      await readableInputs(page, 'category manager'); await literalInputs(page);
      await screenshot(page, 'category-manager'); await layout(page, 'category manager', { sheet: true });
      await closeSheet(page);
      assert.equal(await page.locator('[data-activity-category="study-drawing"]').count(), 0, 'Inactive categories disappear only from new shortcut choices');
      await activityDetails(page, 'study');
      assert.match(await page.locator('.activity-details[data-kind="study"]').textContent(), /画画.*已停用/s);
      assert.equal((await stats(page)).studyMinutes, 15, 'Deactivation must not remove historical statistics');
      sameRecords(await readBook(page), legacyFixture);
    });
    await check('sticker groups are read-only; only actual additions populate recent IDs and the three-sticker limit is enforced', async () => {
      await nav(page, 'calendar');
      const picker = page.locator('.day-sticker-picker');
      if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
      const catalog = await page.evaluate(async () => (await import('./stickers.js')).STICKERS.map(sticker => ({ id: sticker.id, category: sticker.category })));
      const before = await snapshot(page);
      for (const group of ['food', 'study', 'motion', 'mood', 'life', 'decor', 'recent', 'common', 'all']) {
        await page.locator(`[data-day-sticker-group="${group}"]`).click();
        assert.equal(await page.locator(`[data-day-sticker-group="${group}"]`).getAttribute('aria-pressed'), 'true');
        if (['food', 'study', 'motion', 'mood', 'life', 'decor'].includes(group)) {
          const displayed = await picker.locator('.sticker-library-grid [data-day-sticker]').evaluateAll(buttons => buttons.map(button => button.dataset.daySticker));
          assert.ok(displayed.length > 0);
          assert.ok(displayed.every(id => catalog.find(row => row.id === id)?.category === group));
        }
        assert.equal(await snapshot(page), before);
      }
      for (const id of ['life-laundry', 'mood-cat']) await page.locator(`[data-day-sticker="${id}"]`).click();
      let book = await readBook(page);
      assert.deepEqual(savedDay(book).stickerIds, ['milk', 'life-laundry', 'mood-cat']);
      assert.deepEqual(book.recentStickerIds, ['mood-cat', 'life-laundry']);
      const limited = await readRaw(page);
      await page.locator('[data-day-sticker="motion-dumbbell"]').click();
      assert.equal(await readRaw(page), limited, 'A fourth sticker must not mutate records or recent history');
      await page.locator('[data-day-sticker="mood-cat"]').click();
      assert.deepEqual((await readBook(page)).recentStickerIds, ['mood-cat', 'life-laundry'], 'Removing a sticker does not create recent use');
      await page.locator('[data-day-sticker="mood-cat"]').click();
      await page.locator('[data-day-sticker-group="recent"]').click();
      assert.match(await picker.locator('.sticker-library-caption strong').textContent(), /最近用过/);
      await screenshot(page, 'day-stickers', picker);
      await layout(page, 'sticker collection');
      await page.locator('[data-day-sticker-group="all"]').click();
      for (const id of [...savedDay(await readBook(page)).stickerIds]) await page.locator(`[data-day-sticker="${id}"]`).click();
      const used = catalog.filter(sticker => !['milk', 'strawberry', 'book', 'shoe', 'star', 'heart', 'bow', 'fork'].includes(sticker.id)).slice(0, 13).map(sticker => sticker.id);
      assert.equal(used.length, 13);
      for (const id of used) {
        await page.locator(`[data-day-sticker="${id}"]`).click();
        const addedRecent = (await readBook(page)).recentStickerIds;
        assert.equal(addedRecent[0], id); assert.ok(addedRecent.length <= 12);
        await page.locator(`[data-day-sticker="${id}"]`).click();
        assert.deepEqual((await readBook(page)).recentStickerIds, addedRecent);
      }
      assert.deepEqual((await readBook(page)).recentStickerIds, used.slice(-12).reverse());
      for (const id of ['life-laundry', 'mood-cat', 'motion-dumbbell']) await page.locator(`[data-day-sticker="${id}"]`).click();
      await page.locator('[data-action="share-day"]').click(); await waitPreview(page);
      await page.locator('.journal-share-extras summary').click();
      const shareBefore = await snapshot(page);
      for (const group of ['food', 'study', 'motion', 'mood', 'life', 'decor', 'recent', 'common', 'all']) await page.locator(`[data-share-sticker-group="${group}"]`).click();
      const selected = await page.locator('.sticker-library-share .is-picked').evaluateAll(buttons => buttons.map(button => button.dataset.shareSticker));
      assert.deepEqual(selected, ['life-laundry', 'mood-cat', 'motion-dumbbell']);
      await page.locator('[data-share-sticker="life-laundry"]').click(); await waitPreview(page);
      await page.locator('[data-share-sticker="study-backpack"]').click(); await waitPreview(page);
      assert.equal(await snapshot(page), shareBefore, 'Share-only sticker selection must not add real daily usage');
      const image = await download(page, '#download-card', 'v15-sticker-share.png');
      assert.deepEqual([...image.bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      await readableInputs(page, 'share sticker editor'); await screenshot(page, 'share-stickers', page.locator('.journal-share-stickers'));
      await layout(page, 'share sticker editor', { sheet: true }); await closeSheet(page);
      sameRecords(await readBook(page), legacyFixture);
    });
  } finally { activityPhaseBook = await readBook(page); await context.close(); }
}
async function offlineAndBackupPhase() {
  const { context, page } = await openContext(originalRaw, { offline: true });
  report.phases.push('offline assets and schema4 backup restoration');
  try {
    const source = mealPhaseBook || promoteFixture(legacyFixture);
    const activitySource = activityPhaseBook || promoteFixture(legacyFixture);
    const complete = { ...structuredClone(source), schemaVersion: 4, dayRecords: structuredClone(activitySource.dayRecords), activityCategories: structuredClone(activitySource.activityCategories), recentStickerIds: [...activitySource.recentStickerIds] };
    const restore = async bytes => {
      await nav(page, 'settings');
      await page.locator('#import-file').setInputFiles({ name: '机智定食-V1.5-test.json', mimeType: 'application/json', buffer: bytes });
      await page.locator('#restore-confirm').click();
      await page.waitForFunction(() => !document.querySelector('#sheet').open);
    };
    const sameAll = (book, expected) => sameRecords(book, expected, ['inventory', 'meals', 'diaries', 'dayRecords', 'mealTemplates', 'activityCategories', 'recentStickerIds']);
    await check('schema4 JSON export and restore retains templates, category IDs, duration, distance, recent stickers and the exact schema3 upgrade backup', async () => {
      assert.equal(await readRaw(page), originalRaw);
      assert.ok(complete.mealTemplates.length > 0, 'Meal transaction phase leaves a real custom template');
      assert.ok(complete.recentStickerIds.length > 0, 'Sticker transaction phase leaves actual usage');
      assert.ok(savedDay(complete).exercise.items.some(item => item.distanceKm === 2.75), 'Optional distance belongs in the backup');
      await restore(Buffer.from(JSON.stringify(complete), 'utf8'));
      const restored = await readBook(page); sameAll(restored, complete);
      assert.equal(restored.schemaVersion, 4);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), originalRaw);
      await screenshot(page, 'settings-backup');
      const beforeExport = await readRaw(page);
      const backup = await download(page, '[data-action="export"]', 'complete-v15-backup.json');
      const exported = JSON.parse(backup.bytes.toString());
      sameAll(exported, complete); assert.equal(exported.schemaVersion, 4);
      assert.equal(await readRaw(page), beforeExport, 'Export only changes last-export preference');
      const legacy = await download(page, '[data-action="v15-backup"]', 'schema3-upgrade-original.json');
      assert.equal(legacy.bytes.toString(), originalRaw);
      await nav(page, 'calendar'); await page.locator('[data-checkin="exercise"]').click();
      assert.equal(savedDay(await readBook(page)).exercise.checked, false);
      await restore(backup.bytes); sameAll(await readBook(page), exported);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), originalRaw);
      const beforeReload = await readRaw(page); await page.reload(); await page.locator('.settings-page').waitFor();
      assert.equal(await readRaw(page), beforeReload); sameAll(await readBook(page), exported);
      assert.equal(savedDay(await readBook(page)).study.items.find(item => item.id === 'legacy-study').minutes, null);
      assert.equal(savedDay(await readBook(page)).exercise.items.find(item => item.id === 'legacy-exercise').minutes, null);
    });
    await check('the entire release and every sticker are cached; blocked-network month, timeline, share PNG and JSON continue working', async () => {
      const source = await readFile(resolve(root, 'sw.js'), 'utf8');
      const release = new Function('self', source + '\nreturn { CACHE, FILES };')({ addEventListener() {} });
      await page.waitForFunction(async name => {
        if (!await caches.has(name)) return false;
        const cache = await caches.open(name);
        return Boolean(await cache.match('./index.html')) && Boolean(await cache.match('./sticker-picker.js'));
      }, release.CACHE, { timeout: 30000 });
      await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      const cached = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname), release.CACHE);
      for (const file of release.FILES) assert.ok(cached.includes(new URL(file, base).pathname), `Missing offline release resource: ${file}`);
      const stickerSources = await page.evaluate(async () => (await import('./stickers.js')).STICKERS.map(sticker => sticker.src));
      for (const src of stickerSources) assert.ok(cached.includes(new URL(src, base).pathname), `Missing offline sticker: ${src}`);
      report.cachedResources = cached.length; report.cachedStickers = stickerSources.length;
      const before = await snapshot(page);
      blockNetwork = true;
      await page.reload(); await page.locator('.settings-page').waitFor();
      await nav(page, 'calendar');
      const picker = page.locator('.day-sticker-picker');
      if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
      await page.locator('[data-day-sticker-group="all"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.sticker-library img')].every(image => image.complete && image.naturalWidth > 0));
      assert.ok(await picker.locator('img').count() >= stickerSources.length);
      await screenshot(page, 'offline-sticker-library', picker);
      await view(page, 'month');
      assert.equal(await page.locator(`[data-month-date="${today}"] .month-dot[data-kind="study"]`).count(), 1);
      assert.equal(await page.locator(`[data-month-date="${today}"] .month-dot[data-kind="exercise"]`).count(), 1);
      await screenshot(page, 'month-categories');
      await view(page, 'timeline');
      const row = page.locator(`[data-timeline-date="${today}"]`);
      if (await row.locator('details').getAttribute('open') === null) await row.locator('summary').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.timeline-sticker-strip img')].every(image => image.complete && image.naturalWidth > 0));
      assert.equal(await row.locator('.timeline-sticker-strip img').count(), 3);
      assert.match(await row.locator('.timeline-expanded').textContent(), /2\.75.*公里/);
      await screenshot(page, 'timeline-categories');
      await row.locator('[data-timeline-open]').click();
      await page.locator('[data-action="share-day"]').click(); await waitPreview(page);
      await page.locator('.journal-share-extras summary').click();
      await page.locator('[data-share-sticker-group="all"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.sticker-library-share img')].every(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.locator('.sticker-library-share .is-picked').count(), 3);
      const card = await download(page, '#download-card', 'offline-v15-new-stickers.png');
      assert.deepEqual([...card.bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(card.bytes.length > 5000);
      await screenshot(page, 'offline-share', page.locator('.share-preview')); await closeSheet(page);
      assert.equal(await snapshot(page), before, 'Offline viewing, picker groups and PNG export preserve all records and usage');
      await nav(page, 'settings');
      const offlineBackup = await download(page, '[data-action="export"]', 'offline-complete-v15-backup.json');
      sameAll(JSON.parse(offlineBackup.bytes.toString()), complete);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), V15_BACKUP_KEY), originalRaw);
      await literalInputs(page);
    });
  } finally { blockNetwork = false; await context.close(); }
}

try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}) });
  const phases=(process.env.V15_PHASES||'inventory,categories,offline').split(',');
  if(!phases.includes('inventory')&&process.env.V15_MEAL_SEED)mealPhaseBook=JSON.parse(await readFile(process.env.V15_MEAL_SEED,'utf8'));
  if(phases.includes('inventory'))await inventoryAndMealsPhase();
  if(phases.includes('categories'))await categoriesAndStickersPhase();
  if(phases.includes('offline'))await offlineAndBackupPhase();
  await check('bundled assets and execution have no browser errors', async () => assert.deepEqual(report.errors, []));
} catch (error) { report.failures.push({ name: 'browser setup or navigation', message: error.message }); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  report.passed = report.failures.length === 0;
  report.scope = 'P0 inventory/runway; P1 meal templates, categorized activity, sticker collection; schema3 preservation, schema4 backup round trip and offline release';
  await writeFile(resolve(output, `${engine}-v15-results.json`), JSON.stringify(report, null, 2));
  console.log(`${engine}: ${report.checks.length} V1.5 scenarios, ${report.layouts.length} mobile/safe-area layouts, ${report.downloads.length} downloads; ${report.failures.length} failures.`);
  if (!report.passed) process.exitCode = 1;
}
