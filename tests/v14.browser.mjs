import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { SCHEMA } from '../model.js';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const output = process.env.V14_SCREENSHOTS || resolve('tests/ui-previews/v14-app');
await mkdir(output, { recursive: true });
const fixture = {
  schemaVersion: 2, inventoryVersion: 1, updatedAt: '2026-10-12T11:00:00.000Z',
  inventory: ['蛋白质', '蔬菜', '碳水'].map((category, i) => ({ id: `food-${i}`, name: ['牛肉丸', '青菜', '米饭'][i], category, quantity: [9, 8, 12][i], perMeal: 1, unit: '份', note: i === 0 ? '旧备注保持完整' : '', expires: '', photoId: `original-photo-${i}` })),
  meals: [['2026-10-02', 'lunch', '牛肉丸饭', true], ['2026-10-08', 'dinner', '青菜面', true], ['2026-10-13', 'breakfast', '牛奶吐司', true], ['2026-10-13', 'lunch', '牛肉便当', false], ['2026-10-13', 'dinner', '番茄面', false], ['2026-10-20', 'lunch', '未来便当', false]].map(([date, slot, name, completed], i) => ({ id: `old-meal-${i}`, date, slot, name, completed, type: '自制便当', protein: '', note: '餐食私人备注不进入图片', resources: i === 0 ? [{ ingredientId: 'food-0', name: '牛肉丸', amount: 1, unit: '份' }] : [], completedAt: completed ? `${date}T04:00:00.000Z` : null, photoId: `meal-photo-${i}` })),
  diaries: [{ date: '2026-10-13', mood: '私人心情标记', text: '私人长日记标记。\n原始换行与历史都保留。', joy: '私人小确幸标记', updatedAt: '2026-10-13T04:00:00.000Z' }],
};
const original = JSON.stringify(fixture, null, 2);
const swSource = await readFile(resolve(root, 'sw.js'), 'utf8');
const release = new Function('self', swSource + '\nreturn {CACHE,FILES};')({ addEventListener() {} });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let networkBlocked = false;
const server = createServer(async (req, res) => {
  if (networkBlocked) { res.writeHead(503).end('Offline test: server unavailable'); return; }
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engineName = process.env.UI_ENGINE === 'webkit' ? 'webkit' : 'chrome';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engineName === 'chrome' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const report = { engine: engineName, navigation: [], images: [], checks: [], cacheCount: 0 };
try {
  // This fresh context has a fresh local test origin. It never accesses the user's browser data.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-13T04:00:00.000Z'));
  await page.addInitScript(raw => { if (localStorage.getItem('jizhi-ai-test-book-v1') === null) localStorage.setItem('jizhi-ai-test-book-v1', raw); }, original);
  const readRaw = () => page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1'));
  const readBook = async () => JSON.parse(await readRaw());
  const day = async date => (await readBook()).dayRecords.find(record => record.date === date);
  async function inputDate(locator, value) { await locator.fill(value); await locator.evaluate(el => { el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); }); }
  async function month(value = '2026-10') { await page.locator('[data-calendar-view="month"]').click(); await inputDate(page.locator('#calendar-month'), value); }
  async function chooseDate(date) { if ((await page.locator('#calendar-month').inputValue()) !== date.slice(0, 7)) await inputDate(page.locator('#calendar-month'), date.slice(0, 7)); await page.locator(`[data-month-date="${date}"]`).click(); }
  async function details(kind) { const locator = page.locator(`.activity-details[data-kind="${kind}"]`); if (await locator.getAttribute('open') === null) await locator.locator('summary').click(); return locator; }
  async function saveItem(kind, content, minutes, note) { const section = await details(kind), form = section.locator('form'); await form.locator('[name="content"]').fill(content); await form.locator('[name="minutes"]').fill(minutes); await form.locator('[name="note"]').fill(note); await form.locator('[type="submit"]').click(); }
  async function chooseDaySticker(id) { await page.locator('[data-day-sticker-group="common"]').click(); await page.locator(`[data-day-sticker="${id}"]`).click(); }
  async function download(button, label, extension = 'json') {
    const pending = page.waitForEvent('download'); await button.click(); const file = await pending;
    const path = resolve(output, `${engineName}-${label}.${extension}`); await file.saveAs(path);
    return { name: file.suggestedFilename(), bytes: await readFile(path), path };
  }
  async function waitPreview() { await page.waitForFunction(() => { const image = document.querySelector('.share-preview img'), button = document.querySelector('#download-card'); return image && !image.hidden && image.complete && image.naturalWidth > 0 && button && !button.disabled; }); }
  async function clearance(target) {
    for (const safeArea of [0, 34]) {
      const previous = await page.evaluate(extra => {
        const shell = document.querySelector('.app-shell'), nav = document.querySelector('.bottom-nav');
        const before = [shell.getAttribute('style'), nav.getAttribute('style')];
        if (extra) { shell.style.paddingBottom = `${parseFloat(getComputedStyle(shell).paddingBottom) + extra}px`; nav.style.paddingBottom = `${parseFloat(getComputedStyle(nav).paddingBottom) + extra}px`; }
        window.dispatchEvent(new Event('resize')); window.scrollTo(0, document.documentElement.scrollHeight); return before;
      }, safeArea);
      const metrics = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, clearance: document.querySelector('.bottom-nav').getBoundingClientRect().top - document.querySelector('.page').getBoundingClientRect().bottom }));
      assert.ok(metrics.overflow <= 1, `${target} overflow ${JSON.stringify(metrics)}`);
      assert.ok(metrics.clearance >= 8, `${target} hidden by navigation ${JSON.stringify(metrics)}`);
      report.navigation.push({ target, safeArea, ...metrics });
      await page.evaluate(styles => { for (const [selector, style] of [['.app-shell', styles[0]], ['.bottom-nav', styles[1]]]) { const element = document.querySelector(selector); if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); } window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0); }, previous);
    }
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/#calendar`);
  await page.locator('.calendar-page').waitFor();
  assert.equal(await readRaw(), original, 'Opening V1.4 must not rewrite the schema2 source');
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.4-upgrade-backup')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.5-upgrade-backup')), null);
  await month();
  assert.equal(await page.locator('.month-grid > *').count(), 35);
  assert.equal(await page.locator('[data-month-date]').count(), 31);
  assert.equal(await page.locator('.month-stat[data-kind="meal"] strong').textContent(), '4');
  for (const mode of ['all', 'meal', 'exercise', 'study']) {
    await page.locator(`[data-month-mode="${mode}"]`).click();
    assert.equal(await page.locator('.month-grid .month-dot').count(), ['all', 'meal'].includes(mode) ? 4 : 0);
  }
  assert.equal(await readRaw(), original, 'Changing views must not persist business data');
  await page.locator('[data-month-mode="all"]').click();
  await chooseDate('2026-10-04');
  await page.locator('[data-checkin="study"]').click();
  assert.equal((await day('2026-10-04')).study.checked, true);
  assert.equal(await page.locator('.month-stat[data-kind="study"] strong').textContent(), '1');
  await page.locator('[data-checkin="exercise"]').click();
  assert.equal(await page.locator('[data-month-date="2026-10-04"] .month-dot').count(), 2);
  const studyForm = (await details('study')).locator('form');
  await studyForm.locator('[name="content"]').fill('补记日语 📝');
  await studyForm.locator('[name="note"]').fill('学习私人备注标记。\n完整保留。');
  for (let i = 0; i < 2; i++) await page.locator('[data-checkin="exercise"]').click();
  assert.equal(await studyForm.locator('[name="content"]').inputValue(), '补记日语 📝');
  assert.equal(await studyForm.locator('[name="note"]').inputValue(), '学习私人备注标记。\n完整保留。');
  assert.notEqual(await page.locator('.activity-details[data-kind="study"]').getAttribute('open'), null);
  await studyForm.locator('[type="submit"]').click();
  assert.equal((await day('2026-10-04')).study.items[0].minutes, null);
  await saveItem('study', '画画', '15', '第二项也只算一天。');
  assert.equal((await day('2026-10-04')).study.items.length, 2);
  assert.equal(await page.locator('.month-stat[data-kind="study"] strong').textContent(), '1');
  await page.locator('.activity-details[data-kind="study"] [data-activity-edit]').first().click();
  const editingForm = page.locator('.activity-form[data-kind="study"]');
  await editingForm.locator('[name="content"]').fill('日语修改完成'); await editingForm.locator('[name="minutes"]').fill('45');
  await editingForm.locator('[type="submit"]').click();
  assert.ok((await day('2026-10-04')).study.items.some(item => item.content === '日语修改完成' && item.minutes === 45));
  await saveItem('exercise', '徒步', '30', '运动私人备注标记。');
  await saveItem('exercise', '暂时删除这项', '10', '');
  await page.locator('.activity-details[data-kind="exercise"] [data-activity-delete]').last().click();
  await page.locator('#confirm-yes').click();
  assert.equal((await day('2026-10-04')).exercise.items.length, 1);
  assert.equal((await day('2026-10-04')).exercise.checked, true);
  await page.locator('[data-checkin="study"]').click();
  assert.equal(await page.locator('.month-stat[data-kind="study"] strong').textContent(), '0');
  assert.equal((await day('2026-10-04')).study.items.length, 2);
  assert.match(await page.locator('.activity-details[data-kind="study"] .activity-help').textContent(), /未打卡/);
  await page.locator('[data-checkin="study"]').click();
  await page.locator('.day-sticker-picker summary').click();
  for (const id of ['milk', 'book', 'shoe']) await chooseDaySticker(id);
  const beforeLimit = await readRaw(); await chooseDaySticker('heart');
  assert.equal(await readRaw(), beforeLimit, 'Fourth sticker must not write data');
  assert.deepEqual((await day('2026-10-04')).stickerIds, ['milk', 'book', 'shoe']);
  assert.equal(await page.locator('.day-sticker-strip img').count(), 3);
  const migrated = await readBook();
  assert.equal(migrated.schemaVersion, SCHEMA);
  assert.deepEqual(migrated.inventory, fixture.inventory); assert.deepEqual(migrated.meals, fixture.meals); assert.deepEqual(migrated.diaries, fixture.diaries);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.4-upgrade-backup')), original);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.5-upgrade-backup')), original);
  const saved = await readRaw(); await page.reload(); await page.locator('.calendar-page').waitFor();
  assert.equal(await readRaw(), saved); await month(); await chooseDate('2026-10-04');
  assert.equal(await page.locator('.day-sticker-strip img').count(), 3);
  await page.locator('[data-calendar-view="timeline"]').click();
  const timelineRow = page.locator('[data-timeline-date="2026-10-04"]'); await timelineRow.locator('summary').click();
  assert.match(await timelineRow.locator('.timeline-record-mark').textContent(), /学习 · 运动 · 小贴纸/);
  assert.equal(await timelineRow.locator('.timeline-activity-item').count(), 3);
  assert.equal(await timelineRow.locator('.timeline-sticker-strip img').count(), 3);
  assert.match(await timelineRow.locator('.timeline-expanded').textContent(), /日语修改完成|徒步/);
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 844 });
    for (const safeArea of [0, 34]) {
      const previous = await page.evaluate(extra => {
        const shell = document.querySelector('.app-shell'), nav = document.querySelector('.bottom-nav');
        const before = [shell.getAttribute('style'), nav.getAttribute('style')];
        if (extra) { shell.style.paddingBottom = `${parseFloat(getComputedStyle(shell).paddingBottom) + extra}px`; nav.style.paddingBottom = `${parseFloat(getComputedStyle(nav).paddingBottom) + extra}px`; }
        window.dispatchEvent(new Event('resize')); return before;
      }, safeArea);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await timelineRow.locator('.timeline-open').scrollIntoViewIfNeeded();
      const metrics = await timelineRow.locator('.timeline-open').evaluate(button => ({
        width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
        clearance: document.querySelector('.bottom-nav').getBoundingClientRect().top - button.getBoundingClientRect().bottom,
        scrollerClearance: document.querySelector('.bottom-nav').getBoundingClientRect().top - document.querySelector('.timeline-scroll').getBoundingClientRect().bottom,
      }));
      assert.ok(metrics.overflow <= 1, `timeline overflow ${JSON.stringify(metrics)}`);
      assert.ok(metrics.clearance >= 8 && metrics.scrollerClearance >= 8, `timeline actions hidden by navigation ${JSON.stringify(metrics)}`);
      report.navigation.push({ target: 'timeline-expanded', safeArea, ...metrics });
      await page.evaluate(styles => { for (const [selector, style] of [['.app-shell', styles[0]], ['.bottom-nav', styles[1]]]) { const element = document.querySelector(selector); if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); } window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0); }, previous);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, `${engineName}-timeline.png`), fullPage: true });
  await page.locator('[data-calendar-view="month"]').click(); await chooseDate('2026-10-13');
  for (const kind of ['study', 'exercise']) await page.locator(`[data-checkin="${kind}"]`).click();
  assert.equal(await page.locator('[data-month-date="2026-10-13"] .month-dot').count(), 3);
  for (const kind of ['study', 'exercise']) assert.equal(await page.locator(`.month-stat[data-kind="${kind}"] strong`).textContent(), '2');
  await inputDate(page.locator('#calendar-month'), '2026-09');
  assert.equal(await page.locator('.month-grid .month-dot').count(), 0);
  assert.deepEqual(await page.locator('.month-stat strong').allTextContents(), ['0', '0', '0']);
  await inputDate(page.locator('#calendar-month'), '2026-10'); await chooseDate('2026-10-13');
  report.checks.push('legacy load without write, immediate unique-day dots, past date drafts, optional details, edit/delete/cancel, stickers and immutable upgrade backup');

  await page.locator('[data-action="share-day"]').click(); await waitPreview();
  assert.equal(await page.locator('[name="diary"]').isChecked(), false);
  for (const key of ['notes', 'mood', 'joy']) assert.equal(await page.locator(`[name="${key}"]`).isChecked(), false);
  const beforeShare = await readRaw();
  await page.locator('[name="scope"]').selectOption('month'); await inputDate(page.locator('#share-form [name="month"]'), '2026-10'); await waitPreview();
  for (const kind of ['meal', 'exercise', 'study', 'life']) {
    await page.locator(`[data-share-kind="${kind}"]`).click(); await waitPreview();
    const ids = await page.locator('[data-share-template]').evaluateAll(buttons => buttons.map(button => button.dataset.shareTemplate));
    assert.equal(ids.length, 2);
    for (const id of ids) {
      await page.locator(`[data-share-template="${id}"]`).click(); await waitPreview();
      const file = await download(page.locator('#download-card'), id, 'png');
      assert.match(file.name, /\.png$/); assert.equal(file.bytes.subarray(1, 4).toString(), 'PNG');
      const size = { width: file.bytes.readUInt32BE(16), height: file.bytes.readUInt32BE(20) };
      // The art samples intentionally produce compact postcards for sparse days.
      assert.ok(size.width >= 1200 && size.height >= 600 && size.height <= 10000);
      report.images.push({ template: id, ...size, bytes: file.bytes.length });
    }
  }
  await page.locator('[name="format"]').selectOption('square'); await waitPreview();
  const square = await download(page.locator('#download-card'), 'square', 'png');
  assert.equal(square.bytes.readUInt32BE(16), square.bytes.readUInt32BE(20));
  await page.locator('[name="scope"]').selectOption('range');
  await inputDate(page.locator('#share-form [name="start"]'), '2026-10-14'); await inputDate(page.locator('#share-form [name="end"]'), '2026-10-03');
  await page.waitForFunction(() => !document.querySelector('#share-form .form-error').hidden);
  assert.ok(await page.locator('#download-card').isDisabled());
  assert.equal(await readRaw(), beforeShare, 'Share choices and images must not mutate book');
  const privatePrepared = await page.evaluate(async () => { const { prepareJournalShare } = await import('./share-journal.js'); return JSON.stringify(prepareJournalShare(JSON.parse(localStorage.getItem('jizhi-ai-test-book-v1')), { kind: 'life', scope: 'month', month: '2026-10' })); });
  for (const marker of ['私人心情标记', '私人长日记标记', '私人小确幸标记', '学习私人备注标记', '运动私人备注标记', '餐食私人备注']) assert.ok(!privatePrepared.includes(marker));
  await page.locator('.close-button[data-close]').click();
  report.checks.push('eight template controls and downloaded PNGs, square size, range guard, default privacy and read-only sharing');

  await page.locator('[data-page="settings"]').click();
  const exported = await download(page.locator('[data-action="export"]'), 'backup');
  const exportedBook = JSON.parse(exported.bytes.toString());
  assert.equal(exportedBook.schemaVersion, SCHEMA); assert.equal(exportedBook.dayRecords.length, 2);
  assert.deepEqual(exportedBook.inventory, fixture.inventory); assert.deepEqual(exportedBook.meals, fixture.meals); assert.deepEqual(exportedBook.diaries, fixture.diaries);
  const upgrade = await download(page.locator('[data-action="v14-backup"]'), 'upgrade-original');
  assert.equal(upgrade.bytes.toString(), original);
  await page.locator('[data-page="calendar"]').click(); await page.locator('[data-checkin="study"]').click();
  assert.equal((await day('2026-10-13')).study.checked, false);
  await page.locator('[data-page="settings"]').click();
  await page.locator('#import-file').setInputFiles({ name: 'V1.4-restore.json', mimeType: 'application/json', buffer: exported.bytes });
  await page.locator('#restore-confirm').click();
  await page.waitForFunction(() => !document.querySelector('#sheet').open);
  const restored = await readBook();
  for (const key of ['inventory', 'meals', 'diaries', 'dayRecords', 'mealTemplates', 'activityCategories', 'recentStickerIds']) assert.deepEqual(restored[key], exportedBook[key]);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.4-upgrade-backup')), original);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.5-upgrade-backup')), original);
  const current = await download(page.locator('[data-action="original"]'), 'current-original'); assert.equal(current.bytes.toString(), await readRaw());
  report.checks.push('real JSON export/import, original schema2 download, restoration of new records plus images/inventory/history');

  for (const target of ['calendar', 'month', 'inventory', 'summary', 'settings']) {
    await page.locator(`[data-page="${target === 'month' ? 'calendar' : target}"]`).click();
    if (target === 'month') await month();
    for (const width of [320, 390, 736]) { await page.setViewportSize({ width, height: 844 }); await clearance(target); }
    if (target === 'month') { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: resolve(output, `${engineName}-month.png`), fullPage: true }); }
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await page.evaluate(async cacheName => (await (await caches.open(cacheName)).keys()).map(request => new URL(request.url).pathname), release.CACHE);
  report.cacheCount = cached.length;
  for (const file of release.FILES) assert.ok(cached.includes(new URL(file, `http://127.0.0.1:${server.address().port}/`).pathname), `missing offline file ${file}`);
  await page.locator('[data-page="settings"]').click(); await page.waitForFunction(() => document.querySelector('#offline-status').textContent.includes('已缓存'));
  networkBlocked = true;
  await page.reload(); await page.locator('.settings-page').waitFor();
  await page.locator('[data-page="calendar"]').click(); await month();
  await page.locator('[data-checkin="study"]').click();
  assert.equal((await day('2026-10-13')).study.checked, false);
  await page.locator('[data-checkin="study"]').click();
  await page.locator('.day-sticker-picker summary').click();
  for (const id of ['milk', 'book', 'star']) await chooseDaySticker(id);
  await page.waitForFunction(() => [...document.querySelectorAll('.day-sticker-strip img')].every(image => image.complete && image.naturalWidth > 0));
  await page.locator('[data-action="share-day"]').click(); await waitPreview();
  const offlineCard = await download(page.locator('#download-card'), 'offline-card', 'png');
  assert.ok(offlineCard.bytes.length > 1000); await page.locator('.close-button[data-close]').click();
  await page.locator('[data-page="settings"]').click(); const offlineBackup = await download(page.locator('[data-action="export"]'), 'offline-backup');
  assert.deepEqual(JSON.parse(offlineBackup.bytes.toString()).inventory, fixture.inventory);
  assert.deepEqual(errors, []);
  report.checks.push('full release cache, blocked-network reload, offline month/check-ins/stickers/PNG/JSON');
  await writeFile(resolve(output, `${engineName}-checks.json`), JSON.stringify(report, null, 2));
  console.log(`${engineName}: V1.4 integration passed; ${report.cacheCount} release resources cached, ${report.images.length} template PNGs, ${report.navigation.length} mobile/safe-area checks.`);
  await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
