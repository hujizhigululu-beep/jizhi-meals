import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const artifacts = resolve(root, 'tests/ui-previews');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', mime[extname(file)] || 'text/plain');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  // A new temporary context, never a persistent profile or the user's browser.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const first = await context.newPage(), second = await context.newPage();
  const errors = [];
  for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
  await first.addInitScript(() => {
    if (localStorage.getItem('jizhi-meals-v1')) return;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('jizhi-meals-v1', JSON.stringify({
      schemaVersion: 3, inventory: [], meals: [], diaries: [], updatedAt: null,
      dayRecords: [{ date, study: { checked: true, items: [{ id: 'same-item', content: '原版内容', minutes: 30, note: '原备注' }] }, exercise: { checked: false, items: [] }, stickerIds: [] }],
    }));
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await first.goto(url); await second.goto(url);
  const contentInput = () => first.locator('.activity-form[data-kind="study"] input[name="content"]');
  const saveButton = () => first.locator('.activity-form[data-kind="study"] button[type="submit"]');
  const readItems = () => first.evaluate(() => JSON.parse(localStorage.getItem('jizhi-meals-v1')).dayRecords[0].study.items);

  // A storage event must refresh the book without reusing an outdated editing ID.
  await first.locator('.activity-details[data-kind="study"] summary').click();
  await first.locator('[data-activity-edit="same-item"]').click();
  await contentInput().fill('A窗口未保存修改');
  await second.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('jizhi-meals-v1'));
    state.dayRecords[0].study.items[0].content = 'B窗口新记录';
    localStorage.setItem('jizhi-meals-v1', JSON.stringify(state));
  });
  await first.waitForFunction(() => document.querySelector('.activity-entry-text strong')?.textContent === 'B窗口新记录');
  assert.equal(await contentInput().inputValue(), 'A窗口未保存修改');
  assert.equal(await first.locator('.activity-conflict').count(), 1);
  await saveButton().click();
  const afterExternalEdit = await readItems();
  assert.equal(afterExternalEdit.length, 2);
  assert.equal(afterExternalEdit.find(item => item.id === 'same-item').content, 'B窗口新记录');
  assert.ok(afterExternalEdit.some(item => item.id !== 'same-item' && item.content === 'A窗口未保存修改'));

  // A failed delete must preserve the stored record and its unsaved editing draft.
  await first.locator('[data-activity-edit="same-item"]').click();
  await contentInput().fill('删除失败前仍未保存的编辑草稿');
  const beforeDelete = await first.evaluate(() => localStorage.getItem('jizhi-meals-v1'));
  await first.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jizhi-meals-v1') throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await first.locator('[data-activity-delete="same-item"]').click();
  await first.locator('#confirm-yes').click();
  await first.waitForFunction(() => document.querySelector('#toast').textContent.includes('存储空间不足'));
  assert.equal(await contentInput().inputValue(), '删除失败前仍未保存的编辑草稿');
  assert.equal(await saveButton().textContent(), '保存修改');
  assert.equal(await first.evaluate(() => localStorage.getItem('jizhi-meals-v1')), beforeDelete);

  // Reload resets the injected quota failure. Updating storage from its initiating
  // page sends no event to that page, exercising the raw-comparison fallback.
  await first.reload();
  await first.locator('.activity-details[data-kind="study"] summary').click();
  await first.locator('[data-activity-edit="same-item"]').click();
  await contentInput().fill('storage事件前的旧编辑稿');
  await first.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('jizhi-meals-v1'));
    state.dayRecords[0].study.items[0].content = '另一窗口更新但尚未处理事件';
    localStorage.setItem('jizhi-meals-v1', JSON.stringify(state));
  });
  await saveButton().click();
  assert.equal((await readItems()).find(item => item.id === 'same-item').content, '另一窗口更新但尚未处理事件');
  assert.equal(await contentInput().inputValue(), 'storage事件前的旧编辑稿');
  assert.equal(await first.locator('.activity-conflict').count(), 1);
  await saveButton().click();
  const afterFallback = await readItems();
  assert.equal(afterFallback.find(item => item.id === 'same-item').content, '另一窗口更新但尚未处理事件');
  assert.ok(afterFallback.some(item => item.id !== 'same-item' && item.content === 'storage事件前的旧编辑稿'));
  assert.equal(afterFallback.length, 3);
  assert.deepEqual(errors, []);

  await mkdir(artifacts, { recursive: true });
  const checks = { multiwindowChange: 'passed', quotaDeleteDraft: 'passed', suppressedStorageRawFallback: 'passed', pageErrors: errors };
  await writeFile(resolve(artifacts, 'activity-transactions-checks.json'), JSON.stringify(checks, null, 2));
  await first.screenshot({ path: resolve(artifacts, 'activity-transactions.png'), fullPage: false });
  console.log(JSON.stringify(checks));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
