import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const seed = { schemaVersion: 2, inventory: ['蛋白质', '蔬菜', '碳水', '整套食物', '早餐'].map((category, i) => ({ id: 'food-' + i, name: ['鸡蛋', '绿叶蔬菜', '米饭', '完整便当', '早餐面包'][i], category, quantity: [9,8,12,3,5][i], unit: '份', perMeal: 1, expires: '', note: '' })), meals: [], diaries: [] };
  await page.addInitScript(seed => { if (!localStorage.getItem('jizhi-ai-test-book-v1')) localStorage.setItem('jizhi-ai-test-book-v1', JSON.stringify(seed)); }, seed);
  await page.goto(`http://127.0.0.1:${server.address().port}/#inventory`);
  await page.locator('.runway-note').waitFor();
  assert.equal(await page.locator('.runway-fold').getAttribute('open'), null);
  await page.locator('.runway-fold > summary').click();
  assert.match(await page.locator('.runway-total').innerText(), /11/);
  const raw = await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1'));
  await page.locator('[data-fridge-view="list"]').click();
  await page.locator('.fridge-rows').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1')), raw);
  await page.reload(); await page.locator('.fridge-rows').waitFor();
  if (await page.locator('.runway-fold').getAttribute('open') === null) await page.locator('.runway-fold > summary').click();
  await page.locator('.runway-details > summary').click();
  await page.locator('#runway-daily').selectOption('1');
  await page.reload(); assert.equal(await page.locator('#runway-daily').inputValue(), '1');
  assert.equal(await page.locator('.runway-fold').getAttribute('open'), null, 'new page entry starts with the provision ticket folded');
  await page.locator('.runway-fold > summary').click();
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
  }
  await page.locator('[data-inventory-id="food-3"] > summary').click();
  await page.locator('[data-ingredient="food-3"]').click();
  await page.locator('[name="quantity"]').fill('4');
  await page.locator('#ingredient-form [type="submit"]').click();
  await page.locator('#sheet').waitFor({ state: 'hidden' });
  assert.match(await page.locator('.runway-total').innerText(), /12/);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1.3-upgrade-backup')), raw);
  await page.locator('[data-inventory-id="food-3"] > summary').click();
  await page.locator('[data-ingredient="food-3"]').click();
  await page.locator('[name="category"]').selectOption({ label: '早餐' });
  await page.locator('#ingredient-form [type="submit"]').click();
  await page.locator('#sheet').waitFor({ state: 'hidden' });
  assert.match(await page.locator('.runway-total').innerText(), /8/);
  await page.locator('[data-fridge-view="cards"]').click();
  assert.equal(await page.locator('.fridge-rows').count(), 0);
  await page.locator('[data-fridge-view="list"]').click();
  await mkdir(resolve('tests/ui-previews'),{recursive:true});
  await page.screenshot({ path: process.env.FRIDGE_SCREENSHOT || 'tests/ui-previews/fridge-v1.4-mobile.png', fullPage: true });
  await page.locator('[data-page="settings"]').click();
  const download = page.waitForEvent('download'); await page.locator('[data-action="v13-backup"]').click();
  assert.match((await download).suggestedFilename(), /V1.3/);
  assert.deepEqual(errors, []);
  console.log('Mobile UI passed: 320/375/390 widths, mode persistence, quantity and category edits, daily preference, upgrade backup export; no page errors.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
