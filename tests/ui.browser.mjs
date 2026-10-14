import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let networkBlocked = false;
const server = createServer(async (req, res) => {
  if (networkBlocked) { res.writeHead(503).end('Network unavailable during offline check'); return; }
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const engineName = process.env.UI_ENGINE === 'webkit' ? 'webkit' : 'chrome';
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless:true, ...(engineName === 'chrome' && process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
const output = process.env.UI_SCREENSHOTS || resolve('tests/ui-previews');
await mkdir(output, { recursive: true });
const navChecks = [];
async function checkBottomClearance(page, target) {
  for (const extraSafeArea of [0, 34]) {
    const originalStyles = await page.evaluate(extra => {
      const shell = document.querySelector('.app-shell'), nav = document.querySelector('.bottom-nav');
      const original = [shell.getAttribute('style'), nav.getAttribute('style')];
      // Device emulation reports a zero safe-area inset. Exercise the same extra
      // 34px in both padding declarations without changing application styles.
      if (extra) {
        shell.style.paddingBottom = `${parseFloat(getComputedStyle(shell).paddingBottom) + extra}px`;
        nav.style.paddingBottom = `${parseFloat(getComputedStyle(nav).paddingBottom) + extra}px`;
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      return original;
    }, extraSafeArea);
    const metrics = await page.evaluate(() => {
      const content = document.querySelector('.page').getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
      return { width:innerWidth, height:innerHeight, clearance:nav.top - content.bottom, navHeight:nav.height };
    });
    assert.ok(metrics.clearance >= 12, `${target} content hidden by navigation: ${JSON.stringify(metrics)}`);
    navChecks.push({ target, extraSafeArea, ...metrics });
    await page.evaluate(([shellStyle, navStyle]) => {
      for (const [selector, style] of [['.app-shell',shellStyle],['.bottom-nav',navStyle]]) {
        const el = document.querySelector(selector);
        if (style === null) el.removeAttribute('style'); else el.setAttribute('style',style);
      }
      window.scrollTo(0,0);
    }, originalStyles);
  }
}
async function checkRunwayArt(page) {
  const overlaps = await page.evaluate(() => {
    const art = document.querySelector('.runway-background-art').getBoundingClientRect();
    const walk = document.createTreeWalker(document.querySelector('.runway-note'), NodeFilter.SHOW_TEXT);
    const overlaps = [];
    while (walk.nextNode()) {
      const node = walk.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const text of range.getClientRects()) {
        if (text.width && text.height && text.left < art.right && text.right > art.left && text.top < art.bottom && text.bottom > art.top) overlaps.push(node.textContent.trim());
      }
    }
    return overlaps;
  });
  assert.deepEqual(overlaps,[], 'background artwork must remain in the blank corner');
}
try {
  const page = await browser.newPage({ ...(engineName === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']), viewport: { width:390,height:844 }, deviceScaleFactor:1, timezoneId:'Asia/Shanghai' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
  await page.addInitScript(() => {
    if (localStorage.getItem('jizhi-ai-test-book-v1')) return;
    const now = new Date(); const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const seed = { schemaVersion: 2, inventory: ['蛋白质','蔬菜','碳水','整套食物','早餐'].map((category,i) => ({ id:'food-'+i,name:['牛肉丸','绿叶蔬菜','米饭','完整便当','早餐面包'][i],category,quantity:[9,8,12,3,5][i],perMeal:1,unit:'份',note:i === 1 ? '洗好收在冷藏格' : '',expires:'' })),
      meals: ['breakfast','lunch','dinner'].map((slot,i) => ({ id:'meal-'+i,date,slot,name:['牛奶和坚果','牛肉丸便当','去食堂吃晚饭'][i],type:i===2?'公司食堂':'自制便当',protein:'',note:'',resources:[],completed:i===0,completedAt:i===0?new Date().toISOString():null })),
      diaries:[{ date,mood:'(˶ᵔ ᵕ ᵔ˶)',text:'今天散步时，看见路边开了一朵小花。\n回家后收好冰箱，慢慢做一顿喜欢的饭。\n还记下了喜欢的小点心，和窗边的阳光。',joy:'晒到温暖的太阳',updatedAt:new Date().toISOString() }] };
    localStorage.setItem('jizhi-ai-test-book-v1', JSON.stringify(seed));
  });
  const base = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(base + '#inventory'); await page.locator('.fridge-rows').waitFor();
  const raw = await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1'));
  assert.equal(await page.locator('.runway-details').getAttribute('open'), null);
  assert.equal(await page.locator('.ingredient-row[open]').count(), 0);
  const firstIngredient = page.locator('.ingredient-row').first();
  assert.equal(await firstIngredient.locator('.ingredient-meta').isVisible(), false);
  assert.ok(await firstIngredient.evaluate(el => el.getBoundingClientRect().height) <= 56, 'collapsed inventory row follows the 52px notebook summary style');
  await firstIngredient.locator('.stock-numbers').click();
  assert.equal(await firstIngredient.locator('.ingredient-meta').isVisible(), true);
  await firstIngredient.locator('[data-ingredient]').click();
  await page.locator('#ingredient-form').waitFor();
  await page.locator('.close-button[data-close]').click();
  assert.notEqual(await firstIngredient.getAttribute('open'), null, 'editor buttons must not toggle the summary');
  await firstIngredient.locator('.ingredient-row-heading').click();
  assert.equal(await page.locator('.inventory-explanation').getAttribute('open'), null);
  assert.equal(await page.locator('.runway-counts').isVisible(), false);
  if (await page.locator('.runway-fold').getAttribute('open') === null) await page.locator('.runway-fold > summary').click();
  await page.locator('.runway-details > summary').click();
  assert.equal(await page.locator('.runway-counts').isVisible(), true);
  await page.locator('.runway-details > summary').click();
  await page.locator('[data-fridge-view="cards"]').click(); await page.reload();
  assert.equal(await page.locator('[data-fridge-view="cards"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-fridge-view="list"]').click();
  for (const target of ['inventory','summary','settings','calendar']) {
    await page.locator(`[data-page="${target}"]`).click();
    for (const width of [320,375,390]) {
      await page.setViewportSize({ width,height:844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${target} overflow at ${width}`);
      if (target === 'inventory') {
        if (await page.locator('.runway-fold').getAttribute('open') === null) await page.locator('.runway-fold > summary').click();
        await checkRunwayArt(page);
        const total = page.locator('.runway-total strong');
        const originalTotal = await total.textContent();
        await total.evaluate(el => { el.textContent = '1234567890'; });
        await checkRunwayArt(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'long total must wrap without overflowing');
        await total.evaluate((el,text) => { el.textContent = text; },originalTotal);
      }
      await checkBottomClearance(page, target);
      if (target === 'inventory' && width === 320) await page.screenshot({ path:resolve(output,'inventory-320.png') });
    }
    if (target === 'calendar') { const heights = await page.locator('.meals > .meal-card').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height)); assert.ok(heights.every(height => height <= 76), 'ordinary meal rows should stay compact'); }
    await page.screenshot({ path:resolve(output,target+'.png') });
    await page.screenshot({ path:resolve(output,target+'-full.png'),fullPage:true });
    if (target === 'inventory') {
      const lastIngredient = page.locator('.ingredient-row').last();
      await lastIngredient.locator('summary').click();
      await lastIngredient.locator('[data-ingredient]').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
      assert.equal(await lastIngredient.locator('[data-ingredient]').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.bottom <= document.querySelector('.bottom-nav').getBoundingClientRect().top - 8 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-ingredient]') === el;
      }),true,'last editing control must remain visible and tappable');
      await page.screenshot({ path:resolve(output,'inventory-bottom.png') });
      await lastIngredient.locator('summary').click();
      await page.evaluate(() => window.scrollTo(0,0));
    }
  }
  await page.locator('[data-action="timeline"]').click();
  const today = await page.locator('.timeline-row.is-today').getAttribute('data-timeline-date');
  const row = page.locator(`[data-timeline-date="${today}"]`);
  assert.equal(await row.locator('details').getAttribute('open'), null);
  await page.screenshot({path:resolve(output,'timeline.png')});
  await row.locator('summary').click();
  assert.notEqual(await row.locator('details').getAttribute('open'), null);
  assert.equal(await row.locator('.timeline-meal').count(), 3);
  assert.deepEqual(await row.locator('.timeline-section-title').allTextContents(), ['餐食','心情 · 小确幸','今日小故事']);
  assert.equal(await row.locator('.timeline-story-text').textContent(), JSON.parse(raw).diaries[0].text);
  await page.screenshot({ path:resolve(output,'timeline-expanded.png') });
  for (const width of [320,375,390]) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'expanded timeline overflow');
    await row.locator('.timeline-open').scrollIntoViewIfNeeded();
    if (width === 320) await page.screenshot({ path:resolve(output,'timeline-expanded-320.png') });
  }
  await row.locator('.timeline-open').scrollIntoViewIfNeeded();
  assert.equal(await row.locator('.timeline-open').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.bottom-nav').getBoundingClientRect().top - 8),true,'expanded day actions must clear the navigation');
  await row.locator('[data-timeline-open]').click(); await page.locator('.calendar-page').waitFor();
  await page.locator('[data-action="timeline"]').click();
  assert.notEqual(await page.locator(`[data-timeline-date="${today}"] details`).getAttribute('open'), null);
  await page.locator(`[data-timeline-date="${today}"] summary`).click();
  assert.equal(await page.locator(`[data-timeline-date="${today}"] details`).getAttribute('open'), null);
  for (const width of [320,375,390]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'timeline overflow');
  }
  await page.locator('[data-page="settings"]').click();
  assert.equal(await page.locator('.settings-rules').getAttribute('open'), null);
  assert.equal(await page.locator('.settings-credits').getAttribute('open'), null);
  assert.equal(await page.locator('.backup-status').isVisible(), false);
  assert.equal(await page.locator('.settings-install-help').getAttribute('open'), null);
  const download = page.waitForEvent('download'); await page.locator('[data-action="export"]').click();
  assert.match((await download).suggestedFilename(), /备份/);
  assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1')),raw,'UI actions must not mutate journal data');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Windows WebKit's synthetic offline flag aborts navigation before the worker.
  // Block the server instead, so only the installed shell cache can supply files.
  if (engineName === 'webkit') networkBlocked = true; else await page.context().setOffline(true);
  await page.reload(); await page.locator('.settings-page').waitFor();
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'layout-checks.json'), JSON.stringify({ engine:engineName, navChecks },null,2));
  console.log('UI passed: all pages at mobile widths, row taps and isolated editing, artwork clear of text, final content above navigation with 0/34px simulated safe area, timeline expand/open/return, backup export, unchanged raw data, offline reload.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
