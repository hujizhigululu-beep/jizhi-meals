import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { freshState, putMeal } from '../model.js';

// Real browser checks; Playwright is provided by development tooling, not the PWA.
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve('.'), output = resolve(process.env.MEAL_UI_OUTPUT || '/workspace/artifacts/meal-ui');
const key = 'jizhi-ai-test-book-v1', date = '2026-10-14';
const report = { checks: [], layouts: [], errors: [] };
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
const fixture = () => {
  const state = freshState();
  state.inventory.push(
    { id: 'toast', name: '早餐吐司', category: '早餐', quantity: 4, perMeal: 1, unit: '片', note: '', expires: '' },
    { id: 'eggs', name: '鸡蛋', category: '蛋白质', quantity: 12, perMeal: 1, unit: '个', note: '', expires: '' },
    { id: 'rice', name: '米饭', category: '碳水', quantity: 8, perMeal: 1, unit: '份', note: '', expires: '' },
  );
  return state;
};
const book = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const raw = page => page.evaluate(key => localStorage.getItem(key), key);
const close = page => page.locator('.close-button[data-close]').click();
async function open(seed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-14T00:00:00Z'));
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key, seed });
  await page.goto(base);
  await page.locator('.calendar-page').waitFor();
  return { context, page };
}
async function widths(page, name, selector) {
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      const bounds = element.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, innerOverflow: element.scrollWidth - element.clientWidth, height: bounds.height, width: bounds.width };
    }, selector);
    report.layouts.push({ name, viewportWidth: width, ...metrics });
    assert.ok(metrics.overflow <= 1 && metrics.innerOverflow <= 1, `${name} overflows at ${width}px: ${JSON.stringify(metrics)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });

  {
    const { context, page } = await open(fixture());
    const before = await raw(page);
    await page.locator('[data-add="breakfast"]').click();
    await page.locator('[data-meal-breakfast]').click();
    assert.equal(await page.locator('#meal-form [name="name"]').inputValue(), '早餐');
    assert.equal(await page.locator('#meal-form [name="type"]').inputValue(), '其他');
    assert.match(await page.locator('.sheet-subtitle').textContent(), /10月14日.*早餐/);
    assert.equal(await raw(page), before, 'Selecting breakfast must only change the draft');
    const scroll = await page.locator('.meal-scene-slips').evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth }));
    assert.ok(scroll.scroll > scroll.width, 'Six shortcuts must scroll inside the sheet');
    await widths(page, 'breakfast editor', '#sheet');
    await page.locator('[data-component="早餐"] > summary').click();
    await page.locator('[data-template-ingredient="toast"]').check();
    assert.equal(await page.locator('.resource-row').count(), 1);
    await page.locator('#meal-form [name="name"]').fill('吐司与鸡蛋');
    await page.locator('#meal-form [name="type"]').selectOption('外出就餐');
    await page.locator('#meal-form [name="note"]').fill('温热的一杯牛奶');
    await page.locator('.meal-template-fold > summary').click();
    await page.locator('#meal-template-name').fill('早餐外食组合');
    await page.locator('[data-save-meal-template]').click();
    let current = await book(page);
    assert.equal(current.mealTemplates[0].scene, '外食');
    assert.equal(current.meals.length, 0);
    assert.equal(current.inventory[0].quantity, 4);
    await page.locator('#meal-form [type="submit"]').click();
    current = await book(page);
    const breakfast = current.meals[0];
    assert.equal(breakfast.date, date);
    assert.equal(breakfast.slot, 'breakfast');
    assert.equal(breakfast.type, '外出就餐');
    assert.equal(breakfast.name, '吐司与鸡蛋');
    assert.equal(current.inventory[0].quantity, 4);
    await page.locator(`[data-complete="${breakfast.id}"]`).click();
    current = await book(page);
    assert.equal(current.inventory[0].quantity, 3, 'Completing breakfast deducts once');
    await page.locator(`.meal-record[data-meal-fold="${breakfast.id}"] > summary`).click();
    await page.locator(`[data-edit-meal="${breakfast.id}"]`).click();
    await page.locator('#meal-form [type="submit"]').click();
    assert.equal((await book(page)).inventory[0].quantity, 3, 'Editing a completed breakfast must not deduct again');
    report.checks.push('Breakfast quick creation, editable name/type/stock, saved combinations, reserve and complete exactly once');
    await context.close();
  }

  {
    const { context, page } = await open(fixture());
    await page.locator('[data-action="add-snack"]').click();
    await page.locator('#meal-form [name="time"]').fill('15:30');
    await page.locator('[data-meal-breakfast]').click();
    assert.match(await page.locator('.sheet-subtitle').textContent(), /早餐/);
    assert.equal(await page.locator('#meal-form [name="time"]').isVisible(), false);
    await page.locator('[data-meal-scene="外食"]').click();
    assert.match(await page.locator('.sheet-subtitle').textContent(), /零食 \/ 加餐/);
    assert.equal(await page.locator('#meal-form [name="time"]').isVisible(), true);
    assert.equal(await page.locator('#meal-form [name="time"]').inputValue(), '15:30');
    await close(page);
    await page.locator('[data-date="2026-10-17"]').click();
    await page.locator('[data-add="lunch"]').click();
    await page.locator('[data-meal-breakfast]').click();
    assert.match(await page.locator('.sheet-subtitle').textContent(), /10月17日.*早餐/);
    await page.locator('[data-meal-scene="外食"]').click();
    assert.match(await page.locator('.sheet-subtitle').textContent(), /10月17日.*午餐/);
    await page.locator('#meal-form [name="name"]').fill('寿司郎1份');
    await page.locator('#meal-form [type="submit"]').click();
    let current = await book(page), lunch = current.meals[0];
    assert.equal(lunch.slot, 'lunch'); assert.equal(lunch.date, '2026-10-17');
    await page.locator(`[data-meal-fold="${lunch.id}"] > summary`).click();
    await page.locator(`[data-edit-meal="${lunch.id}"]`).click();
    assert.equal(await page.locator('[data-meal-breakfast]').count(), 0, 'Editing an existing lunch must not change its slot through a breakfast shortcut');
    await close(page);
    await page.locator('[data-add="dinner"]').click();
    await page.locator('[data-meal-breakfast]').click();
    await page.locator('#meal-form [type="submit"]').click();
    current = await book(page);
    assert.equal(current.meals.find(meal => meal.slot === 'breakfast').date, '2026-10-17');
    assert.ok(current.meals.some(meal => meal.id === lunch.id && meal.slot === 'lunch'));
    assert.ok(!current.meals.some(meal => meal.slot === 'dinner'));
    const before = await raw(page);
    await page.locator('[data-add="dinner"]').click();
    await page.locator('[data-meal-breakfast]').click();
    await page.locator('#meal-form [type="submit"]').click();
    assert.match(await page.locator('#meal-form .form-error').textContent(), /已经安排/);
    assert.equal(await raw(page), before, 'Existing breakfast must never be overwritten by a shortcut');
    await close(page);
    report.checks.push('Breakfast visible in all new editors, preserves date, explicit slot change and restore, protects existing slots');
    await context.close();
  }

  {
    const state = fixture();
    putMeal(state, { id: 'short', date, slot: 'lunch', name: '外食｜寿司郎1份', type: '外出就餐', protein: '', note: '和朋友一起吃', resources: [] });
    putMeal(state, { id: 'long', date, slot: 'dinner', name: '热乎乎的牛肉蔬菜饭与自己喜欢的配菜'.repeat(4).slice(0, 80), type: '自制便当', protein: '鸡蛋', note: '米饭、青菜、鸡蛋慢慢搭配；享受一顿热乎乎的晚餐。'.repeat(7).slice(0, 200), resources: [{ ingredientId: 'eggs', amount: 1 }, { ingredientId: 'rice', amount: 1 }] });
    const { context, page } = await open(state);
    await page.locator('[data-meal-fold="short"] > summary').click();
    const card = page.locator('.meal-card.lunch');
    assert.equal(await card.locator('.meal-name').count(), 1);
    assert.equal(await card.locator('.meal-kind').count(), 0, 'Do not repeat the type already included in the meal name');
    assert.equal(await card.locator('.meal-resource-list').count(), 0);
    assert.equal(await card.locator('.meal-brief').isVisible(), false, 'Expanded note is only shown once');
    for (const width of [320, 390, 736]) {
      await page.setViewportSize({ width, height: 844 });
      const sizes = await card.evaluate(element => {
        const rect = element.getBoundingClientRect(), note = element.querySelector('.meal-note').getBoundingClientRect(), actions = element.querySelector('.meal-card-controls').getBoundingClientRect();
        return { height: rect.height, gap: actions.top - note.bottom, buttons: [...element.querySelectorAll('button')].map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) };
      });
      assert.ok(sizes.height <= 180, `Short meal should be a small slip: ${JSON.stringify(sizes)}`);
      assert.ok(sizes.gap <= 10 && sizes.gap >= 0, 'Actions must immediately follow the actual note');
      assert.ok(sizes.buttons.every(button => button.width >= 44 && button.height >= 44), 'Actions keep touch areas');
    }
    await widths(page, 'short expanded meal', '.meal-card.lunch');
    await card.screenshot({ path: resolve(output, 'short-meal.png') });
    await page.locator('[data-meal-fold="long"] > summary').click();
    await widths(page, 'long expanded meal', '.meal-card.dinner');
    const unclipped = await page.locator('.meal-card.dinner').evaluate(element => [...element.querySelectorAll('.meal-name, .meal-note, .meal-resource-chip')].every(child => child.scrollHeight <= child.clientHeight + 1 && child.scrollWidth <= child.clientWidth + 1));
    assert.equal(unclipped, true, 'Long names, notes and inventory resources remain complete');
    await page.locator('.meal-card.dinner').screenshot({ path: resolve(output, 'long-meal.png') });
    const before = await raw(page);
    await page.locator('[data-meal-fold="short"] [data-detail="short"]').click();
    for (const id of ['detail-edit', 'detail-copy', 'detail-move', 'detail-delete']) assert.equal(await page.locator(`#${id}`).isVisible(), true);
    assert.equal(await raw(page), before, 'Reading compact details leaves records unchanged');
    report.checks.push('Short and long expanded notes: one name, no empty fields, natural height, adjacent touch controls, retained edit/copy/move/delete');
    await context.close();
  }

  {
    const { context, page } = await open(fixture());
    const before = await raw(page);
    await page.locator('.bottom-nav [data-page="inventory"]').click();
    const fold = page.locator('.runway-fold');
    assert.equal(await fold.getAttribute('open'), null);
    assert.equal(await page.locator('.runway-total').isVisible(), false);
    assert.ok((await page.locator('.runway-note').boundingBox()).height <= 65);
    await widths(page, 'collapsed runway', '.runway-note');
    await page.locator('.runway-heading').click();
    assert.equal(await page.locator('.runway-total').isVisible(), true);
    for (const mode of ['main', 'comprehensive']) {
      await page.locator(`[data-runway-mode="${mode}"]`).click();
      assert.notEqual(await fold.getAttribute('open'), null, 'Mode changes preserve the open panel');
      const expected = await page.evaluate(async mode => {
        const { predictRunway, predictMainCourseRunway, stockSummary } = await import('./runway.js');
        const state = JSON.parse(localStorage.getItem('jizhi-ai-test-book-v1'));
        return mode === 'main' ? predictMainCourseRunway(state, '2026-10-14', 2).covered : stockSummary(state.inventory, '2026-10-14').total;
      }, mode);
      assert.equal(Number(await page.locator('.runway-total strong').textContent()), expected);
    }
    await page.locator('.runway-details > summary').click();
    await page.locator('#runway-daily').selectOption('1');
    assert.notEqual(await fold.getAttribute('open'), null);
    await widths(page, 'expanded runway', '.runway-note');
    await page.locator('.runway-heading').click();
    assert.equal(await page.locator('.runway-total').isVisible(), false);
    assert.equal(await raw(page), before, 'Fold, settings and modes never modify meals or inventory');
    await page.locator('.runway-heading').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.runway-total').isVisible(), true, 'Heading also supports keyboard activation');
    await page.locator('.runway-note').screenshot({ path: resolve(output, 'runway-expanded.png') });
    await page.reload();
    assert.equal(await page.locator('.runway-fold').getAttribute('open'), null, 'New page loads start collapsed');
    report.checks.push('Runway defaults collapsed, native keyboard/touch disclosure, existing predictions and controls, no data mutation');
    await context.close();
  }

  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
